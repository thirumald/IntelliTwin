# Base map

> **Current base map.** IntelliTwin now uses a MapLibre vector map with 3D buildings, built the way the MapLibre
> example [Display buildings in 3D](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/) does it:
> the building layer of the vector tiles is extruded to its height, coloured by height, grown in as the map zooms in and
> placed under the labels. Tiles and styles come from OpenFreeMap (OpenStreetMap data). Settings: `map.styleUrl`,
> `map.styleUrlLight`, `map.buildings3d`, `map.buildingsMinZoom`, `map.buildingColors` in `config.js`.
>
> Google Maps and the raster OpenStreetMap tiles are no longer used. If the vector map cannot be loaded the twin's
> layers are drawn on a plain background and buildings come from the footprint file.
>
> The 2D / 3D / City view switch stays: City view is a closer, steeper look at the same 3D buildings.
>
> The rest of this page describes the optional Google Maps connection, which is off (`map.google.enabled: false`).

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

In this deployment the key is set in `config.js` (`map.google.key`) by the owner's decision, so Google Maps is the base map for every visitor. A different key can be set per browser in **Reports**, **Base map** (paste and **Save**), or by opening the site once with `?gmaps=YOUR_KEY`; it takes the place of the configured key in that browser.

The key needs the **Map Tiles API** enabled in the Google Cloud project (this is a different product from the Maps JavaScript API). If the key is refused, the app says so and shows OpenStreetMap instead.

### A key in `config.js` is public

This site and its repository are public. The key in `config.js` can be read and used by anyone, stays in the repository history, and Google Maps usage is billed to the key's owner. Restrict the key in the Google Cloud console to this site's address (HTTP referrer) and to the Map Tiles API, and set a quota. If it is misused, regenerate it and update `config.js`, or set `map.google.key` to `null` and use a per-browser key.

## Map view switch

The time bar has a **2D / 3D / City view** switch.

| View | What it is |
| --- | --- |
| 2D | Flat map from above |
| 3D | Tilted map with the twin's 3D vehicles and building blocks (the default) |
| City view | Google's photorealistic 3D tiles, tilted further. Needs the Google key; experimental |

## 3D tiles

The 3D option draws Google's photorealistic 3D tiles with deck.gl. Points to know:

- The 3D mesh uses real heights, while the twin draws roads and vehicles flat at zero height. `map.google.heightOffsetM` (27 by default) and `regions[].heightOffsetM` shift the mesh to meet them. This works on flat coastal areas; on sloping or inland ground (Al Ain, the hills of Ras Al Khaimah and Fujairah, inland Dubai) roads will float above or sink into the 3D ground. For that reason the 3D option is off by default.
- 3D tiles are heavier to draw and to download than the 2D map, and are billed separately by Google.
- Coverage depends on Google; where there is none, the app reports that the tiles could not be loaded.

## Attribution

Google's terms require its attribution on the map. The app shows "Google Maps" with the copyright line Google returns for the area in view, and the data credits of the 3D tiles.

## Tested how

The integration was tested with simulated Google responses, not with live calls, because the build environment cannot reach Google. Check the road map, satellite and 3D options once with the real key.

## If Google Maps does not appear

When Google refuses to open a map session the app shows OpenStreetMap and a notification with Google's own reason.
The usual causes: the **Map Tiles API** is not enabled for the key's project, billing is not active on the project,
or the key's website restriction does not include the site address. The same message is under Reports, Base map.
