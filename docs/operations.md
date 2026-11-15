# Operations

## Build on GitHub Actions (recommended)

The workflow `.github/workflows/build-data.yml` runs when files under `tools/` or the workflow itself change, and on manual dispatch.

1. It installs `osmium-tool` and the Python packages in `tools/requirements.txt` (including Eclipse SUMO).
2. It downloads the Geofabrik GCC extract (cached between runs) and filters it.
3. It runs `tools/build.py`: network, demand, three simulations, export.
4. It commits the result to `data/` on the same branch with the message `Rebuild twin data [skip ci]`.

The run summary page lists the network size, demand split, speeds by half hour and whether buses and buildings loaded.

To run it by hand: repository → **Actions** → **Build twin data** → **Run workflow**. Manual dispatch is only offered once the workflow file is on the default branch.

### Bus timetable

The build no longer downloads a bus timetable and no longer reads the `MOBILITY_DATABASE_REFRESH_TOKEN` secret; the app uses a synthetic bus network. The secret can be deleted from the repository settings. To import a real GTFS file again, set `GTFS_ENABLED = True` in `tools/config.py` and put the file at `build/gtfs.zip`.

## Build locally

Requirements: Python 3.10+, `curl`, `osmium-tool`, about 2 GB of free disk space.

```bash
pip install -r tools/requirements.txt
bash tools/fetch_osm.sh build
python tools/build.py --osm build/roads.osm --build build --out data \
  --osm-timestamp "$(cat build/osm_timestamp.txt)"
python -m http.server 8000      # then open http://localhost:8000
```

Useful options and overrides:

| What | How |
| --- | --- |
| Quick test with less traffic | `--scale 0.1` on `build.py` |
| Use a GTFS file you already have | Set `GTFS_ENABLED = True` in `tools/config.py` and put it at `build/gtfs.zip` |
| Use footprint tiles you already have | Put the `.csv.gz` files in `build/buildings/` |

## Configuration

All numbers are in `tools/config.py`: study area, road classes, time window, total demand, departure profile, external shares, gravity parameter, scenarios, sampling rate, meso penalties, building weights. Changing any of them and pushing triggers a rebuild. See [methodology.md](methodology.md) for what each one does.

**Tuning demand:** if the run summary shows the network gridlocked (speeds collapsing and many trips not completed) or empty (speeds at the limit all morning), adjust `TOTAL_VEHICLE_TRIPS` first.

## Deploy the app

The app is plain static files.

- **GitHub Pages:** Settings → Pages → Deploy from a branch → choose the branch and `/ (root)`. The `.nojekyll` file makes Pages serve the files as they are.
- **Any web server:** copy the repository root (at least `index.html`, `css/`, `js/`, `vendor/`, `data/`).

Enable gzip or brotli on the server; the JSON and binary files compress well.

## Updating vendored libraries

`vendor/maplibre-gl.js|css` come from the `maplibre-gl` npm package (`dist/`), and `vendor/deck.gl.min.js` from the `deck.gl` npm package (`dist.min.js`). Replace the files and test the app.
