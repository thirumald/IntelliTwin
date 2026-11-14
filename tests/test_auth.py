import os, tempfile
import pytest
from fastapi.testclient import TestClient

from intellitwin.app import app


@pytest.fixture(scope="module")
def c():
    mp = pytest.MonkeyPatch()
    mp.setenv("INTELLITWIN_DATA", tempfile.mkdtemp())
    mp.setenv("INTELLITWIN_ADMIN_PASSWORD", "Adm1n-Passw0rd!")
    mp.setenv("INTELLITWIN_AUTH", "on")
    with TestClient(app) as c:
        yield c
    mp.undo()


def login(c, u, p):
    return c.post("/api/auth/login", json={"username": u, "password": p})


def test_requires_login(c):
    c.cookies.clear()
    assert c.get("/api/state").status_code == 401
    assert c.get("/api/health").status_code == 200
    assert login(c, "admin", "wrong").status_code == 401


def test_roles_and_admin_flow(c):
    c.cookies.clear()
    assert login(c, "admin", "Adm1n-Passw0rd!").status_code == 200
    assert c.get("/api/state").status_code == 200
    r = c.post("/api/admin/users", json={"username": "view1", "name": "V One", "role": "viewer", "password": "Temp-Passw0rd1"})
    assert r.status_code == 200 and r.json()["must_change"]
    assert c.post("/api/admin/users", json={"username": "x1", "name": "x", "role": "viewer", "password": "short"}).status_code == 400
    c.post("/api/auth/logout")
    # viewer: must change password first, then read-only
    assert login(c, "view1", "Temp-Passw0rd1").status_code == 200
    assert c.get("/api/state").status_code == 403
    assert c.post("/api/auth/password", json={"current": "Temp-Passw0rd1", "new": "Viewer-Passw0rd2"}).status_code == 200
    assert c.get("/api/state").status_code == 200
    assert c.post("/api/demo/play", json={"on": False}).status_code == 403
    assert c.get("/api/admin/users").status_code == 403


def test_last_admin_protected_and_lockout(c):
    c.cookies.clear()
    login(c, "admin", "Adm1n-Passw0rd!")
    me = c.get("/api/auth/me").json()["user"]
    assert c.patch(f"/api/admin/users/{me['id']}", json={"disabled": True}).status_code == 400
    assert c.patch(f"/api/admin/users/{me['id']}", json={"role": "viewer"}).status_code == 400
    assert c.delete(f"/api/admin/users/{me['id']}").status_code == 400
    assert any(a["action"] == "user_created" for a in c.get("/api/admin/audit").json()["items"])
    c.cookies.clear()
    for _ in range(5):
        login(c, "nobody", "x")
    assert login(c, "nobody", "x").status_code == 429
