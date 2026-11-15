"""Add the building layer to a region that is already built, without rebuilding its roads or traffic.

Writes buildings.json and a small buildings_meta.json into --out; the workflow copies them into data/<region>/.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, "tools")
import config as C  # noqa: E402
import regions  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--region", required=True)
ap.add_argument("--build", default="build")
ap.add_argument("--out", required=True)
ap.add_argument("--osm-geojson", default="", help="OpenStreetMap buildings (GeoJSON sequence) to use instead of the Microsoft footprints")
args = ap.parse_args()

C.BBOX = tuple(regions.REGIONS[args.region]["bbox"])
import buildings as B  # noqa: E402  (reads C.BBOX)

os.makedirs(args.out, exist_ok=True)


def from_osm(path):
    """Largest OpenStreetMap building polygons in the region, in the same shape as buildings.load()."""
    import math
    west, south, east, north = C.BBOX
    kx, ky = 111_320 * math.cos(math.radians((south + north) / 2)), 110_570
    shown, count, measured = [], 0, 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip().lstrip("\x1e")
            if not line.startswith("{"):
                continue
            feat = json.loads(line)
            geom = feat.get("geometry") or {}
            rings = [geom["coordinates"][0]] if geom.get("type") == "Polygon" else [p[0] for p in geom.get("coordinates", [])] if geom.get("type") == "MultiPolygon" else []
            props = feat.get("properties") or {}
            for ring in rings:
                if len(ring) < 4:
                    continue
                cx = sum(p[0] for p in ring) / len(ring)
                cy = sum(p[1] for p in ring) / len(ring)
                if not (west <= cx <= east and south <= cy <= north):
                    continue
                area = abs(sum((x0 - cx) * kx * (y1 - cy) * ky - (x1 - cx) * kx * (y0 - cy) * ky for (x0, y0), (x1, y1) in zip(ring, ring[1:]))) / 2
                if area < 20:
                    continue
                count += 1
                h = 0.0
                try:
                    h = float(str(props.get("height", "")).replace("m", "").strip() or 0) or float(props.get("building:levels", 0) or 0) * B.FLOOR_M
                except ValueError:
                    h = 0.0
                if h > 0:
                    measured += 1
                else:
                    h = B.estimated_height(area)
                if area >= C.BUILDING_MIN_SHOW_M2:
                    shown.append((area, round(h, 1), [c for p in ring[:-1] for c in (round(p[0], 5), round(p[1], 5))]))
    if not count:
        raise RuntimeError("no OpenStreetMap buildings inside the study area")
    shown.sort(key=lambda t: -t[0])
    return {"shown": [[h, ring] for _, h, ring in shown[:C.BUILDING_MAX_SHOW]], "count": count, "measured_heights": measured,
            "source": "OpenStreetMap buildings (ODbL)"}


bld = from_osm(args.osm_geojson) if args.osm_geojson else B.load(args.build)
with open(os.path.join(args.out, "buildings.json"), "w") as f:
    json.dump(bld["shown"], f, separators=(",", ":"))
meta = {"available": True, "count": bld["count"], "shown": len(bld["shown"]),
        "measured_heights": bld["measured_heights"], "source": bld["source"]}
with open(os.path.join(args.out, "buildings_meta.json"), "w") as f:
    json.dump(meta, f)
print(args.region, meta, flush=True)
