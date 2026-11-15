# IntelliTwin

Real-time transportation intelligence and predictive simulation.

IntelliTwin is a static traffic digital twin demonstrator for Abu Dhabi city. A build pipeline takes the OpenStreetMap road network, simulates a weekday morning peak with Eclipse SUMO, and exports compact files that the browser replays with deck.gl on a MapLibre map.

> **Simulated, not observed.** The roads are real; the traffic comes from assumed demand. No traffic counts are public for Abu Dhabi, so the model is not calibrated or validated. It is not an official model of any UAE authority and must not be used for planning, operational or safety decisions. See [docs/limitations.md](docs/limitations.md).

## What the app shows

- **Full-view 3D map** on OpenStreetMap data with extruded buildings; every overlay minimises.
- **Opening view:** by default the app opens in full view on the most congested road, in 3D with the camera orbiting, in Live mode following the Abu Dhabi clock. This is set in `config.js`.
- **Pushed alerts:** each new alert appears as an on-screen notification, generated from the synthetic data.
- **Camera video:** cameras play real traffic footage (sample clips from Wikimedia Commons, not Abu Dhabi) until a stream is configured.
- **Predictive analytics:** a separate view with road expansion, traffic signals, population and fleet, demand, safety and emissions, with tiles, charts and tables ([docs/analytics.md](docs/analytics.md)).
- **Critical zones:** traffic watched around defence sites, embassies, hospitals, schools and other sites from OpenStreetMap, with alerts.
- **Response routing:** the quickest route from the nearest unit to a critical alert, drawn on the map with an arrival estimate.
- **Vehicle types, railway and cycle tracks:** cars, taxis, vans, lorries, buses and motorcycles (assumed mix), plus railway and cycle layers from OpenStreetMap.
- **Individual vehicles:** one per vehicle on each road, dots when zoomed out and 3D cars at street level.
- **Live and Historical, 24 hours:** Live follows the Abu Dhabi clock; Historical takes any date and a 24-hour time. Both use a synthetic feed built from the simulated traffic states.
- **Dashboard:** KPIs, alerts, 15/30/60-minute forecast, day profile, demand cases.
- **Congestion:** slowest roads, congestion by road class, and a what-if road closure (an estimate).
- **Accidents and fines:** illustrative, generated and labelled as such.
- **Devices:** CCTV cameras with a video window, enforcement cameras, detectors, message signs and traffic signals. Devices are synthetic unless listed in `config.js`; a camera without a stream shows a synthetic view.
- **Reports:** CSV exports, a printable summary and an audit log.
- **Sign-in with roles** (demo only), **Arabic interface** for fixed labels, and a built-in **assistant**.
- **One configuration file**, `config.js`, for map tiles, feeds, cameras, alert thresholds, roles and services.

Everything shown is simulated, synthetic or illustrative except the road network and building footprints. See [docs/limitations.md](docs/limitations.md).

## Quick start

The simulation data is built by the **Build twin data** GitHub Actions workflow and committed to `data/`. Then serve the repository root as static files, for example with GitHub Pages or:

```bash
python3 -m http.server 8000   # open http://localhost:8000
```

To build the data yourself, see [docs/operations.md](docs/operations.md).

## Documentation

All technical and data-source documentation is in [`docs/`](docs/README.md):
architecture, data sources and licences, methodology and assumptions, data file formats, operations, limitations, and reference figures.

## Stack

Eclipse SUMO 1.28 (mesoscopic) · osmium · Python (NumPy, SciPy, sumolib) · deck.gl 9 · MapLibre GL JS 4 · GitHub Actions

## Attribution

Roads and base map data © OpenStreetMap contributors (ODbL); vector tiles served by OpenFreeMap. Buildings: Microsoft Global ML Building Footprints. Bus timetable: Integrated Transport Centre Abu Dhabi GTFS via the Mobility Database.
