"""Gateway: serves the contributor's front end behind our login, and proxies TomTom with a server-side key.

Why a proxy: the front end calls api.tomtom.com from the browser with a key. Here the browser calls /tt/... on our
server instead; the server adds the key (kept in an environment variable), caches answers for a short time so many
viewers share one upstream call, counts requests against a daily cap, and can be switched on and off for a demo window.
The browser never sees the key.

Serve-time patches (the front-end files on disk are never edited):
  * config.js      : appended overrides: disable the demo sign-in (our login replaces it), drop the published map key,
                     point TomTom at /tt with a placeholder key.
  * js/tomtom.js   : the API base URL becomes configurable (tomtom.base).
  * index.html     : adds /it-shell.js (user chip, sign-out, admin link).
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = Path(os.environ.get("INTELLITWIN_FRONTEND", ROOT / "frontend"))
STATIC = Path(__file__).resolve().parent / "static"
UPSTREAM = "https://api.tomtom.com"
ALLOWED_PREFIXES = ("traffic/", "search/", "routing/")
PUBLIC_PATHS = {"/login.html", "/assets/presight-logo.png", "/favicon.ico"}

router = APIRouter()


def tiles_allowed() -> bool:
    """Map tiles from TomTom are off by default: the twin's own simulated traffic is the product, and a secured on-prem
    deployment cannot fetch tiles. Set TOMTOM_TILES=on to allow them. Data-point calls (incidents, speeds, routing, search) are separate."""
    return os.environ.get("TOMTOM_TILES", "off").strip().lower() == "on"


# ---------------------------------------------------------------- TomTom proxy
def _ttl(path: str) -> int:
    if path.startswith("traffic/map/"):
        return 180
    if "incidentDetails" in path:
        return 60
    if "flowSegmentData" in path:
        return 120
    if path.startswith("search/"):
        return 300
    return 60


class TomTomProxy:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.cache: dict[str, tuple[float, int, str, bytes]] = {}
        self.cache_bytes = 0
        self.max_cache_bytes = 64 * 1024 * 1024
        self.day = ""
        self.counts = {"nontile": 0, "tile": 0}
        self.hits = 0
        self.last_error = ""
        self.live_on = True
        self.live_until: float | None = None

    # configuration is read on every call so tests and operators can change the environment
    @property
    def key(self) -> str:
        return os.environ.get("TOMTOM_KEY", "").strip()

    @property
    def caps(self) -> dict[str, int]:
        return {"nontile": int(os.environ.get("TOMTOM_DAILY_CAP", "2000")), "tile": int(os.environ.get("TOMTOM_TILE_CAP", "20000"))}

    def _roll_day(self) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self.day:
            self.day, self.counts, self.hits = today, {"nontile": 0, "tile": 0}, 0

    def live(self) -> str:
        """'no_key', 'off' or 'on'."""
        if not self.key:
            return "no_key"
        if self.live_until is not None and time.time() > self.live_until:
            self.live_on, self.live_until = False, None
        return "on" if self.live_on else "off"

    def set_live(self, on: bool, minutes: int | None = None) -> None:
        self.live_on = on
        self.live_until = time.time() + minutes * 60 if (on and minutes) else None

    def status(self) -> dict:
        with self.lock:
            self._roll_day()
            return {"configured": bool(self.key), "live": self.live(), "live_until": self.live_until, "day": self.day,
                    "requests_today": dict(self.counts), "caps": self.caps, "cache_hits_today": self.hits,
                    "cache_entries": len(self.cache), "last_error": self.last_error}

    def _cache_get(self, k: str):
        e = self.cache.get(k)
        if e and e[0] > time.time():
            return e
        if e:
            self.cache_bytes -= len(e[3])
            del self.cache[k]
        return None

    def _cache_put(self, k: str, ttl: int, status: int, ctype: str, body: bytes) -> None:
        if len(body) > 2 * 1024 * 1024:
            return
        if k in self.cache:
            self.cache_bytes -= len(self.cache[k][3])
        self.cache[k] = (time.time() + ttl, status, ctype, body)
        self.cache_bytes += len(body)
        if self.cache_bytes > self.max_cache_bytes:  # drop the entries closest to expiry first
            for kk, v in sorted(self.cache.items(), key=lambda kv: kv[1][0]):
                self.cache_bytes -= len(v[3])
                del self.cache[kk]
                if self.cache_bytes < self.max_cache_bytes * 0.7:
                    break

    async def _upstream(self, path: str, params: list[tuple[str, str]]) -> tuple[int, str, bytes]:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{UPSTREAM}/{path}", params=params, headers={"User-Agent": "IntelliTwin-gateway/1.0"})
        return r.status_code, r.headers.get("content-type", "application/octet-stream"), r.content

    async def get(self, path: str, query: list[tuple[str, str]]) -> Response:
        if not path.startswith(ALLOWED_PREFIXES) or ".." in path:
            raise HTTPException(404, "Not a proxied TomTom path")
        if path.startswith("traffic/map/") and not tiles_allowed():
            return JSONResponse({"detail": "TomTom map tiles are disabled on this server (TOMTOM_TILES=off)"}, status_code=404)
        state = self.live()
        if state == "no_key":
            return JSONResponse({"detail": "No TomTom key is configured on the server"}, status_code=503)
        if state == "off":
            return JSONResponse({"detail": "Live data is switched off. An administrator can start a live demo window."}, status_code=503)
        params = sorted((k, v) for k, v in query if k.lower() != "key")
        ck = path + "?" + urlencode(params)
        tile = path.startswith("traffic/map/")
        with self.lock:
            self._roll_day()
            hit = self._cache_get(ck)
            if hit:
                self.hits += 1
                return Response(hit[3], status_code=hit[1], media_type=hit[2], headers={"X-Cache": "HIT"})
            kind = "tile" if tile else "nontile"
            if self.counts[kind] >= self.caps[kind]:
                return JSONResponse({"detail": f"Daily demo cap of {self.caps[kind]} {kind} requests reached"}, status_code=429)
            self.counts[kind] += 1
        try:
            status, ctype, body = await self._upstream(path, params + [("key", self.key)])
        except Exception as ex:  # network failure
            with self.lock:
                self.last_error = f"upstream unreachable: {type(ex).__name__}"
            return JSONResponse({"detail": "TomTom could not be reached"}, status_code=502)
        with self.lock:
            if status == 200:
                self.last_error = ""
                self._cache_put(ck, _ttl(path), status, ctype, body)
            else:
                self.last_error = {403: "TomTom refused the key or the product is not enabled (403)", 429: "TomTom rate or quota limit reached (429)"}.get(status, f"TomTom answered {status}")
                if status in (403, 429):
                    self._cache_put(ck, 20, status, ctype, body)  # do not hammer a refusing upstream
        return Response(body, status_code=status, media_type=ctype, headers={"X-Cache": "MISS"})


tomtom = TomTomProxy()


@router.get("/tt/{path:path}")
async def tt(path: str, request: Request):
    return await tomtom.get(path, list(request.query_params.multi_items()))


@router.get("/api/tomtom/status")
def tt_status():
    return tomtom.status()


@router.post("/api/admin/tomtom")
def tt_admin(body: dict):
    action = body.get("action")
    if action == "start":
        minutes = max(1, min(int(body.get("minutes", 90)), 600))
        tomtom.set_live(True, minutes)
    elif action == "stop":
        tomtom.set_live(False)
    else:
        raise HTTPException(400, "action must be start or stop")
    return tomtom.status()


# ---------------------------------------------------------------- front end
def _read(rel: str) -> str:
    return (FRONTEND / rel).read_text(encoding="utf-8")


def patched_config() -> str:
    server_key = bool(tomtom.key)
    override = (
        "\n;(function(){var c=window.INTELLITWIN_CONFIG||{};\n"
        "  c.auth=Object.assign({},c.auth,{enabled:false});            /* the server login replaces the demo sign-in */\n"
        "  c.map=c.map||{};c.map.google=Object.assign({},c.map.google,{key:null});   /* never use keys published in the file */\n"
        f"  c.tomtom=Object.assign({{}},c.tomtom,{{key:{json.dumps('server' if server_key else None)},base:'/tt'}});\n"
        f"  c.layers=Object.assign({{}},c.layers,{{tomtomTraffic:{'true' if tiles_allowed() else 'false'}}});c.tomtom.flowOnStart={'true' if tiles_allowed() else 'false'};\n"
        f"  window.INTELLITWIN_SERVER=true;window.INTELLITWIN_NO_TT_TILES={'false' if tiles_allowed() else 'true'};}})();\n")
    return _read("config.js") + override


def patched_tomtom_js() -> str:
    src = _read("js/tomtom.js")
    new, n = re.subn(r"BASE\s*=\s*'https://api\.tomtom\.com'", "BASE = (TT.base || 'https://api.tomtom.com')", src, count=1)
    if n != 1:
        print("WARNING: js/tomtom.js changed upstream; could not patch the API base URL, TomTom will call the browser key path.", flush=True)
    if not tiles_allowed():  # no tile requests: no key probe, no "live traffic now" option, no road recolouring
        new, m = re.subn(r"function tryFlow\(\) \{", "function tryFlow() { return;", new, count=1)
        new, m2 = re.subn(r"if \(sel && has\(\)\) \{", "if (sel && has() && false) {", new, count=1)
        if m != 1 or m2 != 1:
            print("WARNING: js/tomtom.js changed upstream; could not disable TomTom tiles in the patch.", flush=True)
    return new


def patched_index() -> str:
    html = _read("index.html")
    tag = '<script src="/it-shell.js"></script>'
    return html.replace("</body>", tag + "\n</body>", 1) if "</body>" in html else html + tag


NO_STORE = {"Cache-Control": "no-store"}


def _frontend_ready() -> bool:
    return (FRONTEND / "index.html").exists()


@router.get("/login.html")
def login_page():
    return FileResponse(STATIC / "login.html", headers=NO_STORE)


@router.get("/admin.html")
def admin_page():
    return FileResponse(STATIC / "admin.html", headers=NO_STORE)


@router.get("/it-shell.js")
def shell_js():
    return FileResponse(STATIC / "it-shell.js", headers=NO_STORE, media_type="application/javascript")


@router.get("/config.js")
def config_js():
    if not _frontend_ready():
        raise HTTPException(503, "Front end not installed. Run tools/fetch_frontend.sh")
    return Response(patched_config(), media_type="application/javascript", headers=NO_STORE)


@router.get("/js/tomtom.js")
def tomtom_js():
    if not _frontend_ready():
        raise HTTPException(503, "Front end not installed. Run tools/fetch_frontend.sh")
    return Response(patched_tomtom_js(), media_type="application/javascript", headers=NO_STORE)


@router.get("/")
@router.get("/index.html")
def index():
    if not _frontend_ready():
        return PlainTextResponse("Front end not installed. Run tools/fetch_frontend.sh and restart.", status_code=503)
    return Response(patched_index(), media_type="text/html", headers=NO_STORE)


@router.get("/{path:path}")
def frontend_file(path: str):
    if path.startswith(("api/", "tt/")):
        raise HTTPException(404, "Not found")
    f = (FRONTEND / path).resolve()
    if FRONTEND.resolve() not in f.parents or not f.is_file():
        raise HTTPException(404, "Not found")
    headers = NO_STORE if f.suffix in (".html", ".js", ".css") else {"Cache-Control": "private, max-age=300"}
    return FileResponse(f, headers=headers)
