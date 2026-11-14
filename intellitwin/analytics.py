"""Read models: everything the UI shows is computed here from the engine state (call with engine.lock held)."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta

import numpy as np

from .engine import INCIDENT_LABELS, STATUSES, Engine
from .traffic import LOS_LABELS, los_index, slot_of


def iso(d: datetime | None) -> str | None:
    return d.isoformat(timespec="seconds") if d else None


def _day(e: Engine) -> datetime:
    return e.now.replace(hour=0, minute=0, second=0, microsecond=0)


def ser_inc(e: Engine, i: dict, detail: bool = False) -> dict:
    t = i["t"]
    det = t["detected"]
    on = t.get("on_scene")
    clr = t.get("cleared")
    out = {
        "id": i["id"], "type": i["type"], "label": INCIDENT_LABELS[i["type"]][0], "label_ar": INCIDENT_LABELS[i["type"]][1],
        "severity": i["severity"], "status": i["status"], "source": i["source"], "street": i["street"], "district": i["district"],
        "district_name": e.city.district_name(i["district"]), "lat": i["lat"], "lon": i["lon"], "detected": iso(det),
        "response_min": round((on - det).total_seconds() / 60, 1) if on else None,
        "clearance_min": round((clr - det).total_seconds() / 60, 1) if clr else None,
        "age_min": round(((clr or e.now) - det).total_seconds() / 60, 1), "vehicles": i["vehicles"], "injuries": i["injuries"],
        "impact_vh": round(i["impact_vh"], 1), "linked_violations": i["links"].get("violation_ids", []), "cause": i["links"].get("cause"),
        "ai_conf": i["ai_conf"], "seg": i["seg"],
    }
    if detail:
        out["timeline"] = [{"status": s, "ts": iso(t[s])} for s in STATUSES if s in t]
        out["responders"] = i["responders"]
        out["notes"] = [{"ts": iso(n["ts"]), "text": n["text"]} for n in i["notes"]]
    return out


def ser_vio(e: Engine, v: dict, detail: bool = False) -> dict:
    f = v["fine"]
    out = {
        "id": v["id"], "type": v["type"], "ts": iso(v["ts"]), "device": v["device"], "device_name": v["device_name"], "street": v["street"],
        "district": v["district"], "district_name": e.city.district_name(v["district"]), "lat": v["lat"], "lon": v["lon"], "plate": v["vehicle"]["plate"],
        "vehicle": f"{v['vehicle']['colour']} {v['vehicle']['make']} {v['vehicle']['type']}", "status": v["status"], "amount": f["amount"],
        "black_points": f["black_points"], "ai_conf": v["ai_conf"], "anpr_conf": v["anpr_conf"], "fine_ref": v["fine_ref"], "repeat": v["repeat"],
        "measured": round(v["measured"]) if v["measured"] else None, "limit": round(v["limit"]) if v["measured"] else None,
        "hold": v["hold"], "incident": v["incident"], "auto": v["auto"],
    }
    if detail:
        out["rule"] = f["rule"]
        out["impound_days"] = f["impound_days"]
        out["due"] = iso(v["due"])
        out["reviewer"] = v["reviewer"]
        out["reject_reason"] = v["reject_reason"]
        out["timeline"] = [{"status": k, "ts": iso(t)} for k, t in sorted(v["t"].items(), key=lambda kv: kv[1])]
        out["plate_history"] = e.plate_count.get(v["vehicle"]["plate"], 1)
        out["plate_points"] = e.plate_points.get(v["vehicle"]["plate"], 0)
        out["owner_vehicle"] = v["vehicle"]
    return out


def _wavg(e: Engine, arr: np.ndarray, ids=None) -> float:
    if ids is None:
        return float(np.average(arr, weights=e.city.length))
    return float(np.average(arr[ids], weights=e.city.length[ids]))


# ---------------------------------------------------------------------------------------- KPIs
def kpis(e: Engine) -> dict:
    day = _day(e)
    r = e.ratio
    ff = e.city.freeflow
    typ = e.model.typical(e.now)
    flow = e._flow()
    km = e.city.length / 1000.0
    v = np.maximum(ff * r, 3.0)
    delay = float(((km / v - km / ff) * flow).sum())
    incs = list(e.incidents.values())
    active = [i for i in incs if i["status"] != "cleared"]
    today_inc = [i for i in incs if i["t"]["detected"] >= day]
    resp = [(i["t"]["on_scene"] - i["t"]["detected"]).total_seconds() / 60 for i in incs if "on_scene" in i["t"] and i["t"]["detected"] >= day - timedelta(days=7)]
    vios = [x for x in e.violations.values() if x["ts"] >= day]
    issued = [x for x in vios if x["status"] in ("issued", "paid", "overdue", "appealed")]
    paid = [x for x in e.violations.values() if x["status"] == "paid" and x["t"].get("paid", day - timedelta(days=1)) >= day]
    all_issued = [x for x in e.violations.values() if x["status"] in ("issued", "paid", "overdue", "appealed")]
    paid_all = [x for x in all_issued if x["status"] == "paid"]
    backlog = [x for x in e.violations.values() if x["status"] == "in_review"]
    return {
        "now": iso(e.now),
        "health": round(_wavg(e, r) * 100, 1),
        "health_vs_typical": round((_wavg(e, r) - _wavg(e, typ)) * 100, 1),
        "avg_speed": round(_wavg(e, ff * r), 1),
        "congested_km": round(float(e.city.length[r < 0.5].sum() / 1000.0), 1),
        "congested_pct": round(float(np.average(r < 0.5, weights=e.city.length) * 100), 1),
        "delay_vh": round(delay),
        "active_incidents": len(active),
        "critical_incidents": sum(1 for i in active if i["severity"] >= 2),
        "incidents_today": len(today_inc),
        "avg_response_min": round(float(np.mean(resp)), 1) if resp else None,
        "violations_today": len(vios),
        "fines_issued_today": len(issued),
        "fines_value_today": int(sum(x["fine"]["amount"] for x in issued)),
        "collected_today": int(sum(x["fine"]["amount"] for x in paid)),
        "collection_rate": round(100 * len(paid_all) / max(len(all_issued), 1), 1),
        "review_backlog": len(backlog),
        "devices": len(e.city.devices),
        "devices_online": len(e.city.devices) - (1 if len(e.city.devices) > 20 else 0),
        "currency": e.city.meta["currency"],
    }


def day_series(e: Engine) -> list[dict]:
    """Midnight-to-midnight grid: today's recorded network speed index (until now) against the typical profile."""
    day = _day(e)
    actual = {slot_of(p["ts"]): p for p in e.series if p["ts"] >= day}
    out = []
    for s in range(288):
        ts = day + timedelta(minutes=5 * s)
        typ = float(np.average(e.model.typical(ts), weights=e.city.length))
        a = actual.get(s) if ts <= e.now else None
        out.append({"ts": iso(ts), "ratio": round(a["ratio"] * 100, 1) if a else None, "typical": round(typ * 100, 1), "congested_pct": round(a["congested_pct"], 1) if a else None})
    return out


