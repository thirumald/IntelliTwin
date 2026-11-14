"""Optional building layer: Microsoft Global ML Building Footprints (CDLA-Permissive-2.0).

Used twice: floor space spreads trip origins and destinations over the city, and the
largest footprints are exported for the 3D view. Heights are mostly estimated from footprint size.
"""
import csv
import glob
import gzip
import io
import json
import math
import os
import re
import urllib.request

import numpy as np

import config as C

README = "https://raw.githubusercontent.com/microsoft/GlobalMLBuildingFootprints/main/README.md"
FALLBACK_LINKS = "https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv"
FLOOR_M = 3.3


def _get(url, timeout=180):
    req = urllib.request.Request(url, headers={"User-Agent": "IntelliTwin-pipeline"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _quadkey(lon, lat, zoom=9):
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    s = math.sin(math.radians(lat))
    y = int((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n)
    return "".join(str(((x >> i) & 1) + 2 * ((y >> i) & 1)) for i in range(zoom - 1, -1, -1))


def _bbox_quadkeys():
    west, south, east, north = C.BBOX
    keys = set()
    for lon in np.arange(west, east + 0.3, 0.3):
        for lat in np.arange(south, north + 0.3, 0.3):
            keys.add(_quadkey(min(lon, east), min(lat, north)))
    return keys


def _download(build_dir):
    out = os.path.join(build_dir, "buildings")
    os.makedirs(out, exist_ok=True)
    if glob.glob(os.path.join(out, "*.csv.gz")):
        return out, "local files"
    try:
        links = re.search(r"https://[^\s)\]]+dataset-links\.csv", _get(README, 60).decode("utf-8")).group(0)
    except Exception:
        links = FALLBACK_LINKS
    keys = _bbox_quadkeys()
    rows = [r for r in csv.DictReader(io.StringIO(_get(links).decode("utf-8"))) if str(r.get("QuadKey", "")) in keys]
    if not rows:
        raise RuntimeError("no footprint tiles listed for the study area")
    for i, r in enumerate(rows):
        with open(os.path.join(out, f"{r.get('Location', 'tile')}_{r['QuadKey']}_{i}.csv.gz"), "wb") as f:
            f.write(_get(r["Url"], 600))
    return out, links


def estimated_height(area_m2):
    """Height guessed from footprint size when the dataset has none (most of Abu Dhabi)."""
    floors = min(15, max(1, round(1 + math.sqrt(area_m2) / 12)))
    return floors * FLOOR_M


def load(build_dir):
    """Return dict with per-building lon, lat, floor space (m²), plus the largest polygons for display."""
    folder, source = _download(build_dir)
    west, south, east, north = C.BBOX
    kx = 111_320 * math.cos(math.radians((south + north) / 2))
    ky = 110_570
    lons, lats, floors_m2, shown = [], [], [], []
    measured = 0
    for path in sorted(glob.glob(os.path.join(folder, "*.csv.gz"))):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line.startswith("{"):
                    continue
                feat = json.loads(line)
                geom = feat.get("geometry") or {}
                if geom.get("type") != "Polygon":
                    continue
                ring = geom["coordinates"][0]
                cx = sum(p[0] for p in ring) / len(ring)
                cy = sum(p[1] for p in ring) / len(ring)
                if not (west <= cx <= east and south <= cy <= north):
                    continue
                area = 0.0
                for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
                    area += (x0 - cx) * kx * (y1 - cy) * ky - (x1 - cx) * kx * (y0 - cy) * ky
                area = abs(area) / 2
                if area < 20:
                    continue
                h = float((feat.get("properties") or {}).get("height", -1) or -1)
                if h > 0:
                    measured += 1
                else:
                    h = estimated_height(area)
                lons.append(cx)
                lats.append(cy)
                floors_m2.append(area * max(1.0, h / FLOOR_M))
                if area >= C.BUILDING_MIN_SHOW_M2:
                    shown.append((area, round(h, 1), [c for p in ring[:-1] for c in (round(p[0], 5), round(p[1], 5))]))
    if not lons:
        raise RuntimeError("no footprints inside the study area")
    shown.sort(key=lambda s: -s[0])
    shown = shown[:C.BUILDING_MAX_SHOW]
    return {"lon": np.array(lons), "lat": np.array(lats), "floor": np.array(floors_m2),
            "shown": [[h, ring] for _, h, ring in shown], "count": len(lons),
            "measured_heights": measured, "source": source}
