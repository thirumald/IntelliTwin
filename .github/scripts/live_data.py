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
# Satellites always followed (NORAD numbers); the name shown is the one N2YO returns for the number.
ALWAYS = [25544, 48274, 20580,                   # International Space Station, Chinese space station, Hubble
          37849, 43013, 54234,                   # Suomi NPP, NOAA-20, NOAA-21: the satellites behind the FIRMS detections
          25994, 27424, 39084, 49260, 40697,     # Terra, Aqua, Landsat 8, Landsat 9, Sentinel-2A
          43676, 39419, 35682]                   # KhalifaSat, DubaiSat-2, DubaiSat-1
CATEGORIES = [1, 3, 6]                           # N2YO groups also sampled for what is overhead: brightest, weather, Earth resources
os.makedirs(OUT, exist_ok=True)


def scrub(text):
    """Remove any key from a message before it is printed or stored."""
    text = str(text)
    for name in ("FIRMS_API_KEY", "N2YO_API_KEY", "AIS_API_KEY"):
        key = os.environ.get(name) or ""
        if key:
            text = text.replace(key, "***")
    return text[:600]


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
    ids, names, count = list(ALWAYS), {}, 0
    for cat in CATEGORIES:
        above = json.loads(get(f"{base}/above/{CENTRE[0]}/{CENTRE[1]}/0/70/{cat}/&apiKey={key}"))
        if "above" not in above:
            raise RuntimeError("N2YO answered: " + scrub(json.dumps(above)))
        for s in above.get("above") or []:
            name = (s.get("satname") or "").strip()
            names[s["satid"]] = name
            count += 1
            if " DEB" in name or " R/B" in name or name.startswith("OBJECT"):
                continue
            if s["satid"] not in ids:
                ids.append(s["satid"])
    picked = ids[:len(ALWAYS) + 22]
    sats = []
    for i in picked:
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
    return f"{len(sats)} satellites ({len(ALWAYS)} always followed, {count} bright, weather and Earth-observation satellites above the UAE at the time)"


async def ais_collect(key, seconds, box=None):
    """Listen for the given time, reconnecting if the stream drops; returns the vessels heard and a short log."""
    import websockets
    ships, log, msgs = {}, [], 0
    sub = {"APIKey": key.strip(), "BoundingBoxes": [box or [[BBOX[1], BBOX[0]], [BBOX[3], BBOX[2]]]]}
    end, attempt = time.time() + seconds, 0
    while time.time() < end - 5 and attempt < 6:
        attempt += 1
        try:
            async with websockets.connect("wss://stream.aisstream.io/v0/stream", open_timeout=30, ping_interval=None, max_size=None) as ws:
                await ws.send(json.dumps(sub))
                while time.time() < end:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=max(1, end - time.time()))
                    except asyncio.TimeoutError:
                        break
                    m = json.loads(raw)
                    if "error" in m:
                        raise RuntimeError("aisstream answered: " + scrub(m["error"]))
                    msgs += 1
                    meta, kind = m.get("MetaData") or {}, m.get("MessageType")
                    mmsi = meta.get("MMSI")
                    if not mmsi:
                        continue
                    s = ships.setdefault(mmsi, {"mmsi": mmsi, "name": (meta.get("ShipName") or "").strip()})
                    body = (m.get("Message") or {}).get(kind) or {}
                    if kind in ("PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"):
                        s.update(lon=round(meta.get("longitude", body.get("Longitude", 0)), 5), lat=round(meta.get("latitude", body.get("Latitude", 0)), 5),
                                 sog=round(body.get("Sog", 0), 1), cog=round(body.get("Cog", 0)), hdg=body.get("TrueHeading", 511), nav=body.get("NavigationalStatus", 15),
                                 t=(meta.get("time_utc") or "")[:19])
                    elif kind == "ShipStaticData":
                        s.update(type=body.get("Type", 0), dest=(body.get("Destination") or "").strip(" @"), call=(body.get("CallSign") or "").strip())
                        d = body.get("Dimension") or {}
                        s["len"] = (d.get("A") or 0) + (d.get("B") or 0)
        except RuntimeError:
            raise
        except Exception as err:  # the stream dropped: note it and connect again
            code = getattr(getattr(err, "rcvd", None), "code", None)
            log.append(f"after {int(seconds - (end - time.time()))} s")
            log.append(scrub(f"{type(err).__name__}{' ' + str(code) if code else ''}: {err}")[:120])
            await asyncio.sleep(min(10, 2 * attempt))
    return [s for s in ships.values() if "lon" in s], msgs, attempt, log


def vessels():
    key = os.environ.get("AIS_API_KEY")
    if not key:
        raise RuntimeError("AIS_API_KEY is not set")
    seconds = int(os.environ.get("AIS_SECONDS", "150"))
    ships, msgs, attempts, log = asyncio.run(ais_collect(key, seconds))
    if not ships:
        k = key.strip()
        shape = f"key has {len(k)} characters" + ("" if all(c in "0123456789abcdefABCDEF" for c in k) and len(k) == 40 else ", not the usual 40 letters and digits (a-f, 0-9)")
        # Listen to the whole world for a moment: if that works, the key is fine and nothing was heard near the UAE.
        world, wmsgs, _, wlog = asyncio.run(ais_collect(key, 25, [[-90, -180], [90, 180]]))
        raise RuntimeError(f"no vessel position was received in {seconds} seconds ({msgs} messages, {attempts} connections" + (f"; drops: {', '.join(log[-4:])}" if log else "") +
                           f"). {shape}. World-wide test: {wmsgs} messages" + (f", drop: {wlog[-1]}" if wlog else "") + ".")
    save("vessels.json", {"updated": NOW, "source": f"aisstream.io AIS, positions heard in {seconds} seconds", "bbox": BBOX, "ships": ships})
    return f"{len(ships)} vessels from {msgs} messages" + (f", {len(log)} reconnects" if log else "")


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
