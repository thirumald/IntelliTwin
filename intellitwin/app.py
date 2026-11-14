"""IntelliTwin API. Run:  uvicorn intellitwin.app:app --port 8090"""
from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Query, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, analytics as an
from .city import list_cities
from .engine import Engine, start_background
from .evidence import render_frame, render_plate

WEB = Path(__file__).resolve().parent.parent / "web"
engine: Engine | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    engine = Engine(os.environ.get("INTELLITWIN_CITY", "abu_dhabi"), start=os.environ.get("INTELLITWIN_START", "07:20"))
    engine.set_speed(float(os.environ.get("INTELLITWIN_SPEED", "10")))
    start_background(engine)
    yield


app = FastAPI(title="IntelliTwin", version=__version__, lifespan=lifespan)


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
def incident_action(iid: str, action: str):
    e = E()
    if iid not in e.incidents:
        raise HTTPException(404, "unknown incident")
    try:
        inc = e.incident_action(iid, action)
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
def violation_action(vid: str, action: str, body: dict | None = Body(default=None)):
    e = E()
    if vid not in e.violations:
        raise HTTPException(404, "unknown violation")
    try:
        v = e.violation_action(vid, action, (body or {}).get("reason"))
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


app.mount("/", StaticFiles(directory=str(WEB), html=True), name="web")
