"""Authentication, roles and audit log.

Users, sessions and the audit log live in a small SQLite file (data/auth.db, git-ignored).
Passwords are PBKDF2-SHA256 hashed with a per-user salt. Sessions are random tokens kept
server-side (only a hash is stored), delivered as an HttpOnly SameSite=Lax cookie, so a
disabled user or a password reset takes effect immediately.

Roles:  admin    everything, plus user management and the audit log
        operator everything operational: incident/violation actions and demo controls
        viewer   read-only
Set INTELLITWIN_AUTH=off to run the demo without login (kiosk mode, everyone is admin).

Sign-in modes (INTELLITWIN_AUTH_MODE): "local" (default) or "oidc" (single sign-on through Keycloak or any OIDC provider,
see intellitwin/oidc.py). In oidc mode local passwords still work for admins only, as a break-glass account.
The audit log is hash-chained: every row stores the hash of the previous row, so an edited or removed row is detected by verify_audit().
"""
from __future__ import annotations

import hashlib
import hmac
import json
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


def mode() -> str:
    return "oidc" if os.environ.get("INTELLITWIN_AUTH_MODE", "local").strip().lower() == "oidc" else "local"


def production() -> bool:
    return os.environ.get("INTELLITWIN_ENV", "").strip().lower() in ("production", "prod")


