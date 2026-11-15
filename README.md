# IntelliTwin

Real-time transportation intelligence and predictive simulation.

IntelliTwin is a static traffic digital twin demonstrator for Abu Dhabi city. A build pipeline takes the OpenStreetMap road network, simulates a weekday morning peak with Eclipse SUMO, and exports compact files that the browser replays with deck.gl on a MapLibre map.

> **Simulated, not observed.** The roads are real; the traffic comes from assumed demand. No traffic counts are public for Abu Dhabi, so the model is not calibrated or validated. It is not an official model of any UAE authority and must not be used for planning, operational or safety decisions. See [docs/limitations.md](docs/limitations.md).

## What the app shows

- **Full-view 3D map:** a vector base map built from OpenStreetMap data with extruded buildings. The dashboard panel, legend and site shortcuts each minimise, or all at once with **Full view**.
- **Road network** coloured by simulated speed against the limit, in 5-minute steps from 07:00 to 10:00.
- **Individual vehicles:** one for every simulated vehicle on each road, moving at that road's simulated speed. They are dots when zoomed out and 3D cars at street level. Playback runs at 1× (real time), 30×, 120× or 600×.
- **Dashboard tabs:** Dashboard, Congestion, Accidents, Fines and Model.
- **Congestion:** slowest named roads and the share of traffic in heavy or severe conditions by road class.
- **Accidents and fines:** illustrative only, generated from the simulated traffic and labelled as such. No real accident or enforcement data is used.
- **Live and Historical:** Live shows the current Abu Dhabi date and time; Historical offers a date and a 24-hour time. Both replay the simulated morning, because no live feed or recorded history exists yet, and the app says so on screen.
- **Scenarios:** typical weekday, demand +20%, demand −20%, each a full SUMO run.
- **Go to:** chips across the top of the map fly to major sites in a tilted 3D view (approximate locations); a selector in the top bar jumps to the longest major roads. **Orbit** circles the camera.
- **Assistant:** a built-in, rule-based agent that answers questions from the simulation data and operates the twin. It is not a language model; an optional endpoint can add one (see [docs/assistant.md](docs/assistant.md)).
- **Optional layers:** timetabled buses (ITC GTFS) and extra buildings (Microsoft footprints), when those downloads succeed.

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
