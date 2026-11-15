# TomTom live data

With a TomTom API key, IntelliTwin adds **real, live data** to the simulated and synthetic picture.

| Feature | Where | TomTom service |
| --- | --- | --- |
| Live traffic on the map | Dashboard, "Show live traffic on the map" | Traffic flow raster tiles |
| Live incidents | Dashboard count, Incidents section, map markers | Traffic incident details |
| Live speeds at the region's sites | Dashboard, "Live speeds at this region's sites" | Flow segment data |
| EV charging stations and charger availability | Transit, EV charging | Category search, charging availability |
| Fuel stations | Transit, Fuel stations | Category search |
| Live route time for a response route | Under the response route text | Routing with traffic |

While the live traffic layer is on, the twin's own road colours are hidden so the live colours can be read. "Live data © TomTom" is shown on the map whenever TomTom data is displayed.

## Setting the key

In this deployment the key is set in `config.js` (`tomtom.key`) by the owner's decision, so live data works for every visitor. A different key can be set per browser, and takes its place there:

- In the app: **Reports**, **TomTom live data**, paste the key, **Save**; or
- Open the site once with `?tomtom=YOUR_KEY` at the end of the address. The key is saved in that browser and removed from the address bar.

**Remove** deletes it from the browser.

### A key in `config.js` is public

This site and its repository are public. The key in `config.js` can be read and used by anyone, and it stays in the repository history even after it is removed. Keep it restricted to the site's address in the TomTom developer dashboard and set a daily request limit. If it is misused, regenerate it there and update `config.js`, or set `tomtom.key` to `null` and use a per-browser key.

## Settings

`tomtom` in `config.js`: `flowStyle` (`relative0` shows speed against free flow), `flowThickness`, `flowOnStart` (switch the live layer on at start), `incidentRefreshSec` (120), `searchRadiusM` (15,000) and `maxSites` (20 live-speed lookups per press).

## Notes

- Requests count against the key's daily quota. Live incidents refresh every two minutes while the page is visible; the other features run only when their button is pressed.
- Results are shown live and are not saved, in line with TomTom's terms for search results.
- Some services depend on the plan of the key. If a feature returns "The key was refused (403)", that product is not enabled for the key.
- The integration was tested with simulated TomTom responses, not with live calls, because the build environment cannot reach TomTom. Check each feature once with the real key.

## Scenario and layers

With a key set, the **Scenario and layers** card on the Dashboard includes TomTom data:

| Option | What it does |
| --- | --- |
| Demand case: **Live traffic now (TomTom)** | Colours the roads with TomTom's live flow in place of the twin's simulated colours. Choosing any other demand case returns to the simulation |
| Live traffic, TomTom | The same switch as a check option |
| Live incidents, TomTom | Live incidents on the map |
| EV charging stations, TomTom / Fuel stations, TomTom | Stations near the map centre |

Defaults are set in `config.js` under `layers`: `tomtomTraffic`, `tomtomIncidents`, `tomtomEv`, `tomtomFuel`.
Vehicles, forecasts and what-if results always come from the twin's simulation; only the road colours are live.

Before the live flow is switched on the app checks that TomTom accepts the key. If it does not, the twin's
simulated traffic stays on and a notification gives the reason (refused key, request limit, not reachable).

## Connection check

Reports, **Connection check** calls Google Maps and TomTom from the browser the same way the application does and
lists each call as working or failed, with the provider's reason and what to change. The two lights in the status
bar show the result at a glance. **Copy result** copies the list (no key included) for a support message.
A key saved in the browser earlier that the provider refuses is dropped automatically in favour of the configured key.
