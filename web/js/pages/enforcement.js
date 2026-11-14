import { h, api, t, num, money, plate, VIOL_LABEL, store } from "../core.js";
import { barChart, chartCard, hbars, simpleTable } from "../charts.js";
import { kpi } from "./common.js";

export async function render(main) {
  const body = h("div"); let alive = true;
  main.append(h("h1", { class: "page" }, `${t("Enforcement")} · ${t("Revenue")}`), h("p", { class: "sub" }, t("Violations, fines, collection and repeat offenders (last 7 days)")), body);
  async function load() {
    let d; try { d = await api("/dashboards/enforcement"); } catch { return; }
    if (!alive) return;
    const k = d.kpis, L = VIOL_LABEL(), cur = d.currency, f = d.funnel, days = d.daily, hrs = [...Array(24).keys()].map(x => String(x).padStart(2, "0"));
    body.replaceChildren(
      h("div", { class: "kpis" }, kpi("Violations today", num(k.violations_today)), kpi("Fines issued", num(k.fines_value_today), cur), kpi("Collected", num(k.collected_today), cur), kpi("Collection rate", num(k.collection_rate, 0), "%"), kpi("Auto-approved", num(d.auto_rate, 0), "%", t("high-confidence, no human touch")), kpi("Review queue", k.review_backlog, null, `${t("median review")} ${d.review_sla_min ?? "–"} ${t("min")}`)),
      h("div", { class: "grid g2" },
        h("section", { class: "card" }, h("h3", null, t("Detection to fine")), hbars([["Detected", f.detected], ["Fine issued", f.issued], ["Paid", f.paid], ["Overdue", f.overdue], ["Appealed", f.appealed], ["In review", f.in_review], ["Rejected", f.rejected]].map(([l, v], i) => ({ label: t(l), value: v, color: i === 0 ? "var(--faint)" : i === 3 ? "var(--s2)" : "var(--s1)" })))),
        chartCard(t("Violations by type"), () => hbars(d.by_type.map(x => ({ label: L[x.type] || x.type, value: x.count, sub: money(x.value), color: "var(--s1)" }))), () => simpleTable([t("Type"), t("Violations"), t("Fines")], d.by_type.map(x => [L[x.type] || x.type, num(x.count), money(x.value)])))),
      h("div", { class: "grid g2", style: { marginTop: "14px" } },
        chartCard(t("Fines issued vs collected"), () => barChart([{ name: t("Issued"), color: "var(--s1)", data: days.map(x => x.issued_value) }, { name: t("Collected"), color: "var(--s3)", data: days.map(x => x.collected) }], days.map(x => x.label), { height: 210, yFmt: x => x >= 1000 ? Math.round(x / 1000) + "k" : x }), () => simpleTable([t("Day"), t("Issued"), t("Collected")], days.map(x => [x.label, money(x.issued_value), money(x.collected)]))),
        chartCard(t("Violations by hour"), () => barChart([{ name: t("Violations"), color: "var(--s2)", data: d.by_hour }], hrs, { height: 210 }), () => simpleTable([t("Hour"), t("Violations")], hrs.map((x, i) => [x, d.by_hour[i]])))),
      h("div", { class: "grid g2", style: { marginTop: "14px" } },
        h("section", { class: "card" }, h("h3", null, t("Repeat offenders")), h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Plate"), t("Vehicle"), t("Violations"), t("Fines"), t("Black points")].map((x, i) => h("th", { class: i > 1 ? "num" : "" }, x)))), h("tbody", null, d.repeat_offenders.map(r => h("tr", null, h("td", null, plate(r.plate)), h("td", { class: "muted" }, r.vehicle), h("td", { class: "num" }, r.count), h("td", { class: "num" }, money(r.value)), h("td", { class: "num" }, r.points)))))),
        h("section", { class: "card" }, h("h3", null, t("Top enforcement locations")), hbars(d.devices.map(x => ({ label: x.name, value: x.count, color: "var(--s7)", onclick: () => { store.focus = { lat: x.lat, lon: x.lon }; location.hash = "#/map"; } }))))),
      h("section", { class: "card", style: { marginTop: "14px" } }, h("h3", null, t("Fine schedule"), h("span", { class: "chip preview" }, "Illustrative")), h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Violation"), t("Fine"), t("Black points"), t("Impound")].map((x, i) => h("th", { class: i ? "num" : "" }, x)))),
        h("tbody", null, d.schedule.map(s => h("tr", null, h("td", null, L[s.id] || s.id), h("td", { class: "num" }, s.bands ? s.bands.map(b => `+${b.over}: ${num(b.amount)}`).join("  ·  ") : money(s.amount)), h("td", { class: "num" }, s.black_points ?? "–"), h("td", { class: "num" }, s.impound_days ? `${s.impound_days} ${t("days")}` : "–"))))), h("div", { class: "faint", style: { marginTop: "8px", fontSize: ".75rem" } }, d.disclaimer)));
  }
  load(); const timer = setInterval(load, 6000);
  return () => { alive = false; clearInterval(timer); };
}
