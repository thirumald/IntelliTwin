# IntelliTwin documentation

Technical and data-source documentation for the IntelliTwin Abu Dhabi mobility twin.

| Document | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | Components, data flow, repository layout, technology choices |
| [data-sources.md](data-sources.md) | Every external data source: what it is, where it comes from, licence, how it is used |
| [methodology.md](methodology.md) | Network build, demand estimation, simulation settings, scenarios, KPIs, all assumptions |
| [data-format.md](data-format.md) | The static files in `data/` that the app reads |
| [operations.md](operations.md) | Running the pipeline on GitHub Actions or locally, configuration, secrets, deployment |
| [limitations.md](limitations.md) | Calibration status, known limits, disclaimer |
| [reference-figures.md](reference-figures.md) | Published and third-party figures used as benchmarks |

## One-paragraph summary

IntelliTwin is a static web application. A build pipeline downloads the OpenStreetMap road network for Abu Dhabi city, converts it to an Eclipse SUMO network, generates an assumed morning-peak travel demand, runs a mesoscopic SUMO simulation for three demand cases, and exports compact files. The browser replays those files with deck.gl on a MapLibre map. The roads are real. The traffic is simulated from assumptions and has not been checked against measured traffic.

## Reference links

- Eclipse SUMO: <https://eclipse.dev/sumo/>
- deck.gl: <https://deck.gl/>
- MapLibre GL JS: <https://maplibre.org/>
- Microsoft Global ML Building Footprints: <https://github.com/microsoft/GlobalMLBuildingFootprints>
- Mobility Database (GTFS catalogue): <https://mobilitydatabase.org/>
- Geofabrik OpenStreetMap extracts: <https://download.geofabrik.de/>
