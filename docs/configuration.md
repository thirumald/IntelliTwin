# Configuration

All settings are in `config.js` at the repository root. Every value has a working default, so the app runs unchanged. Anything left as `null` uses built-in synthetic data, which the app labels on screen.

`config.js` is served to every visitor. **Never put passwords, API keys or tokens in it.**

## Settings

| Section | Key | Default | What it does |
| --- | --- | --- | --- |
| `start` | `mode`, `rate` | `'live'`, 30 | Opening mode and speed. `'live'` starts at the Abu Dhabi clock and plays at `rate` (30× by default, so it runs ahead of the clock; choose 1× to stay locked to it). `'replay'` opens today's synthetic day as Historical |
| | `fullView` | `true` | Open with the panel, legend and site shortcuts minimised |
| | `focus`, `orbit` | `'most-congested-site'`, `true` | Open with the most congested major site selected in the site chips, in a tilted 3D view with the camera orbiting. `'most-congested'` opens on the slowest road instead; `'all'` on the whole area |
| `map` | `styleUrl` | OpenFreeMap dark style | MapLibre style for the vector base map. Use a licensed or self-hosted style in production |
| | `rasterTiles`, `rasterAttribution` | OpenStreetMap standard tiles | Raster fallback if the vector style cannot load |
| | `styleUrlLight`, `lightTint`, `theme` | OpenFreeMap positron, `#e3f1e4`, `'dark'` | Light-theme style, its pale green background tint, and the theme at start |
| | `buildings3d` | `true` | Extrude buildings from the vector tiles |
| `time` | `timeZone` | `Asia/Dubai` | Clock used for Live mode and dates |
| | `weekendDays`, `shortDay` | `[6, 0]`, `5` | Weekend days and the shorter working day, used by the synthetic day |
| `feeds` | `traffic` | `'synthetic'` | Traffic source. Only `'synthetic'` is implemented; see “Integration points” |
| | `accidentsUrl` | `null` | Reserved for a real accident feed; not implemented yet |
| `devices` | `cameras` | `[]` | Real CCTV cameras: `{ id, name, lon, lat, stream }` |
| | `sampleVideos` | four Wikimedia Commons clips | Real traffic footage shown by cameras with no stream: `{ sources: [urls], credit }`. The clips are from Chicago and the camera window says they are not the camera's feed. `[]` uses the synthetic view only |
| | `syntheticCameras`, `syntheticDetectors`, `syntheticSigns` | 40, 80, 15 | How many synthetic devices to place when no real ones are listed |
| | `hlsScript` | `null` | URL of an HLS player script for browsers without native HLS |
| | `signalCycleSeconds` | 90 | Generic signal cycle shown on the map |
| `alerts` | `networkSpeedBelowKmh` | 40 | Alert when network speed falls below this |
| | `roadRatioBelow`, `roadMinVehicles` | 0.45, 80 | Alert for a road below this share of its limit with at least this many vehicles |
| | `seriousAccident`, `maxShown` | `true`, 12 | Alert on serious accidents; list length |
| | `everyAccident` | `true` | Alert on every new accident, not only serious ones |
| | `syntheticEventsPerHour` | 14 | Synthetic operational events raised at cameras (stopped vehicle, wrong-way vehicle, debris, pedestrian on carriageway, queue, camera offline and similar). 0 turns them off |
| | `push`, `pushSeconds`, `pushMaxVisible` | `true`, 9, 4 | Push each new alert as an on-screen notification (and a browser notification when the user has allowed them and the page is in the background) |
| `vehicles` | `mix` | six types | Assumed shares of vehicle types for display and reporting |
| `people` | `perKmByClass` | `[0, 0, 6, 12, 16]` | Synthetic walkers per km of street by road class, before the time-of-day factor |
| `environment` | `sensors`, `syntheticSensors`, `radiusM` | `[]`, 18, 400 | Environmental sensors: real positions or a number of synthetic ones; traffic radius used for readings |
| | `alertAqiAbove`, `alertNoiseAboveDb`, `alert` | 150, 80, `true` | Sensor alert thresholds |
| `response` | `auto`, `speedFactor`, `bases` | `true`, 1.25, seven units | Response routing: route automatically on critical alerts; speed advantage; unit positions (synthetic placeholders) |
| `zones` | `radiusM`, `watchRatioBelow`, `alertRatioBelow`, `minVehicles` | 500, 0.6, 0.4, 25 | Critical-zone monitoring thresholds |
| | `types`, `custom`, `alert` | nine types, `[]`, `true` | Site types with labels and priority; your own sites; whether a site in alert raises an alert |
| `analytics` | growth, horizon, curve, costs, population | see `config.js` | Every assumption behind the predictive analytics view ([analytics.md](analytics.md)) |
| `forecast` | `horizonsMin` | `[15, 30, 60]` | Forecast horizons |
| `closure` | `radiusM`, `speedLoss`, `extraVehicles` | 1500, 0.4, 0.3 | The what-if closure estimate: affected radius, maximum speed loss, extra vehicles on nearby roads |
| `auth` | `enabled`, `roles` | `true`, three roles | Demo sign-in and what each role may do |
| `api` | `assistantUrl` | `null` | Your service for language-model answers ([assistant.md](assistant.md)) |
| | `auditUrl` | `null` | Your service that receives each audit entry as a JSON `POST` |
| `language` | `default`, `available` | `'en'`, `['en', 'ar']` | Interface languages |

