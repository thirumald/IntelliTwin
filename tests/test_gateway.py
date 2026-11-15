import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from intellitwin import gateway
from intellitwin.app import app

JS = "(function(){var TT = CFG.tomtom || {}, BASE = 'https://api.tomtom.com', STORE = 'k';})();"


@pytest.fixture(scope="module")
def c():
    mp = pytest.MonkeyPatch()
    fe = Path(tempfile.mkdtemp())
    (fe / "js").mkdir(); (fe / "assets").mkdir()
    (fe / "index.html").write_text("<html><body><h1>twin</h1></body></html>")
    (fe / "config.js").write_text("window.INTELLITWIN_CONFIG={auth:{enabled:true},map:{google:{key:'PUBLISHED'}},tomtom:{key:'PUBLISHED'}};")
    (fe / "js" / "tomtom.js").write_text(JS)
    (fe / "assets" / "presight-logo.png").write_bytes(b"png")
    (fe / "secret.txt").write_text("x")
    mp.setattr(gateway, "FRONTEND", fe)
    mp.setenv("INTELLITWIN_DATA", tempfile.mkdtemp())
    mp.setenv("INTELLITWIN_ADMIN_PASSWORD", "Adm1n-Passw0rd!")
    mp.setenv("INTELLITWIN_AUTH", "on")
    mp.setenv("TOMTOM_KEY", "server-key")
    calls = []

    async def fake(path, params):
        calls.append((path, dict(params)))
        return 200, "application/json", b'{"ok":true}'
    mp.setattr(gateway.tomtom, "_upstream", fake)
    gateway.tomtom.cache.clear(); gateway.tomtom.counts = {"nontile": 0, "tile": 0}; gateway.tomtom.hits = 0
    with TestClient(app, follow_redirects=False) as cl:
        cl.calls = calls
        yield cl
    mp.undo()


def admin(c):
    c.cookies.clear()
    assert c.post("/api/auth/login", json={"username": "admin", "password": "Adm1n-Passw0rd!"}).status_code == 200


def test_pages_need_login(c):
    c.cookies.clear()
    r = c.get("/", headers={"accept": "text/html"})
    assert r.status_code == 302 and r.headers["location"].startswith("/login.html")
    assert c.get("/login.html").status_code == 200
    assert c.get("/assets/presight-logo.png").status_code == 200
    assert c.get("/config.js").status_code == 401
    assert c.get("/tt/traffic/services/5/incidentDetails").status_code == 401


def test_served_front_end_is_patched(c):
    admin(c)
    html = c.get("/", headers={"accept": "text/html"}).text
    assert "/it-shell.js" in html
    cfg = c.get("/config.js").text
    assert "base:'/tt'" in cfg.replace(" ", "") or '"/tt"' in cfg or "'/tt'" in cfg
    assert "auth=Object.assign({},c.auth,{enabled:false})" in cfg.replace(" ", "")
    assert "google=Object.assign({},c.map.google,{key:null})" in cfg.replace(" ", "")
    assert "BASE = (TT.base || 'https://api.tomtom.com')" in c.get("/js/tomtom.js").text
    assert c.get("/secret.txt").status_code == 200
    assert c.get("/..%2f..%2fetc/passwd").status_code in (404, 400)
    assert c.get("/api/does-not-exist").status_code == 404


def test_proxy_adds_server_key_and_caches(c):
    admin(c)
    n0 = len(c.calls)
    url = "/tt/traffic/services/5/incidentDetails?bbox=1,2,3,4&key=BROWSER-KEY"
    r1 = c.get(url); r2 = c.get(url)
    assert r1.status_code == 200 and r1.headers["x-cache"] == "MISS" and r2.headers["x-cache"] == "HIT"
    assert len(c.calls) == n0 + 1
    path, params = c.calls[-1]
    assert params["key"] == "server-key" and "BROWSER-KEY" not in params.values() and params["bbox"] == "1,2,3,4"
    assert c.get("/tt/admin/secret").status_code == 404
    st = c.get("/api/tomtom/status").json()
    assert st["configured"] and st["requests_today"]["nontile"] >= 1 and st["cache_hits_today"] >= 1
    assert "server-key" not in str(st)


def test_cap_and_live_window(c, monkeypatch):
    admin(c)
    monkeypatch.setenv("TOMTOM_DAILY_CAP", str(gateway.tomtom.counts["nontile"]))
    assert c.get("/tt/routing/1/calculateRoute/1,2:3,4/json?x=unique1").status_code == 429
    monkeypatch.delenv("TOMTOM_DAILY_CAP")
    assert c.post("/api/admin/tomtom", json={"action": "stop"}).json()["live"] == "off"
    assert c.get("/tt/traffic/services/5/incidentDetails?bbox=9,9,9,9").status_code == 503
    assert c.post("/api/admin/tomtom", json={"action": "start", "minutes": 5}).json()["live"] == "on"
    assert c.get("/tt/traffic/services/5/incidentDetails?bbox=9,9,9,9").status_code == 200


def test_viewer_can_read_but_not_administer(c):
    admin(c)
    c.post("/api/admin/users", json={"username": "viewer1", "name": "V", "role": "viewer", "password": "Temp-Passw0rd1"})
    c.cookies.clear()
    c.post("/api/auth/login", json={"username": "viewer1", "password": "Temp-Passw0rd1"})
    c.post("/api/auth/password", json={"current": "Temp-Passw0rd1", "new": "Viewer-Passw0rd2"})
    assert c.get("/tt/traffic/services/5/incidentDetails?bbox=1,1,1,1").status_code == 200
    assert c.post("/api/admin/tomtom", json={"action": "stop"}).status_code == 403
    assert c.get("/admin.html", headers={"accept": "text/html"}).status_code == 302


def test_no_key(c, monkeypatch):
    admin(c)
    monkeypatch.delenv("TOMTOM_KEY")
    assert c.get("/tt/traffic/services/5/incidentDetails?bbox=2,2,2,2").status_code == 503
    assert "key:null" in c.get("/config.js").text.replace(" ", "")


def test_tiles_are_blocked_by_default(c, monkeypatch):
    admin(c)
    before = len(c.calls)
    r = c.get("/tt/traffic/map/4/tile/flow/relative0/10/1/1.png")
    assert r.status_code == 404 and len(c.calls) == before
    assert "INTELLITWIN_NO_TT_TILES=true" in c.get("/config.js").text
    monkeypatch.setenv("TOMTOM_TILES", "on")
    assert c.get("/tt/traffic/map/4/tile/flow/relative0/10/1/1.png").status_code == 200
