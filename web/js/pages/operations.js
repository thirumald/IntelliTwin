import { h, api, t, num, hhmm, ymdhm, dur, pill, SEV, store } from "../core.js";
import { barChart, chartCard, hbars, simpleTable } from "../charts.js";
import { kpi } from "./common.js";
import { incidentDrawer } from "../details.js";

export async function render(main) {
  const body = h("div"); let alive = true;
  main.append(h("h1", { class: "page" }, `${t("Traffic police")} · ${t("Operations")}`), h("p", { class: "sub" }, t("Incident response performance, black spots and workload")), body);
  async function load() {
    let d; try { d = await api("/dashboards/police"); } catch { return; }
    if (!alive) return;
    const k = d.kpis, hrs = [...Array(24).keys()].map(x => String(x).padStart(2, "0"));
    body.replaceChildren(
      h("div", { class: "kpis" }, kpi("Active incidents", k.active_incidents, null, `${k.critical_incidents} ${t("major/critical")}`, k.critical_incidents ? "bad" : ""), kpi("Incidents", k.incidents_today, null, t("today")), kpi("Avg response", d.response_by_severity[2] ?? k.avg_response_min ?? "–", t("min"), t("major incidents")), kpi("Avg clearance", d.avg_clearance_min ?? "–", t("min"))),
      h("div", { class: "grid g21" },
        h("section", { class: "card" }, h("h3", null, t("Active incidents")), d.active.length ? h("table", { class: "t" }, h("tbody", null, d.active.map(i => h("tr", { class: "click", onclick: () => incidentDrawer(i.id) }, h("td", null, h("b", null, i.label), h("div", { class: "muted" }, `${i.street} · ${i.district_name}`)), h("td", null, h("span", { class: "pill " + SEV[i.severity][1] }, h("i"), t(SEV[i.severity][0]))), h("td", null, pill(i.status)), h("td", { class: "num muted" }, dur(i.age_min)))))) : h("div", { class: "empty" }, t("No active incidents"))),
        h("section", { class: "card" }, h("h3", null, t("Average response by severity")), hbars([1, 2, 3].map(s => ({ label: t(SEV[s][0]), value: d.response_by_severity[s] || 0, color: "var(--s1)" })), { fmt: x => x ? `${num(x, 1)} ${t("min")}` : "–" }), h("h3", { style: { marginTop: "16px" } }, t("Incidents by type")), hbars(d.by_type.slice(0, 6).map(x => ({ label: document.documentElement.lang === "ar" ? x.label_ar : x.label, value: x.count, color: "var(--s2)" })), {}))),
      h("div", { class: "grid g2", style: { marginTop: "14px" } },
        h("section", { class: "card" }, h("h3", null, t("Collision black spots")), h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Street"), t("District"), t("Collisions"), t("Severe")].map((x, i) => h("th", { class: i > 1 ? "num" : "" }, x)))), h("tbody", null, d.black_spots.map(b => h("tr", { class: "click", onclick: () => { store.focus = { lat: b.lat, lon: b.lon }; location.hash = "#/map"; } }, h("td", null, b.street), h("td", { class: "muted" }, b.district_name), h("td", { class: "num" }, b.collisions), h("td", { class: "num" }, b.severe)))))),
        chartCard(t("Incidents by hour"), () => barChart([{ name: t("Incidents"), color: "var(--s2)", data: d.by_hour }], hrs, { height: 210 }), () => simpleTable([t("Hour"), t("Incidents")], hrs.map((x, i) => [x, d.by_hour[i]])))));
  }
  load(); const timer = setInterval(load, 5000);
  return () => { alive = false; clearInterval(timer); };
}
