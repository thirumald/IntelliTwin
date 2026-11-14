import { h, api, post, t, store, brand, applyBrand, reloadMeta, toast, nameOf, lang, setLang } from "../core.js";

export async function render(main) {
  const m = store.meta, c = m.city;
  const cityCards = m.cities.map(x => h("div", { class: "cityc" + (x.id === c.id ? " on" : ""), onclick: async () => { await post("/demo/reset", { city: x.id }); await reloadMeta(); toast(`${t("Loaded city pack")}: ${x.name}`); location.reload(); } },
    h("div", { style: { fontSize: "1.15rem", fontWeight: 600 } }, lang.code === "ar" ? x.name_ar : x.name), h("div", { class: "muted" }, `${x.country} · ${x.currency}`), x.id === c.id ? h("span", { class: "pill ok", style: { marginTop: "8px" } }, h("i"), t("Active")) : null));
  const brandCards = brand.all.map(b => h("div", { class: "cityc" + (b.id === brand.cfg.id ? " on" : ""), onclick: () => { applyBrand(b); location.reload(); } },
    h("div", { class: "row" }, h("span", { style: { width: "14px", height: "14px", borderRadius: "50%", background: b.accent, display: "inline-block" } }), h("b", null, b.product)), h("div", { class: "muted" }, b.byline), h("div", { class: "faint", style: { fontSize: ".75rem", marginTop: "4px" } }, b.footer)));
  main.append(h("h1", { class: "page" }, t("City & brand")), h("p", { class: "sub" }, t("One product, any city, any customer brand")),
    h("section", { class: "card" }, h("h3", null, t("Plug-and-play cities")), h("div", { class: "cities" }, cityCards),
      h("div", { class: "muted", style: { margin: "14px 0 6px" } }, t("A city pack is a folder: road network from OpenStreetMap, districts, speed limits, fine schedule, currency and plate format. Adding a city takes three steps:")),
      h("pre", { class: "code" }, `1. cities/<id>/city.json      # bbox, districts, fines, currency, weekend, plate format\n2. tools/build_city.py <id>   # fetches OpenStreetMap roads, builds the network and enforcement points\n3. restart                    # the city appears in the selector, nothing else changes`)),
    h("section", { class: "card", style: { marginTop: "14px" } }, h("h3", null, t("White-label")), h("div", { class: "cities" }, brandCards), h("div", { class: "muted", style: { marginTop: "10px" } }, t("Name, logo, colours, language, currency and fine schedule are configuration. Presight branding is the default."))),
    h("section", { class: "card", style: { marginTop: "14px" } }, h("h3", null, t("About this demo")), h("dl", { class: "kv" }, h("dt", null, t("Data")), h("dd", null, t("Simulated traffic, incidents and violations on real road geometry (OpenStreetMap). No real people or vehicles.")), h("dt", null, t("Segments")), h("dd", null, `${m.n_segments} ${t("road segments")}, ${m.n_devices} ${t("enforcement devices")}`), h("dt", null, t("Forecast")), h("dd", null, t("Preview: weekly profile plus persistence. Not a validated model.")), h("dt", null, t("Version")), h("dd", null, m.version))));
  return () => {};
}
