"""Fetch live data for IntelliTwin and write small JSON files for the site.

Sources (each optional; a missing key or a failed call leaves the previous file in place):
  NASA FIRMS   fire and heat detections from satellites     FIRMS_API_KEY
  N2YO         orbital elements of satellites over the UAE   N2YO_API_KEY
  aisstream.io vessel positions (AIS) in UAE waters          AIS_API_KEY
  Flightradar24 aircraft to and from UAE airports           FLIGHT_RADAR (billed: 8 credits for each flight returned)

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
    for name in ("FIRMS_API_KEY", "N2YO_API_KEY", "AIS_API_KEY", "FLIGHT_RADAR"):
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
    seconds = int(os.environ.get("AIS_SECONDS") or 300)
    keep_hours = float(os.environ.get("AIS_KEEP_HOURS") or 6)
    ships, msgs, attempts, log = asyncio.run(ais_collect(key, seconds))
    # Coverage near the UAE is thin, so vessels heard in earlier runs are kept for a few hours, each with the time it was last heard.
    merged = {}
    try:
        with open(os.path.join(OUT, "vessels.json"), encoding="utf-8") as f:
            for old in json.load(f).get("ships") or []:
                merged[old["mmsi"]] = old
    except (OSError, ValueError, KeyError):
        pass
    for sh in ships:
        merged[sh["mmsi"]] = {**merged.get(sh["mmsi"], {}), **sh}
    cutoff = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - keep_hours * 3600))
    kept = [sh for sh in merged.values() if (sh.get("t") or "") >= cutoff]
    if not ships and not kept:
        k = key.strip()
        shape = f"key has {len(k)} characters" + ("" if all(c in "0123456789abcdefABCDEF" for c in k) and len(k) == 40 else ", not the usual 40 letters and digits (a-f, 0-9)")
        raise RuntimeError(f"no vessel position was received in {seconds} seconds ({msgs} messages, {attempts} connections" + (f"; drops: {', '.join(log[-4:])}" if log else "") + f"). {shape}.")
    save("vessels.json", {"updated": NOW, "source": f"aisstream.io AIS, vessels heard in the last {keep_hours:g} hours", "bbox": BBOX, "heard_now": len(ships), "keep_hours": keep_hours, "ships": kept})
    return f"{len(kept)} vessels in the last {keep_hours:g} h ({len(ships)} heard now from {msgs} messages in {seconds} s)" + (f", {len(log)} reconnects" if log else "")


UAE_AIRPORTS = ["AUH", "DXB", "DWC", "SHJ", "RKT", "FJR", "AAN", "AZI"]


class Skip(Exception):
    """Not an error: the source was left alone on purpose (the previous file stays)."""


def flights(prev):
    """Aircraft flying to or from UAE airports. Flightradar24 bills 8 credits for each flight returned, so the
    number of flights per call (FR24_LIMIT) and the time between calls (FR24_MIN_HOURS) are both capped."""
    key = (os.environ.get("FLIGHT_RADAR") or "").strip()
    if not key:
        raise RuntimeError("the Flightradar24 key is not set (secret FLIGHT_RADAR)")
    limit = max(1, min(200, int(os.environ.get("FR24_LIMIT") or 30)))
    min_hours = float(os.environ.get("FR24_MIN_HOURS") or 8)
    last = prev.get("updated") if prev.get("ok") else None
    if last and os.environ.get("FR24_FORCE") != "1":
        age = (time.time() - time.mktime(time.strptime(last, "%Y-%m-%dT%H:%M:%SZ")) + time.timezone) / 3600
        if age < min_hours:
            raise Skip(f"last fetched {age:.1f} h ago; next after {min_hours:g} h")
    url = ("https://fr24api.flightradar24.com/api/live/flight-positions/full?bounds="
           f"{BBOX[3]},{BBOX[1]},{BBOX[0]},{BBOX[2]}&airports=" + ",".join("both:" + a for a in UAE_AIRPORTS) + f"&limit={limit}")
    req = urllib.request.Request(url, headers={"Accept": "application/json", "Accept-Version": "v1", "Authorization": "Bearer " + key,
                                               "User-Agent": "IntelliTwin live data (github.com/thirumald/IntelliTwin)"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Flightradar24 answered {e.code}: " + scrub(e.read().decode("utf-8", "replace")))
    rows = []
    for f in data.get("data") or []:
        if f.get("lat") is None or f.get("lon") is None:
            continue
        rows.append({"id": f.get("fr24_id"), "flight": f.get("flight") or "", "call": f.get("callsign") or "", "lat": round(f["lat"], 4), "lon": round(f["lon"], 4),
                     "track": f.get("track") or 0, "alt": f.get("alt") or 0, "gs": f.get("gspeed") or 0, "vs": f.get("vspeed") or 0, "type": f.get("type") or "",
                     "reg": f.get("reg") or "", "airline": f.get("operating_as") or f.get("painted_as") or "", "from": f.get("orig_iata") or "", "to": f.get("dest_iata") or "",
                     "eta": f.get("eta") or "", "t": f.get("timestamp") or ""})
    credits = max(1, 8 * len(rows))
    save("flights.json", {"updated": NOW, "source": "Flightradar24 API, aircraft to or from UAE airports inside the UAE area", "airports": UAE_AIRPORTS,
                          "limit": limit, "flights": rows})
    return f"{len(rows)} flights (limit {limit}), about {credits} credits", credits


status_path = os.path.join(OUT, "status.json")
try:
    with open(status_path, encoding="utf-8") as f:
        status = json.load(f)
except (OSError, ValueError):
    status = {}
status["checked"] = NOW
failed = 0
SOURCES = (("fires", fires), ("satellites", satellites), ("vessels", vessels), ("flights", flights))
skipped = 0
for name, fn in SOURCES:
    prev = status.get(name) or {}
    try:
        if name == "flights":
            note, credits = fn(prev)
            day = NOW[:10]
            used = (prev.get("credits_today") or 0) if prev.get("credits_day") == day else 0
            status[name] = {"ok": True, "updated": NOW, "note": note, "credits_day": day, "credits_today": used + credits}
        else:
            note = fn()
            status[name] = {"ok": True, "updated": NOW, "note": note}
        print(f"{name}: OK - {note}", flush=True)
    except Skip as why:
        skipped += 1
        print(f"{name}: kept - {why}", flush=True)
    except Exception as err:  # one source failing must not stop the others
        failed += 1
        msg = scrub(f"{type(err).__name__}: {err}")
        status[name] = {"ok": False, "updated": prev.get("updated") if prev.get("ok") or prev.get("updated") else None, "error": msg, "tried": NOW}
        print(f"{name}: FAILED - {msg}", flush=True)
save("status.json", status)
print(f"{len(SOURCES) - failed - skipped} of {len(SOURCES)} sources updated, {skipped} kept, {failed} failed", flush=True)