## Camera video

Add cameras to `devices.cameras`:

```js
cameras: [
  { id: 'CAM-101', name: 'Corniche / 30th Street', lon: 54.3401, lat: 24.4752, stream: 'https://example.org/cam101/index.m3u8' },
  { id: 'CAM-102', name: 'Airport Road', lon: 54.3900, lat: 24.4470, stream: 'https://example.org/clips/cam102.mp4' },
  { id: 'CAM-103', name: 'Maqta Bridge', lon: 54.4950, lat: 24.4000, stream: 'iframe:https://player.example.org/embed/103' }
]
```

| `stream` value | Played with |
| --- | --- |
| `.mp4` or `.webm` URL | The browser's video player |
| `.m3u8` (HLS) URL | Native HLS where the browser has it (Safari); otherwise the script named in `devices.hlsScript` |
| `iframe:` followed by a URL | An embedded player page |
| missing | A synthetic view drawn from the traffic on the camera's road, labelled “not footage” |

The stream host must allow playback from the site's origin (CORS for HLS, embedding for iframes). RTSP cannot play in a browser; convert it to HLS or WebRTC at a media gateway first.

## Roles

The sign-in is a **demo**: the role is chosen in the browser, so anyone can pick any role. It shows how the interface adapts to a role; it does not protect anything. For real access control, put the app behind single sign-on or an authenticating reverse proxy.

| Permission | Unlocks |
| --- | --- |
| `whatif` | Road closure what-if |
| `export` | CSV exports and the printed summary |
| `video` | Opening camera views |
| `audit` | Audit log view and export |
| `settings` | Configuration summary |

## Integration points not implemented yet

These need a service of your own; the app does not call them today.

| Need | What to build | Where it plugs in |
| --- | --- | --- |
| Live traffic | A service returning speed (or speed ratio) per road link and time | Replace the lookups in `ratioAt()` / `occAt()` in `js/app.js`; link order is defined by `data/roads.json` |
| Stored history | A time-series store queried by date and time | The same lookups, keyed by `state.date` |
| Real accidents and fines | Feeds of records with time, position and type | Replace `TwinEvents.generate()` in `js/events.js` with a loader returning the same structure |
| Real signal states | Signal controller status by junction | `js/devices.js`, the `signals` layer |
| Real authentication | SSO or reverse proxy | In front of the site; then set `auth.enabled: false` |