def startup_problems() -> list[str]:
    """Things that must be fixed before the server may start in production (INTELLITWIN_ENV=production)."""
    out: list[str] = []
    if not production():
        return out
    if not enabled() and os.environ.get("INTELLITWIN_ALLOW_NO_AUTH", "") != "1":
        out.append("INTELLITWIN_AUTH=off is not allowed in production (set INTELLITWIN_ALLOW_NO_AUTH=1 to override)")
    pw = os.environ.get("INTELLITWIN_ADMIN_PASSWORD", "")
    if pw and password_problem(pw, "admin"):
        out.append("INTELLITWIN_ADMIN_PASSWORD is too weak: " + str(password_problem(pw, "admin")))
    if mode() == "oidc":
        for k in ("OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"):
            if not os.environ.get(k, "").strip():
                out.append(f"{k} is required when INTELLITWIN_AUTH_MODE=oidc")
    return out


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
        self._migrate()
        self.fails: dict[str, list[float]] = {}
        self.bootstrap_note: str | None = None
        self._bootstrap()

    def _migrate(self) -> None:
        cols = lambda t: {r[1] for r in self.db.execute(f"PRAGMA table_info({t})")}
        if "hash" not in cols("audit"):
            self.db.execute("ALTER TABLE audit ADD COLUMN prev TEXT")
            self.db.execute("ALTER TABLE audit ADD COLUMN hash TEXT")
        if "source" not in cols("users"):
            self.db.execute("ALTER TABLE users ADD COLUMN source TEXT NOT NULL DEFAULT 'local'")
            self.db.execute("ALTER TABLE users ADD COLUMN sub TEXT")
        self.db.commit()
        # rows written before the chain existed are chained now, in order
        prev = ""
        for r in self.db.execute("SELECT * FROM audit ORDER BY id").fetchall():
            if r["hash"] is None:
                h = self._row_hash(prev, r)
                self.db.execute("UPDATE audit SET prev=?, hash=? WHERE id=?", (prev, h, r["id"]))
            else:
                h = r["hash"]
            prev = h
        self.db.commit()

    @staticmethod
    def _row_hash(prev: str, r) -> str:
        body = json.dumps([r["id"], repr(float(r["ts"])), r["actor"], r["action"], r["target"], r["detail"], r["ip"]], ensure_ascii=False)
        return hashlib.sha256((prev + body).encode()).hexdigest()

    def verify_audit(self) -> dict:
        """Recompute the chain. Reports the first row that was edited, or the first gap in the ids (a removed row)."""
        with self.lock:
            prev, n, last_id = "", 0, None
            for r in self.db.execute("SELECT * FROM audit ORDER BY id"):
                if last_id is not None and r["id"] != last_id + 1:
                    return {"ok": False, "rows": n, "problem": f"row {last_id + 1} is missing", "at": last_id + 1}
                if r["prev"] != prev or r["hash"] != self._row_hash(prev, r):
                    return {"ok": False, "rows": n, "problem": f"row {r['id']} was changed", "at": r["id"]}
                prev, n, last_id = r["hash"], n + 1, r["id"]
            return {"ok": True, "rows": n, "head": prev[:16], "note": "Removing the newest rows cannot be detected without an external copy of the head hash."}

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
        with self.lock:  # one writer at a time keeps the chain in order
            last = self.db.execute("SELECT hash FROM audit ORDER BY id DESC LIMIT 1").fetchone()
            prev = (last["hash"] if last else "") or ""
            cur = self.db.execute("INSERT INTO audit(ts,actor,action,target,detail,ip,prev) VALUES(?,?,?,?,?,?,?)", (time.time(), actor, action, target, detail, ip, prev))
            row = self.db.execute("SELECT * FROM audit WHERE id=?", (cur.lastrowid,)).fetchone()
            self.db.execute("UPDATE audit SET hash=? WHERE id=?", (self._row_hash(prev, row), cur.lastrowid))
            self.db.commit()

    @staticmethod
    def _pub(r: sqlite3.Row) -> dict:
        return {"id": r["id"], "username": r["username"], "name": r["name"], "role": r["role"], "disabled": bool(r["disabled"]),
                "must_change": bool(r["must_change"]), "created": r["created"], "last_login": r["last_login"], "source": r["source"]}

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
            if r and ok and mode() == "oidc" and (r["role"] != "admin" or r["source"] != "local"):
                ok = False  # single sign-on is the way in; local passwords stay only for admins (break-glass)
            if not r or not ok or r["disabled"]:
                self.fails[key].append(now)
                self.log(username, "login_failed", None, "disabled" if r and r["disabled"] and ok else None, ip)
                raise AuthError(401, "Invalid username or password")
            self.fails.pop(key, None)
            return self._open_session(r["id"], ip, "login")

    def _open_session(self, uid: int, ip: str, action: str, detail: str | None = None) -> tuple[str, dict]:
        with self.lock:
            now = time.time()
            token = secrets.token_urlsafe(32)
            self.db.execute("INSERT INTO sessions(th,uid,expires) VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), uid, now + SESSION_TTL))
            self.db.execute("UPDATE users SET last_login=? WHERE id=?", (now, uid))
            self.db.execute("DELETE FROM sessions WHERE expires<?", (now,))
            self.db.commit()
            u = self.db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
            self.log(u["username"], action, None, detail, ip)
            return token, self._pub(u)

    def login_sso(self, sub: str, username_hint: str, name: str, role: str, ip: str) -> tuple[str, dict]:
        """Sign in a user the identity provider has already authenticated. Role and name come from the provider at every sign-in."""
        with self.lock:
            r = self.db.execute("SELECT * FROM users WHERE source='oidc' AND sub=?", (sub,)).fetchone()
            if r and r["disabled"]:
                self.log(r["username"], "login_failed", None, "disabled (sso)", ip)
                raise AuthError(403, "This account is disabled")
            if not r:
                base = re.sub(r"[^a-z0-9._-]", "", (username_hint or "user").lower().split("@")[0])[:28] or "user"
                base = base if USERNAME_RE.match(base) else (base + "000")[:3] + base[3:]
                name_try, i = base, 1
                while self.db.execute("SELECT 1 FROM users WHERE username=?", (name_try,)).fetchone():
                    i += 1
                    name_try = f"{base[:26]}-{i}"
                self.db.execute("INSERT INTO users(username,name,role,pw,must_change,created,source,sub) VALUES(?,?,?,?,?,?,?,?)",
                                (name_try, name or name_try, role, "!", 0, time.time(), "oidc", sub))
                self.log("system", "sso_user_created", name_try, f"role {role}", ip)
                r = self.db.execute("SELECT * FROM users WHERE source='oidc' AND sub=?", (sub,)).fetchone()
            elif r["role"] != role or (name and r["name"] != name):
                self.db.execute("UPDATE users SET role=?, name=? WHERE id=?", (role, name or r["name"], r["id"]))
                self.db.commit()
            return self._open_session(r["id"], ip, "login_sso", f"role {role}")

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