# ---------------------------------------------------------------------------------------- congestion
def _series_pts(e: Engine, hours: int = 24) -> list[dict]:
    cutoff = e.now - timedelta(hours=hours)
    pts = [p for p in e.series if p["ts"] >= cutoff]
    out = []
    for p in pts:
        typ = float(np.average(e.model.typical(p["ts"]), weights=e.city.length))
        out.append({"ts": iso(p["ts"]), "speed": round(p["speed"], 1), "ratio": round(p["ratio"] * 100, 1), "typical": round(typ * 100, 1), "congested_pct": round(p["congested_pct"], 1), "delay_vh": round(p["delay_vh"]), "incidents": p["incidents"]})
    return out


def corridors(e: Engine, min_len: float = 3000.0) -> list[dict]:
    rows = []
    typ = e.model.typical(e.now)
    fc = e.model.forecast(e.now, e.ratio, e.loss, [30])[30]
    flow = e._flow()
    act = defaultdict(list)
    for i in e.incidents.values():
        if i["status"] != "cleared":
            act[i["street"]].append(i["id"])
    for name, ids in e.city.corridors.items():
        L = float(e.city.length[ids].sum())
        if L < min_len or name == "Unnamed road":
            continue
        ids = np.array(ids)
        r = _wavg(e, e.ratio, ids)
        sp = _wavg(e, e.city.freeflow * e.ratio, ids)
        km = e.city.length[ids] / 1000.0
        ff = e.city.freeflow[ids]
        vv = np.maximum(ff * e.ratio[ids], 3.0)
        delay = float(((km / vv - km / ff) * flow[ids]).sum())
        r30 = _wavg(e, fc, ids)
        rows.append({
            "name": name, "km": round(L / 1000, 1), "speed": round(sp, 1), "ratio": round(r * 100, 1), "los": LOS_LABELS[int(los_index(np.array([r]))[0])],
            "typical_ratio": round(_wavg(e, typ, ids) * 100, 1), "delay_vh": round(delay), "forecast30": round(r30 * 100, 1), "forecast30_speed": round(r30 * float(np.average(e.city.freeflow[ids])), 1),
            "trend": "worsening" if r30 < r - 0.04 else "improving" if r30 > r + 0.04 else "steady", "incidents": act.get(name, []),
            "district": Counter(e.city.segs[i]["district"] for i in ids).most_common(1)[0][0],
        })
    rows.sort(key=lambda x: x["ratio"])
    return rows


