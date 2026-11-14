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

Speed limits and lane counts come from OSM tags where present and from SUMO's defaults for the road class otherwise.

## 3. Demand (assumed)

No traffic counts and no census commuting table are public for Abu Dhabi. The demand is therefore an assumption, built as follows.

1. **Total (`TOTAL_VEHICLE_TRIPS`):** 490,000 vehicle trips departing 06:30–10:00. This is set to the same order as the only other public estimate found for the city (see [reference-figures.md](reference-figures.md)). It is the single most influential number in the model.
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
| Rerouting device | 30% of vehicles, every 10 min | Every driver starts on the quickest route given recent travel times; 30% re-plan while driving. A one-run approximation of route choice |
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

## 7. Moving vehicles in the app

1% of vehicles (`TRIP_SAMPLE`) have their full path recorded with the time they leave each link. The app draws these as moving dots; one dot stands for about 100 vehicles. Positions within a link are interpolated at constant speed.

## 8. Buses

Bus runs come from the GTFS timetable for a Tuesday service day. Positions follow the route shape where the feed has one, at constant speed between consecutive timetabled stops; otherwise they move in straight lines between stops. Buses do not load the simulated roads.
