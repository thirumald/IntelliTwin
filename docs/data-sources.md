# Data sources

Every external input, how it is obtained, its licence and how IntelliTwin uses it. Check each licence yourself before commercial or client use; this page is a working summary, not legal advice.

## 1. Roads — OpenStreetMap

| | |
| --- | --- |
| Provider | OpenStreetMap contributors, extract by Geofabrik |
| URL | <https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf> |
| Licence | Open Database Licence (ODbL) 1.0. Attribution: “© OpenStreetMap contributors” |
| Fetched by | `tools/fetch_osm.sh` |
| Used for | Road geometry, class, lanes, speed limits, one-way rules, signal positions, street names |
| Processing | Clipped to the study area, filtered to `motorway`, `trunk`, `primary`, `secondary`, `tertiary` and their link roads, converted with SUMO `netconvert` |
| Currency | The extract's replication timestamp is recorded in `data/meta.json` (`osm_timestamp`) |

Residential and service streets are left out to keep the network and the browser payload small. See [limitations.md](limitations.md).

## 2. Buildings — Microsoft Global ML Building Footprints (optional)

| | |
| --- | --- |
| Provider | Microsoft |
| Repository | <https://github.com/microsoft/GlobalMLBuildingFootprints> |
| Licence | The repository README states CDLA-Permissive-2.0. Confirm against the repository at the time of use |
| Fetched by | `tools/buildings.py`, which reads the current `dataset-links.csv` address from the repository README and downloads the zoom-9 quadkey tiles covering the study area |
| Used for | (a) Floor space, to spread trip origins and destinations over the city. (b) The largest footprints, drawn as 3D blocks |
| Heights | Taken from the dataset where present. Otherwise estimated from footprint size: `floors = clamp(1 + √area / 12, 1, 15)`, 3.3 m per floor. Most Abu Dhabi heights are estimates |

If the download fails, the build continues. Trip ends then fall back to road length × lanes, and `meta.json` records `buildings.available = false`.

## 3. Bus timetable — Integrated Transport Centre GTFS (optional)

| | |
| --- | --- |
| Provider | Integrated Transport Centre / Department of Municipalities and Transport, Abu Dhabi |
| Catalogue | Mobility Database feed `mdb-1329`: <https://mobilitydatabase.org/feeds/gtfs/mdb-1329> |
| Licence | Not stated in the catalogue entry. Treat reuse terms as unconfirmed |
| Fetched by | `tools/gtfs_buses.py` |
| Used for | Positions of timetabled bus runs during the simulated window, drawn as a separate layer |
| Currency | The public copy is old (the producer file name carries a 2022 timestamp). Routes and times may have changed |

Access: the pipeline first tries the Mobility Database API if the repository secret `MOBILITY_DATABASE_REFRESH_TOKEN` is set (see [operations.md](operations.md)), then a direct file address. If neither works, the build continues without buses.

Buses are **not** part of the traffic simulation. They follow the timetable and do not interact with simulated traffic.

## 4. Base map — OpenStreetMap data, OpenFreeMap vector tiles

| | |
| --- | --- |
| Provider | OpenFreeMap public instance, “dark” style: `https://tiles.openfreemap.org/styles/dark` |
| Data | OpenStreetMap (ODbL), OpenMapTiles schema. Attribution is shown on the map |
| Loaded | At run time by the browser |
| 3D buildings | The app extrudes the `building` layer of the vector tiles using its `render_height` attribute |
| Fallback | If the vector style cannot be loaded within 8 seconds, the app switches to OpenStreetMap's standard raster tiles (`tile.openstreetmap.org`), dimmed for the dark theme |
| Terms | OpenFreeMap is a free, donation-funded public service without a service guarantee. OpenStreetMap's own raster tile servers are for light use only: <https://operations.osmfoundation.org/policies/tiles/>. For a client-facing deployment, self-host the tiles or use a commercial provider and change the style address in `js/app.js` |

## Branding

The header shows the Presight logo, loaded at run time from `https://www.presight.ai/hubfs/Presight_2026/Logo.svg`. If that address changes or is unreachable, the logo is omitted and the header shows the product name only. The logo is Presight's trademark; use it only where Presight has approved the branding.

## 5. Population and employment — Statistics Centre Abu Dhabi (reference only)

SCAD figures are **not downloaded or used by the pipeline**. They are quoted in [reference-figures.md](reference-figures.md) as context for the demand assumption. Verify them against SCAD's own publications before reuse.

## 6. Not used

| Source | Why not |
| --- | --- |
| Traffic counts | None are public for Abu Dhabi |
| Accident records, fines, camera locations | None are public; the app shows generated, illustrative figures instead (see [methodology.md](methodology.md), section 10) |
| Signal timings | Not public; a generic penalty is used instead |
| Census commuting table | Not public |
| Live traffic (for example TomTom) | Needs a commercial API key and a key-protecting proxy; a possible extension |
| Live bus positions | No public feed |

## Attribution text for deployments

> Roads and base map data © OpenStreetMap contributors (ODbL); vector tiles by OpenFreeMap. Buildings: Microsoft Global ML Building Footprints. Bus timetable: Integrated Transport Centre Abu Dhabi GTFS via the Mobility Database. Simulation: Eclipse SUMO. Rendering: deck.gl, MapLibre GL JS.
