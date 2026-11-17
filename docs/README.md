# IntelliTwin documentation

Technical and data-source documentation for the IntelliTwin traffic twin for Abu Dhabi.

| Document | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | Components, data flow, repository layout, technology choices |
| [data-sources.md](data-sources.md) | Every external data source: what it is, where it comes from, licence, how it is used |
| [methodology.md](methodology.md) | Network build, demand estimation, simulation settings, scenarios, KPIs, all assumptions |
| [data-format.md](data-format.md) | The static files in `data/` that the app reads |
| [operations.md](operations.md) | Running the pipeline on GitHub Actions or locally, configuration, secrets, deployment |
| [configuration.md](configuration.md) | Every setting in `config.js`, camera video, roles, integration points |
| [analytics.md](analytics.md) | The predictive analytics view: sections, method and assumptions |
| [zones-and-response.md](zones-and-response.md) | Critical-zone monitoring, response routing, vehicle types, railway and cycle layers |
| [buses.md](buses.md) | Public transport: synthetic buses (stops, timetable, tracking), taxis and shuttles |
| [live-data.md](live-data.md) | Real live data: NASA FIRMS fire detections, aisstream.io vessels, N2YO satellites, and the workflow that fetches them |
| [critical-use-cases.md](critical-use-cases.md) | Crowd safety, unified command, utility failure, adaptive control, site protection and the other critical cases; analytics charts and reports |
| [operations-modules.md](operations-modules.md) | Incidents, signals, events and roadworks, parking, evacuation, vehicle search, pedestrians, freight, weather, assets, reports |
| [regions.md](regions.md) | UAE regions: what changes per region, the two kinds of traffic, building and adding a region |
| [google-maps.md](google-maps.md) | Google Maps as the base map, 3D tiles, setting the key |
| [tomtom.md](tomtom.md) | TomTom live data: features, setting the key, why the key is not in the repository |
| [vlm.md](vlm.md) | Vision-language model sample in the camera window, and how to connect a real model |
| [platform-monitoring.md](platform-monitoring.md) | Platform monitoring: data ingestion and infrastructure (synthetic) |
| [integration-studio.md](integration-studio.md) | Integration Studio: onboarding data sources, field mapping, transformations, testing, versions (no server behind it) |
| [environment.md](environment.md) | Environmental sensors: synthetic readings, air-quality index, noise |
| [assistant.md](assistant.md) | The built-in assistant and how to connect a language model |
| [limitations.md](limitations.md) | Calibration status, known limits, disclaimer |
| [reference-figures.md](reference-figures.md) | Published and third-party figures used as benchmarks |

## One-paragraph summary

IntelliTwin is a static web application. A build pipeline downloads the OpenStreetMap road network for Abu Dhabi city, converts it to an Eclipse SUMO network, generates an assumed morning-peak travel demand, runs a mesoscopic SUMO simulation for three demand cases, and exports compact files. The browser replays those files with deck.gl on a MapLibre map. The roads are real. The traffic is simulated from assumptions and has not been checked against measured traffic.

## Reference links

- Eclipse SUMO: <https://eclipse.dev/sumo/>
- deck.gl: <https://deck.gl/>
- MapLibre GL JS: <https://maplibre.org/>
- OpenFreeMap (vector tiles from OpenStreetMap data): <https://openfreemap.org/>
- Microsoft Global ML Building Footprints: <https://github.com/microsoft/GlobalMLBuildingFootprints>
- Mobility Database (GTFS catalogue): <https://mobilitydatabase.org/>
- Geofabrik OpenStreetMap extracts: <https://download.geofabrik.de/>
