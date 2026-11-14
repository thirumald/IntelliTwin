# Calibration status, limits and disclaimer

## Disclaimer

IntelliTwin is an independent demonstrator built from open data. It is not an official model of the Department of Municipalities and Transport, the Integrated Transport Centre, the Statistics Centre Abu Dhabi or any other UAE body, and it is not endorsed by them or by any data provider.

The traffic shown is simulated, not observed. Results are indicative and must not be used for planning, investment, operational, legal or safety decisions. The software and data are provided as is, without warranty.

## Calibration status

**Not calibrated and not validated.** No traffic counts are public for Abu Dhabi, so nothing in the model has been compared with measured traffic. The total amount of traffic rests on one assumed number (see [methodology.md](methodology.md)). Treat every figure, and every individual road, as illustrative.

## Known limits

| Area | Limit |
| --- | --- |
| Coverage | Abu Dhabi city only. Traffic from Dubai, Al Ain and Al Dhafra enters at boundary points with assumed volumes |
| Network | Motorway to tertiary roads only. Residential and service streets are missing, so local access traffic is loaded onto the nearest larger street |
| Demand total | Assumed, benchmarked only against another model's estimate |
| Demand pattern | Homes and workplaces are not distinguished; origins and destinations share the same weights, so the tidal inbound morning flow is weaker than in reality |
| Vehicle mix | One car type. No vans, lorries, taxis or motorcycles as separate classes |
| Staff transport | Company minibuses and labour coaches, a large part of the UAE morning peak, are not modelled |
| Signals | Positions from OpenStreetMap; timings are not public, so a generic delay and capacity penalty is applied |
| Tolls | Darb toll gates are not modelled as a price |
| Route choice | One simulated morning with periodic rerouting; no day-to-day equilibrium, no departure-time choice |
| Simulation detail | Mesoscopic queues, not individual car-following; no lane changing, no junction geometry effects |
| Buses | Drawn from a timetable that may be several years old; they do not interact with traffic |
| Buildings | Machine-detected footprints; most heights are estimated from footprint size |
| Scenarios | Demand scaling only. No incident, closure, weather or event scenarios yet |
| Days | One typical weekday. No Friday, weekend, Ramadan or school-holiday patterns |
| Speed limits | From OpenStreetMap tags or class defaults; the enforcement buffer common in Abu Dhabi is not represented |

## What would make it a decision-grade model

1. Traffic counts and journey times to calibrate and validate against (for example GEH statistics by count site).
2. An origin–destination matrix from surveys, mobile data or licence-plate data.
3. Signal plans and ramp-metering logic.
4. Current GTFS and staff-transport data.
5. A demand model that separates homes, jobs, schools and freight.
6. An equilibrium assignment with documented convergence.
