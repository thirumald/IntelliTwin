"""Hash-chained audit, production startup guard and OIDC sign-in against a fake identity provider."""
import base64
import json
import tempfile
import time
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from intellitwin import auth as authmod, oidc
from intellitwin.app import app

ISS, CID = "https://idp.test/realms/p", "intellitwin"


def test_audit_chain_detects_edit_and_removal():
    a = authmod.Auth(__import__("pathlib").Path(tempfile.mkdtemp()) / "a.db")
    for i in range(5):
        a.log("u", "act", f"t{i}")
    assert a.verify_audit()["ok"]
    a.db.execute("UPDATE audit SET detail='x' WHERE id=3"); a.db.commit()
    r = a.verify_audit()
    assert not r["ok"] and r["at"] == 3
    a.db.execute("UPDATE audit SET detail=NULL WHERE id=3"); a.db.commit()
    assert a.verify_audit()["ok"]
    a.db.execute("DELETE FROM audit WHERE id=2"); a.db.commit()
    r = a.verify_audit()
    assert not r["ok"] and r["at"] == 2


def test_old_audit_rows_are_chained_on_upgrade():
    import sqlite3
    d = __import__("pathlib").Path(tempfile.mkdtemp()) / "a.db"
    db = sqlite3.connect(str(d))
    db.executescript("CREATE TABLE audit(id INTEGER PRIMARY KEY, ts REAL NOT NULL, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT);"
                     "INSERT INTO audit(ts,action) VALUES(1.5,'a'),(2.5,'b');")
    db.commit(); db.close()
    a = authmod.Auth(d)
    a.log("u", "c")
    assert a.verify_audit() == {**a.verify_audit()} and a.verify_audit()["ok"] and a.verify_audit()["rows"] >= 3


def test_startup_guard(monkeypatch):
    monkeypatch.setenv("INTELLITWIN_ENV", "production")
    monkeypatch.setenv("INTELLITWIN_AUTH", "off")
    monkeypatch.setenv("INTELLITWIN_ADMIN_PASSWORD", "short")
    monkeypatch.setenv("INTELLITWIN_AUTH_MODE", "oidc")
    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    bad = " ".join(authmod.startup_problems())
    assert "AUTH=off" in bad and "too weak" in bad and "OIDC_ISSUER" in bad
    monkeypatch.setenv("INTELLITWIN_ENV", "dev")
    assert authmod.startup_problems() == []


# ---------------------------------------------------------------- fake identity provider
@pytest.fixture()
def idp(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key())); jwk.update(kid="k1", alg="RS256", use="sig")
    for k, v in dict(INTELLITWIN_AUTH_MODE="oidc", OIDC_ISSUER=ISS, OIDC_CLIENT_ID=CID, OIDC_CLIENT_SECRET="s3cret").items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("INTELLITWIN_DATA", tempfile.mkdtemp())
    monkeypatch.setenv("INTELLITWIN_ADMIN_PASSWORD", "Adm1n-Passw0rd!")
    monkeypatch.setenv("INTELLITWIN_AUTH", "on")
    monkeypatch.delenv("INTELLITWIN_ENV", raising=False)
    oidc._disc.update(at=0, doc=None); oidc._jwks.update(at=0, keys=None); oidc._pending.clear()
    state = {"claims": {}, "iss": ISS}

    def get_json(url):
        if url.endswith("openid-configuration"):
            return {"issuer": ISS, "authorization_endpoint": ISS + "/auth", "token_endpoint": ISS + "/token", "jwks_uri": ISS + "/certs"}
        return {"keys": [jwk]}

    def post_form(url, data):
        assert data["client_secret"] == "s3cret" and data["code_verifier"]
        c = {"iss": state["iss"], "aud": CID, "sub": "u-1", "iat": int(time.time()), "exp": int(time.time()) + 300,
             "nonce": state["nonce"], "preferred_username": "Asha", "name": "Asha K", **state["claims"]}
        return {"id_token": jwt.encode(c, key, algorithm="RS256", headers={"kid": "k1"})}
    monkeypatch.setattr(oidc, "_get_json", get_json)
    monkeypatch.setattr(oidc, "_post_form", post_form)
    with TestClient(app, follow_redirects=False) as cl:
        cl.idp = state
        yield cl


def sso(cl, **claims):
    cl.cookies.clear()
    r = cl.get("/api/auth/oidc/login?next=/admin.html")
    assert r.status_code == 302 and r.headers["location"].startswith(ISS + "/auth?")
    q = parse_qs(urlparse(r.headers["location"]).query)
    assert q["code_challenge_method"] == ["S256"] and q["client_id"] == [CID]
    cl.idp["nonce"] = q["nonce"][0]
    cl.idp["claims"] = claims
    return cl.get("/api/auth/oidc/callback", params={"state": q["state"][0], "code": "abc"})


def test_sso_signs_in_and_maps_role(idp):
    assert idp.get("/api/auth/config").json()["mode"] == "oidc"
    r = sso(idp, realm_access={"roles": ["offline_access", "intellitwin-operator", "viewer"]})
    assert r.status_code == 302 and r.headers["location"] == "/admin.html"
    me = idp.get("/api/auth/me").json()["user"]
    assert me["role"] == "operator" and me["source"] == "oidc" and me["username"] == "asha"
    # role change at the provider shows up at the next sign-in
    sso(idp, realm_access={"roles": ["admin"]})
    assert idp.get("/api/auth/me").json()["user"]["role"] == "admin"


def test_sso_refuses_no_role_bad_issuer_and_replay(idp):
    r = sso(idp, realm_access={"roles": ["something-else"]})
    assert "/login.html?error=" in r.headers["location"] and idp.get("/api/auth/me").status_code == 401
    idp.idp["iss"] = "https://evil.test"
    r = sso(idp, realm_access={"roles": ["admin"]})
    assert "/login.html?error=" in r.headers["location"] and idp.get("/api/auth/me").status_code == 401
    idp.idp["iss"] = ISS
    # the state can be used once
    idp.cookies.clear()
    loc = idp.get("/api/auth/oidc/login").headers["location"]
    q = parse_qs(urlparse(loc).query); idp.idp["nonce"] = q["nonce"][0]; idp.idp["claims"] = {"realm_access": {"roles": ["admin"]}}
    assert idp.get("/api/auth/oidc/callback", params={"state": q["state"][0], "code": "a"}).headers["location"] == "/"
    assert "error=" in idp.get("/api/auth/oidc/callback", params={"state": q["state"][0], "code": "a"}).headers["location"]
    assert "error=" in idp.get("/api/auth/oidc/callback", params={"state": "nope", "code": "a"}).headers["location"]


def test_oidc_mode_keeps_local_admin_only(idp):
    idp.cookies.clear()
    ok = idp.post("/api/auth/login", json={"username": "admin", "password": "Adm1n-Passw0rd!"})
    assert ok.status_code == 200
    sso(idp, realm_access={"roles": ["viewer"]})
    idp.cookies.clear()
    assert idp.post("/api/auth/login", json={"username": "asha", "password": "anything-at-all"}).status_code == 401
    idp.post("/api/auth/login", json={"username": "admin", "password": "Adm1n-Passw0rd!"})
    assert idp.get("/api/admin/audit/verify").json()["ok"] is True
