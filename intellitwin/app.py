"""IntelliTwin API. Run:  uvicorn intellitwin.app:app --port 8090"""
from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote

from fastapi import Body, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from . import __version__, analytics as an, auth as authmod, gateway
from .city import list_cities
from .engine import Engine, start_background
from .evidence import render_frame, render_plate

WEB = Path(__file__).resolve().parent.parent / "web"
engine: Engine | None = None
auth: authmod.Auth | None = None
PUBLIC_API = {"/api/auth/login", "/api/health"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, auth
    auth = authmod.Auth()
    if auth.bootstrap_note:
        print("\n" + "=" * 72 + "\n  " + auth.bootstrap_note + "\n" + "=" * 72 + "\n", flush=True)
    if not authmod.enabled():
        print("WARNING: INTELLITWIN_AUTH=off, login is disabled and everyone is admin.", flush=True)
    engine = Engine(os.environ.get("INTELLITWIN_CITY", "abu_dhabi"), start=os.environ.get("INTELLITWIN_START", "07:20"))
    engine.set_speed(float(os.environ.get("INTELLITWIN_SPEED", "10")))
    start_background(engine)
    yield


app = FastAPI(title="IntelliTwin", version=__version__, lifespan=lifespan)


def _ip(request: Request) -> str:
    return request.client.host if request.client else "-"


def _is_api(path: str) -> bool:
    return path.startswith(("/api/", "/tt/"))


def _wants_html(request: Request) -> bool:
    return request.method == "GET" and ("text/html" in request.headers.get("accept", "") or request.url.path in ("/", "/index.html", "/admin.html"))


@app.middleware("http")
async def guard(request: Request, call_next):
    path, method = request.url.path, request.method
    request.state.user = None
    request.state.token = request.cookies.get(authmod.COOKIE)
    if not _is_api(path):
        if not authmod.enabled() or path in gateway.PUBLIC_PATHS:
            return await call_next(request)
        # pages and static files: the login page and logo are public, everything else needs a session
        user = auth.user_for(request.state.token) if auth else None
        request.state.user = user
        if user is None:
            if _wants_html(request):
                nxt = quote(path + (("?" + request.url.query) if request.url.query else ""), safe="/")
                return RedirectResponse("/login.html?next=" + nxt, status_code=302)
            return JSONResponse({"detail": "Not signed in"}, status_code=401)
        if user["must_change"]:
            return RedirectResponse("/login.html?change=1", status_code=302) if _wants_html(request) else JSONResponse({"detail": "Password change required"}, status_code=403)
        if path == "/admin.html" and user["role"] != "admin":
            return RedirectResponse("/", status_code=302)
        return await call_next(request)
    if not authmod.enabled():
        request.state.user = {"id": 0, "username": "demo", "name": "Demo (no login)", "role": "admin", "disabled": False, "must_change": False}
        return await call_next(request)
    user = auth.user_for(request.state.token) if auth else None
    request.state.user = user
    if path in PUBLIC_API:
        return await call_next(request)
    if user is None:
        return JSONResponse({"detail": "Not signed in"}, status_code=401)
    if method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")  # CSRF defence in depth on top of SameSite=Lax
        if origin and origin.split("://", 1)[-1] != request.headers.get("host"):
            return JSONResponse({"detail": "Cross-origin request blocked"}, status_code=403)
    if user["must_change"] and not path.startswith("/api/auth/"):
        return JSONResponse({"detail": "Password change required", "code": "password_change_required"}, status_code=403)
    if path.startswith("/api/admin/") and user["role"] != "admin":
        return JSONResponse({"detail": "Admin only"}, status_code=403)
    if method not in ("GET", "HEAD", "OPTIONS") and not path.startswith("/api/auth/") and user["role"] == "viewer":
        return JSONResponse({"detail": "Your role is read-only"}, status_code=403)
    resp = await call_next(request)
    if method == "POST" and path.startswith("/api/") and not path.startswith(("/api/auth/", "/api/admin/")) and resp.status_code < 400:
        auth.log(user["username"], "action", path.removeprefix("/api/"), None, _ip(request))
    return resp


def U(request: Request) -> dict:
    return request.state.user


def _err(ex: authmod.AuthError):
    raise HTTPException(ex.status, ex.msg)


@app.post("/api/auth/login")
def login(request: Request, response: Response, body: dict = Body(...)):
    try:
        token, user = auth.login(str(body.get("username", "")), str(body.get("password", "")), _ip(request))
    except authmod.AuthError as ex:
        _err(ex)
    response.set_cookie(authmod.COOKIE, token, max_age=authmod.SESSION_TTL, httponly=True, samesite="lax",
                        secure=request.url.scheme == "https", path="/")
    return user


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    auth.logout(request.state.token, request.state.user, _ip(request))
    response.delete_cookie(authmod.COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def me(request: Request):
    return {"user": U(request), "auth": authmod.enabled()}


@app.post("/api/auth/password")
def change_password(request: Request, body: dict = Body(...)):
    try:
        auth.change_password(U(request), str(body.get("current", "")), str(body.get("new", "")), request.state.token, _ip(request))
    except authmod.AuthError as ex:
        _err(ex)
    return {"ok": True}


@app.get("/api/admin/users")
def admin_users():
    return {"users": auth.list_users(), "roles": list(authmod.ROLES)}


@app.post("/api/admin/users")
def admin_create(request: Request, body: dict = Body(...)):
    try:
        return auth.create_user(U(request), body.get("username", ""), body.get("name", ""), body.get("role", "viewer"), body.get("password", ""), _ip(request))
    except authmod.AuthError as ex:
        _err(ex)


@app.patch("/api/admin/users/{uid}")
def admin_update(uid: int, request: Request, body: dict = Body(...)):
    try:
        return auth.update_user(U(request), uid, body, _ip(request))
    except authmod.AuthError as ex:
        _err(ex)


@app.delete("/api/admin/users/{uid}")
def admin_delete(uid: int, request: Request):
    try:
        auth.delete_user(U(request), uid, _ip(request))
    except authmod.AuthError as ex:
        _err(ex)
    return {"ok": True}


@app.get("/api/admin/audit")
def admin_audit(limit: int = 200, q: str | None = None):
    return {"items": auth.audit(limit, q)}


def E() -> Engine:
    assert engine is not None
    return engine


@app.get("/api/meta")
def meta():
    e = E()
    with e.lock:
        m = dict(e.city.meta)
        tiles = os.environ.get("INTELLITWIN_TILES")  # raster tile URL template; default OpenStreetMap (demo use only)
        if tiles:
            m["tiles"] = tiles
        return {"version": __version__, "tiles": os.environ.get("INTELLITWIN_TILES"), "city": m, "cities": list_cities(), "n_segments": e.city.n, "n_devices": len(e.city.devices), "history_days": e.history_days}


@app.get("/api/roads")
def roads():
    e = E()
    with e.lock:
        feats = [{"type": "Feature", "id": s["id"], "properties": {"id": s["id"], "name": s["name"], "cls": s["cls"], "limit": s["limit"], "district": s["district"]}, "geometry": {"type": "LineString", "coordinates": s["coords"]}} for s in e.city.segs]
        devs = [{"type": "Feature", "properties": {"id": d["id"], "kind": d["kind"], "name": d["name"]}, "geometry": {"type": "Point", "coordinates": [d["lon"], d["lat"]]}} for d in e.city.devices]
    return JSONResponse({"roads": {"type": "FeatureCollection", "features": feats}, "devices": {"type": "FeatureCollection", "features": devs}})


@app.get("/api/state")
def state():
    e = E()
    with e.lock:
        active = [an.ser_inc(e, i) for i in e.incidents.values() if i["status"] != "cleared"]
        k = an.kpis(e)
        return {"now": an.iso(e.now), "speed": e.speed, "playing": e.playing, "story": e.story_state, "ratios": [int(x * 100) for x in e.ratio], "incidents": active, "kpis": k,
                "feed": [{"ts": an.iso(f["ts"]), "level": f["level"], "kind": f["kind"], "text": f["text"], "ref": f["ref"]} for f in list(e.feed)[:12]]}


@app.get("/api/feed")
def feed(limit: int = 50):
    e = E()
    with e.lock:
        return [{"ts": an.iso(f["ts"]), "level": f["level"], "kind": f["kind"], "text": f["text"], "ref": f["ref"]} for f in list(e.feed)[:limit]]


@app.get("/api/congestion")
def congestion():
    e = E()
    with e.lock:
        return an.congestion(e)


@app.get("/api/forecast")
def forecast():
    e = E()
    with e.lock:
        return an.forecast(e)


@app.get("/api/forecast/map")
def forecast_map(minutes: int = 30):
    e = E()
    with e.lock:
        return {"minutes": minutes, "ratios": an.forecast_map(e, minutes)}


@app.get("/api/incidents")
def incidents(status: str | None = None, active: bool | None = None, limit: int = 100):
    e = E()
    with e.lock:
        xs = sorted(e.incidents.values(), key=lambda i: i["t"]["detected"], reverse=True)
        if status:
            xs = [i for i in xs if i["status"] == status]
        if active is not None:
            xs = [i for i in xs if (i["status"] != "cleared") == active]
        return [an.ser_inc(e, i) for i in xs[:limit]]


@app.get("/api/incidents/{iid}")
def incident(iid: str):
    e = E()
    with e.lock:
        if iid not in e.incidents:
            raise HTTPException(404, "unknown incident")
        return an.ser_inc(e, e.incidents[iid], True)


@app.post("/api/incidents/{iid}/{action}")
def incident_action(iid: str, action: str, request: Request):
    e = E()
    if iid not in e.incidents:
        raise HTTPException(404, "unknown incident")
    try:
        inc = e.incident_action(iid, action, U(request)["name"])
    except ValueError as ex:
        raise HTTPException(400, str(ex))
    with e.lock:
        return an.ser_inc(e, inc, True)


@app.get("/api/chain/{iid}")
def chain(iid: str):
    e = E()
    with e.lock:
        if iid not in e.incidents:
            raise HTTPException(404, "unknown incident")
        return an.chain(e, iid)


@app.get("/api/violations")
def violations(status: str | None = None, type: str | None = None, q: str | None = None, district: str | None = None, limit: int = 100, offset: int = 0):
    e = E()
    with e.lock:
        xs = sorted(e.violations.values(), key=lambda v: v["ts"], reverse=True)
        if status:
            xs = [v for v in xs if v["status"] == status]
        if type:
            xs = [v for v in xs if v["type"] == type]
        if district:
            xs = [v for v in xs if v["district"] == district]
        if q:
            ql = q.lower()
            xs = [v for v in xs if ql in v["vehicle"]["plate"].lower() or ql in v["id"].lower() or ql in (v["fine_ref"] or "").lower() or ql in v["street"].lower()]
        return {"total": len(xs), "items": [an.ser_vio(e, v) for v in xs[offset : offset + limit]]}


@app.get("/api/violations/{vid}")
def violation(vid: str):
    e = E()
    with e.lock:
        if vid not in e.violations:
            raise HTTPException(404, "unknown violation")
        return an.ser_vio(e, e.violations[vid], True)


@app.post("/api/violations/{vid}/{action}")
def violation_action(vid: str, action: str, request: Request, body: dict | None = Body(default=None)):
    e = E()
    if vid not in e.violations:
        raise HTTPException(404, "unknown violation")
    try:
        v = e.violation_action(vid, action, (body or {}).get("reason"), U(request)["name"])
    except ValueError as ex:
        raise HTTPException(400, str(ex))
    with e.lock:
        return an.ser_vio(e, v, True)


@app.get("/api/violations/{vid}/evidence/{frame}.png")
def evidence(vid: str, frame: str):
    e = E()
    with e.lock:
        v = e.violations.get(vid)
        if v is None:
            raise HTTPException(404, "unknown violation")
        snap = dict(v)
    png = render_plate(snap) if frame == "plate" else render_frame(snap, int(frame), snap["device_name"])
    return Response(png, media_type="image/png", headers={"Cache-Control": "max-age=3600"})


@app.get("/api/dashboards/{name}")
def dashboard(name: str):
    e = E()
    fn = {"executive": an.executive, "police": an.police, "enforcement": an.enforcement}.get(name)
    if fn is None:
        raise HTTPException(404, "unknown dashboard")
    with e.lock:
        return fn(e)


@app.post("/api/demo/speed")
def demo_speed(body: dict = Body(...)):
    E().set_speed(float(body["x"]))
    return {"speed": E().speed}


@app.post("/api/demo/play")
def demo_play(body: dict = Body(...)):
    E().set_playing(bool(body["on"]))
    return {"playing": E().playing}


@app.post("/api/demo/storyline")
def demo_story():
    return E().start_storyline()


@app.post("/api/demo/reset")
def demo_reset(body: dict | None = Body(default=None)):
    b = body or {}
    E().reset(b.get("city"), b.get("start", "07:20"))
    return {"ok": True, "city": E().city.id}


@app.get("/api/health")
def health():
    return {"ok": True, "version": __version__}


app.include_router(gateway.router)  # must be last: it holds the catch-all that serves the front end
