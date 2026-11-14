import { h, $, api, post, send, session, can, modal, store, startStore, onState, loadBrand, brand, applyBrand, lang, setLang, t, icon, hhmm, toast, reloadMeta } from "./core.js";
import { nav, incidentDrawer, violationDrawer } from "./details.js";

const PAGES = {
  overview: () => import("./pages/overview.js"), map: () => import("./pages/map.js"), congestion: () => import("./pages/congestion.js"),
  incidents: () => import("./pages/incidents.js"), violations: () => import("./pages/violations.js"), operations: () => import("./pages/operations.js"),
  enforcement: () => import("./pages/enforcement.js"), settings: () => import("./pages/settings.js"),
  users: () => import("./pages/admin.js").then(m => ({ render: m.renderUsers })), audit: () => import("./pages/admin.js").then(m => ({ render: m.renderAudit })),
};
const NAV = [
  ["Command", null], ["Overview", "overview", "grid"], ["Live map", "map", "map"], ["Congestion", "congestion", "traffic"], ["Incidents", "incidents", "alert"], ["Violations & fines", "violations", "receipt"],
  ["Analytics", null], ["Operations", "operations", "shield"], ["Enforcement", "enforcement", "chart"], ["Admin", null], ["City & brand", "settings", "gear"], ["Users", "users", "users", "admin"], ["Audit log", "audit", "receipt", "admin"],
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
    citySel, h("span", { class: "chip" }, t("Simulated data")), h("span", { class: "spacer" }), clock, speeds, playBtn, story, reset, brandSel, langBtn, ...[userMenu()].filter(Boolean));
  if (!can("operator")) top.querySelectorAll("#playbtn,#storybtn,.btn[title]").forEach(b => { b.disabled = true; b.title = t("Read-only role"); });
  if (store.state) paintTop(store.state);
}
function userMenu() {
  const u = session.user;
  if (!u || u.username === "demo") return null;
  return h("div", { class: "usr" }, h("button", { class: "btn", "aria-haspopup": "menu", onclick: e => { const m = e.currentTarget.nextSibling; m.hidden = !m.hidden; } }, icon("user"), " ", u.name),
    h("div", { class: "menu", hidden: true }, h("div", { class: "who" }, h("b", null, u.name), h("small", null, `${u.username} · ${u.role}`)),
      h("button", { onclick: () => passwordDialog(false) }, t("Change password")),
      h("button", { onclick: async () => { try { await send("POST", "/auth/logout"); } finally { location.replace("/login.html"); } } }, t("Sign out"))));
}
export function passwordDialog(forced, after) {
  const cur = h("input", { type: "password", autocomplete: "current-password" }), nw = h("input", { type: "password", autocomplete: "new-password" }), nw2 = h("input", { type: "password", autocomplete: "new-password" }), err = h("div", { class: "ferr" });
  const m = modal(forced ? t("Set a new password") : t("Change password"), [forced ? h("p", { class: "muted" }, t("You must set your own password before continuing.")) : null,
    h("label", null, t("Current password"), cur), h("label", null, t("New password (min 10 characters)"), nw), h("label", null, t("Repeat new password"), nw2), err],
    async () => {
      if (nw.value !== nw2.value) { err.textContent = t("Passwords do not match"); return false; }
      try { await send("POST", "/auth/password", { current: cur.value, new: nw.value }); session.user.must_change = false; toast(t("Password changed")); if (after) after(); return true; } catch (e) { err.textContent = e.message; return false; }
    }, !forced);
  cur.focus(); return m;
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
  for (const [label, id, ic, need] of NAV) {
    if (need && !can(need)) continue;
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

window.addEventListener("unhandledrejection", e => { const r = e.reason; if (r && r.status && r.status !== 401) { toast(r.message); e.preventDefault(); } });
document.addEventListener("click", e => { if (!e.target.closest(".usr")) document.querySelectorAll(".usr .menu").forEach(m => m.hidden = true); });

(async function boot() {
  const me = await api("/auth/me");
  session.user = me.user;
  setLang(lang.code);
  if (session.user.must_change) {  // every other API call is refused until the password is changed
    await loadBrand(); document.body.append(h("div", { class: "empty", style: { padding: "40px" } }, t("Set your password to continue")));
    passwordDialog(true, () => location.reload()); return;
  }
  await loadBrand();
  await startStore();
  buildTop(); buildNav();
  onState(paintTop);
  window.addEventListener("hashchange", () => route());
  nav.go = h => { location.hash = h; };
  await route(true);
})();
