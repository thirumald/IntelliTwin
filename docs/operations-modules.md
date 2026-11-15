# Operations, mobility and support modules

Eleven modules added on top of the traffic twin. **All of them run on synthetic or estimated data** generated in the browser, and each section says so on screen. They show how the function would work; they are not connected to real systems.

| Module | Menu | What it shows | Basis |
| --- | --- | --- | --- |
| Incident management | Incidents | Register of incidents from report to closure, response time against a target, operator actions (acknowledge, dispatch, close), CSV export | Illustrative accident records; response steps generated unless an operator acts |
| Signal control | Signals | Signal plans by time of day, adaptive junctions, green-wave corridors, emergency-vehicle priority along the active response route | Junction positions from OpenStreetMap, service level from the simulation; timings are examples |
| Planned events and roadworks | Events | Two-week calendar, what is active now, expected effect, closure test through the road-closure what-if | Example entries in `config.js` |
| Parking | Parking | Car parks and on-street zones, occupancy, guidance to the nearest site with space, violations | Example sites with generated occupancy |
| Emergency and evacuation | Emergency | For a chosen site: people to move, assembly point, route, clearance time, nearest hospital, police and fire station. Natural disaster exercises: flood, storm surge, sandstorm, earthquake, extreme heat | OpenStreetMap sites; assumptions and example areas in `config.js` |
| Vehicle search | Search | Plate search, journey between cameras, watch list | Generated plate reads at synthetic cameras; demo plates |
| Pedestrian and school safety | Pedestrians | Schools with fast traffic nearby at arrival and dismissal, crossings to review, crowd levels | OpenStreetMap schools, simulated speeds, generated counts |
| Freight and restricted vehicles | Freight | Lorries on the network, ban hours and zone, weigh stations, hazardous loads | Assumed vehicle mix; examples in `config.js` |
| Weather and visibility | Environment | Conditions, visibility, advised motorway limit, message-sign text; fog, sandstorm and rain can be demonstrated | Generated; example rule set |
| Asset health and maintenance | Devices | Availability by asset type, open and overdue work orders | Generated |
| Scheduled reports and before/after study | Reports | Report schedule, generate a report file now, compare two days | Built from the twin's data |

## Methods and limits

**Incidents.** Each illustrative accident becomes an incident. Unless an operator acts, it is acknowledged 1 to 3 minutes after the report, a unit is dispatched 1 to 4 minutes later and arrives after a generated drive of 3 to 12 minutes. Response time is report to arrival; the target is `incidents.responseTargetMin` (12 minutes). Operator actions are kept for the session only and are written to the audit log.

**Signals.** Cycle time follows the simulated service level (70 s at level A to 140 s at level F), scaled by the time-of-day plan. The first `signalControl.adaptiveJunctions` junctions by delay are marked adaptive as an example pilot. Corridors are major roads with three or more signals. Emergency priority marks the signals within 70 m of the active response route; the time saved is `prioritySavingSec` per signal, an assumption.

**Evacuation.** Clearance time = mobilisation time + vehicles ÷ road capacity + free-flow drive to the assembly point. It ignores background traffic, junction delay and staged release. It is a first estimate for discussion, not an approved plan. Assembly points are example open areas, not designated sites.

**Natural disaster scenarios** (in the Emergency section). Flash flood, coastal storm surge, severe sandstorm, earthquake and extreme heat. Choosing one shades its example areas and reports the road length and vehicles inside (from the simulated traffic), the critical sites inside by type, an assumed number of people, a time to clear vehicles at road capacity, the assembly points outside the area and a response checklist. The areas are examples for exercises, not surveyed hazard zones, and nothing here is a warning or forecast.

**Vehicle search.** No real plate is read. A plate typed into the search produces the same generated sightings each time for that day. In a real deployment this function handles personal data: it needs a lawful basis, role-based access and a full audit trail. Here it is limited to the Administrator and Operator roles and every search is logged, but the sign-in is a demonstration, not a security control.

**Weather.** Conditions are generated per day (mostly clear; fog only in the early morning; dust in the afternoon). The selector overrides them for a demonstration. The traffic simulation does not respond to weather.

**Before/after study.** The two days are synthetic and differ only by day type, so the comparison shows the method, not the effect of a measure. A real study needs stored history.

**Reports.** A static site cannot send reports on a schedule. The schedule shows when each would run on a server; **Get** builds the report in the browser and downloads it.

## Settings

Each module has a section in `config.js`: `incidents`, `signalControl`, `planned`, `emergency`, `parking`, `vehicleSearch`, `freight`, `pedestrians`, `weather`, `assets`, `reports`.
