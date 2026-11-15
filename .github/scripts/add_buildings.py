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
args = ap.parse_args()

C.BBOX = tuple(regions.REGIONS[args.region]["bbox"])
import buildings as B  # noqa: E402  (reads C.BBOX)

os.makedirs(args.out, exist_ok=True)
bld = B.load(args.build)
with open(os.path.join(args.out, "buildings.json"), "w") as f:
    json.dump(bld["shown"], f, separators=(",", ":"))
meta = {"available": True, "count": bld["count"], "shown": len(bld["shown"]),
        "measured_heights": bld["measured_heights"], "source": bld["source"]}
with open(os.path.join(args.out, "buildings_meta.json"), "w") as f:
    json.dump(meta, f)
print(args.region, meta, flush=True)
