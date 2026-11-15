"""Check a TomTom key against the services IntelliTwin uses, for Abu Dhabi.

Usage:   read -s TOMTOM_KEY; export TOMTOM_KEY; python tools/check_tomtom.py
The key is read from the environment and never printed.
"""
import os
import sys

import httpx

KEY = os.environ.get("TOMTOM_KEY", "").strip()
if not KEY:
    sys.exit("Set TOMTOM_KEY first (see docs/tomtom-key.md).")
B = "https://api.tomtom.com"
BBOX = "54.25,24.18,54.80,24.62"
POINTS = {"Sheikh Zayed Bin Sultan St": (24.4247, 54.5275), "Al Khaleej Al Arabi St": (24.4298, 54.3901), "Corniche St": (24.5004, 54.3646)}


def call(path, **params):
    r = httpx.get(B + path, params={**params, "key": KEY}, timeout=20)
    return r


def line(ok, name, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (" - " + detail if detail else ""))
    return ok


results = []
for name, (lat, lon) in POINTS.items():
    r = call("/traffic/services/4/flowSegmentData/absolute/10/json", point=f"{lat},{lon}", unit="KMPH")
    if r.status_code == 200:
        d = r.json().get("flowSegmentData", {})
        results.append(line(True, f"flow @ {name}", f"{d.get('currentSpeed')} km/h now, {d.get('freeFlowSpeed')} free flow, confidence {d.get('confidence')}, class {d.get('frc')}"))
    else:
        results.append(line(False, f"flow @ {name}", f"HTTP {r.status_code}"))

r = call("/traffic/services/5/incidentDetails", bbox=BBOX, language="en-GB", timeValidityFilter="present",
         fields="{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},from,to,delay,length}}}")
if r.status_code == 200:
    inc = r.json().get("incidents", [])
    kinds = {}
    for i in inc:
        k = (i.get("properties") or {}).get("iconCategory")
        kinds[k] = kinds.get(k, 0) + 1
    results.append(line(True, "incidents in the Abu Dhabi box", f"{len(inc)} active; by iconCategory {kinds or 'none'}"))
else:
    results.append(line(False, "incidents", f"HTTP {r.status_code}"))

r = call("/traffic/map/4/tile/flow/relative0/11/1241/860.png", tileSize=256)
results.append(line(r.status_code == 200 and r.headers.get("content-type", "").startswith("image"), "flow tile (z11)", f"HTTP {r.status_code}, {len(r.content)} bytes"))

r = call("/routing/1/calculateRoute/24.4298,54.3901:24.4247,54.5275/json", traffic="true", travelMode="car")
if r.status_code == 200:
    s = (r.json().get("routes") or [{}])[0].get("summary", {})
    results.append(line(True, "routing with traffic", f"{round(s.get('travelTimeInSeconds', 0) / 60)} min, delay {round(s.get('trafficDelayInSeconds', 0) / 60)} min, {round(s.get('lengthInMeters', 0) / 1000, 1)} km"))
else:
    results.append(line(False, "routing with traffic", f"HTTP {r.status_code} (optional: used for response route times)"))

r = call("/search/2/categorySearch/petrol%20station.json", lat=24.45, lon=54.37, radius=10000, limit=3)
results.append(line(r.status_code == 200, "search (fuel stations)", f"HTTP {r.status_code} (optional: used in Transit)"))

print("\nThe first 5 lines decide the live demo (flow, incidents, tiles). Routing and search are optional extras.")
sys.exit(0 if all(results[:5]) else 1)
