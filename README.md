# IntelliTwin

Real-time transportation intelligence and predictive simulation.

IntelliTwin is a static, browser-only traffic digital twin demonstrator for Abu Dhabi. There is no backend and no build step: open `index.html` or host the folder on any static server.

> **Synthetic data.** Every traffic value comes from an in-browser model with assumed demand profiles. Nothing is measured, and corridor alignments are schematic. This is not an official model of any UAE authority and must not be used for planning, operational or safety decisions.

## Features

- **Map:** 11 major corridors, coloured per direction by share of free-flow speed, with moving vehicle dots (one dot is about 45 vehicles).
- **Playback:** 24-hour timeline at 1 min/s, 10 min/s or 1 h/s, plus a Live mode that follows the viewer's clock.
- **Forecast:** view the network 15, 30 or 60 minutes ahead, with a 24-hour network speed chart.
- **What-if scenarios:** scale travel demand (70–140%), block half the lanes on a corridor, or apply rain/fog. KPIs show the change against a typical day.
- **Corridor ranking:** slowest first, with speed, delay and direction; tap to locate on the map.
- **Responsive:** works on desktop and phone.

## Run

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

To publish on GitHub Pages: Settings → Pages → deploy from the branch root.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Page layout |
| `css/styles.css` | Styling |
| `js/model.js` | Traffic model: corridors, demand profile, BPR volume-delay, network KPIs |
| `js/app.js` | Map, animation, panels, chart and controls |
| `vendor/` | MapLibre GL JS 4.7.1 (BSD-3-Clause), vendored so the app has no CDN dependency |

## Model

Each corridor direction gets a demand share by time of day (AM peak around 07:30, PM peak around 18:00, with a directional bias). Speed follows a BPR volume-delay curve: `speed = free_flow / (1 + 0.6 × (volume / capacity)^4)`. Scenarios change demand, capacity and free-flow speed. Capacities, loads and biases in `js/model.js` are assumptions to be replaced with real counts, signal plans and live feeds.

## Attribution

Base map tiles © OpenStreetMap contributors © CARTO, loaded at runtime. CARTO's hosted basemaps have their own usage terms; swap the tile URL in `js/app.js` for production or commercial use.
