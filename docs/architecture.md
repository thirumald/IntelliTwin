# Architecture

## Overview

```
 Open data (internet)                Build pipeline (GitHub Actions or local)            Static app (browser)
┌──────────────────────┐   ┌──────────────────────────────────────────────────┐   ┌───────────────────────────┐
│ Geofabrik OSM extract │──▶│ fetch_osm.sh   osmium: clip to bbox, keep roads  │   │ index.html                │
│ MS building footprints│──▶│ buildings.py   floor space, large footprints     │   │ js/app.js                 │
│ ITC GTFS timetable    │──▶│ gtfs_buses.py  timetable positions of buses      │   │  MapLibre GL JS base map  │
└──────────────────────┘   │ build.py       netconvert → demand → SUMO meso   │   │  deck.gl PathLayer roads  │
                            │                → export                          │──▶│  deck.gl TripsLayer cars  │
                            └──────────────────────────────────────────────────┘   │  deck.gl PolygonLayer 3D  │
                                              writes data/*.json, data/*.bin        └───────────────────────────┘
```

There is no server-side component at run time. The simulation runs once, at build time. The app only reads static files, so it can be hosted on GitHub Pages or any static file server.

## Why this split

- **SUMO cannot run in a browser.** It is a native simulator. Running it in the pipeline and shipping results keeps the app static.
- **The pipeline needs open internet.** It runs on GitHub Actions, where Geofabrik, the Mobility Database and the Microsoft footprint store are reachable.
- **Scenarios are pre-simulated.** Each demand case is a full SUMO run. The app switches between stored results instead of approximating in the browser.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html`, `css/`, `js/app.js` | The static application |
| `vendor/` | MapLibre GL JS 4.7.1 and deck.gl 9.0.38, vendored so the app needs no CDN |
| `data/` | Pipeline output read by the app (committed by the workflow) |
| `tools/config.py` | Every tunable number: study area, time window, demand, scenarios |
| `tools/fetch_osm.sh` | Downloads and filters OpenStreetMap |
| `tools/build.py` | Network build, demand, simulation, export |
| `tools/buildings.py` | Building footprints (optional layer) |
| `tools/gtfs_buses.py` | Bus timetable (optional layer) |
| `.github/workflows/build-data.yml` | Runs the pipeline and commits `data/` |
| `docs/` | This documentation |

## Technology

| Layer | Technology | Licence |
| --- | --- | --- |
| Traffic simulation | Eclipse SUMO 1.28.0 (`netconvert`, `sumo --mesosim`, `sumolib`) | EPL-2.0 |
| OSM processing | osmium-tool | GPL-3.0 (build-time tool only) |
| Numerics | NumPy, SciPy, pyproj | BSD / MIT |
| Map rendering | MapLibre GL JS | BSD-3-Clause |
| Data layers | deck.gl (`PathLayer`, `TripsLayer`, `PolygonLayer`, `MapboxOverlay`) | MIT |
| Base map tiles | CARTO dark raster tiles over OpenStreetMap data | See [data-sources.md](data-sources.md) |

## Run-time behaviour of the app

1. Load `data/meta.json` and `data/roads.json`. If they are missing, show a “data not built yet” message.
2. Load the selected scenario: per-link speed and occupancy for every 5-minute bin, plus sampled vehicle trajectories.
3. Each animation frame, advance simulated time, colour road links from the current bin, and move the sampled vehicles (and timetabled buses) with `TripsLayer`.
4. KPIs and the morning profile come from per-bin figures precomputed in `meta.json`. The slowest-roads list is computed in the browser from link data grouped by road name.

## Extension points

- **Live traffic layer:** add a TomTom (or other) flow feed as a separate layer. This needs an API key and, for a static site, a small proxy to keep the key private.
- **Authority data:** replace the assumed demand with counts, signal plans and current GTFS when available. The entry points are `make_demand()` and the meso penalties in `tools/config.py`.
- **More scenarios:** add entries to `SCENARIOS` in `tools/config.py`. Incident or closure scenarios need a per-scenario network change in `simulate()`.
