#!/usr/bin/env python3
"""IntelliTwin data pipeline: OSM roads → SUMO network → demand → mesoscopic simulation → static files.

Usage: python tools/build.py --osm build/roads.osm --build build --out data
See docs/ for the method, sources and file formats.
"""
import argparse
import datetime as dt
import json
import math
import os
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402
import regions as R  # noqa: E402

import sumolib  # noqa: E402


def run(cmd):
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


# ---------------------------------------------------------------- network
def build_network(osm_file, net_file):
    run([
        "netconvert", "--osm-files", osm_file, "-o", net_file,
        "--geometry.remove", "--roundabouts.guess", "--ramps.guess",
        "--junctions.join", "--tls.guess-signals", "--tls.discard-simple", "--tls.join",
        "--keep-edges.by-vclass", "passenger", "--keep-edges.components", "1",
        "--remove-edges.isolated", "--output.street-names", "--no-warnings",
    ])


def edge_class(edge):
    t = (edge.getType() or "").replace("highway.", "")
    return t.replace("_link", ""), t.endswith("_link")


def load_edges(net):
    edges = [e for e in net.getEdges() if e.allows("passenger")]
    edges.sort(key=lambda e: e.getID())
    return edges


def simplify(points, tol):
    """Douglas–Peucker on projected (metre) coordinates."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        worst, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > worst:
                worst, idx = d, i
        if worst > tol:
            keep[idx] = True
            stack.extend([(a, idx), (idx, b)])
    return [p for p, k in zip(points, keep) if k]


def edge_shape(edge):
    lanes = edge.getLanes()
    return simplify(lanes[len(lanes) // 2].getShape(), C.SHAPE_TOLERANCE_M)


# ---------------------------------------------------------------- demand
def building_weights(net, edges, local, bld):
    """Floor space of each building goes to the nearest ordinary street."""
    from scipy.spatial import cKDTree
    idx = np.flatnonzero(local)
    mids = np.array([edges[i].getShape()[len(edges[i].getShape()) // 2] for i in idx])
    xy = np.array([net.convertLonLat2XY(lo, la) for lo, la in zip(bld["lon"], bld["lat"])])
    d, j = cKDTree(mids).query(xy, distance_upper_bound=C.BUILDING_SNAP_M)
    ok = np.isfinite(d)
    w = np.zeros(len(edges))
    np.add.at(w, idx[j[ok]], bld["floor"][ok])
    return w, float(ok.mean())


def make_demand(net, edges, out_dir, bld=None):
    """Write one trips file per scenario. Scenarios are nested subsets of the largest trip list."""
    rng = np.random.default_rng(C.SEED)
    max_mult = max(s["demand"] for s in C.SCENARIOS)
    n = int(C.TOTAL_VEHICLE_TRIPS * max_mult)

    ids = np.array([e.getID() for e in edges])
    mid = np.array([e.getShape()[len(e.getShape()) // 2] for e in edges])
    length = np.array([e.getLength() for e in edges])
    lanes = np.array([e.getLaneNumber() for e in edges])
    speed = np.array([e.getSpeed() for e in edges])
    cls = [edge_class(e) for e in edges]
    # Trips start and end on ordinary streets, not on motorways, trunks or ramps.
    local = np.array([c in ("primary", "secondary", "tertiary") and not link for c, link in cls])
    if local.sum() < 20:
        local[:] = True
    w_local = np.where(local, length * lanes, 0.0)
    w_local /= w_local.sum()
    snapped = None
    if bld is not None:
        w_b, snapped = building_weights(net, edges, local, bld)
        if w_b.sum() > 0:
            w_local = C.BUILDING_WEIGHT * w_b / w_b.sum() + (1 - C.BUILDING_WEIGHT) * w_local

    # Boundary points: dead-end junctions close to the edge of the study area.
    west, south, east, north = C.BBOX
    m = C.FRINGE_MARGIN_DEG

    def at_boundary(node):
        nbrs = {e.getToNode().getID() for e in node.getOutgoing()} | {e.getFromNode().getID() for e in node.getIncoming()}
        if len(nbrs) != 1:
            return False
        lon, lat = net.convertXY2LonLat(*node.getCoord())
        return lon < west + m or lon > east - m or lat < south + m or lat > north - m

    src = np.array([at_boundary(e.getFromNode()) for e in edges])
    snk = np.array([at_boundary(e.getToNode()) for e in edges])
    w_src = np.where(src, lanes * speed ** 2, 0.0)
    w_snk = np.where(snk, lanes * speed ** 2, 0.0)
    has_fringe = w_src.sum() > 0 and w_snk.sum() > 0
    if has_fringe:
        w_src /= w_src.sum()
        w_snk /= w_snk.sum()

    def gravity_dest(orig):
        cand = rng.choice(len(edges), size=(len(orig), C.DEST_CANDIDATES), p=w_local)
        d = np.hypot(mid[cand, 0] - mid[orig, 0][:, None], mid[cand, 1] - mid[orig, 1][:, None]) / 1000.0
        p = np.exp(-d / C.GRAVITY_BETA_KM) * (d >= C.MIN_TRIP_KM) + 1e-12
        p /= p.sum(axis=1, keepdims=True)
        pick = (p.cumsum(axis=1) > rng.random((len(orig), 1))).argmax(axis=1)
        return cand[np.arange(len(orig)), pick]

    kind = rng.random(n)
    orig = rng.choice(len(edges), size=n, p=w_local)
    dest = gravity_dest(orig)
    if has_fringe:
        through = kind < C.THROUGH_SHARE
        inbound = (kind >= C.THROUGH_SHARE) & (kind < C.THROUGH_SHARE + C.EXTERNAL_SHARE * 0.6)
        outbound = (kind >= C.THROUGH_SHARE + C.EXTERNAL_SHARE * 0.6) & (kind < C.THROUGH_SHARE + C.EXTERNAL_SHARE)
        orig[through | inbound] = rng.choice(len(edges), size=int((through | inbound).sum()), p=w_src)
        dest[through | outbound] = rng.choice(len(edges), size=int((through | outbound).sum()), p=w_snk)
        trip_type = np.where(through, 2, np.where(inbound | outbound, 1, 0))
    else:
        trip_type = np.zeros(n, dtype=int)

    prof = np.array(C.DEPART_PROFILE, dtype=float)
    slot = rng.choice(len(prof), size=n, p=prof / prof.sum())
    slot_len = (C.SIM_END - C.SIM_BEGIN) / len(prof)
    depart = C.SIM_BEGIN + (slot + rng.random(n)) * slot_len
    level = rng.random(n) * max_mult          # trip is in a scenario when level < its demand multiplier
    simulated = rng.random(n) < C.SIM_SAMPLE
    sampled = simulated & (rng.random(n) < C.TRIP_SAMPLE / C.SIM_SAMPLE)

    order = np.argsort(depart)
    files, counts = {}, {}
    for sc in C.SCENARIOS:
        path = os.path.join(out_dir, f"trips_{sc['id']}.xml")
        k = 0
        with open(path, "w") as f:
            # One simulated vehicle stands for 1 / SIM_SAMPLE vehicles, so it takes that much road space.
            f.write(f'<routes>\n<vType id="car" vClass="passenger" length="{7.5 / C.SIM_SAMPLE - 2.5:.1f}" minGap="2.5"/>\n')
            for i in order:
                if level[i] >= sc["demand"] or orig[i] == dest[i]:
                    continue
                k += 1
                if not simulated[i]:
                    continue
                f.write(f'<trip id="{"s" if sampled[i] else "v"}{i}" type="car" depart="{depart[i]:.1f}" '
                        f'from="{ids[orig[i]]}" to="{ids[dest[i]]}" departLane="best" departSpeed="max"'
                        + ('><param key="has.vehroute.device" value="true"/></trip>\n' if sampled[i] else '/>\n'))
            f.write("</routes>\n")
        files[sc["id"]], counts[sc["id"]] = path, k
    stats = {"internal": int((trip_type == 0).sum()), "external": int((trip_type == 1).sum()),
             "through": int((trip_type == 2).sum()), "generated": n,
             "boundary_points": int(src.sum()), "trip_ends": "building floor space" if bld is not None else "road length × lanes",
             "buildings_snapped_share": round(snapped, 3) if snapped is not None else None}
    return files, counts, stats


# ---------------------------------------------------------------- simulation
def simulate(net_file, trips_file, work, tag):
    add = os.path.join(work, f"edgedata_{tag}.add.xml")
    out = {k: os.path.join(work, f"{k}_{tag}.xml") for k in ("edgedata", "vehroute", "tripinfo", "summary")}
    with open(add, "w") as f:
        f.write(f'<additional><edgeData id="ed" period="{C.BIN_SECONDS}" begin="{C.SIM_BEGIN}" '
                f'file="{os.path.abspath(out["edgedata"])}" excludeEmpty="true"/></additional>\n')
    cmd = [
        "sumo", "-n", net_file, "-r", trips_file, "-a", add,
        "--begin", str(C.SIM_BEGIN), "--end", str(C.SIM_END), "--seed", str(C.SEED),
        "--mesosim",
        # Headways stretched by 1 / SIM_SAMPLE so that capacity matches the sampled demand.
        "--meso-tauff", f"{1.13 / C.SIM_SAMPLE:.2f}", "--meso-taufj", f"{1.13 / C.SIM_SAMPLE:.2f}",
        "--meso-taujf", f"{1.73 / C.SIM_SAMPLE:.2f}", "--meso-taujj", f"{1.4 / C.SIM_SAMPLE:.2f}",
        "--meso-tls-penalty", str(C.MESO_TLS_PENALTY),
        "--meso-tls-flow-penalty", str(C.MESO_TLS_FLOW_PENALTY),
        "--meso-minor-penalty", str(C.MESO_MINOR_PENALTY), "--meso-overtaking",
        "--device.rerouting.probability", str(C.REROUTE_PROBABILITY),
        "--device.rerouting.period", str(C.REROUTE_PERIOD), "--device.rerouting.pre-period", "300",
        "--device.rerouting.adaptation-steps", "18",
        "--routing-algorithm", "astar",
        "--ignore-route-errors", "--max-depart-delay", "900", "--time-to-teleport", "300",
        "--device.vehroute.probability", "0",
        "--vehroute-output", out["vehroute"], "--vehroute-output.exit-times",
        "--vehroute-output.last-route", "--vehroute-output.write-unfinished",
        "--tripinfo-output", out["tripinfo"], "--tripinfo-output.write-unfinished",
        "--summary-output", out["summary"], "--summary-output.period", "300",
        "--no-step-log", "--no-warnings", "--duration-log.statistics",
    ]
    print("+", " ".join(cmd), flush=True)
    log = open(os.path.join(work, f"sumo_{tag}.log"), "w")
    return out, subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT), log


# ---------------------------------------------------------------- export
def write_paths(path, trips):
    """Binary trajectories: uint32 count, uint32 offsets[count+1], float32 (lon, lat, t)[points]."""
    offsets, flat = [0], []
    for pts in trips:
        flat.extend(pts)
        offsets.append(len(flat))
    with open(path, "wb") as f:
        f.write(struct.pack("<I", len(trips)))
        f.write(np.asarray(offsets, dtype="<u4").tobytes())
        f.write(np.asarray(flat, dtype="<f4").reshape(-1, 3).tobytes() if flat else b"")


def export_edgedata(xml_file, edge_index, edges, n_bins, out_prefix):
    ratio = np.full((n_bins, len(edges)), 255, dtype=np.uint8)
    occ = np.zeros((n_bins, len(edges)), dtype=np.float32)   # vehicle-seconds on the edge in the bin
    ff = np.array([e.getSpeed() for e in edges])
    b = None
    for ev, el in ET.iterparse(xml_file, events=("start", "end")):
        if ev == "start" and el.tag == "interval":
            b = int((float(el.get("begin")) - C.SIM_BEGIN) // C.BIN_SECONDS)
        elif ev == "end" and el.tag == "edge":
            i = edge_index.get(el.get("id"))
            if i is not None and b is not None and 0 <= b < n_bins and el.get("speed") is not None:
                ss = float(el.get("sampledSeconds", 0))
                if ss > 0:
                    ratio[b, i] = min(100, round(100 * float(el.get("speed")) / ff[i]))
                    occ[b, i] = ss / C.SIM_SAMPLE
            el.clear()
    ratio.tofile(out_prefix + "_speed.bin")
    np.minimum(np.round(occ / 10), 65535).astype("<u2").tofile(out_prefix + "_occ.bin")

    kpis = []
    for b in range(n_bins):
        r = np.where(ratio[b] == 255, 100, ratio[b]) / 100.0
        v = ff * r                                # m/s
        vkt = (occ[b] * v).sum()                  # vehicle-metres
        tot = occ[b].sum()
        free = (occ[b] * r).sum()                 # seconds the same distance takes at free flow
        kpis.append({
            "speed": round(3.6 * vkt / tot, 1) if tot else None,
            "vehicles": int(round(tot / C.BIN_SECONDS)),
            "extra": round(100 * (tot / free - 1), 1) if free else 0,
            "delay_h": round((tot - free) / 3600 * (3600 / C.BIN_SECONDS)),
        })
    return kpis


def export_trips(vehroute_file, net, shapes, out_file):
    trips = []
    for ev, el in ET.iterparse(vehroute_file, events=("end",)):
        if el.tag != "vehicle":
            continue
        route = el.find("route")
        if route is None:
            dist = el.find("routeDistribution")
            route = dist.findall("route")[-1] if dist is not None else None
        if route is not None and route.get("exitTimes"):
            eids = route.get("edges").split()
            exits = [float(x) for x in route.get("exitTimes").split()]
            t0 = float(el.get("depart"))
            pts = []
            for eid, t1 in zip(eids, exits):
                shp = shapes.get(eid)
                if shp is None or t1 < 0:
                    break
                seg = [math.hypot(shp[k + 1][0] - shp[k][0], shp[k + 1][1] - shp[k][1]) for k in range(len(shp) - 1)]
                total = sum(seg) or 1.0
                acc = 0.0
                for k, (x, y) in enumerate(shp):
                    if k == 0 and pts:
                        continue  # junction: the previous edge's last point carries this time
                    if k > 0:
                        acc += seg[k - 1]
                    lon, lat = net.convertXY2LonLat(x, y)
                    pts.append((lon, lat, t0 + (t1 - t0) * acc / total - C.SIM_BEGIN))
                t0 = t1
            if len(pts) >= 2:
                trips.append(pts)
        el.clear()
    write_paths(out_file, trips)
    return len(trips)


def trip_stats(tripinfo_file):
    n = dur = dist = loss = 0
    for ev, el in ET.iterparse(tripinfo_file, events=("end",)):
        if el.tag == "tripinfo":
            if float(el.get("arrival", -1)) >= 0:
                n += 1
                dur += float(el.get("duration"))
                dist += float(el.get("routeLength"))
                loss += float(el.get("timeLoss"))
            el.clear()
    if not n:
        return {"completed": 0}
    return {"completed": round(n / C.SIM_SAMPLE), "km": round(dist / n / 1000, 1), "min": round(dur / n / 60, 1),
            "kmh": round(3.6 * dist / dur, 1), "min_lost": round(loss / n / 60, 1)}


def osm_names(osm_file):
    """English street name per OSM way, falling back to the local name."""
    out = {}
    for ev, el in ET.iterparse(osm_file, events=("end",)):
        if el.tag == "way":
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            name = tags.get("name:en") or tags.get("int_name") or tags.get("name") or tags.get("ref") or ""
            if name:
                out[el.get("id")] = name
            el.clear()
        elif el.tag == "node":
            el.clear()
    return out


def export_roads(net, edges, out_file, way_names=None):
    names, name_idx, rows = [], {}, []
    way_names = way_names or {}
    km_by_class = {}
    for e in edges:
        cls, link = edge_class(e)
        way = e.getID().lstrip("-").split("#")[0]
        name = way_names.get(way) or e.getName() or ""
        if name not in name_idx:
            name_idx[name] = len(names)
            names.append(name)
        coords = []
        for x, y in edge_shape(e):
            lon, lat = net.convertXY2LonLat(x, y)
            coords += [round(lon, 5), round(lat, 5)]
        rows.append({"n": name_idx[name], "c": C.CLASS_RANK.get(cls, 4), "k": 1 if link else 0,
                     "l": e.getLaneNumber(), "s": round(e.getSpeed() * 3.6), "m": round(e.getLength()), "p": coords})
        km_by_class[cls] = km_by_class.get(cls, 0) + e.getLength() / 1000
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"names": names, "edges": rows}, f, ensure_ascii=False, separators=(",", ":"))
    return {k: round(v) for k, v in km_by_class.items()}


ZONE_RULES = [  # (type, tag key, accepted values or None for any)
    ("defence", "landuse", {"military"}), ("defence", "military", None),
    ("embassy", "amenity", {"embassy"}), ("embassy", "office", {"diplomatic"}), ("embassy", "diplomatic", None),
    ("school", "amenity", {"school", "kindergarten"}), ("university", "amenity", {"university", "college"}),
    ("hospital", "amenity", {"hospital"}), ("police", "amenity", {"police"}), ("fire", "amenity", {"fire_station"}),
    ("government", "office", {"government"}), ("government", "amenity", {"townhall", "courthouse"}),
    ("airport", "aeroway", {"aerodrome"}),
]


def synthetic_traffic(net, edges, n_bins, out_dir, centre, total_trips):
    """Traffic for a region without a simulation: a volume-delay pattern by road class, lanes, distance from
    the centre and time of day. It fills the same files as the SUMO export so the app reads both alike.
    These figures are a PATTERN, not a simulation result and not measurements."""
    rng = np.random.default_rng(C.SEED)
    n = len(edges)
    per_lane = {"motorway": 1400, "trunk": 1100, "primary": 700, "secondary": 450, "tertiary": 250}   # vehicles per hour per lane at the peak
    cap_lane = {"motorway": 1900, "trunk": 1600, "primary": 1100, "secondary": 800, "tertiary": 550}
    cls = [edge_class(e)[0] for e in edges]
    lanes = np.array([e.getLaneNumber() for e in edges], dtype=float)
    ff = np.array([e.getSpeed() for e in edges])
    length = np.array([e.getLength() for e in edges])
    peak = np.array([per_lane.get(c, 250) for c in cls]) * lanes
    cap = np.array([cap_lane.get(c, 550) for c in cls]) * lanes
    mid = np.array([net.convertXY2LonLat(*e.getShape()[len(e.getShape()) // 2]) for e in edges])
    dist_km = np.hypot((mid[:, 0] - centre[0]) * 101.0, (mid[:, 1] - centre[1]) * 110.6)
    central = 0.55 + 0.75 * np.exp(-dist_km / 9.0)                    # busier towards the centre
    local = np.clip(rng.lognormal(0.0, 0.35, n), 0.35, 1.9)           # road-to-road variation
    profile = np.interp(np.arange(n_bins) * C.BIN_SECONDS, np.arange(len(C.DEPART_PROFILE)) * 900.0, C.DEPART_PROFILE)
    profile = profile / profile.max()
    scenarios, base_km = [], None
    for sc in C.SCENARIOS:
        ratio = np.zeros((n_bins, n), dtype=np.uint8)
        occ = np.zeros((n_bins, n), dtype=np.float32)
        kpis, vkm = [], 0.0
        for b in range(n_bins):
            flow = peak * central * local * profile[b] * sc["demand"]             # vehicles per hour
            r = np.clip(1.0 / (1.0 + 0.6 * (flow / cap) ** 4), 0.12, 1.0)          # speed as a share of the limit
            secs = flow * C.BIN_SECONDS / 3600.0 * length / (ff * r)                 # vehicle-seconds on the link
            ratio[b] = np.round(100 * r)
            occ[b] = secs
            v = ff * r
            tot, free = secs.sum(), (secs * r).sum()
            vkm += (secs * v).sum() / 1000.0
            kpis.append({"speed": round(3.6 * (secs * v).sum() / tot, 1) if tot else None, "vehicles": int(round(tot / C.BIN_SECONDS)),
                         "extra": round(100 * (tot / free - 1), 1) if free else 0, "delay_h": round((tot - free) / 3600 * (3600 / C.BIN_SECONDS))})
        ratio.tofile(os.path.join(out_dir, sc["id"] + "_speed.bin"))
        np.minimum(np.round(occ / 10), 65535).astype("<u2").tofile(os.path.join(out_dir, sc["id"] + "_occ.bin"))
        if base_km is None:
            base_km = vkm
        scenarios.append({**sc, "trips": int(total_trips * sc["demand"]), "shown_trips": 0, "stats": {"completed": 0}, "bins": kpis})
    return scenarios, {"total_vehicle_km": round(base_km), "trip_ends": "not simulated: synthetic traffic pattern"}


def export_extra(osm_file, out_dir):
    """Railways, cycle tracks and critical sites straight from OpenStreetMap (no simulation involved)."""
    west, south, east, north = C.BBOX
    nodes, rail, cycle, zones, energy = {}, [], [], [], []

    def add_energy(tags, lon, lat):
        kind = tags.get("amenity")
        if kind in ("fuel", "charging_station") and west <= lon <= east and south <= lat <= north:
            name = tags.get("name:en") or tags.get("name") or tags.get("brand:en") or tags.get("brand") or tags.get("operator") or ""
            sockets = 0
            for k, v in tags.items():
                if k.startswith("socket:") and k.count(":") == 1 and str(v).isdigit():
                    sockets += int(v)
            cap = tags.get("capacity", "")
            energy.append(["ev" if kind == "charging_station" else "fuel", name, round(lon, 5), round(lat, 5),
                           tags.get("brand:en") or tags.get("brand") or tags.get("operator") or "", sockets or (int(cap) if str(cap).isdigit() else 0)])

    def zone_type(tags):
        for ztype, key, values in ZONE_RULES:
            if key in tags and (values is None or tags[key] in values):
                return ztype
        return None

    def add_zone(tags, lon, lat):
        ztype = zone_type(tags)
        if ztype and west <= lon <= east and south <= lat <= north:
            name = tags.get("name:en") or tags.get("int_name") or tags.get("name") or ""
            zones.append([ztype, name, round(lon, 5), round(lat, 5)])

    for ev, el in ET.iterparse(osm_file, events=("end",)):
        if el.tag == "node":
            lon, lat = float(el.get("lon")), float(el.get("lat"))
            nodes[el.get("id")] = (lon, lat)
            if len(el):
                ntags = {t.get("k"): t.get("v") for t in el.findall("tag")}
                add_zone(ntags, lon, lat)
                add_energy(ntags, lon, lat)
            el.clear()
        elif el.tag == "way":
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            pts = [nodes[nd.get("ref")] for nd in el.findall("nd") if nd.get("ref") in nodes]
            if len(pts) >= 2:
                line = [c for p in pts for c in (round(p[0], 5), round(p[1], 5))]
                inside = any(west <= p[0] <= east and south <= p[1] <= north for p in pts)
                if inside and tags.get("railway") in ("rail", "light_rail", "subway", "tram", "monorail") and tags.get("service") not in ("yard", "siding", "spur"):
                    rail.append(line)
                elif inside and tags.get("highway") == "cycleway":
                    cycle.append(line)
                else:
                    cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
                    add_zone(tags, cx, cy)
                    add_energy(tags, cx, cy)
            el.clear()

    # One marker per site: drop repeats of the same type within about 150 m (a campus mapped as several objects).
    kept = []
    for z in sorted(zones, key=lambda z: (z[0], -len(z[1]))):
        if not any(k[0] == z[0] and abs(k[2] - z[2]) < 0.0015 and abs(k[3] - z[3]) < 0.0015 for k in kept):
            kept.append(z)

    def km(lines):
        total = 0.0
        for ln in lines:
            for i in range(0, len(ln) - 2, 2):
                total += math.hypot((ln[i + 2] - ln[i]) * 101.4, (ln[i + 3] - ln[i + 1]) * 110.6)
        return round(total)

    # Fuel and EV charging stations: one per site (a station mapped as a node and as an area is kept once).
    stations = []
    for e in sorted(energy, key=lambda e: (e[0], -len(e[1]))):
        if not any(k[0] == e[0] and abs(k[2] - e[2]) < 0.0006 and abs(k[3] - e[3]) < 0.0006 for k in stations):
            stations.append(e)
    for name, data in (("rail.json", rail), ("cycle.json", cycle), ("zones.json", kept), ("energy.json", stations)):
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    counts = {}
    for z in kept:
        counts[z[0]] = counts.get(z[0], 0) + 1
    return {"rail_km": km(rail), "cycle_km": km(cycle), "zones": counts,
            "fuel_stations": sum(1 for e in stations if e[0] == "fuel"), "ev_stations": sum(1 for e in stations if e[0] == "ev")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--osm", required=True)
    ap.add_argument("--build", default="build")
    ap.add_argument("--out", default="data")
    ap.add_argument("--osm-timestamp", default="")
    ap.add_argument("--scale", type=float, default=1.0, help="scale demand (for small test networks)")
    ap.add_argument("--extra", default="", help="OSM file with railways, cycle tracks and critical sites")
    ap.add_argument("--region", default="", help="region id from tools/regions.py; empty = Abu Dhabi city (the default study area)")
    ap.add_argument("--mode", default="sumo", choices=["sumo", "synthetic"], help="sumo = run the simulation; synthetic = traffic pattern without a simulation")
    ap.add_argument("--no-buildings", action="store_true", help="skip the building footprints")
    args = ap.parse_args()
    os.makedirs(args.build, exist_ok=True)
    os.makedirs(args.out, exist_ok=True)
    region = R.REGIONS.get(args.region) if args.region else None
    if args.region and not region:
        raise SystemExit(f"unknown region {args.region}")
    centre = ((C.BBOX[0] + C.BBOX[2]) / 2, (C.BBOX[1] + C.BBOX[3]) / 2)
    if region:
        C.BBOX, C.TOTAL_VEHICLE_TRIPS, centre = tuple(region["bbox"]), region["trips"], region["centre"]
    C.TOTAL_VEHICLE_TRIPS = int(C.TOTAL_VEHICLE_TRIPS * args.scale)

    net_file = os.path.join(args.build, "net.net.xml")
    build_network(args.osm, net_file)
    net = sumolib.net.readNet(net_file)
    edges = load_edges(net)
    edge_index = {e.getID(): i for i, e in enumerate(edges)}
    shapes = {e.getID(): edge_shape(e) for e in edges}
    print(f"network: {len(edges)} edges, {len(net.getNodes())} junctions", flush=True)

    extra = {"available": False}
    if args.extra and os.path.exists(args.extra):
        try:
            extra = {"available": True, **export_extra(args.extra, args.out)}
        except Exception as exc:  # optional layers; never fail the build for them
            extra = {"available": False, "reason": f"{type(exc).__name__}: {exc}"[:200]}
    print("extra layers:", extra, flush=True)

    km_by_class = export_roads(net, edges, os.path.join(args.out, "roads.json"), osm_names(args.osm))
    bld, buildings = None, {"available": False, "reason": "not attempted"}
    try:
        if args.no_buildings or args.mode == "synthetic":
            raise RuntimeError("skipped for this build")
        import buildings as B
        bld = B.load(args.build)
        with open(os.path.join(args.out, "buildings.json"), "w") as f:
            json.dump(bld["shown"], f, separators=(",", ":"))
        buildings = {"available": True, "count": bld["count"], "shown": len(bld["shown"]),
                     "measured_heights": bld["measured_heights"], "source": bld["source"]}
    except Exception as exc:  # optional layer; demand falls back to road length × lanes
        buildings = {"available": False, "reason": f"{type(exc).__name__}: {exc}"[:200]}
    print("buildings:", buildings, flush=True)

    n_bins = (C.SIM_END - C.SIM_BEGIN) // C.BIN_SECONDS
    if args.mode == "synthetic":
        scenarios, demand_stats = synthetic_traffic(net, edges, n_bins, args.out, centre, C.TOTAL_VEHICLE_TRIPS)
        print("synthetic traffic:", [(sc["id"], sc["bins"][18]["speed"], sc["bins"][18]["vehicles"]) for sc in scenarios], flush=True)
    else:
        trip_files, trip_counts, demand_stats = make_demand(net, edges, args.build, bld)

        scenarios = []
        # The scenarios are independent, so their simulations run side by side.
        running = {sc["id"]: simulate(net_file, trip_files[sc["id"]], args.build, sc["id"]) for sc in C.SCENARIOS}
        for sc in C.SCENARIOS:
            out, proc, log = running[sc["id"]]
            code = proc.wait()
            log.close()
            print(open(log.name).read()[-1500:], flush=True)
            if code != 0:
                raise RuntimeError(f"sumo failed for scenario {sc['id']} (exit {code})")
            kpis = export_edgedata(out["edgedata"], edge_index, edges, n_bins, os.path.join(args.out, sc["id"]))
            # The trip sample is only kept for the default study area; the app draws vehicles from the link statistics.
            shown = 0 if args.region else export_trips(out["vehroute"], net, shapes, os.path.join(args.out, f"{sc['id']}_trips.bin"))
            scenarios.append({**sc, "trips": trip_counts[sc["id"]], "shown_trips": shown,
                              "stats": trip_stats(out["tripinfo"]), "bins": kpis})
            print(sc["id"], scenarios[-1]["stats"], flush=True)

    # Buses in the app are a synthetic example network (js/buses.js). The real timetable import is off
    # unless GTFS_ENABLED is set in tools/config.py.
    buses = {"available": False, "reason": "real timetable import is switched off; the app uses a synthetic bus network"}
    if getattr(C, "GTFS_ENABLED", False):
        try:
            import gtfs_buses
            buses = gtfs_buses.build(os.path.join(args.out, "buses.bin"), args.build)
        except Exception as exc:  # the bus layer is optional; never fail the build for it
            buses = {"available": False, "reason": f"{type(exc).__name__}: {exc}"[:200]}
    print("buses:", buses, flush=True)

    signal_nodes = [n for n in net.getNodes() if n.getType() in ("traffic_light", "traffic_light_right_on_red")]
    tls = len(signal_nodes)
    # Signal positions for the app's signal layer (timings are not public, so the app shows a generic cycle).
    with open(os.path.join(args.out, "signals.json"), "w") as f:
        json.dump([[round(v, 5) for v in net.convertXY2LonLat(*n.getCoord())] for n in signal_nodes], f, separators=(",", ":"))
    meta = {
        "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "osm_timestamp": args.osm_timestamp.strip() or "unknown",
        "sumo": subprocess.run(["sumo", "--version"], capture_output=True, text=True).stdout.splitlines()[0].strip(),
        "region": args.region or "abudhabi", "region_name": region["name"] if region else "Abu Dhabi", "traffic": "simulated" if args.mode == "sumo" else "synthetic",
        "bbox": C.BBOX, "sim_begin": C.SIM_BEGIN, "sim_end": C.SIM_END,
        "display_begin": C.DISPLAY_BEGIN, "bin_seconds": C.BIN_SECONDS, "bins": n_bins,
        "trip_sample": C.TRIP_SAMPLE, "sim_sample": C.SIM_SAMPLE,
        "network": {"edges": len(edges), "junctions": len(net.getNodes()), "signals": tls,
                    "km": round(sum(e.getLength() for e in edges) / 1000), "km_by_class": km_by_class},
        "demand": {"total_assumed": C.TOTAL_VEHICLE_TRIPS, **demand_stats},
        "scenarios": scenarios, "buses": buses, "buildings": buildings, "extra": extra,
    }
    with open(os.path.join(args.out, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print("done", flush=True)


if __name__ == "__main__":
    main()
