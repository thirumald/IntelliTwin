# Buses (synthetic network)

The **Buses** section and the blue routes and buses on the map come from `js/buses.js`.

## Why it is synthetic

The public Integrated Transport Centre timetable could not be downloaded: the Mobility Database accepted the API token, but the file download was refused (HTTP 403). So the app builds an example network instead. **The route numbers, stops, timetables and delays are invented. They are not Abu Dhabi's real bus services**, and the section says so on screen.

## How it is built

| Element | Method |
| --- | --- |
| Routes | Listed in `config.js` (`buses.routes`): two end points and a peak headway each. The path is the quickest road route between them, preferring ordinary roads to motorways |
| Stops | One every 600 m along the path (`stopSpacingM`) |
| Timetable | Departures from both ends from 05:30 to 23:30, at the peak headway from 06:00 to 09:30 and 16:00 to 20:00, and 1.5 times that otherwise |
| Journey time | Route length at a timetabled 22 km/h including stops (`scheduleKmh`) |
| Buses on the map | Placed where the timetable puts them; 3D buses at street zoom, dots otherwise |
| Delay | 35% of the extra travel time the synthetic traffic causes on the route (`delayShare`). A bus is “on time” within 3 minutes |

## Using real services

Replace `buses.routes` with real end points and headways, or connect a GTFS feed in place of the route builder in `js/buses.js`. If you have the timetable file from the Integrated Transport Centre, the data build can also read it from `build/gtfs.zip` (see [operations.md](operations.md)).
