# Public transport: buses, taxis and shuttles (synthetic)

The **Transit** section covers buses (`js/buses.js`) and taxis and on-demand shuttles (`js/transit.js`). All vehicles, numbers, positions, statuses and waits in it are synthetic. Only the railway track is real, from OpenStreetMap.

## Why it is synthetic

The app uses an example network instead of the public Integrated Transport Centre timetable, whose download was refused (HTTP 403) and whose public copy dates from 2022. **The route numbers, stops, timetables and delays are invented. They are not Abu Dhabi's real bus services**, and the section says so on screen.

## How it is built

| Element | Method |
| --- | --- |
| Routes | Listed in `config.js` (`buses.routes`): two end points and a peak headway each. The path is the quickest road route between them, preferring ordinary roads to motorways |
| Stops | One every 600 m along the path (`stopSpacingM`) |
| Timetable | Departures from both ends from 05:30 to 23:30, at the peak headway from 06:00 to 09:30 and 16:00 to 20:00, and 1.5 times that otherwise |
| Journey time | Route length at a timetabled 22 km/h including stops (`scheduleKmh`) |
| Buses on the map | Placed where the timetable puts them; 3D buses at street zoom, dots otherwise |
| Delay | 35% of the extra travel time the synthetic traffic causes on the route (`delayShare`). A bus is “on time” within 3 minutes |

## Stops, bus numbers and live tracking

| Element | Method |
| --- | --- |
| Stop number | Route, direction (A outbound, B return) and position, for example `101A07` |
| Stop name | The road the stop stands on, numbered where a road has several stops; the first and last are the terminus |
| Next bus at a stop | From the nearest bus still before the stop, or the next departure, including the current delay |
| Bus number | Route, direction and the running number of the departure that day, for example `101A-14` |
| Live tracking | Tap a bus, taxi or shuttle on the map, or a bus in the route's list. The map follows it and a card shows its route, next stop, progress and delay. Dragging the map or **Stop tracking** ends it |

## Taxis

`taxis` in `config.js` sets the fleet size, the ranks and the shares. Taxis move back and forth along the quickest road paths between ranks. Each taxi is hired, vacant or going to a booking; the shares follow the time of day (70% hired at peaks, 50% by day, 25% at night). Rank queues and passenger waits are generated from the same shares.

## On-demand shuttles and rail

`shuttles.zones` lists the service zones with their radius, vehicles and usual booking wait. Shuttles circulate on streets inside their zone; passengers on board and waits are generated. The railway figure is the length of real OpenStreetMap track in the area; no passenger timetable is published, so no trains are shown.

## Using real services

Replace `buses.routes` in `config.js` with real end points and headways, or connect a GTFS feed in place of the route builder in `js/buses.js`. The old GTFS import in the data build is switched off (see [operations.md](operations.md)).
