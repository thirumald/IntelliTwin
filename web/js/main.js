import { h, $, api, post, store, startStore, onState, loadBrand, brand, applyBrand, lang, setLang, t, icon, hhmm, toast, reloadMeta } from "./core.js";
import { nav, incidentDrawer, violationDrawer } from "./details.js";

const PAGES = {
  overview: () => import("./pages/overview.js"), map: () => import("./pages/map.js"), congestion: () => import("./pages/congestion.js"),
  incidents: () => import("./pages/incidents.js"), violations: () => import("./pages/violations.js"), operations: () => import("./pages/operations.js"),
  enforcement: () => import("./pages/enforcement.js"), settings: () => import("./pages/settings.js"),
};
const NAV = [
  ["Command", null], ["Overview", "overview", "grid"], ["Live map", "map", "map"], ["Congestion", "congestion", "traffic"], ["Incidents", "incidents", "alert"], ["Violations & fines", "violations", "receipt"],
  ["Analytics", null], ["Operations", "operations", "shield"], ["Enforcement", "enforcement", "chart"], ["Admin", null], ["City & brand", "settings", "gear"],
];
let cleanup = null, current = null;

function buildTop() {
  const b = brand.cfg, top = $("#top");
  const citySel = h("select", { class: "sel", "aria-label": t("City"), onchange: async e => { await post("/demo/reset", { city: e.target.value }); await reloadMeta(); toast(t("Loaded city pack") + ": " + e.target.selectedOptions[0].text); buildTop(); route(true); } },
    store.meta.cities.map(c => h("option", { value: c.id, selected: c.id === store.meta.city.id }, lang.code === "ar" ? c.name_ar : c.name)));
  const clock = h("div", { class: "clock" }, h("b", { id: "clk", class: "tnum" }, "--:--"), h("small", { id: "clkd" }, ""));
  const speeds = h("div", { class: "seg", role: "group", "aria-label": t("Speed") }, [1, 10, 30, 60].map(x => h("button", { "data-x": x, onclick: async () => { await post("/demo/speed", { x }); markSpeed(x); } }, x + "×")));
  const playBtn = h("button", { class: "btn", id: "playbtn", onclick: async () => { const on = !store.state.playing; await post("/demo/play", { on }); } }, icon("pause"));
  const story = h("button", { class: "btn primary", id: "storybtn", onclick: async () => { const r = await post("/demo/storyline"); toast(r.state === "running" ? `${t("Storyline started")}: ${r.junction || ""}` : ""); } }, icon("bolt"), " ", t("Start storyline"));
  const reset = h("button", { class: "btn", title: t("Reset"), onclick: async () => { await post("/demo/reset", { city: store.meta.city.id }); toast(t("Demo reset")); route(true); } }, icon("refresh"));
  const langBtn = h("div", { class: "seg" }, ["en", "ar"].map(c => h("button", { class: lang.code === c ? "on" : "", onclick: () => { setLang(c); buildTop(); buildNav(); route(true); } }, c === "en" ? "EN" : "ع")));
  const brandSel = h("select", { class: "sel", "aria-label": t("Brand"), onchange: e => { applyBrand(brand.all.find(x => x.id === e.target.value)); buildTop(); buildNav(); } }, brand.all.map(x => h("option", { value: x.id, selected: x.id === b.id }, x.product)));
  top.replaceChildren(
    b.lockup
      ? h("div", { class: "logo lockup" }, h("img", { src: b.logo, alt: "Presight, a G42 company", class: "plogo" }), h("span", { class: "vr" }), h("b", { class: "prod" }, "Intelli", h("i", null, "Twin")))
      : h("div", { class: "logo" }, h("img", { src: "/brand/mark.svg", alt: "" }), h("div", { class: "t" }, h("b", null, b.product), h("small", null, b.byline))),
    citySel, h("span", { class: "chip" }, t("Simulated data")), h("span", { class: "spacer" }), clock, speeds, playBtn, story, reset, brandSel, langBtn);
  if (store.state) paintTop(store.state);
}
function markSpeed(x) { document.querySelectorAll(".seg button[data-x]").forEach(b => b.classList.toggle("on", Number(b.dataset.x) === Math.round(x))); }
function paintTop(s) {
  const c = $("#clk"); if (!c) return;
  c.textContent = s.now.slice(11, 16); $("#clkd").textContent = s.now.slice(0, 10);
  markSpeed(s.speed);
  const pb = $("#playbtn"); if (pb) pb.replaceChildren(icon(s.playing ? "pause" : "play"));
  const sb = $("#storybtn"); if (sb) sb.disabled = s.story === "running";
  const bad = document.querySelector(".badge-n"); if (bad) bad.textContent = s.incidents.length;
}

function buildNav() {
  const nv = $("#nav"); nv.replaceChildren();
  for (const [label, id, ic] of NAV) {
    if (!id) { nv.append(h("div", { class: "sep" }, t(label))); continue; }
    nv.append(h("a", { href: "#/" + id, "data-p": id, class: current === id ? "on" : "" }, icon(ic), h("span", { class: "lbl" }, t(label)), id === "incidents" ? h("span", { class: "badge-n" }, store.state ? store.state.incidents.length : 0) : null));
  }
  nv.append(h("div", { class: "foot" }, brand.cfg.footer));
}

async function route(force) {
  const [, p = "overview", arg] = location.hash.replace(/^#\/?/, "#/").split("/");
  const page = PAGES[p] ? p : "overview";
  const main = $("#main");
  if (!force && page === current && !arg) return;
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  current = page;
  document.querySelectorAll("nav.side a").forEach(a => a.classList.toggle("on", a.dataset.p === page));
  main.className = page === "map" ? "flush" : "";
  main.replaceChildren(h("div", { class: "empty" }, "…"));
  const mod = await PAGES[page]();
  main.replaceChildren();
  cleanup = await mod.render(main);
  if (arg && page === "incidents") incidentDrawer(arg);
  if (arg && page === "violations") violationDrawer(arg);
}

(async function boot() {
  setLang(lang.code);
  await loadBrand();
  await startStore();
  buildTop(); buildNav();
  onState(paintTop);
  window.addEventListener("hashchange", () => route());
  nav.go = h => { location.hash = h; };
  await route(true);
})();
