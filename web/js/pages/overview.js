import { h, api, store, onState, t, num, money, hhmm, pill, SEV, nameOf, LOS_COL, LOS } from "../core.js";
import { lineChart, barChart, chartCard, simpleTable, hbars, C } from "../charts.js";
import { kpi, arrow, forecastPanel } from "./common.js";
import { incidentDrawer } from "../details.js";

export async function render(main) {
  const cityName = nameOf(store.meta.city);
  const kp = h("div", { class: "kpis" }), top = h("div", { class: "grid g21" }), mid = h("div", { class: "grid g2", style: { marginTop: "14px" } }), bot = h("div", { class: "grid g2", style: { marginTop: "14px" } });
  main.append(h("h1", { class: "page" }, `${cityName} · ${t("Executive")}`), h("p", { class: "sub" }, t("City traffic health, safety and enforcement at a glance")), kp, top, mid, bot);
  const fp = forecastPanel({ height: 200, compact: false, rows: 4 });
  let alive = true;
  function paintKpi(s) {
    const k = s.kpis, cur = k.currency;
    kp.replaceChildren(
      kpi("Network health", num(k.health, 0), "/100", h("span", null, arrow(k.health_vs_typical), " ", t("vs typical")), k.health < 60 ? "bad" : k.health < 75 ? "warn" : ""),
      kpi("Avg speed", num(k.avg_speed, 0), t("km/h"), `${num(k.congested_km, 1)} km ${t("congested")} (${num(k.congested_pct, 0)}%)`),
      kpi("Delay", num(k.delay_vh), "veh·h", t("lost per hour")),
      kpi("Active incidents", k.active_incidents, null, `${k.critical_incidents} ${t("major/critical")} · ${t("avg response")} ${k.avg_response_min ?? "–"} ${t("min")}`, k.critical_incidents ? "bad" : ""),
      kpi("Violations today", num(k.violations_today), null, `${k.fines_issued_today} ${t("fines issued")}`),
      kpi("Fines issued", num(k.fines_value_today), cur, `${t("Collected")} ${num(k.collected_today)} ${cur}`),
      kpi("Collection rate", num(k.collection_rate, 0), "%", `${k.review_backlog} ${t("awaiting review")}`));
  }
  const off = onState(paintKpi);
  async function load() {
    let d; try { d = await api("/dashboards/executive"); } catch { return; }
    if (!alive) return;
    const s = d.series, lab = s.map(p => hhmm(p.ts));
    top.replaceChildren(
      chartCard(t("Network speed vs typical"), () => lineChart([{ name: t("Today"), color: "var(--s1)", data: s.map(p => p.ratio), fmt: x => num(x, 0) + "%" }, { name: t("Typical"), color: "var(--faint)", dash: true, data: s.map(p => p.typical), fmt: x => num(x, 0) + "%" }], lab, { height: 400, yMin: 0, yMax: 100, xEvery: 24, nowIndex: s.reduce((a, p, i) => p.ratio != null ? i : a, 0), unit: "%", aria: "Network speed index today against typical" }),
        () => simpleTable([t("Time"), t("Today"), t("Typical"), t("Congested")], s.filter((p, i) => i % 12 === 0 && p.ratio != null).map(p => [hhmm(p.ts), num(p.ratio, 0) + "%", num(p.typical, 0) + "%", num(p.congested_pct, 0) + "%"]))),
      h("section", { class: "card" }, h("h3", null, t("Forecast"), h("span", { class: "chip preview" }, t("Preview"))), fp.el));
    mid.replaceChildren(
      h("section", { class: "card" }, h("h3", null, t("Most congested corridors")), h("div", { class: "scroll", style: { maxHeight: "300px" } }, h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Corridor"), t("km/h"), "LOS", t("Delay")].map((x, i) => h("th", { class: i ? "num" : "" }, x)))),
        h("tbody", null, d.corridors.map(c => h("tr", null, h("td", null, c.name), h("td", { class: "num" }, num(c.speed, 0)), h("td", { class: "num" }, h("span", { class: "pill", style: { color: LOS_COL[LOS.indexOf(c.los)], borderColor: LOS_COL[LOS.indexOf(c.los)] } }, c.los)), h("td", { class: "num" }, num(c.delay_vh)))))))),
      h("section", { class: "card" }, h("h3", null, t("Active incidents")), d.kpis.active_incidents === 0 ? h("div", { class: "empty" }, t("No active incidents")) : h("div", { class: "scroll", style: { maxHeight: "300px" } }, h("table", { class: "t" }, h("tbody", null, store.state.incidents.map(i => h("tr", { class: "click", onclick: () => incidentDrawer(i.id) }, h("td", null, h("b", null, i.label), h("div", { class: "muted" }, `${i.street} · ${i.district_name}`)), h("td", null, pill(i.status)), h("td", { class: "num muted" }, `${num(i.age_min, 0)} ${t("min")}`))))))));
    const days = d.daily;
    bot.replaceChildren(
      chartCard(t("Daily violations"), () => barChart([{ name: t("Violations"), color: "var(--s1)", data: days.map(x => x.violations) }], days.map(x => x.label), { height: 200 }), () => simpleTable([t("Day"), t("Violations"), t("Incidents")], days.map(x => [x.label, num(x.violations), x.incidents]))),
      chartCard(t("Fines issued vs collected"), () => barChart([{ name: t("Issued"), color: "var(--s1)", data: days.map(x => x.issued_value) }, { name: t("Collected"), color: "var(--s3)", data: days.map(x => x.collected) }], days.map(x => x.label), { height: 200, yFmt: x => x >= 1000 ? Math.round(x / 1000) + "k" : x }), () => simpleTable([t("Day"), t("Issued"), t("Collected")], days.map(x => [x.label, money(x.issued_value), money(x.collected)]))));
  }
  load(); const timer = setInterval(load, 6000);
  return () => { alive = false; clearInterval(timer); off(); fp.stop(); };
}
