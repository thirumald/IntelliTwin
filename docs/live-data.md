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

A separate **OSINT** menu section holds every real public feed. All of it is fetched by the Live data workflow.

| Card | Source | Key |
| --- | --- | --- |
| Weather now | Open-Meteo, for the open region | none |
| Rain forecast, 48 hours | Open-Meteo | none |
| Sand and dust storm forecast, 48 hours | Open-Meteo air quality (CAMS dust), wind gusts and visibility | none |
| Earthquakes, magnitude 4 and above within 2,000 km, 30 days | USGS | none |
| Natural events, Red Sea to India, 60 days | NASA EONET | none |
| Space weather (planetary K index) | NOAA SWPC | none |
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
- **OSIRIS.** The feed list follows the open-source OSIRIS project (MIT licence). OSIRIS itself is a Next.js server
  application, so it cannot run inside this static site; `osint.osirisUrl` sets the link shown in the Sources card
  (the public demo by default; point it at your own instance if you host one).

## Alerts follow the selections

An alert is raised only while its layer is ticked in Scenario and layers. While the roads show live TomTom traffic the
simulated congestion alerts are held back. The alert panel says how many alerts are not shown for that reason.
