# Data files

Everything the app reads is in `data/`, written by `tools/build.py`. All binary files are little-endian.

| File | Content |
| --- | --- |
| `meta.json` | Build information, network and demand summary, per-scenario KPIs |
| `roads.json` | Road links: geometry and attributes |
| `<scenario>_speed.bin` | Speed ratio per link and time bin |
| `<scenario>_occ.bin` | Occupancy per link and time bin |
| `<scenario>_trips.bin` | Sampled vehicle trajectories |
| `buses.bin` | Timetabled bus trajectories (only if the GTFS step succeeded) |
| `buildings.json` | Largest building footprints (only if the buildings step succeeded) |
| `signals.json` | Traffic signal positions, `[[lon, lat], …]` |

`<scenario>` is `base`, `high` or `low`.

## meta.json

| Field | Meaning |
| --- | --- |
| `built` | Build time, UTC |
| `osm_timestamp` | Replication timestamp of the OSM extract |
| `sumo` | SUMO version string |
| `bbox` | `[west, south, east, north]` |
| `sim_begin`, `sim_end`, `display_begin` | Seconds after midnight |
| `bin_seconds`, `bins` | Bin length and number of bins |
| `trip_sample` | Share of vehicles exported as trajectories |
| `network` | `edges`, `junctions`, `signals`, `km`, `km_by_class` |
| `demand` | `total_assumed`, `generated`, `internal`, `external`, `through`, `boundary_points`, `trip_ends`, `buildings_snapped_share` |
| `scenarios[]` | `id`, `label`, `demand`, `trips`, `shown_trips`, `stats`, `bins[]` |
| `scenarios[].stats` | `completed`, `km`, `min`, `kmh`, `min_lost` (averages over completed trips) |
| `scenarios[].bins[]` | `speed` (km/h), `vehicles`, `extra` (% extra travel time), `delay_h` (vehicle-hours per hour) |
| `buses`, `buildings` | `available` plus counts and source, or `reason` when unavailable |

## roads.json

```json
{ "names": ["", "Corniche Road", "..."],
  "edges": [ { "n": 1, "c": 2, "k": 0, "l": 3, "s": 60, "m": 412, "p": [54.3521, 24.4801, 54.3562, 24.4829] } ] }
```

| Key | Meaning |
| --- | --- |
| `n` | Index into `names` (0 or empty string = unnamed) |
| `c` | Class: 0 motorway, 1 trunk, 2 primary, 3 secondary, 4 tertiary |
| `k` | 1 if a link road or ramp |
| `l` | Lanes |
| `s` | Speed limit in the model, km/h |
| `m` | Length, metres |
| `p` | Flattened `[lon, lat, lon, lat, …]`, simplified to 15 m tolerance |

Each direction of a road is its own link. The array order defines the link index used by the binary files.

## `<scenario>_speed.bin`

`uint8[bins × links]`, row-major by bin. Value = round(100 × mean speed ÷ speed limit), capped at 100. `255` means no vehicle used the link in that bin (treat as free flow).

## `<scenario>_occ.bin`

`uint16[bins × links]`. Value = vehicle-seconds on the link in the bin ÷ 10. Average vehicles present = value × 10 ÷ `bin_seconds`.

## Trajectory files (`*_trips.bin`, `buses.bin`)

```
uint32   count
uint32   offsets[count + 1]      // index of each trajectory's first point
float32  points[offsets[count] × 3]   // lon, lat, t
```

`t` is seconds since `sim_begin`. This maps directly onto deck.gl `TripsLayer` (`getPath`, `getTimestamps`).

## buildings.json

```json
[ [height_m, [lon, lat, lon, lat, …]], … ]
```

Largest footprints first, outer ring only, without the closing point.