def hotspots(e: Engine, limit: int = 12) -> list[dict]:
    r = e.ratio
    bad = np.where(r < 0.5)[0]
    groups: dict[str, list[int]] = defaultdict(list)
    for i in bad:
        groups[e.city.segs[i]["name"]].append(int(i))
    out = []
    for name, ids in groups.items():
        if name == "Unnamed road":
            continue
        ia = np.array(ids)
        worst = ia[int(np.argmin(r[ia]))]
        since = np.nanmin(e.cong_since[ia])
        mid = e.seg_mid[worst]
        inc = [i["id"] for i in e.incidents.values() if i["status"] != "cleared" and i["street"] == name]
        out.append({
            "street": name, "district": e.city.segs[worst]["district"], "district_name": e.city.district_name(e.city.segs[worst]["district"]),
            "km": round(float(e.city.length[ia].sum() / 1000), 1), "avg_speed": round(_wavg(e, e.city.freeflow * r, ia), 1), "worst_speed": round(float(e.city.freeflow[worst] * r[worst]), 1),
            "since": iso(datetime.fromtimestamp(since)) if not np.isnan(since) else None, "minutes": round((e.now.timestamp() - since) / 60) if not np.isnan(since) else 0,
            "lat": float(mid[1]), "lon": float(mid[0]), "incidents": inc, "segs": len(ids),
        })
    out.sort(key=lambda x: -x["km"] * (1.2 if x["incidents"] else 1.0))
    return out[:limit]


def congestion(e: Engine) -> dict:
    r = e.ratio
    li = los_index(r)
    dist = [round(float(e.city.length[li == k].sum() / e.city.length.sum() * 100), 1) for k in range(6)]
    # hour x weekday matrix of congested % from the recorded history (this is what a real system builds from its data lake)
    acc: dict[tuple[int, int], list[float]] = defaultdict(list)
    for p in e.series:
        acc[(p["ts"].weekday(), p["ts"].hour)].append(p["congested_pct"])
    heat = [[round(float(np.mean(acc[(d, h)])), 1) if acc.get((d, h)) else None for h in range(24)] for d in range(7)]
    by_d = []
    for d in e.city.meta["districts"]:
        ids = np.where(e.city.district_idx == [x["id"] for x in e.city.meta["districts"]].index(d["id"]))[0]
        if len(ids) == 0:
            continue
        by_d.append({"id": d["id"], "name": d["name"], "name_ar": d["name_ar"], "speed": round(_wavg(e, e.city.freeflow * r, ids), 1), "ratio": round(_wavg(e, r, ids) * 100, 1), "congested_pct": round(float(np.average(r[ids] < 0.5, weights=e.city.length[ids]) * 100), 1)})
    return {"los_distribution": dist, "los_labels": LOS_LABELS, "hotspots": hotspots(e), "corridors": corridors(e)[:15], "series": _series_pts(e, 24), "heat": heat, "districts": by_d, "kpis": kpis(e)}


