# Live data and the OSINT menu

Three real data sources are shown beside the simulation. They show the real world at the real time, whatever
the twin's own clock shows.

| Source | What | Where in the app |
| --- | --- | --- |
| NASA FIRMS | Fire and heat detections from the VIIRS satellites, last two days, UAE | Emergency, "Fire and heat detections"; map layer |
| aisstream.io | Vessel positions heard on AIS in UAE waters | Transit, "Live vessels (AIS)"; map layer; replaces the synthetic ships |
| Flightradar24 | Aircraft flying to or from UAE airports (snapshot) | Transit, "Live flights"; map layer; Dashboard and Analytics figures. Synthetic flights are switched off (`air.synthetic: false`) |
| N2YO | Orbital elements of satellites; positions computed in the browser (satellite.js) | Transit, "Satellites overhead"; map layer |

Each layer has a check option in the Scenario and layers card on the Dashboard.

## How it works

The site is static, so the API keys cannot be used from the browser without exposing them. Instead:

1. The **Live data** workflow (`.github/workflows/live-data.yml`) runs every 30 minutes in GitHub Actions.
2. It reads the keys from the repository secrets (or variables) `FIRMS_API_KEY`, `N2YO_API_KEY`, `AIS_API_KEY` and `FLIGHT_RADAR`.
3. `.github/scripts/live_data.py` calls the three services and writes `fires.json`, `satellites.json`,
   `vessels.json` and `status.json`.
4. The files are published as a single commit on the `live-data` branch. The main branch gets no data commits
   and the site is not redeployed.
5. The app reads the files from `live.baseUrl` in `config.js` and looks for newer ones every 10 minutes.

No key is written to a file or to the workflow log. `status.json` records for each source whether the last
attempt worked, when, and the error if it did not. A source that fails keeps its previous file.

## Notes

- **Fires.** In the UAE most detections are gas flares and industrial heat sources, not wildfires. The value
  shown is the fire radiative power in megawatts.
- **Vessels.** A snapshot of positions heard during about 150 seconds, so it is up to 30 minutes old. Coverage
  depends on the receivers that feed aisstream.io.
- **Flights.** Flightradar24 bills 8 credits for each flight returned, so the workflow asks for at most `FR24_LIMIT`
  flights (default 30) and only once every `FR24_MIN_HOURS` hours (default 8): about 720 credits a day at most. Both can
  be changed as repository variables. The app therefore shows a snapshot with its time, not a continuous feed; aircraft
  positions are not moved forward. `status.json` keeps the credits estimated for the day.
- **Satellites.** A fixed list (space stations, Hubble, the VIIRS satellites behind FIRMS, Landsat, Sentinel,
  KhalifaSat, DubaiSat) plus bright, weather and Earth-observation satellites that were above the UAE at the
  last refresh. Elevation is measured from the centre of the open region.
- Settings: `live` in `config.js` (`enabled`, `baseUrl`, `refreshMin`, layer defaults, `replaceSyntheticShips`).
- To refresh at once: Actions, Live data, Run workflow.

## Layer tree

Scenario and layers opens from the small settings button at the bottom left of the map, just above the zoom buttons; it is no longer a card in the Dashboard panel. Its layers are grouped as a tree: Road, Public
transport, Sea, Air and space, People and safety, City and environment. Each group and the whole tree has a tick box
that selects or clears everything under it (a dash means some are on); a second click clears.

## OSINT menu

**OSINT** opens from the menu as a page of its own, like Analytics: a 3D map of the feeds (UAE 3D, World or the open
region), a symbol legend, and the feed cards in a grid. All of it is real and fetched by the Live data workflow.

The page opens on **City 3D**: street level over the open region with the 3D buildings shown and the camera slowly orbiting. Touching the map pauses the orbit; the **Orbit** button turns it off. `osintMap.defaultView` (`region`, `uae` or `world`), `osintMap.orbit` and `osintMap.orbitDegPerSec` in `config.js` set this.

