"""Fetch live data for IntelliTwin and write small JSON files for the site.

Sources (each optional; a missing key or a failed call leaves the previous file in place):
  NASA FIRMS   fire and heat detections from satellites     FIRMS_API_KEY
  N2YO         orbital elements of satellites over the UAE   N2YO_API_KEY
  aisstream.io vessel positions (AIS) in UAE waters          AIS_API_KEY

The keys come from the environment (GitHub Actions secrets) and are never written to the output or the log.
status.json records, for each source, whether the last attempt worked and when.
"""
import asyncio
import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
BBOX = (51.0, 22.4, 56.7, 26.5)                  # UAE and its waters: west, south, east, north
CENTRE = (24.4, 54.5)                            # observer for "satellites above": lat, lon
NOW = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
ALWAYS = [25544]                                 # International Space Station
os.makedirs(OUT, exist_ok=True)


def scrub(text):
    """Remove any key from a message before it is printed or stored."""
    text = str(text)
    for name in ("FIRMS_API_KEY", "N2YO_API_KEY", "AIS_API_KEY"):
        key = os.environ.get(name) or ""
        if key:
            text = text.replace(key, "***")
    return text[:300]


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "IntelliTwin live data (github.com/thirumald/IntelliTwin)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def save(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))


def fires():
    key = os.environ.get("FIRMS_API_KEY")
    if not key:
        raise RuntimeError("FIRMS_API_KEY is not set")
    area = ",".join(str(v) for v in BBOX)
    rows, used = [], []
    for source in ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"):
        text = get(f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{area}/2")
        if not text.lstrip().lower().startswith("latitude"):
            raise RuntimeError("FIRMS answered: " + scrub(text.strip().splitlines()[0] if text.strip() else "nothing"))
        n = 0
        for r in csv.DictReader(io.StringIO(text)):
            try:
                t = str(r.get("acq_time", "0")).zfill(4)
                rows.append([round(float(r["longitude"]), 4), round(float(r["latitude"]), 4), r.get("acq_date", ""), t[:2] + ":" + t[2:],
                             round(float(r.get("frp") or 0), 1), (r.get("confidence") or "")[:1], r.get("satellite", ""), r.get("daynight", "")])
                n += 1
            except (KeyError, ValueError):
                continue
        used.append(f"{source}: {n}")
    rows.sort(key=lambda r: (r[2], r[3]), reverse=True)
    save("fires.json", {"updated": NOW, "source": "NASA FIRMS, VIIRS 375 m active fire, last 2 days", "bbox": BBOX,
                        "fields": ["lon", "lat", "date", "time_utc", "frp_mw", "confidence", "satellite", "daynight"], "rows": rows[:3000]})
    return f"{len(rows)} detections ({'; '.join(used)})"


def satellites():
    key = os.environ.get("N2YO_API_KEY")
    if not key:
        raise RuntimeError("N2YO_API_KEY is not set")
    base = "https://api.n2yo.com/rest/v1/satellite"
    above = json.loads(get(f"{base}/above/{CENTRE[0]}/{CENTRE[1]}/0/45/0/&apiKey={key}"))
    if "above" not in above:
        raise RuntimeError("N2YO answered: " + scrub(json.dumps(above)))
    ids, names = list(ALWAYS), {}
    for s in above.get("above") or []:
        name = (s.get("satname") or "").strip()
        names[s["satid"]] = name
        # Skip debris and rocket bodies; keep working satellites, and not too many of one constellation.
        if " DEB" in name or " R/B" in name or name.startswith("OBJECT"):
            continue
        if s["satid"] not in ids:
            ids.append(s["satid"])
    seen, picked = {}, []
    for i in ids:
        fam = (names.get(i, "ISS").split("-")[0].split(" ")[0])
        seen[fam] = seen.get(fam, 0) + 1
        if seen[fam] <= 6:
            picked.append(i)
    sats = []
    for i in picked[:40]:
        try:
            d = json.loads(get(f"{base}/tle/{i}&apiKey={key}", timeout=30))
            lines = [x.strip() for x in (d.get("tle") or "").replace("\r", "").split("\n") if x.strip()]
            if len(lines) == 2:
                sats.append({"id": i, "name": (d.get("info") or {}).get("satname") or names.get(i, str(i)), "l1": lines[0], "l2": lines[1]})
        except (urllib.error.URLError, ValueError, TimeoutError):
            continue
    if not sats:
        raise RuntimeError("no orbital elements were returned")
    save("satellites.json", {"updated": NOW, "source": "N2YO.com orbital elements (TLE); positions are computed in the browser", "observer": CENTRE, "sats": sats})
    return f"{len(sats)} satellites ({above.get('info', {}).get('satcount', '?')} objects above the UAE at the time)"


async def ais_collect(key, seconds):
    import websockets
    ships = {}
    sub = {"APIKey": key, "BoundingBoxes": [[[BBOX[1], BBOX[0]], [BBOX[3], BBOX[2]]]], "FilterMessageTypes": ["PositionReport", "ShipStaticData", "StandardClassBPositionReport"]}
    end = time.time() + seconds
    async with websockets.connect("wss://stream.aisstream.io/v0/stream", open_timeout=30) as ws:
        await ws.send(json.dumps(sub))
        while time.time() < end:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=max(1, end - time.time()))
            except asyncio.TimeoutError:
                break
            m = json.loads(raw)
            if "error" in m:
                raise RuntimeError("aisstream answered: " + scrub(m["error"]))
            meta, kind = m.get("MetaData") or {}, m.get("MessageType")
            mmsi = meta.get("MMSI")
            if not mmsi:
                continue
            s = ships.setdefault(mmsi, {"mmsi": mmsi, "name": (meta.get("ShipName") or "").strip()})
            body = (m.get("Message") or {}).get(kind) or {}
            if kind in ("PositionReport", "StandardClassBPositionReport"):
                s.update(lon=round(meta.get("longitude", body.get("Longitude", 0)), 5), lat=round(meta.get("latitude", body.get("Latitude", 0)), 5),
                         sog=round(body.get("Sog", 0), 1), cog=round(body.get("Cog", 0)), hdg=body.get("TrueHeading", 511), nav=body.get("NavigationalStatus", 15),
                         t=(meta.get("time_utc") or "")[:19])
            elif kind == "ShipStaticData":
                s.update(type=body.get("Type", 0), dest=(body.get("Destination") or "").strip(" @"), call=(body.get("CallSign") or "").strip())
                d = body.get("Dimension") or {}
                s["len"] = (d.get("A") or 0) + (d.get("B") or 0)
    return [s for s in ships.values() if "lon" in s]


