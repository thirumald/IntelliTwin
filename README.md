# IntelliTwin

Real-time transportation intelligence and predictive simulation.

IntelliTwin is a static traffic digital twin demonstrator for Abu Dhabi city. A build pipeline takes the OpenStreetMap road network, simulates a weekday morning peak with Eclipse SUMO, and exports compact files that the browser replays with deck.gl on a MapLibre map.

> **Simulated, not observed.** The roads are real; the traffic comes from assumed demand. No traffic counts are public for Abu Dhabi, so the model is not calibrated or validated. It is not an official model of any UAE authority and must not be used for planning, operational or safety decisions. See [docs/limitations.md](docs/limitations.md).

## What the app shows

- **Road network** coloured by simulated speed against the limit, in 5-minute steps from 07:00 to 10:00.
- **Moving vehicles:** a 1% sample of simulated trips (one dot ≈ 100 vehicles).
- **Scenarios:** typical weekday, demand +20%, demand −20%, each a full SUMO run.
- **KPIs and morning profile:** network speed, extra travel time, vehicles moving, delay.
- **Slowest roads:** ranked by name; tap to locate.
- **Go to:** chips across the top of the map fly to major sites in a tilted 3D view (approximate locations); a selector in the top bar jumps to the longest major roads.
- **3D and Orbit:** tilt the map, or let the camera circle the view; touching the map stops the orbit.
- **Optional layers:** timetabled buses (ITC GTFS) and 3D buildings (Microsoft footprints), when those downloads succeed.

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

Roads and base map © OpenStreetMap contributors (ODbL). Buildings: Microsoft Global ML Building Footprints. Bus timetable: Integrated Transport Centre Abu Dhabi GTFS via the Mobility Database.