| Card | Source | Key |
| --- | --- | --- |
| Weather now | Open-Meteo, for the open region | none |
| Rain forecast, 48 hours | Open-Meteo | none |
| Sand and dust storm forecast, 48 hours | Open-Meteo air quality (CAMS dust), wind gusts and visibility | none |
| Earthquakes, magnitude 4 and above within 2,000 km, 30 days | USGS | none |
| Natural events, Red Sea to India, 60 days | NASA EONET | none |
| Space weather (planetary K index) | NOAA SWPC | none |
| Global incidents | USGS earthquakes of magnitude 5.5 and above, NASA EONET open events, GDACS orange and red alerts | none |
| Fire and heat detections | NASA FIRMS | `FIRMS_API_KEY` |
| Live flights | Flightradar24 | `FLIGHT_RADAR` |
| Live vessels (AIS) | aisstream.io | `AIS_API_KEY` |
| Satellites overhead | N2YO | `N2YO_API_KEY` |
| Sources | State and age of every feed | |

- **Sand and dust risk** is worked out in the workflow from forecast dust (µg/m³), gusts and visibility: Low, Moderate,
  High, Severe. It is indicative, not an official warning.
- **Alerts.** A high dust risk in the next 24 hours, 5 mm or more of rain in the next 12 hours, visibility under 1 km,
  and an earthquake of magnitude 5 or more within 800 km in the last day raise alerts. They follow the two tick boxes
  "Weather, rain and dust warnings" and "Earthquake warnings" in Scenario and layers. Thresholds: `osint` in `config.js`.
- **On the map.** Each kind of data has its own symbol: flame on a column (fire, height = power), aircraft on a stem
  (flight, height scaled), hull (vessel, colour = type), satellite on a stem, rings on a column (earthquake, height =
  magnitude), weather symbol with temperature, triangle (incident, colour = alert level). The same symbols are drawn on
  the main map at the scale of the open region.

## Alerts follow the selections

An alert is raised only while its layer is ticked in Scenario and layers. While the roads show live TomTom traffic the
simulated congestion alerts are held back. The alert panel says how many alerts are not shown for that reason.

## Live camera wall

The camera button beside the Scenario and layers button (and "Open the live camera wall" in the Cameras group of the
layer tree) opens a wall of camera views, 12 to a page, with search.

- 120 synthetic camera positions on the busiest roads (`devices.syntheticCameras`), each shown on the map with a camera
  symbol.
- Each tile plays one of the test clips in `devices.sampleVideos`: recorded footage from other cities, marked
  "TEST VIDEO". It is not that camera's feed. A camera with a real `stream` in `devices.cameras` is marked "LIVE".
- The first tile is "Earth from space": NASA's live stream on YouTube (`cameraWall.earthStream`; `null` hides it).
- Only the page shown loads video; closing the wall stops everything.

## Map pop-ups

Pop-ups have a solid background and border in both themes, sit above the 3D layer, are lifted clear of the symbol they
belong to, and only one is open at a time.

## 3D map: buildings, floors and lighting

`js/map3d.js` gives every 3D map the same options: the main map and the map on
the OSINT page.

- **Buildings.** The OSINT map now draws the same 3D buildings as the main map.
  "City 3D" on the OSINT page shows the selected city at street level.
- **Floors.** A slider cuts all buildings at the chosen floor and marks that
  floor with a coloured band. Floors are **estimated from building height**
  (`map3d.floorHeightM`, 3.3 m by default). There are no real floor plans in the
  data.
- **Lighting.** "Follow the clock" places the sun from the simulation time and
  the region's position; Morning, Noon, Evening and Night are fixed presets. The
  light is applied to the buildings and to the 3D symbols drawn over them.

The controls sit in the Scenario and layers pop-up (gear button on the map) and
in the side panel of the OSINT page. Both maps share one setting. Defaults are
in `config.js` under `map3d`.

If the vector base map is slow to load, the app now keeps waiting and shows a
notice after 20 seconds. Before, it gave up after 8 seconds and showed a plain
background without buildings.
