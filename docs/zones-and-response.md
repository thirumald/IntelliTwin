# Critical zones, response routing and transport layers

## Critical zones (`js/zones.js`)

The **Zones** tab and the yellow site markers watch the traffic around sensitive sites: defence sites, embassies, government buildings, police and fire stations, hospitals, airports, schools and universities.

- **Where the sites come from:** OpenStreetMap, through the data build (`data/zones.json`), plus any you list in `config.js` under `zones.custom`. OpenStreetMap coverage of these sites is incomplete and names may be missing; for defence and diplomatic sites in particular, use your own authoritative list.
- **Status:** each minute, the traffic on links within the radius (500 m) is summarised. A site is on **Watch** when traffic is under 60% of the limit, and in **Alert** when it is under 40%, or when an accident or a serious operational event is active inside the radius. Sites with almost no traffic nearby are left at Normal.
- **Alerts:** a site in Alert raises an alert (critical for defence, embassy, hospital and airport sites) and can be pushed like any other.
- **What it is not:** the status is derived from synthetic traffic, illustrative accidents and synthetic events. It demonstrates the monitoring; it is not a security or safety assessment of any real site.

## Response routing (`js/response.js`)

When a critical alert is pushed, or when you open an alert that has a location, the app finds the quickest route from the nearest response unit and draws it in cyan, with the travel time and distance in the **Response route** card.

- **Method:** the road links are joined into a graph by matching each link's end to link starts within 45 m; Dijkstra's algorithm finds the least-time path using current link speeds × 1.25 (response vehicles faster than traffic), capped at 115% of the limit.
- **Limits:** turn restrictions and medians are unknown, so the route is indicative. Unit positions are synthetic placeholders in `config.js` (`response.bases`); replace them with real bases or live unit positions.

## Vehicle types

Vehicles on the map are drawn as cars, taxis, vans, lorries, buses and motorcycles in the shares set by `vehicles.mix`, with different sizes and colours in the 3D view. The simulation itself has one vehicle type, so the split is an assumption for display and reporting.

## People on foot and the 3D view

At street zoom the map shows cars with glass and wheels, taxis, vans, lorries, buses and motorcycles on an asphalt surface, lit by a sun-like light, and people walking along both sides of ordinary streets. The walkers are synthetic: their number follows an assumed density per kilometre by road class (`people.perKmByClass`) and time of day. Nobody is counted or tracked.

The map has a dark and a light theme (the **Light map** / **Dark map** button, or `map.theme`); the light theme has a pale green tint (`map.lightTint`).

## Railway and cycle tracks

Read from OpenStreetMap by the data build (`data/rail.json`, `data/cycle.json`) and drawn as a dashed light line and a magenta line. They are geometry only: no trains or cyclists are simulated, because there is no public timetable or count data for them.
