import { h, api, store, t, num, hhmm, nameOf, LOS, LOS_COL } from "../core.js";
import { lineChart, barChart, heatmap, chartCard, simpleTable, hbars } from "../charts.js";
import { forecastPanel, losLegend } from "./common.js";
import { incidentDrawer } from "../details.js";

export async function render(main) {
  const fp = forecastPanel({ height: 230, rows: 8 });
  const body = h("div");
  main.append(h("h1", { class: "page" }, t("Congestion")), h("p", { class: "sub" }, t("Where traffic is slow, how long it has been slow, and where it is heading")), body);
  let alive = true;
  async function load() {
    let d; try { d = await api("/congestion"); } catch { return; }
    if (!alive) return;
    const s = d.series, lab = s.map(p => hhmm(p.ts));
    const dist = d.los_distribution;
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], hrs = [...Array(24).keys()].map(x => String(x).padStart(2, "0"));
    body.replaceChildren(
      h("div", { class: "grid g21" },
        h("section", { class: "card" }, h("h3", null, t("Forecast"), h("span", { class: "chip preview" }, t("Preview")), h("span", { class: "spacer" })), fp.el),
        h("section", { class: "card" }, h("h3", null, t("Level of service"), h("span", { class: "spacer" }), losLegend()),
          hbars(LOS.map((l, i) => ({ label: `${l}  ${["Free flow", "Stable", "Approaching unstable", "Unstable", "Near capacity", "Gridlock"][i]}`, value: dist[i], color: LOS_COL[i] })), { fmt: x => num(x, 1) + "%" }),
          h("div", { class: "faint", style: { fontSize: ".75rem", margin: "8px 0 18px" } }, t("Share of road length by level of service, now")),
          h("h3", null, t("Districts")), hbars(d.districts.sort((a, b) => a.speed - b.speed).map(x => ({ label: lang(x), value: x.speed, sub: `${num(x.congested_pct, 0)}% ${t("congested")}`, color: x.ratio < 55 ? "var(--s2)" : "var(--s1)" })), { fmt: x => num(x, 0) + " " + t("km/h") }))),
      h("div", { class: "grid g2", style: { marginTop: "14px" } },
        h("section", { class: "card" }, h("h3", null, t("Hotspots"), h("span", { class: "spacer" }), h("span", { class: "muted" }, d.hotspots.length + " " + t("active"))), d.hotspots.length === 0 ? h("div", { class: "empty" }, t("No congestion hotspots")) :
          h("div", { class: "scroll", style: { maxHeight: "340px" } }, h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Street"), t("District"), "km", t("km/h"), t("Since"), ""].map((x, i) => h("th", { class: i > 1 ? "num" : "" }, x)))),
            h("tbody", null, d.hotspots.map(x => h("tr", { class: "click", onclick: () => { store.focus = { lat: x.lat, lon: x.lon }; location.hash = "#/map"; } }, h("td", null, x.street), h("td", { class: "muted" }, x.district_name), h("td", { class: "num" }, num(x.km, 1)), h("td", { class: "num" }, num(x.avg_speed, 0)), h("td", { class: "num" }, `${x.minutes}m`), h("td", null, x.incidents.length ? h("a", { href: "javascript:void 0", onclick: ev => { ev.stopPropagation(); incidentDrawer(x.incidents[0]); } }, "INC") : null))))))),
        h("section", { class: "card" }, h("h3", null, t("Corridors")), h("div", { class: "scroll", style: { maxHeight: "340px" } }, h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Corridor"), t("km/h"), "LOS", "+30m", ""].map((x, i) => h("th", { class: i && i < 4 ? "num" : "" }, x)))),
          h("tbody", null, d.corridors.map(c => h("tr", null, h("td", null, c.name), h("td", { class: "num" }, num(c.speed, 0)), h("td", { class: "num" }, h("span", { class: "pill", style: { color: LOS_COL[LOS.indexOf(c.los)], borderColor: LOS_COL[LOS.indexOf(c.los)] } }, c.los)), h("td", { class: "num" }, num(c.forecast30_speed, 0)), h("td", null, h("span", { class: "pill " + (c.trend === "worsening" ? "warn" : c.trend === "improving" ? "ok" : "mute") }, t(c.trend === "worsening" ? "Worsening" : c.trend === "improving" ? "Improving" : "Steady")))))))))),
      h("div", { class: "grid g2", style: { marginTop: "14px" } },
        chartCard(t("Congested network share, last 24 h"), () => lineChart([{ name: t("Congested"), color: "var(--s2)", data: s.map(p => p.congested_pct), fmt: x => num(x, 1) + "%" }], lab, { height: 210, yMin: 0, xEvery: 24, unit: "%" }), () => simpleTable([t("Time"), t("Congested")], s.filter((_, i) => i % 6 === 0).map(p => [hhmm(p.ts), num(p.congested_pct, 1) + "%"]))),
        chartCard(t("Congested network share by hour and weekday"), () => heatmap(d.heat, days, hrs, { unit: "%" }), null)),
      null);
  }
  const lang = x => (document.documentElement.lang === "ar" && x.name_ar) ? x.name_ar : x.name;
  load(); const timer = setInterval(load, 6000);
  return () => { alive = false; clearInterval(timer); fp.stop(); };
}
