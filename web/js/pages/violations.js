import { h, api, t, num, money, ymdhm, pill, plate, VIOL_LABEL, store } from "../core.js";
import { violationDrawer } from "../details.js";
import { kpi } from "./common.js";

export async function render(main) {
  let status = "in_review", type = "", q = "", limit = 60, alive = true;
  const kp = h("div", { class: "kpis" }), tbl = h("div"), more = h("div", { style: { textAlign: "center", padding: "10px" } });
  const tabs = [["in_review", "Review queue"], ["", "All"], ["issued", "Issued"], ["paid", "Paid"], ["overdue", "Overdue"], ["appealed", "Appealed"], ["rejected", "Rejected"]];
  const seg = h("div", { class: "seg" }, tabs.map(([k, l]) => h("button", { class: k === status ? "on" : "", "data-k": k, onclick: () => { status = k; limit = 60; seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.k === k)); load(); } }, t(l))));
  const typeSel = h("select", { class: "sel", onchange: e => { type = e.target.value; load(); } }, h("option", { value: "" }, t("All types")), store.meta.city.fines.map(f => h("option", { value: f.id }, document.documentElement.lang === "ar" ? f.label_ar : f.label)));
  const search = h("input", { class: "inp", placeholder: t("Search plate, ID, street"), style: { width: "250px" }, oninput: e => { q = e.target.value; clearTimeout(search._t); search._t = setTimeout(load, 300); } });
  main.append(h("h1", { class: "page" }, t("Violations & fines")), h("p", { class: "sub" }, t("Detection, evidence, review, fine, payment and appeal in one workflow")), kp, h("div", { class: "row", style: { marginBottom: "10px" } }, seg, typeSel, search), h("section", { class: "card" }, tbl, more));
  const L = VIOL_LABEL();
  async function load() {
    const qs = new URLSearchParams({ limit, ...(status ? { status } : {}), ...(type ? { type } : {}), ...(q ? { q } : {}) });
    let r, d; try { [r, d] = await Promise.all([api("/violations?" + qs), api("/dashboards/enforcement")]); } catch { return; }
    if (!alive) return;
    const k = d.kpis;
    kp.replaceChildren(kpi("Review queue", k.review_backlog, null, `${t("median review")} ${d.review_sla_min ?? "–"} ${t("min")}`, k.review_backlog > 25 ? "warn" : ""), kpi("Violations today", num(k.violations_today)), kpi("Fines issued", num(k.fines_value_today), k.currency), kpi("Collected", num(k.collected_today), k.currency), kpi("Collection rate", num(k.collection_rate, 0), "%"));
    tbl.replaceChildren(r.items.length ? h("div", { class: "scroll", style: { maxHeight: "none" } }, h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Time"), "ID", t("Plate"), t("Type"), t("Location"), t("Confidence"), t("Amount"), t("Status")].map((x, i) => h("th", { class: i === 6 ? "num" : "" }, x)))),
      h("tbody", null, r.items.map(v => h("tr", { class: "click", onclick: () => violationDrawer(v.id) },
        h("td", { class: "tnum" }, ymdhm(v.ts)), h("td", { class: "tnum muted" }, v.id), h("td", null, plate(v.plate), v.repeat ? h("span", { class: "pill warn", style: { marginInlineStart: "6px" } }, "×3+") : null),
        h("td", null, L[v.type] || v.type, v.measured ? h("span", { class: "muted" }, ` ${v.measured}/${v.limit}`) : null, v.hold ? h("span", { class: "pill info", style: { marginInlineStart: "6px" } }, h("i"), t("Linked to incident")) : null),
        h("td", { class: "muted" }, v.device_name), h("td", { class: "tnum" }, Math.round(Math.min(v.ai_conf, v.anpr_conf) * 100) + "%"), h("td", { class: "num" }, money(v.amount)), h("td", null, pill(v.status))))))) : h("div", { class: "empty" }, t("Nothing here")));
    more.replaceChildren(r.total > r.items.length ? h("button", { class: "btn", onclick: () => { limit += 60; load(); } }, `${t("Show more")} (${r.items.length} / ${num(r.total)})`) : h("span", { class: "faint" }, `${num(r.total)} ${t("records")}`));
  }
  load(); const timer = setInterval(load, 4000);
  return () => { alive = false; clearInterval(timer); };
}
