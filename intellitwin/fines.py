"""Fine rules engine and the synthetic vehicle fleet (plates, owners' propensity to offend)."""
from __future__ import annotations

import numpy as np

from .city import City

VEHICLE_TYPES = [("Sedan", 0.52), ("SUV", 0.33), ("Pickup", 0.06), ("Van", 0.05), ("Motorcycle", 0.02), ("Truck", 0.02)]
COLOURS = ["White", "Silver", "Black", "Grey", "Blue", "Red", "Beige"]
MAKES = ["Toyota", "Nissan", "Hyundai", "Kia", "Lexus", "Mitsubishi", "Honda", "BMW", "Mercedes", "Ford", "Chevrolet"]
AR_LETTERS = {"ABC": "أ ب ج", "XYZ": "س ص ع", "RTL": "ر ط ل", "KSA": "ك س ا", "DHA": "ض ه ا"}

# illustrative black points per speeding band for cities that run a black-point system
SPEED_BLACK_POINTS = [0, 0, 4, 6, 12, 23]


class Fleet:
    """Synthetic fleet: each vehicle has a plate and an offending propensity (gamma-distributed => repeat offenders)."""

    def __init__(self, city: City, size: int = 25000, seed: int = 11):
        rng = np.random.default_rng(seed)
        cfg = city.meta["plate"]
        self.vehicles = []
        used = set()
        for i in range(size):
            while True:
                code = cfg["codes"][int(rng.integers(len(cfg["codes"])))]
                digits = int(rng.choice(cfg["digits"]))
                num = int(rng.integers(10 ** (digits - 1), 10**digits))
                plate = f"{code} {num}"
                if plate not in used:
                    used.add(plate)
                    break
            vt = rng.choice([v[0] for v in VEHICLE_TYPES], p=[v[1] for v in VEHICLE_TYPES])
            self.vehicles.append(
                {"plate": plate, "emirate": cfg["emirate"], "type": str(vt), "make": str(rng.choice(MAKES)), "colour": str(rng.choice(COLOURS))}
            )
        w = rng.gamma(0.35, 1.0, size)  # heavy tail: a few vehicles offend a lot
        self.p = w / w.sum()
        self.cdf = np.cumsum(self.p)
        self.rng = np.random.default_rng(seed + 5)
        self.by_plate = {v["plate"]: v for v in self.vehicles}

    def pick(self) -> dict:
        return self.vehicles[min(int(np.searchsorted(self.cdf, self.rng.random())), len(self.vehicles) - 1)]

    def make(self, plate: str, vtype="SUV") -> dict:
        v = self.by_plate.get(plate)
        if v is None:
            v = {"plate": plate, "emirate": self.vehicles[0]["emirate"], "type": vtype, "make": "Toyota", "colour": "White"}
            self.by_plate[plate] = v
        return v


class FineRules:
    def __init__(self, city: City):
        self.city = city
        self.rules = {r["id"]: r for r in city.meta["fines"]}
        self.bp_system = city.meta.get("black_points_system", False)

    def assess(self, vtype: str, measured_speed: float | None = None, limit: float | None = None) -> dict | None:
        """Return the fine for a detection, or None if it is below the enforcement threshold."""
        r = self.rules[vtype]
        if vtype == "speeding":
            over = (measured_speed or 0) - (limit or 0)
            bands = r["bands"]
            hit, idx = None, -1
            for i, b in enumerate(bands):
                if over >= b["over"]:
                    hit, idx = b, i
            if hit is None:
                return None
            bp = SPEED_BLACK_POINTS[min(idx + 1, len(SPEED_BLACK_POINTS) - 1)] if self.bp_system else 0
            return {"amount": hit["amount"], "black_points": bp, "impound_days": 0, "over": round(over), "rule": f"Exceeding the limit by {round(over)} km/h"}
        return {
            "amount": r["amount"],
            "black_points": r.get("black_points", 0) if self.bp_system else 0,
            "impound_days": r.get("impound_days", 0),
            "over": None,
            "rule": r["label"],
        }
