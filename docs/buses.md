# Public transport: buses, taxis, shuttles, ships and aircraft (synthetic)

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

## Ships and aircraft

`js/seaair.js` adds two cards to the Transit section, with moving icons on the map.

| Element | Method |
| --- | --- |
| Ships | A vessel starts every 22 minutes on one of the example sea lanes off Mina Zayed, inbound or outbound, at its type's speed (container ship, tanker, cruise ship, ferry, cargo dhow). Drawn as a ship icon with a fading wake |
| Port | Berths in use are generated per two-hour period |
| Aircraft | 16 movements an hour, alternating arrivals and departures on four example paths at the airport. Each is in view for seven minutes, descending to or climbing from the runway. Drawn as an aircraft icon at height with a fading trail; 20% of flights are delayed by 10 to 45 minutes |
| Board | The next arrivals and departures with scheduled time, expected time and status |
| Tracking | Tap a ship or an aircraft in the air to follow it |

Ship and flight figures also appear on the Dashboard (Sea and air now), in the City scorecard (Sea and air connections), in generated reports, in Platform monitoring (two feeds) and in Twin Advisor answers.

**Vessel names, flight numbers, times and positions are invented.** The sea lanes and flight paths in `config.js` (`sea.lanes`, `air.routes`) are approximate lines for demonstration; they are not charted channels or published flight procedures, and they should be checked against the base map and corrected before a client demonstration. For real positions, replace the generators with a vessel feed (AIS) and a flight feed (ADS-B) from a licensed provider.

## Using real services

Replace `buses.routes` in `config.js` with real end points and headways, or connect a GTFS feed in place of the route builder in `js/buses.js`. The old GTFS import in the data build is switched off (see [operations.md](operations.md)).
