"""Authentication, roles and audit log.

Users, sessions and the audit log live in a small SQLite file (data/auth.db, git-ignored).
Passwords are PBKDF2-SHA256 hashed with a per-user salt. Sessions are random tokens kept
server-side (only a hash is stored), delivered as an HttpOnly SameSite=Lax cookie, so a
disabled user or a password reset takes effect immediately.

Roles:  admin    everything, plus user management and the audit log
        operator everything operational: incident/violation actions and demo controls
        viewer   read-only
Set INTELLITWIN_AUTH=off to run the demo without login (kiosk mode, everyone is admin).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path

ROLES = ("admin", "operator", "viewer")
SESSION_TTL = int(os.environ.get("INTELLITWIN_SESSION_HOURS", "12")) * 3600
COOKIE = "it_session"
ITER = 310_000
MAX_FAILS, LOCK_SECONDS = 5, 300
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")
MIN_PASSWORD = 10


def enabled() -> bool:
    return os.environ.get("INTELLITWIN_AUTH", "on").lower() not in ("off", "0", "false", "no")


def _hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITER)
    return f"pbkdf2${ITER}${salt.hex()}${dk.hex()}"


def _verify(password: str, stored: str) -> bool:
    try:
        _, it, salt, dk = stored.split("$")
        got = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(got.hex(), dk)
    except Exception:
        return False


def password_problem(pw: str, username: str = "") -> str | None:
    if len(pw) < MIN_PASSWORD:
        return f"Password must be at least {MIN_PASSWORD} characters"
    if username and username.lower() in pw.lower():
        return "Password must not contain the username"
    if pw.lower() in ("password123", "1234567890", "qwertyuiop"):
        return "Password is too common"
    return None


class AuthError(Exception):
    def __init__(self, status: int, msg: str):
        super().__init__(msg)
        self.status, self.msg = status, msg


class Auth:
    def __init__(self, path: Path | None = None):
        data = Path(os.environ.get("INTELLITWIN_DATA", Path(__file__).resolve().parent.parent / "data"))
        data.mkdir(parents=True, exist_ok=True)
        self.path = path or data / "auth.db"
        self.lock = threading.RLock()
        self.db = sqlite3.connect(str(self.path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            role TEXT NOT NULL, pw TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, must_change INTEGER NOT NULL DEFAULT 0,
            created REAL NOT NULL, last_login REAL);
        CREATE TABLE IF NOT EXISTS sessions(th TEXT PRIMARY KEY, uid INTEGER NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, ts REAL NOT NULL, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT);
        """)
        self.fails: dict[str, list[float]] = {}
        self.bootstrap_note: str | None = None
        self._bootstrap()

    # ------------------------------------------------------------ bootstrap
    def _bootstrap(self) -> None:
        with self.lock:
            if self.db.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
                return
            pw = os.environ.get("INTELLITWIN_ADMIN_PASSWORD")
            generated = not pw
            pw = pw or secrets.token_urlsafe(12)
            self.db.execute("INSERT INTO users(username,name,role,pw,must_change,created) VALUES(?,?,?,?,?,?)",
                            ("admin", "Administrator", "admin", _hash(pw), 1 if generated else 0, time.time()))
            self.db.commit()
            self.log("system", "bootstrap", "admin", "initial admin created")
            if generated:
                self.bootstrap_note = f"First start: created user 'admin' with password '{pw}' (you must change it at first login)."

    # ------------------------------------------------------------ helpers
    def log(self, actor: str | None, action: str, target: str | None = None, detail: str | None = None, ip: str | None = None) -> None:
        with self.lock:
            self.db.execute("INSERT INTO audit(ts,actor,action,target,detail,ip) VALUES(?,?,?,?,?,?)", (time.time(), actor, action, target, detail, ip))
            self.db.commit()

    @staticmethod
    def _pub(r: sqlite3.Row) -> dict:
        return {"id": r["id"], "username": r["username"], "name": r["name"], "role": r["role"], "disabled": bool(r["disabled"]),
                "must_change": bool(r["must_change"]), "created": r["created"], "last_login": r["last_login"]}

    def _active_admins(self, exclude: int | None = None) -> int:
        q = "SELECT COUNT(*) FROM users WHERE role='admin' AND disabled=0" + (" AND id!=?" if exclude else "")
        return self.db.execute(q, (exclude,) if exclude else ()).fetchone()[0]

    # ------------------------------------------------------------ login / sessions
    def login(self, username: str, password: str, ip: str) -> tuple[str, dict]:
        key = f"{username.lower()}|{ip}"
        with self.lock:
            now = time.time()
            recent = [t for t in self.fails.get(key, []) if now - t < LOCK_SECONDS]
            self.fails[key] = recent
            if len(recent) >= MAX_FAILS:
                self.log(username, "login_locked", None, None, ip)
                raise AuthError(429, "Too many failed attempts. Try again in a few minutes.")
            r = self.db.execute("SELECT * FROM users WHERE username=?", (username.lower().strip(),)).fetchone()
            ok = _verify(password, r["pw"]) if r else (_verify(password, _hash("x")) and False)
            if not r or not ok or r["disabled"]:
                self.fails[key].append(now)
                self.log(username, "login_failed", None, "disabled" if r and r["disabled"] and ok else None, ip)
                raise AuthError(401, "Invalid username or password")
            self.fails.pop(key, None)
            token = secrets.token_urlsafe(32)
            self.db.execute("INSERT INTO sessions(th,uid,expires) VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), r["id"], now + SESSION_TTL))
            self.db.execute("UPDATE users SET last_login=? WHERE id=?", (now, r["id"]))
            self.db.execute("DELETE FROM sessions WHERE expires<?", (now,))
            self.db.commit()
            self.log(r["username"], "login", None, None, ip)
            return token, self._pub(self.db.execute("SELECT * FROM users WHERE id=?", (r["id"],)).fetchone())

    def logout(self, token: str | None, user: dict | None, ip: str) -> None:
        if not token:
            return
        with self.lock:
            self.db.execute("DELETE FROM sessions WHERE th=?", (hashlib.sha256(token.encode()).hexdigest(),))
            self.db.commit()
        if user:
            self.log(user["username"], "logout", None, None, ip)

    def user_for(self, token: str | None) -> dict | None:
        if not token:
            return None
        with self.lock:
            r = self.db.execute("SELECT u.* FROM sessions s JOIN users u ON u.id=s.uid WHERE s.th=? AND s.expires>? AND u.disabled=0",
                                (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
            return self._pub(r) if r else None

    # ------------------------------------------------------------ self service
    def change_password(self, user: dict, current: str, new: str, token: str | None, ip: str) -> None:
        with self.lock:
            r = self.db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
            if not _verify(current, r["pw"]):
                raise AuthError(400, "Current password is incorrect")
            if current == new:
                raise AuthError(400, "New password must differ from the current one")
            bad = password_problem(new, r["username"])
            if bad:
                raise AuthError(400, bad)
            self.db.execute("UPDATE users SET pw=?, must_change=0 WHERE id=?", (_hash(new), r["id"]))
            keep = hashlib.sha256(token.encode()).hexdigest() if token else ""
            self.db.execute("DELETE FROM sessions WHERE uid=? AND th!=?", (r["id"], keep))  # sign out other devices
            self.db.commit()
            self.log(r["username"], "password_changed", r["username"], None, ip)

    # ------------------------------------------------------------ admin
    def list_users(self) -> list[dict]:
        with self.lock:
            return [self._pub(r) for r in self.db.execute("SELECT * FROM users ORDER BY username")]

    def create_user(self, actor: dict, username: str, name: str, role: str, password: str, ip: str) -> dict:
        username = (username or "").strip().lower()
        if not USERNAME_RE.match(username):
            raise AuthError(400, "Username: 3-32 chars, lowercase letters, digits, . _ -")
        if role not in ROLES:
            raise AuthError(400, "Unknown role")
        if not (name or "").strip():
            raise AuthError(400, "Name is required")
        bad = password_problem(password or "", username)
        if bad:
            raise AuthError(400, bad)
        with self.lock:
            try:
                cur = self.db.execute("INSERT INTO users(username,name,role,pw,must_change,created) VALUES(?,?,?,?,1,?)",
                                      (username, name.strip()[:80], role, _hash(password), time.time()))
            except sqlite3.IntegrityError:
                raise AuthError(409, "Username already exists")
            self.db.commit()
            self.log(actor["username"], "user_created", username, f"role={role}", ip)
            return self._pub(self.db.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone())

    def update_user(self, actor: dict, uid: int, patch: dict, ip: str) -> dict:
        with self.lock:
            r = self.db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
            if not r:
                raise AuthError(404, "Unknown user")
            sets, vals, notes = [], [], []
            if "name" in patch:
                if not str(patch["name"]).strip():
                    raise AuthError(400, "Name is required")
                sets.append("name=?"); vals.append(str(patch["name"]).strip()[:80])
            if "role" in patch and patch["role"] != r["role"]:
                if patch["role"] not in ROLES:
                    raise AuthError(400, "Unknown role")
                if r["role"] == "admin" and self._active_admins(exclude=uid) == 0:
                    raise AuthError(400, "At least one active admin is required")
                sets.append("role=?"); vals.append(patch["role"]); notes.append(f"role={patch['role']}")
            if "disabled" in patch and bool(patch["disabled"]) != bool(r["disabled"]):
                if patch["disabled"] and uid == actor["id"]:
                    raise AuthError(400, "You cannot disable your own account")
                if patch["disabled"] and r["role"] == "admin" and self._active_admins(exclude=uid) == 0:
                    raise AuthError(400, "At least one active admin is required")
                sets.append("disabled=?"); vals.append(1 if patch["disabled"] else 0); notes.append("disabled" if patch["disabled"] else "enabled")
            if patch.get("password"):
                bad = password_problem(patch["password"], r["username"])
                if bad:
                    raise AuthError(400, bad)
                sets += ["pw=?", "must_change=1"]; vals.append(_hash(patch["password"])); notes.append("password reset")
            if not sets:
                return self._pub(r)
            vals.append(uid)
            self.db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", vals)
            if patch.get("password") or patch.get("disabled") or ("role" in patch):
                self.db.execute("DELETE FROM sessions WHERE uid=?", (uid,))  # force re-login
            self.db.commit()
            self.log(actor["username"], "user_updated", r["username"], ", ".join(notes) or "profile", ip)
            return self._pub(self.db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())

    def delete_user(self, actor: dict, uid: int, ip: str) -> None:
        with self.lock:
            r = self.db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
            if not r:
                raise AuthError(404, "Unknown user")
            if uid == actor["id"]:
                raise AuthError(400, "You cannot delete your own account")
            if r["role"] == "admin" and not r["disabled"] and self._active_admins(exclude=uid) == 0:
                raise AuthError(400, "At least one active admin is required")
            self.db.execute("DELETE FROM sessions WHERE uid=?", (uid,))
            self.db.execute("DELETE FROM users WHERE id=?", (uid,))
            self.db.commit()
            self.log(actor["username"], "user_deleted", r["username"], None, ip)

    def audit(self, limit: int = 200, q: str | None = None) -> list[dict]:
        with self.lock:
            sql, args = "SELECT * FROM audit", []
            if q:
                sql += " WHERE actor LIKE ? OR action LIKE ? OR target LIKE ? OR detail LIKE ?"
                args = [f"%{q}%"] * 4
            sql += " ORDER BY id DESC LIMIT ?"
            return [dict(r) for r in self.db.execute(sql, (*args, min(max(limit, 1), 1000)))]


def _cli() -> None:
    """python -m intellitwin.auth reset-admin [username]  ->  sets a new random password and prints it."""
    import sys
    if len(sys.argv) < 2 or sys.argv[1] != "reset-admin":
        print("usage: python -m intellitwin.auth reset-admin [username]")
        raise SystemExit(2)
    name = (sys.argv[2] if len(sys.argv) > 2 else "admin").lower()
    a = Auth()
    pw = secrets.token_urlsafe(12)
    with a.lock:
        r = a.db.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
        if not r:
            print(f"No user '{name}'. Existing: " + ", ".join(u["username"] for u in a.list_users()))
            raise SystemExit(1)
        a.db.execute("UPDATE users SET pw=?, must_change=1, disabled=0 WHERE id=?", (_hash(pw), r["id"]))
        a.db.execute("DELETE FROM sessions WHERE uid=?", (r["id"],))
        a.db.commit()
    a.log("cli", "password_reset", name, "reset-admin command")
    print(f"User '{name}' now has the temporary password: {pw}\nYou will be asked to change it at sign-in.")


if __name__ == "__main__":
    _cli()
