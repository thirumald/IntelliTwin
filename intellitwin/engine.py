"""Simulation engine: clock, traffic state, incidents, violations, fines pipeline, alert feed and storyline."""
from __future__ import annotations

import heapq
import math
import threading
import time
import zlib
from collections import deque
from datetime import datetime, timedelta

import numpy as np

from .city import City, load_city
from .fines import FineRules, Fleet
from .traffic import SLOT_MIN, TrafficModel, daily_curve, los_index

INCIDENT_TYPES = [("collision", 0.34), ("breakdown", 0.30), ("debris", 0.12), ("roadworks", 0.08), ("vehicle_fire", 0.04), ("pedestrian", 0.05), ("stalled_bus", 0.07)]
INCIDENT_LABELS = {
    "collision": ("Collision", "حادث تصادم"),
    "breakdown": ("Vehicle breakdown", "عطل مركبة"),
    "debris": ("Debris on road", "أجسام على الطريق"),
    "roadworks": ("Road works", "أعمال طرق"),
    "vehicle_fire": ("Vehicle fire", "حريق مركبة"),
    "pedestrian": ("Pedestrian on carriageway", "مشاة على الطريق"),
    "stalled_bus": ("Stalled bus", "حافلة متعطلة"),
}
STATUSES = ["detected", "verified", "dispatched", "on_scene", "clearing", "cleared"]
SOURCES = [("ai_camera", 0.45), ("call_centre", 0.25), ("patrol", 0.20), ("sensor", 0.10)]
RESPONDERS = {
    "collision": {1: ["police", "recovery"], 2: ["police", "ambulance", "recovery"], 3: ["police", "ambulance", "civil_defence", "recovery"]},
    "vehicle_fire": {1: ["civil_defence", "police"], 2: ["civil_defence", "police", "ambulance"], 3: ["civil_defence", "police", "ambulance"]},
    "pedestrian": {1: ["police"], 2: ["police", "ambulance"], 3: ["police", "ambulance"]},
}
VIOLATION_RATE_PER_DAY = {"red_light": 15.0, "speed": 14.0, "ai_cabin": 12.0, "parking": 11.0, "wrong_way": 0.5}
STORY_PLATE_SUFFIX = "48215"


def _wchoice(rng, items):
    r = rng.random() * sum(w for _, w in items)
    acc = 0.0
    for k, w in items:
        acc += w
        if r <= acc:
            return k
    return items[-1][0]


