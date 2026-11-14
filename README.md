# IntelliTwin

**Real-time transportation intelligence and predictive simulation.** *by Presight*

One platform from the first slowdown to the issued fine: live traffic map, congestion management,
incident and accident management, violations and fines with evidence, executive / traffic-police /
enforcement dashboards, a congestion forecast (preview), white-label branding and plug-and-play cities.

> Status: demo build on simulated data (real road geometry from OpenStreetMap). See
> [docs/00-demo-build-plan.md](docs/00-demo-build-plan.md) for scope and
> [docs/01-demo-runbook.md](docs/01-demo-runbook.md) for the 10-minute demo script.

## Run

```bash
./run.sh                      # http://localhost:8090   (creates .venv on first run)
INTELLITWIN_CITY=dubai ./run.sh
```

Open the console, press **Start storyline**, and follow the runbook. Useful links:
`/?lang=ar` (Arabic, RTL), `/?brand=capital` (white-label), `/#/map`, `/#/violations`.

| Setting | Env var | Default |
| --- | --- | --- |
| Start city | `INTELLITWIN_CITY` | `abu_dhabi` |
| Start time of the simulated day | `INTELLITWIN_START` | `07:20` (AM peak) |
| Simulation speed (sim s per real s) | `INTELLITWIN_SPEED` | `10` |
| Raster tile URL template | `INTELLITWIN_TILES` | OpenStreetMap (demo only) |

## What is in the box

| Area | Where |
| --- | --- |
| City packs (config + road network) | `cities/<id>/city.json`, `network.json`; builder `tools/build_city.py` |
| Traffic model, weekly profile, forecast | `intellitwin/traffic.py` |
| Simulation engine: incidents, violations, fines pipeline, storyline | `intellitwin/engine.py` |
| Fine rules and synthetic fleet | `intellitwin/fines.py` |
| Evidence imagery (generated) | `intellitwin/evidence.py` |
| Read models for dashboards | `intellitwin/analytics.py` |
| API (FastAPI) | `intellitwin/app.py` |
| Web console (no build step; MapLibre, vanilla ES modules) | `web/` |
| White-label brands | `web/brand/brands.json` |

## Add a city

1. `cities/<id>/city.json`: bbox, districts, speed limits, fine schedule, currency, weekend days, plate format.
2. `python tools/build_city.py <id>`: downloads OpenStreetMap roads and builds the network and enforcement points.
3. Restart. The city appears in the selector.

Abu Dhabi, Dubai and Riyadh ship as packs.

## Test

```bash
.venv/bin/pytest -q
```

## Honest limits of this build

- All data is simulated. The forecast is an explainable baseline (weekly profile + decaying persistence) and is labelled *Preview*.
- Fine schedules are illustrative. State is in memory (a reset restores the seed); Postgres and event streaming are the next step.
- OpenStreetMap tiles are for demos; use a licensed or self-hosted tile source for customers.

Presight © 2026
