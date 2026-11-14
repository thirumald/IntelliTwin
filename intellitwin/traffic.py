"""Traffic state model: demand curve -> congestion -> speeds, plus the weekly profile and forecaster.

Speed ratio r = speed / free-flow follows a BPR-style volume-delay curve of demand/capacity x:
    r = 1 / (1 + x**3.2)
Demand follows daily curves (AM and PM peaks on weekdays, a midday/evening hump at weekends), scaled per
district and road class, with persistent per-segment variation and AR(1) noise. Incidents remove capacity
at their segment and, attenuated, on the segments upstream of it (spill-back).

Forecast = weekly profile learned from simulated history + decaying persistence of today's deviation.
It is an explainable baseline, shown in the product as Preview; no accuracy claim is made for it.
"""
from __future__ import annotations

import math
from datetime import datetime

import numpy as np

from .city import City

SLOT_MIN = 5
SLOTS = 24 * 60 // SLOT_MIN  # 288
LOS_EDGES = [0.80, 0.65, 0.50, 0.40, 0.30]  # ratio thresholds for A..E, below the last = F
LOS_LABELS = ["A", "B", "C", "D", "E", "F"]


def _g(h, mu, sd):
    return np.exp(-0.5 * ((h - mu) / sd) ** 2)


def daily_curve(h: float, weekend: bool) -> float:
    if weekend:
        return float(0.15 + 0.45 * _g(h, 13.5, 2.6) + 0.35 * _g(h, 20.0, 1.8))
    return float(0.18 + 0.60 * _g(h, 8.0, 1.1) + 0.62 * _g(h, 17.7, 1.4) + 0.30 * _g(h, 13.0, 2.0) + 0.10 * _g(h, 21.0, 1.5))


def ratio_from_x(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.power(np.maximum(x, 0.0), 3.2))


def los_index(ratio: np.ndarray) -> np.ndarray:
    idx = np.zeros(ratio.shape, dtype=np.int8)
    for e in LOS_EDGES:
        idx += (ratio < e).astype(np.int8)
    return idx


def slot_of(dt: datetime) -> int:
    return (dt.hour * 60 + dt.minute) // SLOT_MIN


class TrafficModel:
    def __init__(self, city: City, seed: int = 7):
        self.city = city
        rng = np.random.default_rng(seed)
        n = city.n
        self.seg_mult = rng.uniform(0.85, 1.20, n).astype(np.float32)
        self.am_bias = rng.uniform(-0.18, 0.18, n).astype(np.float32)
        base = city.dweight * np.array([1.0, 1.05, 0.95], dtype=np.float32)[city.cls]
        self.base = (base * self.seg_mult).astype(np.float32)
        self.noise = np.zeros(n, dtype=np.float32)
        self.rng = np.random.default_rng(seed + 1)
        self.weekend_days = set(city.meta["weekend"])
        self.profile = None  # (2, SLOTS, n) float16, learned weekly profile of the speed ratio
        # upstream adjacency lists for spill-back
        self.prev = [s["prev"] for s in city.segs]

    # ---- demand ------------------------------------------------------------------------------
    def is_weekend(self, dt: datetime) -> bool:
        return dt.weekday() in self.weekend_days

    def demand(self, dt: datetime, advance_noise_h: float = 0.0) -> np.ndarray:
        h = dt.hour + dt.minute / 60.0
        we = self.is_weekend(dt)
        c = daily_curve(h, we)
        am = float(_g(h, 8.0, 1.1) - _g(h, 17.7, 1.4)) if not we else 0.0
        x = c * self.base + 0.5 * self.am_bias * am
        if advance_noise_h > 0:
            # AR(1) noise with ~25 min memory
            phi = math.exp(-advance_noise_h * 60.0 / 25.0)
            self.noise = phi * self.noise + math.sqrt(1 - phi * phi) * 0.045 * self.rng.standard_normal(self.city.n).astype(np.float32)
        return np.maximum(x + self.noise, 0.02)

    # ---- incidents -> capacity loss ----------------------------------------------------------
    def capacity_loss(self, incidents: list[dict]) -> np.ndarray:
        loss = np.zeros(self.city.n, dtype=np.float32)
        for inc in incidents:
            if inc["status"] == "cleared":
                continue
            base = {1: 0.30, 2: 0.55, 3: 0.80}[inc["severity"]] * inc.get("block", 1.0)
            if inc["status"] == "clearing":
                base *= 0.5
            frontier, seen, k = [inc["seg"]], {inc["seg"]}, 0
            while frontier and k < 4:
                for s in frontier:
                    loss[s] = max(loss[s], base * (0.72 ** k))
                nxt = []
                for s in frontier:
                    for p in self.prev[s]:
                        if p not in seen:
                            seen.add(p)
                            nxt.append(p)
                frontier, k = nxt, k + 1
        return np.minimum(loss, 0.92)

    # ---- speeds ------------------------------------------------------------------------------
    def ratio(self, dt: datetime, loss: np.ndarray | None = None, boost: np.ndarray | None = None, advance_noise_h: float = 0.0) -> np.ndarray:
        x = self.demand(dt, advance_noise_h)
        if boost is not None:
            x = x + boost
        if loss is not None:
            x = x / (1.0 - loss)
        return np.clip(ratio_from_x(x), 0.04, 1.0).astype(np.float32)

    # ---- weekly profile ----------------------------------------------------------------------
    def learn_profile(self, days: int = 14, seed: int = 99) -> None:
        """Run the stochastic model over `days` of simulated history and average per (day type, 5-min slot)."""
        sim = TrafficModel(self.city, seed=7)  # same city structure, independent noise
        sim.rng = np.random.default_rng(seed)
        sums = np.zeros((2, SLOTS, self.city.n), dtype=np.float32)
        cnt = np.zeros((2, 1, 1), dtype=np.float32)
        start = datetime(2026, 1, 5)  # a Monday
        step_h = SLOT_MIN / 60.0
        per_day_counted = [0, 0]
        for d in range(days):
            we = 1 if sim.is_weekend(_add_days(start, d)) else 0
            per_day_counted[we] += 1
            for s in range(SLOTS):
                dt = _add_days(start, d).replace(hour=s * SLOT_MIN // 60, minute=(s * SLOT_MIN) % 60)
                r = sim.ratio(dt, advance_noise_h=step_h)
                sums[we, s] += r
        for we in (0, 1):
            sums[we] /= max(per_day_counted[we], 1)
        self.profile = sums.astype(np.float16)
        self.history_days = days

    def typical(self, dt: datetime) -> np.ndarray:
        we = 1 if self.is_weekend(dt) else 0
        return self.profile[we, slot_of(dt)].astype(np.float32)

    # ---- forecast ----------------------------------------------------------------------------
    def forecast(self, dt: datetime, r_now: np.ndarray, loss: np.ndarray, horizons_min: list[int]) -> dict[int, np.ndarray]:
        from datetime import timedelta

        typ_now = self.typical(dt)
        resid = r_now - typ_now
        tau = np.where(loss > 0.01, 55.0, 22.0).astype(np.float32)
        out = {}
        for h in horizons_min:
            typ_h = self.typical(dt + timedelta(minutes=h))
            out[h] = np.clip(typ_h + resid * np.exp(-h / tau), 0.04, 1.0)
        return out


def _add_days(d: datetime, k: int) -> datetime:
    from datetime import timedelta

    return d + timedelta(days=k)