# ---------------------------------------------------------------------------------------- forecast (preview)
def forecast(e: Engine) -> dict:
    hs = list(range(0, 65, 5))
    fc = e.model.forecast(e.now, e.ratio, e.loss, hs[1:])
    fc[0] = e.ratio
    pts = []
    base = _wavg(e, e.ratio)
    for h in hs:
        rr = _wavg(e, fc[h])
        typ = _wavg(e, e.model.typical(e.now + timedelta(minutes=h)))
        sig = 0.012 + 0.0016 * h * (1.8 if any(i["status"] != "cleared" for i in e.incidents.values()) else 1.0)
        ffm = float(np.average(e.city.freeflow, weights=e.city.length))
        pts.append({"minute": h, "ts": iso(e.now + timedelta(minutes=h)), "ratio": round(rr * 100, 1), "speed": round(rr * ffm, 1), "typical": round(typ * 100, 1), "lo": round(max(rr - 1.28 * sig, 0.04) * 100, 1), "hi": round(min(rr + 1.28 * sig, 1.0) * 100, 1),
                    "congested_pct": round(float(np.average(fc[h] < 0.5, weights=e.city.length) * 100), 1)})
    rows = corridors(e)
    risk = sorted(rows, key=lambda c: c["forecast30"])[:8]
    fc60 = e.model.forecast(e.now, e.ratio, e.loss, [60])[60]
    for c in risk:
        ids = np.array(e.city.corridors[c["name"]])
        c["forecast60"] = round(_wavg(e, fc60, ids) * 100, 1)
    worst = min(pts, key=lambda p: p["ratio"])
    return {"now": iso(e.now), "points": pts, "at_risk": risk, "worst": worst, "incident_aware": any(i["status"] != "cleared" for i in e.incidents.values()),
            "method": "Weekly speed profile learned from 14 days of history plus decaying persistence of today's deviation; longer persistence near active incidents.", "status": "preview"}


def forecast_map(e: Engine, minutes: int) -> list[int]:
    minutes = max(5, min(60, minutes))
    fc = e.model.forecast(e.now, e.ratio, e.loss, [minutes])[minutes]
    return [int(x * 100) for x in fc]


# ---------------------------------------------------------------------------------------- dashboards
def _daily(e: Engine, days: int = 7) -> list[dict]:
    day0 = _day(e)
    rows = []
    for k in range(days - 1, -1, -1):
        d = day0 - timedelta(days=k)
        d2 = d + timedelta(days=1)
        vs = [v for v in e.violations.values() if d <= v["ts"] < d2]
        iss = [v for v in vs if v["status"] in ("issued", "paid", "overdue", "appealed")]
        pd = [v for v in e.violations.values() if v["status"] == "paid" and d <= v["t"].get("paid", d - timedelta(days=9)) < d2]
        inc = [i for i in e.incidents.values() if d <= i["t"]["detected"] < d2]
        pts = [p for p in e.series if d <= p["ts"] < d2]
        rows.append({
            "date": d.strftime("%Y-%m-%d"), "label": d.strftime("%a"), "violations": len(vs), "issued": len(iss), "issued_value": int(sum(v["fine"]["amount"] for v in iss)),
            "collected": int(sum(v["fine"]["amount"] for v in pd)), "incidents": len(inc), "avg_speed": round(float(np.mean([p["speed"] for p in pts])), 1) if pts else None,
            "peak_congested_pct": round(max((p["congested_pct"] for p in pts), default=0), 1), "delay_vh": round(float(np.sum([p["delay_vh"] for p in pts])) * (5 / 60)) if pts else 0,
        })
    return rows


