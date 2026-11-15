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

The key is **not stored in the repository**. Each browser keeps its own copy:

- In the app: **Reports**, **TomTom live data**, paste the key, **Save**; or
- Open the site once with `?tomtom=YOUR_KEY` at the end of the address. The key is saved in that browser and removed from the address bar.

**Remove** deletes it from the browser.

### Why it is not in `config.js`

This site and its repository are public. A key written into `config.js` can be read and used by anyone, and it stays in the repository history even after it is removed. `tomtom.key` exists for deployments where that is acceptable; before using it, restrict the key to the site's address in the TomTom developer dashboard and set a daily request limit.

## Settings

`tomtom` in `config.js`: `flowStyle` (`relative0` shows speed against free flow), `flowThickness`, `flowOnStart` (switch the live layer on at start), `incidentRefreshSec` (120), `searchRadiusM` (15,000) and `maxSites` (20 live-speed lookups per press).

## Notes

- Requests count against the key's daily quota. Live incidents refresh every two minutes while the page is visible; the other features run only when their button is pressed.
- Results are shown live and are not saved, in line with TomTom's terms for search results.
- Some services depend on the plan of the key. If a feature returns "The key was refused (403)", that product is not enabled for the key.
- The integration was tested with simulated TomTom responses, not with live calls, because the build environment cannot reach TomTom. Check each feature once with the real key.
