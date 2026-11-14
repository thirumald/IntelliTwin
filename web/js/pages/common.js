import { h, api, t, num, hhmm, store, LOS, LOS_COL, nameOf } from "../core.js";
import { lineChart, C } from "../charts.js";

export function kpi(label, value, unit, delta, cls) {
  return h("div", { class: "kpi " + (cls || "") }, h("div", { class: "l" }, t(label)), h("div", { class: "v tnum" }, value, unit ? h("small", null, unit) : null), delta != null ? h("div", { class: "d" }, delta) : null);
}
export const arrow = (v, goodWhenUp = true) => { if (!v) return "–"; const up = v > 0; return h("span", { class: (up === goodWhenUp) ? "up" : "down" }, `${up ? "▲" : "▼"} ${num(Math.abs(v), 1)}`); };
export function losLegend() { return h("span", { class: "los", title: "Level of service A (free flow) to F (gridlock)" }, LOS.map((l, i) => h("span", { style: { background: LOS_COL[i] } }, l))); }

/** Forecast panel (Preview): network speed for the next 60 min with a range, plus corridors at risk. */
export function forecastPanel(opts = {}) {
  const root = h("div");
  let alive = true, timer;
  async function update() {
    let f; try { f = await api("/forecast"); } catch { return; }
    if (!alive) return;
    const labels = f.points.map(p => hhmm(p.ts));
    const chart = lineChart([
      { name: t("Predicted") + " (" + t("km/h") + ")", color: "var(--s1)", data: f.points.map(p => p.speed), fmt: x => num(x, 1) + " " + t("km/h"), dash: false },
      { name: t("typical"), color: "var(--faint)", data: f.points.map(p => p.typical / 100 * (f.points[0].speed / (f.points[0].ratio / 100))), dash: true, fmt: x => num(x, 1) + " " + t("km/h") },
    ], labels, { height: opts.height || 190, band: { lo: f.points.map(p => p.lo / 100 * (f.points[0].speed / (f.points[0].ratio / 100))), hi: f.points.map(p => p.hi / 100 * (f.points[0].speed / (f.points[0].ratio / 100))), name: "Range (80%)" }, nowIndex: 0, yMin: Math.max(0, Math.floor(Math.min(...f.points.map(p => p.lo / 100 * (f.points[0].speed / (f.points[0].ratio / 100)))) / 20) * 20), yMax: Math.ceil(Math.max(...f.points.map(p => p.typical / 100 * (f.points[0].speed / (f.points[0].ratio / 100)))) / 20) * 20 + 20, xEvery: 2, unit: "" });
    const w = f.worst, now = f.points[0];
    const delta = w.speed - now.speed;
    const headline = delta < -2 ? `${t("Network speed expected to fall to")} ${num(w.speed, 0)} ${t("km/h")} ${t("by")} ${hhmm(w.ts)}` : delta > 2 ? `${t("Network speed expected to recover to")} ${num(f.points[f.points.length - 1].speed, 0)} ${t("km/h")}` : t("Network speed expected to hold steady");
    root.replaceChildren(
      h("div", { class: "row", style: { justifyContent: "space-between", marginBottom: "6px" } }, h("b", null, headline), f.incident_aware ? h("span", { class: "pill warn" }, h("i"), t("Active incident factored in")) : null),
      chart,
      opts.compact ? null : h("div", { style: { marginTop: "10px" } }, h("div", { class: "muted", style: { marginBottom: "4px" } }, t("At risk in the next hour")),
        h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Corridor"), t("Now"), "+30", "+60", ""].map(x => h("th", { class: x === t("Corridor") ? "" : "num" }, x)))),
          h("tbody", null, f.at_risk.slice(0, opts.rows || 5).map(c => h("tr", null, h("td", null, c.name), h("td", { class: "num" }, num(c.speed, 0)), h("td", { class: "num" }, num(c.forecast30_speed, 0)), h("td", { class: "num" }, num(c.forecast60 / 100 * (c.forecast30_speed / (c.forecast30 / 100)), 0)), h("td", null, h("span", { class: "pill " + (c.trend === "worsening" ? "warn" : c.trend === "improving" ? "ok" : "mute") }, t(c.trend === "worsening" ? "Worsening" : c.trend === "improving" ? "Improving" : "Steady")))))))),
      h("div", { class: "faint", style: { fontSize: ".6875rem", marginTop: "8px" } }, f.method));
  }
  update(); timer = setInterval(update, 4000);
  return { el: root, stop() { alive = false; clearInterval(timer); } };
}