def executive(e: Engine) -> dict:
    cs = corridors(e)
    return {"kpis": kpis(e), "daily": _daily(e), "series": day_series(e), "corridors": cs[:6], "districts": congestion(e)["districts"],
            "incident_mix": dict(Counter(i["type"] for i in e.incidents.values())), "violation_mix": dict(Counter(v["type"] for v in e.violations.values()))}


def police(e: Engine) -> dict:
    incs = sorted(e.incidents.values(), key=lambda i: i["t"]["detected"], reverse=True)
    active = [ser_inc(e, i) for i in incs if i["status"] != "cleared"]
    done = [i for i in incs if "on_scene" in i["t"]]
    by_sev = {}
    for s in (1, 2, 3):
        xs = [(i["t"]["on_scene"] - i["t"]["detected"]).total_seconds() / 60 for i in done if i["severity"] == s]
        by_sev[s] = round(float(np.mean(xs)), 1) if xs else None
    # black spots: incidents grouped by street + district over the history window
    spots: dict[tuple, list] = defaultdict(list)
    for i in incs:
        spots[(i["street"], i["district"])].append(i)
    black = sorted(
        [{"street": k[0], "district_name": e.city.district_name(k[1]), "district": k[1], "count": len(v), "collisions": sum(1 for x in v if x["type"] == "collision"), "severe": sum(1 for x in v if x["severity"] >= 2),
          "lat": v[0]["lat"], "lon": v[0]["lon"]} for k, v in spots.items()], key=lambda x: (-x["collisions"], -x["count"]))[:8]
    by_hour = [0] * 24
    for i in incs:
        by_hour[i["t"]["detected"].hour] += 1
    clr = [(i["t"]["cleared"] - i["t"]["detected"]).total_seconds() / 60 for i in incs if "cleared" in i["t"]]
    return {"kpis": kpis(e), "active": active, "recent": [ser_inc(e, i) for i in incs[:25]], "response_by_severity": by_sev, "avg_clearance_min": round(float(np.mean(clr)), 1) if clr else None,
            "black_spots": black, "by_hour": by_hour, "by_type": [{"type": k, "label": INCIDENT_LABELS[k][0], "label_ar": INCIDENT_LABELS[k][1], "count": c} for k, c in Counter(i["type"] for i in incs).most_common()],
            "lifecycle": {s: sum(1 for i in incs if i["status"] == s) for s in STATUSES}}


def enforcement(e: Engine) -> dict:
    day = _day(e)
    vs = list(e.violations.values())
    week = [v for v in vs if v["ts"] >= day - timedelta(days=6)]
    by_type = Counter(v["type"] for v in week)
    value_by_type: dict[str, int] = defaultdict(int)
    for v in week:
        if v["status"] in ("issued", "paid", "overdue", "appealed"):
            value_by_type[v["type"]] += v["fine"]["amount"]
    funnel = Counter(v["status"] for v in week)
    funnel_detected = len(week)
    issued_like = sum(funnel[s] for s in ("issued", "paid", "overdue", "appealed"))
    by_hour = [0] * 24
    for v in week:
        by_hour[v["ts"].hour] += 1
    dev = Counter(v["device"] for v in week)
    dev_rows = []
    names = {d["id"]: d for d in e.city.devices}
    for did, c in dev.most_common(8):
        d = names[did]
        dev_rows.append({"device": did, "name": d["name"], "kind": d["kind"], "count": c, "lat": d["lat"], "lon": d["lon"]})
    # repeat offenders
    rep = []
    by_plate: dict[str, list] = defaultdict(list)
    for v in week:
        by_plate[v["vehicle"]["plate"]].append(v)
    for p, lst in sorted(by_plate.items(), key=lambda kv: -len(kv[1]))[:10]:
        rep.append({"plate": p, "count": len(lst), "value": int(sum(x["fine"]["amount"] for x in lst if x["status"] != "rejected")), "points": e.plate_points.get(p, 0), "vehicle": f"{lst[0]['vehicle']['colour']} {lst[0]['vehicle']['make']}"})
    reviewed = [v for v in vs if "in_review" in v["t"] and ("issued" in v["t"] or "rejected" in v["t"])]
    sla = [((v["t"].get("issued") or v["t"].get("rejected")) - v["t"]["in_review"]).total_seconds() / 60 for v in reviewed]
    auto = sum(1 for v in week if v["auto"])
    dist = Counter()
    for v in week:
        dist[v["district"]] += 1
    appeals = sum(1 for v in week if "appealed" in v["t"])
    return {
        "kpis": kpis(e), "daily": _daily(e), "by_type": [{"type": k, "count": c, "value": value_by_type.get(k, 0)} for k, c in by_type.most_common()], "by_hour": by_hour,
        "funnel": {"detected": funnel_detected, "in_review": funnel["in_review"], "rejected": funnel["rejected"], "issued": issued_like, "paid": funnel["paid"], "overdue": funnel["overdue"], "appealed": funnel["appealed"], "cancelled": funnel["cancelled"]},
        "devices": dev_rows, "repeat_offenders": rep, "review_sla_min": round(float(np.median(sla)), 0) if sla else None, "auto_rate": round(100 * auto / max(len(week), 1), 1),
        "by_district": [{"id": k, "name": e.city.district_name(k), "count": c} for k, c in dist.most_common()], "appeals": appeals, "currency": e.city.meta["currency"],
        "schedule": e.city.meta["fines"], "disclaimer": e.city.meta.get("fine_disclaimer"),
    }


