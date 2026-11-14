import { h, api, store, onState, t, hhmm, hhmmss, num, rampColor, RAMP, pill, SEV, brand, lang } from "../core.js";
import { incidentDrawer } from "../details.js";
import { forecastPanel, losLegend } from "./common.js";

const KIND_COL = { red_light: "#d95926", speed: "#3987e5", ai_cabin: "#9085e9", parking: "#c98500", wrong_way: "#d55181" };

export async function render(main) {
  const meta = store.meta, city = meta.city;
  main.append(h("div", { id: "map" }));
  if (!store.roads || store.roadsCity !== city.id) { store.roads = await api("/roads"); store.roadsCity = city.id; }
  const map = new maplibregl.Map({
    container: "map", center: city.center, zoom: city.zoom, attributionControl: { compact: true }, pitchWithRotate: false,
    style: { version: 8, sources: { base: { type: "raster", tiles: [meta.tiles || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a1424" } }, { id: "base", type: "raster", source: "base", paint: { "raster-brightness-max": 0.34, "raster-brightness-min": 0.0, "raster-saturation": -0.9, "raster-contrast": 0.25 } }] },
  });
  map.jumpTo({ center: city.center, zoom: city.zoom, padding: { right: lang.code === 'ar' ? 0 : 400, left: lang.code === 'ar' ? 400 : 0 } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), lang.code === "ar" ? "top-left" : "bottom-right");
  const stops = RAMP.flatMap(([r, c]) => [r, c]);
  let ready = false, mode = 0, forecastRatios = null, last = [], markers = new Map(), showDev = true;
  map.on("load", () => {
    map.addSource("roads", { type: "geojson", data: store.roads.roads, promoteId: "id" });
    map.addSource("devices", { type: "geojson", data: store.roads.devices });
    map.addLayer({ id: "casing", type: "line", source: "roads", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#050b16", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, ["match", ["get", "cls"], "motorway", 11, "trunk", 10, 8], 17, 22] } });
    map.addLayer({ id: "roads", type: "line", source: "roads", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["interpolate", ["linear"], ["coalesce", ["feature-state", "r"], 1], ...stops], "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.2, 14, ["match", ["get", "cls"], "motorway", 6, "trunk", 5.5, 4], 17, 13] } });
    map.addLayer({ id: "devices", type: "circle", source: "devices", minzoom: 11, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 7], "circle-color": ["match", ["get", "kind"], ...Object.entries(KIND_COL).flat(), "#fff"], "circle-stroke-color": "#0a1424", "circle-stroke-width": 1.5 } });
    map.on("click", "devices", e => new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setHTML(`<div style="color:#0a1424"><b>${e.features[0].properties.name}</b><br>${e.features[0].properties.kind.replace("_", " ")} · ${e.features[0].properties.id}</div>`).addTo(map));
    map.on("click", "roads", e => { const p = e.features[0].properties; const r = store.state.ratios[p.id] / 100; new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setHTML(`<div style="color:#0a1424"><b>${p.name}</b><br>${num(p.limit * 0.97 * r, 0)} / ${p.limit} km/h</div>`).addTo(map); });
    map.on("mouseenter", "roads", () => map.getCanvas().style.cursor = "pointer"); map.on("mouseleave", "roads", () => map.getCanvas().style.cursor = "");
    ready = true; paint(store.state);
    if (store.focus) { map.flyTo({ center: [store.focus.lon, store.focus.lat], zoom: 15.2, duration: 900 }); store.focus = null; }
  });
  function paint(s) {
    if (!ready || !s) return;
    const arr = mode === 0 || !forecastRatios ? s.ratios : forecastRatios;
    for (let i = 0; i < arr.length; i++) if (last[i] !== arr[i]) { map.setFeatureState({ source: "roads", id: i }, { r: arr[i] / 100 }); last[i] = arr[i]; }
    // incident markers
    const ids = new Set(s.incidents.map(i => i.id));
    for (const [id, m] of markers) if (!ids.has(id)) { m.remove(); markers.delete(id); }
    for (const i of s.incidents) {
      if (markers.has(i.id)) continue;
      const col = i.severity >= 3 ? "#d03b3b" : i.severity === 2 ? "#ec835a" : "#fab219";
      const el = h("div", { class: "mk", title: i.label, style: { "--c": col }, onclick: () => incidentDrawer(i.id) }, h("span"));
      markers.set(i.id, new maplibregl.Marker({ element: el }).setLngLat([i.lon, i.lat]).addTo(map));
    }
    if (feedEl) paintFeed(s); if (incEl) paintInc(s);
    modeNote.style.display = mode ? "inline-flex" : "none";
  }
  // ---- top controls (Now / forecast layers)
  const modeNote = h("span", { class: "chip preview", style: { display: "none", alignItems: "center" } }, t("Forecast"), " · ", t("Preview"));
  const modes = [[0, t("Now")], [15, "+15"], [30, "+30"], [60, "+60"]];
  async function setMode(m) {
    mode = m; seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", Number(b.dataset.m) === m));
    if (m) { forecastRatios = (await api("/forecast/map?minutes=" + m)).ratios; }
    paint(store.state);
  }
  const seg = h("div", { class: "seg", style: { background: "#0f1d33ee" } }, modes.map(([m, l]) => h("button", { "data-m": m, class: m === 0 ? "on" : "", onclick: () => setMode(m) }, l + (m ? " " + t("min") : ""))));
  const devBtn = h("button", { class: "btn sm on", style: { background: "#0f1d33ee" }, onclick: () => { showDev = !showDev; map.setLayoutProperty("devices", "visibility", showDev ? "visible" : "none"); } }, t("Cameras"));
  main.append(h("div", { class: "map-top" }, seg, modeNote, devBtn));
  main.append(h("div", { class: "map-legend" }, h("div", { class: "row", style: { gap: "8px" } }, h("b", null, t("Speed vs free flow")), losLegend()), h("div", { class: "bar" }), h("div", { class: "lab" }, h("span", null, t("Gridlock")), h("span", null, t("Free flow")))));
  // ---- right panel
  const body = h("div", { class: "body" });
  let tab = "alerts", feedEl = null, incEl = null, fp = null;
  const tabs = h("div", { class: "tabs" }, [["alerts", "Alerts"], ["incidents", "Incidents"], ["forecast", "Forecast"]].map(([k, l]) => h("button", { "data-k": k, class: k === tab ? "on" : "", onclick: () => setTab(k) }, t(l))));
  function setTab(k) {
    tab = k; tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.k === k));
    if (fp) { fp.stop(); fp = null; } feedEl = incEl = null; body.replaceChildren();
    if (k === "alerts") { feedEl = h("div"); body.append(feedEl); paintFeed(store.state); }
    if (k === "incidents") { incEl = h("div"); body.append(incEl); paintInc(store.state); }
    if (k === "forecast") { body.append(h("div", { class: "row", style: { marginBottom: "6px" } }, h("span", { class: "chip preview" }, t("Preview")), h("span", { class: "muted" }, t("Congestion forecast, next 60 min"))), (fp = forecastPanel({ height: 170, rows: 6 })).el); }
  }
  function paintFeed(s) {
    if (!feedEl) return;
    feedEl.replaceChildren(...s.feed.map(f => h("div", { class: "feed-item " + f.level + (f.ref && f.kind === "incident" ? " click" : ""), onclick: f.ref && f.kind === "incident" ? () => incidentDrawer(f.ref) : null }, h("span", { class: "tm" }, hhmm(f.ts)), h("span", { class: "tx" }, f.text))));
    if (!s.feed.length) feedEl.replaceChildren(h("div", { class: "empty" }, "No alerts"));
  }
  function paintInc(s) {
    if (!incEl) return;
    incEl.replaceChildren(...(s.incidents.length ? s.incidents.map(i => h("div", { class: "feed-item click", onclick: () => incidentDrawer(i.id) },
      h("span", { class: "tm" }, hhmm(i.detected)), h("div", { style: { flex: 1 } }, h("div", null, h("b", null, i.label), " ", pill(i.status)), h("div", { class: "muted" }, `${i.street} · ${i.district_name}`), h("div", { class: "faint" }, `${t("Severity")} ${i.severity} · ${num(i.age_min, 0)} ${t("min")}`)))) : [h("div", { class: "empty" }, "No active incidents")]));
  }
  main.append(h("aside", { class: "map-panel" }, tabs, body));
  setTab("alerts");
  const off = onState(paint);
  return () => { off(); if (fp) fp.stop(); markers.forEach(m => m.remove()); map.remove(); };
}
