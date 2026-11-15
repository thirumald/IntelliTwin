# IntelliTwin

Real-time transportation intelligence and predictive simulation.

IntelliTwin is a static traffic digital twin demonstrator for Abu Dhabi city. A build pipeline takes the OpenStreetMap road network, simulates a weekday morning peak with Eclipse SUMO, and exports compact files that the browser replays with deck.gl on a MapLibre map.

> **Simulated, not observed.** The roads are real; the traffic comes from assumed demand. No traffic counts are public for Abu Dhabi, so the model is not calibrated or validated. It is not an official model of any UAE authority and must not be used for planning, operational or safety decisions. See [docs/limitations.md](docs/limitations.md).

## What the app shows

- **Full-view 3D map** on OpenStreetMap data with extruded buildings; every overlay minimises.
- **Opening view:** by default the app opens in full view on the most congested major site, in 3D with the camera orbiting, in Live mode. The site is selected in the site chips, and replay runs at 30× by default. This is set in `config.js`.
- **Pushed alerts:** each new alert appears as an on-screen notification, generated from the synthetic data.
- **Camera video:** cameras play real traffic footage (sample clips from Wikimedia Commons, not Abu Dhabi) until a stream is configured.
- **Analytics and city KPIs:** opens inside the same page. A City scorecard compares 25 KPIs with example targets across six goals (smooth traffic, fewer accidents, fewer violations, safe and secure city, clean and liveable, city development), plus road expansion, traffic signals, population and fleet, environment, safety and demand sections.
- **Critical zones:** traffic watched around defence sites, embassies, hospitals, schools and other sites from OpenStreetMap, with alerts.
- **Response routing:** the quickest route from the nearest unit to a critical alert, drawn on the map with an arrival estimate.
- **Vehicle types, railway and cycle tracks:** cars, taxis, vans, lorries, buses and motorcycles (assumed mix), plus railway and cycle layers from OpenStreetMap.
- **Environmental sensors:** example roadside sensors with synthetic air-quality and noise readings, on the map, in an Environment tab and in the analytics ([docs/environment.md](docs/environment.md)).
- **Dark and light map**, with a pale green light theme; 3D cars with glass and wheels, and synthetic people on foot at street zoom.
- **Individual vehicles:** one per vehicle on each road, dots when zoomed out and 3D cars at street level.
- **Application shell:** one top bar (Live / Historical, road search, alerts, theme, language), a navigation rail for the sections, a docked panel and a status bar; dark and light themes; a bottom bar on phones. Four interface styles: **Standard** (default: navy and gold), **Military** (olive and khaki), **Police** (blue and silver) and **Enterprise**; each has a dark and a mid-tone light theme.
- **Public transport (Transit):** bus routes with numbered and named stops, next-bus times, bus numbers and live tracking on the map; a taxi fleet with ranks and statuses; on-demand shuttle zones. All synthetic, not Abu Dhabi's real services.
- **Live and Historical, 24 hours:** Live starts at the Abu Dhabi clock and plays at 30× by default (1× stays locked to the clock); Historical takes any date and a 24-hour time. Both use synthetic data.
- **Dashboard:** KPIs, alerts, 15/30/60-minute forecast, day profile, demand cases.
- **Congestion:** slowest roads, congestion by road class, and a what-if road closure (an estimate).
- **Accidents and fines:** illustrative, generated and labelled as such.
- **Devices:** CCTV cameras with a video window, enforcement cameras, detectors, message signs and traffic signals. Devices are synthetic unless listed in `config.js`; a camera without a stream shows a synthetic view.
- **Reports:** CSV exports, a printable summary and an audit log.
- **Sign-in with roles** (demo only), **Arabic interface** for fixed labels, and a built-in assistant, **Twin Advisor**.
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

Roads and base map data © OpenStreetMap contributors (ODbL); vector tiles served by OpenFreeMap. Buildings: Microsoft Global ML Building Footprints. Buses: synthetic example network.
