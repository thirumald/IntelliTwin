# Reference figures

Figures used as context or benchmarks. None of them is read by the pipeline. Verify each against its original source before quoting it elsewhere.

## Statistics Centre Abu Dhabi (SCAD), population and employment 2024

As quoted on the Abu Dhabi Traffic Twin site (The Moving Dot Lab), which attributes them to SCAD's 2024 figures published in 2025. Not independently checked here.

| Figure | Value |
| --- | --- |
| Abu Dhabi Emirate residents | 4,135,985 |
| Abu Dhabi Region residents | 2,823,340 |
| Al Ain Region residents | 986,910 |
| Al Dhafra Region residents | 325,735 |
| Employed, aged 15 and over (emirate) | 2.76 million |
| Population growth 2023 to 2024 (emirate) | 7.5% |

SCAD publishes regions, not the city outline used here.

## A third-party model: Abu Dhabi Traffic Twin (The Moving Dot Lab)

Source: <https://abudhabitraffictwin.themovingdot.com/>, read in November 2026. These are that model's own estimates and assumptions, not observations. That site states its model is not calibrated or validated. They are listed because they are the only other public estimate found for the city.

| Figure in that model | Value |
| --- | --- |
| Residents in its modelled area (assumed) | 2,450,000 |
| All vehicle trips, 06:30–10:00 | 490,628 |
| of which commuting by car | 286,521 |
| of which school run, shopping, other | 142,624 |
| of which vans | 48,089 |
| of which lorries | 9,193 |
| of which long-distance through traffic | 4,200 |
| Cars, vans and lorries moving at one instant (08:00–09:00) | about 65,200 |
| Average car speed | 47 km/h |
| Bus services | 73 lines, 887 runs |
| Traffic signals (positions from OSM) | 121 |
| Roads (all classes) | 12,859 km; 690 km motorway, 250 km trunk |

That model differs from IntelliTwin in method: it includes all road classes, distinguishes trip types, and iterates over several simulated mornings.

## How IntelliTwin uses these

| IntelliTwin parameter | Value | Relation to the references |
| --- | --- | --- |
| `TOTAL_VEHICLE_TRIPS` | 392,000 | 80% of the third-party total for 06:30–10:00, because only major roads are modelled and the full total gridlocked |
| `THROUGH_SHARE` | 1% | Same order as the third-party through-traffic share |
| `EXTERNAL_SHARE` | 12% | Own assumption; no reference |

## Sanity checks after a build

Compare the run summary with the benchmarks, remembering both are models:

- Vehicles moving at 08:00–09:00: tens of thousands, same order as 65,000.
- Average trip speed: roughly 35–60 km/h. Much lower suggests gridlock from too much demand on the reduced network; much higher suggests too little demand.
- Share of trips completed: most trips departing before 09:30 should finish.
