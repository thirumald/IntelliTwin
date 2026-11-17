# Predictive analytics

The **Analytics** button in the top bar opens a separate full-screen view (`js/analytics.js`). It has seven sections, each with headline tiles, charts with hover values, and tables.

Everything is computed in the browser from the synthetic traffic. **The results illustrate a planning method; they are not forecasts and must not be used for investment or design decisions.** All assumptions are in `config.js` under `analytics`.

## Where it opens

Analytics opens inside the same page, over the map area. The top bar, the side menu and the status bar stay in place; choosing any menu section, **Close** or Esc returns to the map.

## Finding your way: region, scenario, data layer and the tree

The header has three drop-downs beside Growth and Horizon:

| Control | What it does |
| --- | --- |
| **Region** | The same list as the top bar. Choosing a region reloads the twin for it and opens Analytics again on the same section |
| **Scenario** | The demand case the figures are worked out for (the "Demand case" of Scenario and layers). The charts are rebuilt when the case has loaded |
| **Data layer** | Shows only the sections for one kind of data: city performance, operations, traffic and roads, signals, safety, environment, population |

The tree on the left lists **data layer → section → chart or table**. Choosing a section opens it; choosing a chart scrolls to it. The tree is read from the page each time, so a chart added to a section, and the scorecard goals, appear in it with no further change. On a phone the tree folds into a "Sections and data" bar. The groups are set in `analytics.nav` in `config.js`; a section not listed there appears under "Other". The code is `js/analytics-nav.js`.

Cards are kept to about a third of the screen height so that two rows show together; a long chart, table or list scrolls inside its card.

## City scorecard

The first tab. It groups KPIs under seven goals and compares each with an example target.

| Goal | KPIs |
| --- | --- |
| Smooth traffic | Peak network speed, extra travel time, vehicle delay a day, critical roads, junctions at service level E or F, buses on time |
| Fewer accidents | Accidents a day, serious accidents, accidents in the worst hour, critical alerts open |
| Fewer violations | Fines a day, fines in the worst hour, largest violation type, share at the five busiest sites |
| Safe and secure city | Critical sites monitored, sites on alert, cameras online |
| Sea and air connections | Flights on time, average flight delay, flight movements, berths in use, vessel movements (all synthetic) |
| Clean and liveable | Road traffic CO₂ a day, air quality index, roadside noise |
| City development | Peak speed and critical roads at the horizon with and without measures, cycle track, delay cost a year, residents (context) |

Status: **On target** when the value meets the target, **Watch** within 25% of it, **Off target** beyond that. Each status has a symbol and a label as well as a colour.

Values come from the simulated traffic for the day type on the map, the illustrative accidents and fines, and the synthetic sensors, alerts, buses and devices. **Targets are examples** in `analytics.targets` in `config.js`; they are not official targets. Replace them with the client's own before showing the scorecard as an assessment.

## Sections

| Section | What it shows |
| --- | --- |
| Overview | Peak network speed today and at the horizon, with and without measures; roads critical at the peak by year; junctions at service level E or F; annual delay cost; the first roads and junctions to act on |
| Road expansion | Roads ranked by the peak-hour delay one extra lane each way would save; peak speed today, at the horizon and widened; the year each road becomes critical |
| Traffic signals | Junctions by service level; approach delay by junction; what adaptive control would save |
| Population and fleet | Residents by region and a projection; vehicles moving at the peak by type; network length by mode (roads, cycle tracks, railway) |
| Environment | Sensors by air-quality band (donut); pollutants through the day; noise by sensor; road length by noise band; CO₂ by hour; CO₂ by vehicle type (donut). See [environment.md](environment.md) |
| Accidents and violations | Accidents by severity (donut) and by hour; violations by type (donut) and by hour; accident exposure index by road; busiest enforcement sites. All illustrative |
| Demand | Network speed and vehicles moving through a working day for the three demand cases |

Growth (3–10% a year) and horizon (5–20 years) can be changed at the top of the view.

## Method

**Growth projection.** Each road link's peak speed ratio `r` (speed ÷ limit, working day at 08:00) is converted to a volume-to-capacity ratio `x` by inverting the volume-delay curve `r = 1 / (1 + a·x^b)` (BPR form, `a` = 0.6, `b` = 4). Demand growth multiplies `x` by `(1 + g)^years`, and the curve gives the future `r`. A free-flowing link with no measurable delay is given `x` = 0.35.

**Road widening.** One extra lane each way divides `x` by `(lanes + 1) / lanes`. The delay saved is the difference in vehicle-hours lost in the peak hour at the horizon. The network line “Widen N roads” applies this to the N roads with the largest saving.

**Critical road.** Peak speed under 40% of the limit (`criticalRatio`).

**Signals.** A junction's approaches are the road links ending within 90 m of a signal position from OpenStreetMap. Service level is a proxy from the approach speed ratio: A ≥ 85%, B ≥ 70%, C ≥ 55%, D ≥ 40%, E ≥ 25%, F below. It is not the delay-based level of service of a signal analysis, because signal timings are not public. Adaptive control is modelled as removing 12% of approach delay (`adaptiveSignalDelayReduction`), an assumption.

**Delay cost.** Daily vehicle-hours of delay × value of time (AED 40 per vehicle-hour) × 250 working days. Both factors are assumptions.

**Population.** Figures quoted from Statistics Centre Abu Dhabi 2024 data as shown on a third-party site ([reference-figures.md](reference-figures.md)); verify before reuse. The projection holds the 2023–2024 growth rate constant, which is a simple extrapolation.

**Vehicle types.** The simulation has one vehicle type. The split into cars, taxis, vans, lorries, buses and motorcycles uses assumed shares (`vehicles.mix`).

**Accident exposure index.** Traffic volume on each road, weighted up where it is slow, scaled so the highest road is 100. It is an exposure measure, not a count or a prediction of accidents.

**CO₂.** Vehicle-kilometres × an emission factor of `150 + 2500 ÷ speed` g/km, an assumed curve that rises in slow traffic. The split by vehicle type weights each type's share by an assumed factor against a car (`co2.typeFactor`).

**Noise by road.** CoRTN basic noise level at 10 m from the kerb, from each road's peak flow, speed and the assumed heavy-vehicle share, reported as LAeq ≈ L10 − 3.

**Accidents and violations.** Counts for the day shown in the twin, from the illustrative generator ([methodology.md](methodology.md)). They are not records.

## Limits

- The base traffic is synthetic and uncalibrated, so every projection inherits that.
- The projection treats each link separately: traffic does not reroute when a road is widened, and widening does not attract new traffic.
- Widening is tested as one extra lane with no check of land, cost or feasibility.
