# Methodology

All parameters named here live in `tools/config.py`.

## 1. Study area and time window

- **Area (`BBOX`):** longitude 54.25–54.80, latitude 24.18–24.62. This covers Abu Dhabi island, the surrounding islands and the mainland out to Al Wathba.
- **Simulated window:** 06:30–10:00 on one typical weekday. The first 30 minutes warm the network up; the app shows 07:00–10:00.
- **Statistics interval (`BIN_SECONDS`):** 5 minutes.

## 2. Network

`netconvert` builds the SUMO network from the filtered OpenStreetMap file with:

| Option | Effect |
| --- | --- |
| `--geometry.remove` | Merges links between junctions, keeping shape |
| `--roundabouts.guess`, `--ramps.guess` | Roundabout priority and motorway ramp lanes |
| `--junctions.join` | Merges the several OSM nodes of one large junction |
| `--tls.guess-signals`, `--tls.discard-simple`, `--tls.join` | Signals from OSM positions; drops signals on trivial junctions |
| `--keep-edges.by-vclass passenger` | Keeps only roads open to cars |
| `--keep-edges.components 1`, `--remove-edges.isolated` | Keeps the largest connected network |

Street names use the OSM English name (`name:en`) where one exists, then the local name. Speed limits and lane counts come from OSM tags where present and from SUMO's defaults for the road class otherwise.

## 3. Demand (assumed)

No traffic counts and no census commuting table are public for Abu Dhabi. The demand is therefore an assumption, built as follows.

1. **Total (`TOTAL_VEHICLE_TRIPS`):** 392,000 vehicle trips departing 06:30–10:00. The only other public estimate found for the city is about 490,000 for all roads (see [reference-figures.md](reference-figures.md)). IntelliTwin's network has major roads only, and with the full 490,000 it gridlocked (see the tuning history below), so the total is set 20% lower. This is a plausibility adjustment, not calibration. Together with the distance parameter below, it is the most influential number in the model.
2. **Departure profile (`DEPART_PROFILE`):** relative departures per 15 minutes, rising to a peak around 07:15–08:00 and tapering after.
3. **Trip ends:** each ordinary street link (primary, secondary, tertiary; not motorways, trunks or ramps) gets a weight.
   - With building data: 80% from the floor space of buildings whose nearest street link it is (within 600 m), 20% from link length × lanes.
   - Without building data: link length × lanes.
   - Homes and workplaces are not distinguished, because open land-use data is too sparse. Origins and destinations use the same weights.
4. **Trip distribution (gravity):** an origin is drawn by weight. Twelve candidate destinations are drawn by weight, and one is chosen with probability ∝ `exp(−distance / 9 km)`, excluding anything closer than 1.5 km.
5. **External traffic:** 12% of trips have one end at a boundary point (60% inbound, 40% outbound); 1% cross the area boundary to boundary. Boundary points are dead-end junctions within about 2 km of the study-area edge, weighted by lanes × speed² so that motorways dominate.
6. **Vehicle types:** one passenger-car type. Vans, lorries, taxis, company buses and motorcycles are not separated.

The trip list is generated once with a fixed random seed. Each trip carries a random level, and a scenario includes the trips below its demand multiplier, so scenarios are nested: every “−20%” trip is in “typical”, and every “typical” trip is in “+20%”.

## 4. Simulation

SUMO runs in **mesoscopic** mode (`--mesosim`): each road is a chain of queues with capacity and travel time, not individual car-following. This is fast enough to simulate the whole city for three scenarios in one pipeline run.

**Sampling (`SIM_SAMPLE` = 0.25):** only one trip in four is simulated. To keep congestion realistic, each simulated vehicle takes four vehicles' worth of road space (length 27.5 m plus gap) and the mesoscopic headways are multiplied by four, which cuts road capacity to a quarter. Vehicle counts and trip totals are scaled back up by four in the output. On the test network, the sampled run matched the full run to within about 1 km/h on network speed. The three scenarios run in parallel.

| Setting | Value | Why |
| --- | --- | --- |
| `--meso-tls-penalty` | 0.6 | Signal timings are not public; adds a generic delay at signals from the default green split |
| `--meso-tls-flow-penalty` | 0.8 | Generic capacity loss at signals |
| `--meso-minor-penalty` | 3 s | Delay when entering from a minor road |
| `--meso-overtaking` | on | Faster vehicles may pass within a queue segment |
| Routes at departure | SUMO routing engine, A* | Every trip is routed when it departs, using travel times averaged over recent minutes, so later drivers avoid roads that are already slow |
| Rerouting device | 30% of vehicles, every 10 min | These drivers also re-plan while driving. A one-run approximation of route choice, not an equilibrium |
| `--max-depart-delay` | 900 s | A trip that cannot enter a jammed road within 15 minutes is dropped |
| `--seed` | 42 | Reproducible runs |

There is no day-to-day learning loop and no departure-time choice. Route choice adapts within the single simulated morning.

## 5. Scenarios

| Id | Label | Demand multiplier |
| --- | --- | --- |
| `base` | Typical weekday | 1.0 |
| `high` | Demand +20% | 1.2 |
| `low` | Demand −20% (staggered hours) | 0.8 |

## 6. Outputs and KPIs

