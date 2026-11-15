# Live data: NASA FIRMS, N2YO and aisstream.io

Three real data sources are shown beside the simulation. They show the real world at the real time, whatever
the twin's own clock shows.

| Source | What | Where in the app |
| --- | --- | --- |
| NASA FIRMS | Fire and heat detections from the VIIRS satellites, last two days, UAE | Emergency, "Fire and heat detections"; map layer |
| aisstream.io | Vessel positions heard on AIS in UAE waters | Transit, "Live vessels (AIS)"; map layer; replaces the synthetic ships |
| N2YO | Orbital elements of satellites; positions computed in the browser (satellite.js) | Transit, "Satellites overhead"; map layer |

Each layer has a check option in the Scenario and layers card on the Dashboard.

## How it works

The site is static, so the API keys cannot be used from the browser without exposing them. Instead:

1. The **Live data** workflow (`.github/workflows/live-data.yml`) runs every 30 minutes in GitHub Actions.
2. It reads the keys from the repository secrets (or variables) `FIRMS_API_KEY`, `N2YO_API_KEY` and `AIS_API_KEY`.
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
- **Satellites.** A fixed list (space stations, Hubble, the VIIRS satellites behind FIRMS, Landsat, Sentinel,
  KhalifaSat, DubaiSat) plus bright, weather and Earth-observation satellites that were above the UAE at the
  last refresh. Elevation is measured from the centre of the open region.
- Settings: `live` in `config.js` (`enabled`, `baseUrl`, `refreshMin`, layer defaults, `replaceSyntheticShips`).
- To refresh at once: Actions, Live data, Run workflow.
