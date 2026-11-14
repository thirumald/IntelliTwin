import { h, api, t, num, hhmm, ymdhm, dur, pill, SEV, store } from "../core.js";
import { incidentDrawer } from "../details.js";
import { kpi } from "./common.js";

export async function render(main) {
  let filter = "active", alive = true;
  const kp = h("div", { class: "kpis" }), tbl = h("div");
  const seg = h("div", { class: "seg" }, [["active", "Active"], ["all", "All"]].map(([k, l]) => h("button", { class: k === filter ? "on" : "", "data-k": k, onclick: () => { filter = k; seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.k === k)); load(); } }, t(l))));
  main.append(h("h1", { class: "page" }, t("Incidents")), h("p", { class: "sub" }, t("Detection, verification, dispatch and clearance of every road incident")), kp, h("div", { class: "row", style: { marginBottom: "10px" } }, seg), h("section", { class: "card" }, tbl));
  async function load() {
    let xs; try { xs = await api(`/incidents?${filter === "active" ? "active=true" : ""}&limit=120`); } catch { return; }
    if (!alive) return;
    const act = xs.filter(i => i.status !== "cleared");
    kp.replaceChildren(kpi("Active incidents", act.length), kpi("Major/critical", act.filter(i => i.severity >= 2).length, null, null, act.some(i => i.severity >= 2) ? "bad" : ""), kpi("Avg response", (() => { const r = xs.filter(i => i.response_min != null).map(i => i.response_min); return r.length ? num(r.reduce((a, b) => a + b, 0) / r.length, 1) : "–"; })(), t("min")), kpi("Traffic impact", num(xs.reduce((a, i) => a + i.impact_vh, 0), 0), t("Vehicle-hours")));
    tbl.replaceChildren(xs.length ? h("div", { class: "scroll", style: { maxHeight: "none" } }, h("table", { class: "t" }, h("thead", null, h("tr", null, ["ID", t("Type"), t("Severity"), t("Status"), t("Street"), t("District"), t("Detected"), t("Response time"), t("Impact")].map(x => h("th", null, x)))),
      h("tbody", null, xs.map(i => h("tr", { class: "click", onclick: () => incidentDrawer(i.id) }, h("td", { class: "tnum muted" }, i.id), h("td", null, h("b", null, i.label), i.linked_violations.length ? h("span", { class: "pill warn", style: { marginInlineStart: "8px" } }, h("i"), t("Linked violation")) : null), h("td", null, h("span", { class: "pill " + SEV[i.severity][1] }, h("i"), t(SEV[i.severity][0]))), h("td", null, pill(i.status)), h("td", null, i.street), h("td", { class: "muted" }, i.district_name), h("td", { class: "tnum" }, ymdhm(i.detected)), h("td", { class: "tnum" }, dur(i.response_min)), h("td", { class: "tnum" }, `${num(i.impact_vh, 0)} vh`)))))) : h("div", { class: "empty" }, t("No incidents")));
  }
  load(); const timer = setInterval(load, 3000);
  return () => { alive = false; clearInterval(timer); };
}
