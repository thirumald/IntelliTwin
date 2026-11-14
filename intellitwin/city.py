"""City packs: everything city-specific lives in cities/<id>/ (city.json + network.json)."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

CITIES_DIR = Path(__file__).resolve().parent.parent / "cities"
CLS = {"motorway": 0, "trunk": 1, "primary": 2}
CLS_NAMES = ["motorway", "trunk", "primary"]
CLS_FACTOR = np.array([1.0, 1.05, 0.95])


def list_cities() -> list[dict]:
    out = []
    for d in sorted(CITIES_DIR.iterdir()):
        if (d / "city.json").exists() and (d / "network.json").exists():
            c = json.loads((d / "city.json").read_text())
            out.append({"id": c["id"], "name": c["name"], "name_ar": c["name_ar"], "country": c["country"], "currency": c["currency"]})
    return out


@dataclass
class City:
    meta: dict
    segs: list[dict]
    junctions: list[dict]
    speed_cams: list[dict]
    n: int = 0
    limit: np.ndarray = field(default=None)
    freeflow: np.ndarray = field(default=None)
    lanes: np.ndarray = field(default=None)
    length: np.ndarray = field(default=None)
    cls: np.ndarray = field(default=None)
    district_idx: np.ndarray = field(default=None)
    dweight: np.ndarray = field(default=None)
    capacity: np.ndarray = field(default=None)  # veh/h
    devices: list[dict] = field(default_factory=list)
    corridors: dict[str, list[int]] = field(default_factory=dict)

    @property
    def id(self) -> str:
        return self.meta["id"]

    def district_name(self, did: str) -> str:
        for d in self.meta["districts"]:
            if d["id"] == did:
                return d["name"]
        return did


def load_city(city_id: str) -> City:
    d = CITIES_DIR / city_id
    meta = json.loads((d / "city.json").read_text())
    net = json.loads((d / "network.json").read_text())
    segs = net["segments"]
    c = City(meta=meta, segs=segs, junctions=net["junctions"], speed_cams=net["speed_cams"])
    c.n = len(segs)
    c.limit = np.array([s["limit"] for s in segs], dtype=np.float32)
    c.freeflow = c.limit * 0.97
    c.lanes = np.array([s["lanes"] for s in segs], dtype=np.float32)
    c.length = np.array([s["len"] for s in segs], dtype=np.float32)
    c.cls = np.array([CLS[s["cls"]] for s in segs], dtype=np.int8)
    didx = {x["id"]: i for i, x in enumerate(meta["districts"])}
    c.district_idx = np.array([didx[s["district"]] for s in segs], dtype=np.int16)
    c.dweight = np.array([x["weight"] for x in meta["districts"]], dtype=np.float32)[c.district_idx]
    c.capacity = c.lanes * 1700.0
    for s in segs:
        c.corridors.setdefault(s["name"], []).append(s["id"])
    # enforcement devices (the sources of violations)
    for j in c.junctions:
        c.devices.append({"id": f"RL-{j['id']:02d}", "kind": "red_light", "name": j["name"], "lat": j["lat"], "lon": j["lon"], "seg": j["segs"][0], "district": j["district"]})
        c.devices.append({"id": f"AI-{j['id']:02d}", "kind": "ai_cabin", "name": j["name"] + " (AI cabin)", "lat": j["lat"], "lon": j["lon"], "seg": j["segs"][0], "district": j["district"]})
    for sc in c.speed_cams:
        c.devices.append({"id": f"SP-{sc['id']:02d}", "kind": "speed", "name": sc["name"], "lat": sc["lat"], "lon": sc["lon"], "seg": sc["seg"], "district": sc["district"]})
    for j in c.junctions[::2]:
        c.devices.append({"id": f"PK-{j['id']:02d}", "kind": "parking", "name": j["name"] + " (parking patrol)", "lat": j["lat"] + 0.0006, "lon": j["lon"] + 0.0006, "seg": j["segs"][0], "district": j["district"]})
    for sc in c.speed_cams[::4]:
        c.devices.append({"id": f"WW-{sc['id']:02d}", "kind": "wrong_way", "name": sc["name"].replace("speed camera", "wrong-way detector"), "lat": sc["lat"], "lon": sc["lon"], "seg": sc["seg"], "district": sc["district"]})
    return c