Per link and 5-minute bin, SUMO reports mean speed and vehicle-seconds present.

| KPI | Definition |
| --- | --- |
| Speed ratio | Link mean speed ÷ link speed limit, capped at 1 |
| Congestion level | Free ≥ 0.8, Moderate 0.6–0.8, Heavy 0.4–0.6, Severe < 0.4 |
| Average network speed | Vehicle-kilometres ÷ vehicle-hours over all links in the bin |
| Vehicles moving | Vehicle-seconds in the bin ÷ bin length |
| Extra travel time | Vehicle-hours ÷ free-flow vehicle-hours − 1 |
| Delay per hour | (Vehicle-hours − free-flow vehicle-hours), scaled to one hour |
| Slowest roads | Links grouped by street name (roads ≥ 2 km with ≥ 15 vehicles), ranked by occupancy-weighted speed ratio |

Trip statistics (average length, duration, speed, time lost) come from SUMO's trip records for trips completed inside the window.

## 7. Vehicles in the app

The app draws **one vehicle for every vehicle the simulation has on each road link**. For each link and 5-minute bin, the number present is the simulated vehicle-seconds divided by the bin length. Those vehicles are spaced along the link, spread across its lanes, and moved at the link's simulated speed. Zoomed out they are dots; from zoom 14.3 they are 3D cars on the links near the view centre.

The counts and speeds are the simulation's. The individual cars are drawn to match them: they are not tracked vehicles, they do not carry a route from link to link, and their colours are decorative. The pipeline still exports a 1% sample of true simulated trajectories (`*_trips.bin`), which the app no longer loads.

## 8. Buses

Bus runs come from the GTFS timetable for a Tuesday service day. Positions follow the route shape where the feed has one, at constant speed between consecutive timetabled stops; otherwise they move in straight lines between stops. Buses do not load the simulated roads.

## 9. Live and historical modes

The model holds one simulated weekday morning. There is no live traffic feed and no recorded history.

- **Live:** the header shows the current Abu Dhabi date and time. Between 07:00 and 10:00 the twin follows the clock at real-time speed; outside those hours it replays the modelled morning and says so.
- **Historical:** a date and a 24-hour time can be chosen. Every date replays the same modelled morning for the selected demand case; a time outside 07:00–10:00 shows the nearest modelled time. The on-screen note states this.

Storing real history would need a feed (for example floating-car speeds or detector counts) and a time-series store behind the app.

## 10. Illustrative accidents and fines

No accident or enforcement data is public for Abu Dhabi. So that the dashboard has these views, `js/events.js` generates them in the browser, deterministically, from the simulated traffic. **They are not real records and the app labels them “illustrative” wherever they appear.**

| Item | How it is generated |
| --- | --- |
| Accidents | 45 for the typical weekday (06:30–10:00), an arbitrary demo figure. Each is placed on a link and time in proportion to vehicle-kilometres, weighted up where traffic is slow. Other demand cases scale with their own exposure. Severity is drawn 78% damage only, 17% minor injury, 5% serious; duration 15–45 minutes |
| Enforcement sites | 60 assumed sites: the busiest named links (at most two per road). They are not real camera locations |
| Violations | Drawn per site and 5-minute bin from the simulated flow passing it, by type: speeding (mostly when traffic flows freely), red light, lane discipline, phone use, seat belt, tailgating. The rates are invented for the demo |
| Fine values | Placeholders (AED 400–1,000 by type), not the official tariff |

To replace them with real data, load real records in place of `TwinEvents.generate()`; the dashboard, map layers and assistant read the same structure.

## 11. Tuning history

All builds used the real OpenStreetMap network (20,801 links). “Typical weekday” results:

| Build | Settings | Result |
| --- | --- | --- |
| 1 | 490,000 trips, distance 9 km, traffic-aware routes at departure | Average trip 22 km. Speed fell all morning to about 24 km/h at 10:00 with over 110,000 vehicles moving. Gridlocked. The same build's “−20%” case (392,000 trips) peaked near 55,000 vehicles at about 50 km/h and began to recover |
| 2 | 490,000 trips, distance 5 km, free-flow routes fixed in advance | About 13 km/h at 10:00. Worse |
| 3 | 392,000 trips, distance 9 km, free-flow routes fixed in advance | About 15 km/h at 10:00. Still gridlocked |
| 4 | 392,000 trips, distance 9 km, traffic-aware routes at departure | Current build. Not gridlocked: vehicles moving level off near 56,000 from 08:30. Network speed is about 50 km/h at 09:00 but keeps easing to about 36 km/h at 10:00 instead of recovering. Average trip 22.8 km at 59.5 km/h, 7.8 minutes lost. The “−20%” case recovers fully; the “+20%” case reaches about 93,000 vehicles and 26 km/h |

Findings: fixing every driver's route in advance on free-flowing roads (builds 2 and 3) was the main cause of gridlock, more than the trip total. Routing each trip at departure with recent travel times costs about 10 ms per trip, which is why a build takes about 45 minutes.

The scenarios scale from the build 4 total: “+20%” is about 470,000 trips, close to the gridlocked build 1.

These are plausibility adjustments against another model's figures ([reference-figures.md](reference-figures.md)), not calibration against measurements.
