# Google Maps base map

IntelliTwin can draw Google Maps as its background instead of the OpenStreetMap base map.

**What changes and what does not.** Only the picture under the twin changes. The road network, traffic, signals, sites and stations of the twin still come from OpenStreetMap: Google does not license its road geometry for this kind of use, and the simulation is built on the OpenStreetMap network. The two line up because both are georeferenced.

| Option | What it shows |
| --- | --- |
| Google Maps, road map | Google road map; a dark style in the dark theme, the standard style in the light theme |
| Google Maps, satellite | Satellite imagery |
| Google Maps, satellite with roads | Satellite imagery with road names |
| Google 3D buildings and terrain | Google's photorealistic 3D tiles: textured 3D buildings and terrain. Experimental |
| OpenStreetMap | The previous base map (OpenFreeMap vector tiles, with 3D building blocks) |

## Setting the key

Use **Reports**, **Base map**: paste the key and press **Save**; or open the site once with `?gmaps=YOUR_KEY` at the end of the address. The key is kept in that browser only and is **not stored in the repository**.

The key needs the **Map Tiles API** enabled in the Google Cloud project (this is a different product from the Maps JavaScript API). If the key is refused, the app says so and shows OpenStreetMap instead.

### Why the key is not in `config.js`

This site and its repository are public. A key written into `config.js` can be read and used by anyone, stays in the repository history, and Google Maps usage is billed to the key's owner. `map.google.key` exists for deployments where that is acceptable: first restrict the key in the Google Cloud console to this site's address (HTTP referrer) and to the Map Tiles API, and set a quota.

## 3D tiles

The 3D option draws Google's photorealistic 3D tiles with deck.gl. Points to know:

- The 3D mesh uses heights above the ellipsoid, while the twin draws roads and vehicles at zero height. `map.google.heightOffsetM` (28 by default) lifts the mesh to meet them. If roads float above the ground or sink into it, adjust this value.
- 3D tiles are heavier to draw and to download than the 2D map, and are billed separately by Google.
- Coverage depends on Google; where there is none, the app reports that the tiles could not be loaded.

## Attribution

Google's terms require its attribution on the map. The app shows "Google Maps" with the copyright line Google returns for the area in view, and the data credits of the 3D tiles.

## Tested how

The integration was tested with simulated Google responses, not with live calls, because the build environment cannot reach Google. Check the road map, satellite and 3D options once with the real key.