class Engine:
    def __init__(self, city_id: str = "abu_dhabi", start: str = "07:20", history_days: int = 7, seed: int = 2026):
        self.lock = threading.RLock()
        self.seed = seed
        self.history_days = history_days
        self.load(city_id, start)

    # ------------------------------------------------------------------ setup / reset
    def load(self, city_id: str, start: str = "07:20") -> None:
        with self.lock:
            self.city: City = load_city(city_id)
            self.model = TrafficModel(self.city, seed=7)
            self.model.learn_profile(14)
            self.fleet = Fleet(self.city, seed=self.seed)
            self.rules = FineRules(self.city)
            self.rng = np.random.default_rng(self.seed)
            self.incidents: dict[str, dict] = {}
            self.violations: dict[str, dict] = {}
            self.feed: deque = deque(maxlen=300)
            self.series: deque = deque(maxlen=self.history_days * 288 + 400)
            self.plate_count: dict[str, int] = {}
            self.plate_points: dict[str, int] = {}
            self.heap: list = []  # (time, seq, kind, payload) for payments/appeals/reviews
            self.seq = 0
            self.vcount = 0
            self.icount = 0
            self.scripted: list = []
            self.boost = np.zeros(self.city.n, dtype=np.float32)
            self.boost_target = np.zeros(self.city.n, dtype=np.float32)
            self.cong_since = np.full(self.city.n, np.nan)
            self.corr_state: dict[str, bool] = {}
            self.speed = 10.0
            self.playing = True
            self.story_state = "idle"
            self.last_real = time.time()
            self.loss = np.zeros(self.city.n, dtype=np.float32)
            self.ratio = np.ones(self.city.n, dtype=np.float32)
            self.seg_mid = np.array([s["coords"][len(s["coords"]) // 2] for s in self.city.segs], dtype=np.float64)
            self.demand_x = np.zeros(self.city.n, dtype=np.float32)
            self.today = self._pick_demo_day()
            h, m = (int(x) for x in start.split(":"))
            self.start_dt = self.today.replace(hour=h, minute=m)
            self.now = self.today - timedelta(days=self.history_days)
            self.warm = True
            self._run_until(self.start_dt, step_s=300)
            self.warm = False
            self.last_real = time.time()
            self._seed_live_incidents()
            self.feed.clear()
            self.log("info", "system", f"IntelliTwin online for {self.city.meta['name']}: {self.city.n} road segments, {len(self.city.devices)} enforcement devices", None)

    def _seed_live_incidents(self) -> None:
        """Open the demo with a few realistic live incidents so the board is never empty."""
        w = np.maximum(self.demand_x, 0.01) * np.where(self.city.cls == 2, 1.0, 1.4)
        rng = np.random.default_rng(self.seed + 3)
        for typ, sev, ago in (("breakdown", 1, 9), ("stalled_bus", 1, 4), ("roadworks", 1, 55)):
            seg = int(rng.choice(self.city.n, p=w / w.sum()))
            self._make_incident(typ, seg, sev, "patrol" if typ != "stalled_bus" else "ai_camera", detected=self.now - timedelta(minutes=ago))
        self._advance_incidents()

    def _pick_demo_day(self) -> datetime:
        d = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        for _ in range(10):
            if d.weekday() not in self.city.meta["weekend"] and d.weekday() in (1, 2, 3):
                return d
            d -= timedelta(days=1)
        return d

    # ------------------------------------------------------------------ clock
    def tick(self) -> None:
        """Advance the simulation by real elapsed time x speed. Called by the background thread."""
        with self.lock:
            real = time.time()
            dt_real = min(real - self.last_real, 2.0)
            self.last_real = real
            if not self.playing:
                return
            target = self.now + timedelta(seconds=dt_real * self.speed)
            self._run_until(target, step_s=60 if self.speed <= 60 else 120)

    def _run_until(self, target: datetime, step_s: int) -> None:
        while self.now < target:
            sub = min(step_s, (target - self.now).total_seconds())
            self._step(sub)

    # ------------------------------------------------------------------ one step
    def _step(self, sub: float) -> None:
        self.now = self.now + timedelta(seconds=sub)
        now = self.now
        dt_h = sub / 3600.0
        # scripted storyline
        while self.scripted and self.scripted[0][0] <= now:
            _, _, fn = heapq.heappop(self.scripted)
            fn()
        # boosts ease toward their targets (surge ramp-up / relaxation)
        k = 1 - math.exp(-sub / 360.0)
        self.boost += (self.boost_target - self.boost) * k
        # incident lifecycle then traffic
        self._advance_incidents()
        self.loss = self.model.capacity_loss([i for i in self.incidents.values() if i["status"] != "cleared"])
        self.demand_x = self.model.demand(now, advance_noise_h=dt_h) + self.boost
        x = self.demand_x / (1.0 - self.loss)
        from .traffic import ratio_from_x

        self.ratio = np.clip(ratio_from_x(x), 0.04, 1.0).astype(np.float32)
        # congestion duration tracking
        cong = self.ratio < 0.5
        ts = now.timestamp()
        self.cong_since = np.where(cong & np.isnan(self.cong_since), ts, np.where(cong, self.cong_since, np.nan))
        # incident impact accumulation (vehicle-hours of extra delay on affected segments)
        self._accumulate_impact(dt_h)
        # random events
        self._spawn_incidents(dt_h)
        self._spawn_violations(dt_h)
        self._process_heap()
        if now.minute % SLOT_MIN == 0 and now.second < sub + 1 and (not self.series or (now - self.series[-1]["ts"]).total_seconds() >= 240):
            self._record_point()
            if not self.warm:
                self._corridor_alerts()

    # ------------------------------------------------------------------ helpers
    def log(self, level: str, kind: str, text: str, ref: str | None, **extra) -> None:
        self.feed.appendleft({"ts": self.now, "level": level, "kind": kind, "text": text, "ref": ref, **extra})

    def _flow(self) -> np.ndarray:
        """Vehicles/h on each segment (demand x capacity, throttled by congestion)."""
        return np.minimum(self.demand_x, 1.0) * self.city.capacity * (0.55 + 0.45 * self.ratio)

    def _accumulate_impact(self, dt_h: float) -> None:
        for inc in self.incidents.values():
            if inc["status"] == "cleared":
                continue
            seg_ids = inc["affected"]
            if not seg_ids:
                continue
            ids = np.array(seg_ids)
            ff = self.city.freeflow[ids]
            v = np.maximum(ff * self.ratio[ids], 3.0)
            km = self.city.length[ids] / 1000.0
            extra_h = (km / v - km / ff) * self._flow()[ids] * dt_h
            inc["impact_vh"] += float(np.maximum(extra_h, 0).sum())

    def _record_point(self) -> None:
        w = self.city.length
        r = self.ratio
        flow = self._flow()
        ff = self.city.freeflow
        km = self.city.length / 1000.0
        v = np.maximum(ff * r, 3.0)
        delay = float(((km / v - km / ff) * flow).sum())
        self.series.append(
            {
                "ts": self.now,
                "ratio": float(np.average(r, weights=w)),
                "speed": float(np.average(ff * r, weights=w)),
                "congested_pct": float(np.average(r < 0.5, weights=w) * 100),
                "congested_km": float(w[r < 0.5].sum() / 1000.0),
                "delay_vh": delay,
                "incidents": sum(1 for i in self.incidents.values() if i["status"] != "cleared"),
                "ratios": None,
            }
        )

    def _corridor_alerts(self) -> None:
        for name, ids in self.city.corridors.items():
            tot = float(self.city.length[ids].sum())
            if tot < 2500 or name == "Unnamed road":
                continue
            rr = float(np.average(self.ratio[ids], weights=self.city.length[ids]))
            bad = rr < 0.42
            if bad and not self.corr_state.get(name):
                self.log("warning", "congestion", f"Heavy congestion building on {name} (avg {rr * float(np.average(self.city.freeflow[ids])):.0f} km/h)", name)
            self.corr_state[name] = bad

    # ------------------------------------------------------------------ incidents
    def _make_incident(self, typ: str, seg: int, severity: int, source: str, links: dict | None = None, plan_scale: float = 1.0, detected: datetime | None = None, vehicles: int | None = None) -> dict:
        rng = self.rng
        self.icount += 1
        iid = f"INC-{self.icount:05d}"
        s = self.city.segs[seg]
        mid = s["coords"][len(s["coords"]) // 2]
        det = detected or self.now
        sev = severity
        coll = typ == "collision"
        dur = {
            "verified": rng.uniform(1, 4) * plan_scale,
            "dispatched": rng.uniform(1, 4) * plan_scale,
            "on_scene": {1: rng.uniform(6, 12), 2: rng.uniform(7, 14), 3: rng.uniform(9, 18)}[sev] * plan_scale,
            "clearing": (rng.uniform(10, 20) if sev == 1 else rng.uniform(22, 38) if sev == 2 else rng.uniform(40, 65)) * (1.0 if coll else 0.6) * plan_scale,
            "cleared": rng.uniform(5, 12) * plan_scale,
        }
        if typ == "roadworks":
            dur["clearing"] = rng.uniform(60, 180)
        inc = {
            "id": iid, "type": typ, "severity": sev, "status": "detected", "source": source, "seg": seg,
            "street": s["name"], "district": s["district"], "lat": mid[1], "lon": mid[0], "limit": s["limit"],
            "t": {"detected": det}, "next_at": det + timedelta(minutes=dur["verified"]), "dur": dur,
            "responders": [], "vehicles": vehicles or (int(rng.integers(2, 4)) if coll else 1),
            "injuries": int(rng.integers(0, 2 if sev == 1 else 4)) if coll else 0,
            "links": links or {}, "affected": [], "impact_vh": 0.0, "block": 1.0 if coll else 0.6,
            "ai_conf": round(float(rng.uniform(0.82, 0.99)), 2), "notes": [],
        }
        if typ in ("breakdown", "debris", "stalled_bus", "pedestrian"):
            inc["block"] = 0.55
        # segments that this incident throttles (itself plus upstream spill-back)
        frontier, seen = [seg], {seg}
        for _ in range(4):
            nxt = []
            for q in frontier:
                for p in self.city.segs[q]["prev"]:
                    if p not in seen:
                        seen.add(p)
                        nxt.append(p)
            frontier = nxt
        inc["affected"] = list(seen)
        self.incidents[iid] = inc
        label = INCIDENT_LABELS[typ][0]
        self.log("critical" if sev >= 2 else "warning", "incident", f"{label} on {s['name']} ({self.city.district_name(s['district'])}) - severity {sev}", iid)
        return inc

    def _spawn_incidents(self, dt_h: float) -> None:
        h = self.now.hour + self.now.minute / 60
        lam = 0.34 * daily_curve(h, self.model.is_weekend(self.now)) / 0.45
        # more likely where traffic is dense
        if self.rng.random() < 1 - math.exp(-lam * dt_h):
            w = np.maximum(self.demand_x, 0.01) * np.where(self.city.cls == 2, 1.0, 1.4)
            seg = int(self.rng.choice(self.city.n, p=w / w.sum()))
            if any(i["seg"] == seg and i["status"] != "cleared" for i in self.incidents.values()):
                return
            typ = _wchoice(self.rng, INCIDENT_TYPES)
            sev = int(self.rng.choice([1, 2, 3], p=[0.55, 0.35, 0.10])) if typ in ("collision", "vehicle_fire", "pedestrian") else 1
            self._make_incident(typ, seg, sev, _wchoice(self.rng, SOURCES))

    def _advance_incidents(self) -> None:
        for inc in self.incidents.values():
            while inc["status"] != "cleared" and self.now >= inc["next_at"]:
                self._set_status(inc, STATUSES[STATUSES.index(inc["status"]) + 1], inc["next_at"])

    def _set_status(self, inc: dict, status: str, at: datetime) -> None:
        inc["status"] = status
        inc["t"][status] = at
        if status == "dispatched":
            r = RESPONDERS.get(inc["type"], {}).get(inc["severity"], ["recovery"] if inc["type"] != "roadworks" else [])
            inc["responders"] = [{"unit": u, "eta_min": round(float(self.rng.uniform(5, 15)), 0)} for u in r]
        if status in ("on_scene", "cleared"):
            lbl = INCIDENT_LABELS[inc["type"]][0]
            self.log("info" if status == "cleared" else "warning", "incident", f"{lbl} on {inc['street']} {'cleared, lanes reopened' if status == 'cleared' else 'responders on scene'}", inc["id"])
        if status != "cleared":
            nxt = STATUSES[STATUSES.index(status) + 1]
            inc["next_at"] = at + timedelta(minutes=inc["dur"][nxt])
        else:
            inc["next_at"] = at

    def incident_action(self, iid: str, action: str, who: str = "Operator") -> dict:
        with self.lock:
            inc = self.incidents[iid]
            to = {"verify": "verified", "dispatch": "dispatched", "arrive": "on_scene", "clear": "cleared"}.get(action)
            if to is None:
                raise ValueError("unknown action")
            if STATUSES.index(to) <= STATUSES.index(inc["status"]):
                return inc
            # walk through intermediate states so timestamps stay consistent
            while STATUSES.index(inc["status"]) < STATUSES.index(to):
                self._set_status(inc, STATUSES[STATUSES.index(inc["status"]) + 1], self.now)
            inc["notes"].append({"ts": self.now, "text": f"{who}: {action}"})
            return inc

    # ------------------------------------------------------------------ violations & fines
    def _spawn_violations(self, dt_h: float) -> None:
        h = self.now.hour + self.now.minute / 60
        flow_shape = daily_curve(h, self.model.is_weekend(self.now)) / 0.45
        for dev in self.city.devices:
            kind = dev["kind"]
            per_day = VIOLATION_RATE_PER_DAY[kind]
            shape = flow_shape
            if kind == "speed":
                shape = 0.5 + 1.1 * float(self.ratio[dev["seg"]])
            if kind == "parking":
                shape = 1.6 if 8 <= h <= 20 else 0.1
            lam = per_day / 24.0 * shape * dt_h
            if lam <= 0:
                continue
            n = int(self.rng.poisson(lam))
            for _ in range(n):
                self._new_violation(dev)

    def _new_violation(self, dev: dict, forced: dict | None = None) -> dict | None:
        rng = self.rng
        kind = dev["kind"]
        vtype = {"red_light": "red_light", "speed": "speeding", "parking": "illegal_parking", "wrong_way": "wrong_way"}.get(kind)
        if kind == "ai_cabin":
            vtype = str(rng.choice(["phone_use", "seatbelt", "lane_violation"], p=[0.42, 0.33, 0.25]))
        limit = float(self.city.segs[dev["seg"]]["limit"])
        measured = None
        if vtype == "speeding":
            measured = limit + 12 + float(rng.gamma(1.6, 9.0))
        f = self.rules.assess(vtype, measured, limit)
        if f is None:
            return None
        veh = forced["vehicle"] if forced else self.fleet.pick()
        self.vcount += 1
        vid = f"V-{self.vcount:06d}"
        ai_conf = forced["ai_conf"] if forced else float(np.clip(rng.normal(0.94, 0.05), 0.55, 0.995))
        anpr = forced["anpr_conf"] if forced else float(np.clip(rng.normal(0.955, 0.035), 0.6, 0.995))
        v = {
            "id": vid, "type": vtype, "device": dev["id"], "device_name": dev["name"], "seg": dev["seg"], "street": self.city.segs[dev["seg"]]["name"],
            "district": dev["district"], "lat": dev["lat"], "lon": dev["lon"], "ts": self.now, "vehicle": veh, "limit": limit, "measured": measured,
            "ai_conf": round(ai_conf, 2), "anpr_conf": round(anpr, 2), "fine": f, "status": "detected", "t": {"detected": self.now},
            "fine_ref": None, "due": None, "hold": bool(forced and forced.get("hold")), "reviewer": None, "reject_reason": None,
            "repeat": False, "incident": None, "auto": False,
        }
        self.violations[vid] = v
        self.plate_count[veh["plate"]] = self.plate_count.get(veh["plate"], 0) + 1
        v["repeat"] = self.plate_count[veh["plate"]] >= 3
        conf = min(ai_conf, anpr)
        auto_ok = vtype in ("speeding", "illegal_parking") and conf >= 0.93 and not v["repeat"] and not v["hold"]
        if auto_ok:
            self._issue(v, self.now + timedelta(minutes=float(rng.uniform(1, 5))), auto=True)
        else:
            v["status"] = "in_review"
            v["t"]["in_review"] = self.now
            if not v["hold"]:
                # the review team works the queue: resolve after an SLA-like delay
                delay = timedelta(minutes=float(rng.gamma(2.0, 28.0)) + 8)
                self._push(self.now + delay, "review", vid)
        return v

    def _push(self, at: datetime, kind: str, payload) -> None:
        self.seq += 1
        heapq.heappush(self.heap, (at, self.seq, kind, payload))

    def _issue(self, v: dict, at: datetime, auto: bool = False, reviewer: str | None = None) -> None:
        self.fine_n = getattr(self, "fine_n", 0) + 1
        v["status"] = "issued"
        v["auto"] = auto
        v["reviewer"] = reviewer or ("AI auto-approval" if auto else "Review team")
        v["fine_ref"] = f"F-{self.fine_n:06d}"
        v["t"]["issued"] = at
        v["due"] = at + timedelta(days=30)
        pts = v["fine"]["black_points"]
        if pts:
            p = v["vehicle"]["plate"]
            self.plate_points[p] = self.plate_points.get(p, 0) + pts
        rng = self.rng
        u = rng.random()
        if u < 0.04:  # appeal
            ap = at + timedelta(days=float(rng.uniform(1, 12)))
            self._push(ap, "appeal", v["id"])
        elif u < 0.88:  # pays: median ~3 days, long tail
            self._push(at + timedelta(days=float(rng.lognormal(1.1, 0.9))), "pay", v["id"])
        self._push(v["due"], "overdue", v["id"])

    def _process_heap(self) -> None:
        while self.heap and self.heap[0][0] <= self.now:
            at, _, kind, vid = heapq.heappop(self.heap)
            v = self.violations.get(vid)
            if v is None:
                continue
            st = v["status"]
            if kind == "review" and st == "in_review":
                if min(v["ai_conf"], v["anpr_conf"]) < 0.80 and self.rng.random() < 0.6:
                    self._reject(v, "Plate not legible / low confidence", at, "Review team")
                else:
                    self._issue(v, at)
            elif kind == "pay" and st in ("issued", "overdue"):
                v["status"] = "paid"
                v["t"]["paid"] = at
            elif kind == "overdue" and st == "issued":
                v["status"] = "overdue"
                v["t"]["overdue"] = at
            elif kind == "appeal" and st in ("issued", "overdue"):
                v["status"] = "appealed"
                v["t"]["appealed"] = at
                self._push(at + timedelta(days=3), "appeal_result", v["id"])
            elif kind == "appeal_result" and st == "appealed":
                if self.rng.random() < 0.38:
                    v["status"] = "cancelled"
                    v["t"]["cancelled"] = at
                    v["reject_reason"] = "Appeal upheld"
                    p = v["vehicle"]["plate"]
                    self.plate_points[p] = max(0, self.plate_points.get(p, 0) - v["fine"]["black_points"])
                else:
                    v["status"] = "issued"
                    v["t"]["appeal_dismissed"] = at
                    self._push(at + timedelta(days=float(self.rng.uniform(2, 9))), "pay", v["id"])

    def _reject(self, v: dict, reason: str, at: datetime, who: str) -> None:
        v["status"] = "rejected"
        v["reject_reason"] = reason
        v["reviewer"] = who
        v["t"]["rejected"] = at

    def violation_action(self, vid: str, action: str, reason: str | None = None, who: str = "Operator") -> dict:
        with self.lock:
            v = self.violations[vid]
            if action == "approve" and v["status"] == "in_review":
                self._issue(v, self.now, reviewer=who)
                self.log("info", "fine", f"Fine {v['fine_ref']} issued: {v['fine']['amount']} {self.city.meta['currency']} to {v['vehicle']['plate']} ({v['type'].replace('_', ' ')})", vid)
            elif action == "reject" and v["status"] == "in_review":
                self._reject(v, reason or "Rejected by operator", self.now, who)
            elif action == "pay" and v["status"] in ("issued", "overdue"):
                v["status"] = "paid"
                v["t"]["paid"] = self.now
            elif action == "appeal" and v["status"] in ("issued", "overdue"):
                v["status"] = "appealed"
                v["t"]["appealed"] = self.now
                self._push(self.now + timedelta(days=3), "appeal_result", vid)
            elif action == "uphold_appeal" and v["status"] == "appealed":
                v["status"] = "cancelled"
                v["t"]["cancelled"] = self.now
                v["reject_reason"] = "Appeal upheld"
            elif action == "dismiss_appeal" and v["status"] == "appealed":
                v["status"] = "issued"
                v["t"]["appeal_dismissed"] = self.now
            else:
                raise ValueError(f"cannot {action} a {v['status']} violation")
            v["hold"] = False
            return v

    # ------------------------------------------------------------------ storyline (the hero scenario)
    def start_storyline(self) -> dict:
        with self.lock:
            if self.story_state == "running":
                return {"state": "running"}
            j = None
            for cand in self.city.junctions:
                if cand["district"] in ("markaziyah", "reem", "downtown", "olaya"):
                    j = cand
                    break
            j = j or self.city.junctions[0]
            seg = j["segs"][0]
            # surge area: segments within 2 km of the junction
            lat0 = math.radians(j["lat"])
            dx = (self.seg_mid[:, 0] - j["lon"]) * 111320 * math.cos(lat0)
            dy = (self.seg_mid[:, 1] - j["lat"]) * 110540
            near = np.sqrt(dx * dx + dy * dy) < 2200
            t0 = self.now + timedelta(minutes=1)
            self.story = {"junction": j, "t0": t0, "violation": None, "incident": None}
            self.story_state = "running"

            def surge():
                self.boost_target = np.where(near, 0.22, 0.0).astype(np.float32)
                self.log("warning", "congestion", f"Traffic surge detected around {j['name']}: speeds falling", None)

            def red_light():
                dev = next(d for d in self.city.devices if d["kind"] == "red_light" and d["id"] == f"RL-{j['id']:02d}")
                code = self.city.meta["plate"]["codes"][0]
                veh = self.fleet.make(f"{code} {STORY_PLATE_SUFFIX}")
                veh.update({"type": "SUV", "colour": "Black", "make": "Nissan"})
                v = self._new_violation(dev, forced={"vehicle": veh, "ai_conf": 0.91, "anpr_conf": 0.97, "hold": True})
                self.story["violation"] = v["id"]
                self.log("warning", "violation", f"Red-light violation at {j['name']} - plate {veh['plate']} (awaiting review)", v["id"])

            def crash():
                inc = self._make_incident("collision", seg, 2, "ai_camera", links={"violation_ids": [self.story["violation"]], "cause": "red_light_running"}, plan_scale=1.0, vehicles=2)
                inc["injuries"] = 1
                inc["ai_conf"] = 0.96
                inc["storyline"] = True
                self.story["incident"] = inc["id"]
                self.violations[self.story["violation"]]["incident"] = inc["id"]

            def relax():
                self.boost_target = np.zeros(self.city.n, dtype=np.float32)
                self.story_state = "done"

            def at(mins, fn):
                self.seq += 1
                heapq.heappush(self.scripted, (t0 + timedelta(minutes=mins), self.seq, fn))

            at(0, surge)
            at(4.0, red_light)
            at(4.7, crash)
            at(40, relax)
            return {"state": "running", "junction": j["name"], "starts": t0.isoformat()}

    # ------------------------------------------------------------------ controls
    def set_speed(self, x: float) -> None:
        with self.lock:
            self.speed = float(max(1.0, min(x, 240.0)))

    def set_playing(self, on: bool) -> None:
        with self.lock:
            self.playing = on
            self.last_real = time.time()

    def reset(self, city_id: str | None = None, start: str = "07:20") -> None:
        sp = self.speed
        self.load(city_id or self.city.id, start)
        self.speed = sp


def start_background(engine: Engine, interval: float = 0.5) -> threading.Thread:
    def loop():
        while True:
            try:
                engine.tick()
            except Exception as e:  # keep the demo alive; log and carry on
                import traceback

                traceback.print_exc()
            time.sleep(interval)

    t = threading.Thread(target=loop, daemon=True, name="sim-loop")
    t.start()
    return t
