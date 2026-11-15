# Critical smart-city use cases

Thirteen use cases are added inside the existing menu sections (no new menu items). They are built in
`js/citycases.js` and configured under `cityCases` in `config.js`.

Everything here is computed in the browser. Nothing is sent to a field system, and every card states
whether its figures are synthetic, simulated or a screening estimate.

| Use case | Section | What it does | Basis |
| --- | --- | --- | --- |
| Crowd safety | Pedestrians | People, share of capacity and density at the region's venues; hold or release entry; suggested action | Synthetic |
| School zones now | Pedestrians | Vehicles and speeds within 200 m of each school; zones where a school-time limit would bite | Real school positions, simulated speeds |
| Unified command | Incidents | Police, ambulance, civil defence, traffic control and municipality on one incident with a shared timeline; declare a major incident | Synthetic, from the illustrative incident |
| Utility failure impact | Emergency | Power, water, lighting or telecom failure at a site: roads, signals, cameras and critical sites affected, with actions | Screening estimate |
| Adaptive control | Signals | Fixed plan, adaptive or green wave by corridor, with the estimated delay saved | Simulated control |
| Site protection | Zones | Normal, Elevated or Lockdown for a critical site, with the actions at each level | Synthetic |
| Tracking across cameras | Search | Leg-by-leg times and speeds for a searched plate, likely next cameras, alert units | Synthetic sightings |
| Asset health forecast | Devices | Health score, assets likely to fail in 30 days, overdue work orders | Synthetic |
| Impact and conflicts | Events | Extra delay of each planned work or event; overlapping works within 2 km | Screening estimate |
| Service performance | Transit | Buses on time, lateness, passengers on board and load by route | Synthetic |
| Development impact | Model | New homes and jobs at a site: added peak cars and the speed change on nearby main roads | Screening estimate, not a simulation run |
| Emissions and exceedances | Environment | CO₂ so far today, sensors above the limit, hours above the limit, share by vehicle type | Estimated and synthetic |
| Resilient city services | Analytics | A scorecard goal with six KPIs from the cases above | As above |

Operator actions (hold entry, declare a major incident, set a signal mode, set a protection level, alert
units) are recorded in the audit log and marked as simulated.

## Analytics and reports

- **City scorecard** has a status donut, a bar for each goal (share of KPIs on target), a "furthest from
  target" chart, and a bullet graphic on every KPI (bar = value, marker = target, shaded = target side).
- **Operations today** charts venue occupancy, bus lateness, incidents by stage, EV sockets, car parks,
  device availability, air quality through the day, and sea and air movements.
- **Regions** compares road length, signals and road classes across all regions in `config.js`.
- **Reports** now include the region, a goal-by-goal bar chart, city services, the busiest venues and any
  utility or development assessment made in the session. Three schedules are added: daily city services,
  weekly safety and security, monthly regional comparison.