def vessels():
    key = os.environ.get("AIS_API_KEY")
    if not key:
        raise RuntimeError("AIS_API_KEY is not set")
    seconds = int(os.environ.get("AIS_SECONDS", "150"))
    ships = asyncio.run(ais_collect(key, seconds))
    if not ships:
        raise RuntimeError(f"no vessel position was received in {seconds} seconds")
    save("vessels.json", {"updated": NOW, "source": f"aisstream.io AIS, positions heard in {seconds} seconds", "bbox": BBOX, "ships": ships})
    return f"{len(ships)} vessels"


status_path = os.path.join(OUT, "status.json")
try:
    with open(status_path, encoding="utf-8") as f:
        status = json.load(f)
except (OSError, ValueError):
    status = {}
status["checked"] = NOW
failed = 0
for name, fn in (("fires", fires), ("satellites", satellites), ("vessels", vessels)):
    prev = status.get(name) or {}
    try:
        note = fn()
        status[name] = {"ok": True, "updated": NOW, "note": note}
        print(f"{name}: OK - {note}", flush=True)
    except Exception as err:  # one source failing must not stop the others
        failed += 1
        msg = scrub(f"{type(err).__name__}: {err}")
        status[name] = {"ok": False, "updated": prev.get("updated") if prev.get("ok") or prev.get("updated") else None, "error": msg, "tried": NOW}
        print(f"{name}: FAILED - {msg}", flush=True)
save("status.json", status)
print(f"{3 - failed} of 3 sources updated", flush=True)
