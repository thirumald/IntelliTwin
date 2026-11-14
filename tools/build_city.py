#!/usr/bin/env python3
"""Build a city pack's road network from OpenStreetMap.

    tools/build_city.py abu_dhabi              # fetch from Overpass (needs internet) and build
    tools/build_city.py abu_dhabi --raw f.json # build from a saved Overpass response

Reads  cities/<id>/city.json   (bbox, districts, speed limits ...)
Writes cities/<id>/network.json (segments, adjacency, enforcement devices)

A new city is: write its city.json, run this script, restart. Nothing else changes.
Road data (c) OpenStreetMap contributors, ODbL.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANES = {"motorway": 3, "trunk": 3, "primary": 2}
SEG_MAX_M = 450.0


def hav(a, b):
    """Metres between two (lon, lat) points."""
    r = 6371000.0
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp, dl = p2 - p1, math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def fetch(bbox):
    s, w, n, e = bbox[1], bbox[0], bbox[3], bbox[2]
    q = f'[out:json][timeout:90];way["highway"~"^(motorway|trunk|primary)$"]({s},{w},{n},{e});out geom;'
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": q}).encode(),
        headers={"User-Agent": "IntelliTwinDemo/0.1"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def name_of(tags):
    return tags.get("name:en") or tags.get("name") or tags.get("ref") or "Unnamed road"


def build(city: dict, osm: dict) -> dict:
    limits = city["speed_limits"]
    districts = city["districts"]

    def district_of(lon, lat):
        best, bd = None, 1e18
        for d in districts:
            dist = hav((lon, lat), (d["lon"], d["lat"]))
            if dist < bd:
                best, bd = d["id"], dist
        return best

    segs = []
    node_ways = defaultdict(set)  # node id -> way ids
    node_pos = {}
    for el in osm["elements"]:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})
        cls = tags.get("highway")
        if cls not in limits:
            continue
        # classify links as the class they hang off but slower
        nodes, geom = el["nodes"], [(g["lon"], g["lat"]) for g in el["geometry"]]
        if len(nodes) != len(geom) or len(nodes) < 2:
            continue
        for nid, p in zip(nodes, geom):
            node_ways[nid].add(el["id"])
            node_pos[nid] = p
        m = re.match(r"\d+", str(tags.get("maxspeed", "")))
        limit = int(m.group()) if m else limits[cls]
        lanes = int(tags["lanes"]) if str(tags.get("lanes", "")).isdigit() else LANES[cls]
        name = name_of(tags)
        # split into chunks <= SEG_MAX_M at vertices
        start, acc = 0, 0.0
        for i in range(1, len(geom)):
            acc += hav(geom[i - 1], geom[i])
            if acc >= SEG_MAX_M or i == len(geom) - 1:
                if acc >= 25:  # drop slivers
                    pts = geom[start : i + 1]
                    segs.append(
                        {
                            "way": el["id"],
                            "name": name,
                            "cls": cls,
                            "limit": limit,
                            "lanes": lanes,
                            "len": round(acc),
                            "a": nodes[start],
                            "b": nodes[i],
                            "tunnel": tags.get("tunnel") == "yes" or tags.get("tunnel") == "building_passage",
                            "bridge": "bridge" in tags,
                            "coords": [[round(x, 5), round(y, 5)] for x, y in pts],
                        }
                    )
                start, acc = i, 0.0

    # ids, district, adjacency (b of one == a of the next)
    by_a = defaultdict(list)
    for i, s in enumerate(segs):
        s["id"] = i
        mid = s["coords"][len(s["coords"]) // 2]
        s["district"] = district_of(*mid)
        by_a[s["a"]].append(i)
    for s in segs:
        s["next"] = [j for j in by_a.get(s["b"], []) if j != s["id"]][:3]
    prev = defaultdict(list)
    for s in segs:
        for j in s["next"]:
            prev[j].append(s["id"])
    for s in segs:
        s["prev"] = prev.get(s["id"], [])[:3]

    # junctions: nodes touched by >= 3 segment ends of >= 2 distinct names
    incident = defaultdict(list)
    for s in segs:
        incident[s["a"]].append(s["id"])
        incident[s["b"]].append(s["id"])
    cands = []
    for nid, ids in incident.items():
        names = {segs[i]["name"] for i in ids if segs[i]["name"] != "Unnamed road"}
        ways = {segs[i]["way"] for i in ids}
        if len(ids) >= 3 and len(names) >= 2 and len(ways) >= 2:
            score = sum({"motorway": 1, "trunk": 3, "primary": 3}[segs[i]["cls"]] for i in ids)
            if any(segs[i]["cls"] == "motorway" for i in ids) and not any(segs[i]["cls"] != "motorway" for i in ids):
                continue  # pure motorway interchanges are not signalised
            cands.append((score, nid, ids, names))
    cands.sort(key=lambda c: (-c[0], c[1]))
    junctions, taken = [], []
    for score, nid, ids, names in cands:
        p = node_pos[nid]
        if any(hav(p, q) < 700 for q in taken):
            continue
        if segs[ids[0]]["tunnel"]:
            continue
        taken.append(p)
        nm = sorted(names)
        junctions.append(
            {
                "id": len(junctions),
                "name": f"{nm[0]} / {nm[1]}" if len(nm) > 1 else nm[0],
                "lon": round(p[0], 5),
                "lat": round(p[1], 5),
                "segs": ids,
                "district": district_of(*p),
            }
        )
        if len(junctions) >= 28:
            break

    # top up with signalised approach points on primary/trunk roads (many real crossings are grade-separated)
    for s in sorted(segs, key=lambda s: (s["cls"] != "primary", s["id"])):
        if len(junctions) >= 16:
            break
        if s["cls"] == "motorway" or s["tunnel"] or s["name"] == "Unnamed road" or s["len"] < 150:
            continue
        p = s["coords"][-1]
        if any(hav(p, q) < 900 for q in taken):
            continue
        taken.append(p)
        junctions.append({"id": len(junctions), "name": f"{s['name']} signal", "lon": p[0], "lat": p[1],
                          "segs": [s["id"]] + s["next"][:2], "district": s["district"]})

    # speed cameras: spaced mid-segments on fast roads
    speed_cams, taken2 = [], []
    for s in sorted(segs, key=lambda s: (-s["limit"], s["id"])):
        if s["cls"] == "primary" or s["tunnel"] or s["len"] < 300:
            continue
        mid = s["coords"][len(s["coords"]) // 2]
        if any(hav(mid, q) < 2500 for q in taken2):
            continue
        taken2.append(mid)
        speed_cams.append({"id": len(speed_cams), "seg": s["id"], "lon": mid[0], "lat": mid[1], "name": f"{s['name']} (speed camera)", "district": s["district"], "limit": s["limit"]})
        if len(speed_cams) >= 22:
            break

    # drop internal-only keys
    for s in segs:
        for k in ("a", "b", "way"):
            s.pop(k, None)
    return {"segments": segs, "junctions": junctions, "speed_cams": speed_cams}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("city")
    ap.add_argument("--raw", help="saved Overpass JSON instead of fetching")
    a = ap.parse_args()
    d = ROOT / "cities" / a.city
    city = json.loads((d / "city.json").read_text())
    osm = json.load(open(a.raw)) if a.raw else fetch(city["bbox"])
    net = build(city, osm)
    out = d / "network.json"
    out.write_text(json.dumps(net, separators=(",", ":"), ensure_ascii=False))
    print(f"{a.city}: {len(net['segments'])} segments, {len(net['junctions'])} junctions, "
          f"{len(net['speed_cams'])} speed cameras -> {out} ({out.stat().st_size/1e6:.2f} MB)")


if __name__ == "__main__":
    sys.exit(main())
