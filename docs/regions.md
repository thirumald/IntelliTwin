# Regions

The region selector in the top bar switches the whole application to another part of the UAE. **Abu Dhabi is the default.** Choosing a region reloads the app on that region's data; the address then carries `?region=dubai` (and so on), so a region can be bookmarked or shared.

| Region | Area covered | Traffic today |
| --- | --- | --- |
| Abu Dhabi | Abu Dhabi city: the islands and the mainland to Al Wathba | SUMO simulation |
| Dubai | Jebel Ali to Mirdif | Synthetic pattern, then SUMO simulation when its build has run |
| Sharjah | Sharjah city to University City and the airport | as Dubai |
| Ajman | Ajman city | as Dubai |
| Umm Al Quwain | The town and the coast road | as Dubai |
| Ras Al Khaimah | The city, Al Hamra and the airport | as Dubai |
| Fujairah | Fujairah city and port | as Dubai |
| Al Ain | Al Ain city | as Dubai |

The Model section and the status bar state whether a region's traffic is **simulated** or a **synthetic pattern**.

## What changes with the region

| Item | Source in every region |
| --- | --- |
| Roads, signals, railway, cycle tracks | Real, from OpenStreetMap |
| Critical sites (Zones) | Real, from OpenStreetMap |
| Fuel and EV charging stations | Real locations, from OpenStreetMap |
| Site list (chips and the Sites drop-down) | `regions[].sites` in `config.js`; positions are approximate |
| Traffic | SUMO simulation, or a synthetic pattern until the simulation has been built |
| Buses, taxis, shuttles, parking, freight, events, emergency, ships, flights | Synthetic examples derived from the region's site list (`js/regions.js`) |
| Accidents, fines, incidents, alerts, sensors, devices, weather | Synthetic or illustrative, generated on the region's roads |
| Live traffic, incidents, speeds, EV and fuel | Real and live from TomTom when a key is set (see [tomtom.md](tomtom.md)) |

Regions without a port (Al Ain) do not show the ships card; regions without an airport (Ajman, Umm Al Quwain) do not show the flights card. Population figures in Analytics are set for Abu Dhabi only.

## Two kinds of traffic

**Synthetic pattern** (`--mode synthetic`). No simulation. Each road gets a flow from its class, lanes, distance from the region centre and the time of day, and a speed from a volume-delay curve. It is quick to build (about a minute per region) and looks plausible, but it is not a simulation result and not a measurement.

**SUMO simulation** (`--mode sumo`). The same method as Abu Dhabi: assumed demand, gravity trip distribution and a mesoscopic simulation. The number of trips is an assumption scaled from Abu Dhabi by city size (`tools/regions.py`). Building footprints are not used for the other regions, so trip ends follow road length and lanes.

Neither is calibrated; there are no public traffic counts.

## Building the data

`Build region data` in GitHub Actions builds all seven regions side by side into `data/<region>/`, then commits them once.

- A push that changes `tools/regions.py` runs the synthetic mode. It never replaces a region that already has a simulation.
- Run it by hand and choose **sumo** to simulate every region. This takes much longer; a region whose simulation fails keeps its previous data.

## Adding a region

1. Add it to `tools/regions.py`: id, name, bounding box, centre and assumed trips.
2. Add the id to the `matrix.region` list in `.github/workflows/build-regions.yml`.
3. Add it to `regions` in `config.js` with its site list, and a port and an airport if it has them.

## Limits

- Site positions, sea lanes and flight paths for the regions are placed from approximate coordinates and should be checked on the map.
- The site list drives the example bus routes, taxi ranks, car parks and so on, so they are illustrations, not real services or facilities.