# ---------------------------------------------------------------------------------------- the linked chain (hero drill-down)
def chain(e: Engine, iid: str) -> dict:
    inc = e.incidents[iid]
    t0 = inc["t"]["detected"]
    steps = []
    # congestion on the corridor
    ids = np.array(e.city.corridors[inc["street"]])
    steps.append({"kind": "congestion", "ts": iso(t0 - timedelta(minutes=5)), "title": f"Congestion building on {inc['street']}", "detail": f"Corridor currently averages {_wavg(e, e.city.freeflow * e.ratio, ids):.0f} km/h (free flow {float(np.average(e.city.freeflow[ids])):.0f})."})
    vios = [e.violations[x] for x in inc["links"].get("violation_ids", []) if x in e.violations]
    # unlinked violations at the same location in the 20 minutes before are listed as context
    for v in e.violations.values():
        if v["id"] in inc["links"].get("violation_ids", []):
            continue
        if v["seg"] == inc["seg"] and t0 - timedelta(minutes=20) <= v["ts"] <= t0:
            vios.append(v)
    for v in vios:
        steps.append({"kind": "violation", "ts": iso(v["ts"]), "title": f"{e.rules.rules[v['type']]['label']} - {v['vehicle']['plate']}", "ref": v["id"],
                      "detail": f"{v['device_name']}. Fine {v['fine']['amount']} {e.city.meta['currency']} ({v['status'].replace('_', ' ')}).", "image": f"/api/violations/{v['id']}/evidence/1.png"})
    for s in STATUSES:
        if s in inc["t"]:
            steps.append({"kind": "incident", "ts": iso(inc["t"][s]), "title": {"detected": f"{INCIDENT_LABELS[inc['type']][0]} detected", "verified": "Incident verified", "dispatched": "Responders dispatched", "on_scene": "Responders on scene", "clearing": "Clearing in progress", "cleared": "Lanes reopened"}[s], "ref": iid})
    for v in vios:
        for k in ("issued", "paid"):
            if k in v["t"]:
                steps.append({"kind": "fine", "ts": iso(v["t"][k]), "title": f"Fine {v['fine_ref']} {k}", "ref": v["id"], "detail": f"{v['fine']['amount']} {e.city.meta['currency']} to {v['vehicle']['plate']}"})
    steps.sort(key=lambda s: s["ts"])
    return {"incident": ser_inc(e, inc, True), "violations": [ser_vio(e, v) for v in vios], "steps": steps, "impact": {"delay_vh": round(inc["impact_vh"], 1), "affected_segments": len(inc["affected"])}}
