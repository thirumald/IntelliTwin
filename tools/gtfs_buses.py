"""Optional bus layer: timetable positions from the Integrated Transport Centre GTFS feed.

Buses are drawn from the published timetable; they are not part of the traffic simulation.
"""
import csv
import io
import json
import math
import os
import urllib.request
import zipfile

import config as C
from build import write_paths


UA = "Mozilla/5.0 (compatible; IntelliTwin-pipeline; +https://github.com/thirumald/IntelliTwin)"


def _seconds(text):
    h, m, s = text.strip().split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def _rows(zf, name):
    if name not in zf.namelist():
        return []
    with zf.open(name) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))


def _download(build_dir):
    path = os.path.join(build_dir, "gtfs.zip")
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return path, "local file"
    last, api_error = None, ""
    urls = list(C.GTFS_URLS)
    token = os.environ.get("MOBILITY_DATABASE_REFRESH_TOKEN", "").strip()
    if token:
        # Mobility Database API: exchange the refresh token, then ask for the feed's latest hosted dataset.
        try:
            req = urllib.request.Request(
                "https://api.mobilitydatabase.org/v1/tokens", method="POST",
                data=json.dumps({"refresh_token": token}).encode(),
                headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA})
            access = json.load(urllib.request.urlopen(req, timeout=60))["access_token"]
            req = urllib.request.Request(
                f"https://api.mobilitydatabase.org/v1/gtfs_feeds/{C.GTFS_FEED_ID}",
                headers={"Authorization": f"Bearer {access}", "Accept": "application/json", "User-Agent": UA})
            feed = json.load(urllib.request.urlopen(req, timeout=60))
            hosted = (feed.get("latest_dataset") or {}).get("hosted_url")
            producer = (feed.get("source_info") or {}).get("producer_url")
            urls = [u for u in (hosted, producer) if u] + urls
        except Exception as exc:
            api_error = f"Mobility Database API: {type(exc).__name__}: {exc}"
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                f.write(r.read())
            zipfile.ZipFile(path).namelist()
            return path, url
        except Exception as exc:
            last = exc
    raise RuntimeError(f"GTFS download failed: {last}" + (f"; {api_error}" if api_error else "; no API token step error" if token else "; no API token set"))


def build(out_file, build_dir):
    path, source = _download(build_dir)
    zf = zipfile.ZipFile(path)
    west, south, east, north = C.BBOX

    services = {r["service_id"] for r in _rows(zf, "calendar.txt") if r.get(C.GTFS_WEEKDAY) == "1"}
    if not services:
        by_date = {}
        for r in _rows(zf, "calendar_dates.txt"):
            if r.get("exception_type") == "1":
                by_date.setdefault(r["date"], set()).add(r["service_id"])
        if by_date:
            services = max(by_date.values(), key=len)
    trips = {r["trip_id"]: r for r in _rows(zf, "trips.txt") if not services or r["service_id"] in services}
    stops = {r["stop_id"]: (float(r["stop_lon"]), float(r["stop_lat"])) for r in _rows(zf, "stops.txt")
             if r.get("stop_lat") and r.get("stop_lon")}

    shapes = {}
    for r in _rows(zf, "shapes.txt"):
        shapes.setdefault(r["shape_id"], []).append(
            (int(r["shape_pt_sequence"]), float(r["shape_pt_lon"]), float(r["shape_pt_lat"])))
    for k in shapes:
        shapes[k] = [(lon, lat) for _, lon, lat in sorted(shapes[k])]

    calls = {}
    with zf.open("stop_times.txt") as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            if r["trip_id"] in trips and r["stop_id"] in stops:
                t = r.get("departure_time") or r.get("arrival_time")
                if t:
                    calls.setdefault(r["trip_id"], []).append((int(r["stop_sequence"]), _seconds(t), r["stop_id"]))

    def dist(a, b):
        kx = 111.32 * math.cos(math.radians(24.4))
        return math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110.57)

    paths, routes = [], set()
    for trip_id, seq in calls.items():
        seq.sort()
        if len(seq) < 2 or seq[-1][1] < C.SIM_BEGIN or seq[0][1] > C.SIM_END:
            continue
        pts = [stops[s] for _, _, s in seq]
        times = [t for _, t, _ in seq]
        if not any(west <= x <= east and south <= y <= north for x, y in pts):
            continue
        shape = shapes.get(trips[trip_id].get("shape_id") or "")
        if shape and len(shape) >= 2:
            # Snap each stop to the nearest later shape point, then spread time along the shape by distance.
            idx, j = [], 0
            for p in pts:
                j = min(range(j, len(shape)), key=lambda k: dist(shape[k], p))
                idx.append(j)
            out = []
            for a in range(len(idx) - 1):
                i0, i1 = idx[a], idx[a + 1]
                seg = shape[i0:i1 + 1] if i1 > i0 else [shape[i0]]
                cum = [0.0]
                for k in range(1, len(seg)):
                    cum.append(cum[-1] + dist(seg[k - 1], seg[k]))
                total = cum[-1] or 1.0
                for k, p in enumerate(seg):
                    if out and k == 0:
                        continue
                    out.append((p[0], p[1], times[a] + (times[a + 1] - times[a]) * cum[k] / total - C.SIM_BEGIN))
            path_pts = out
        else:
            path_pts = [(p[0], p[1], t - C.SIM_BEGIN) for p, t in zip(pts, times)]
        if len(path_pts) >= 2:
            paths.append(path_pts)
            routes.add(trips[trip_id].get("route_id"))

    if not paths:
        return {"available": False, "reason": "no timetabled runs in the window", "source": source}
    write_paths(out_file, paths)
    feed = _rows(zf, "feed_info.txt")
    return {"available": True, "runs": len(paths), "lines": len(routes), "source": source,
            "shapes": bool(shapes), "feed_start": feed[0].get("feed_start_date", "") if feed else "",
            "feed_end": feed[0].get("feed_end_date", "") if feed else ""}
