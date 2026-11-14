// Detail drawers: incident (lifecycle + linked chain) and violation (evidence + fine workflow).
import { h, api, post, t, num, money, hhmm, hhmmss, ymdhm, dur, pill, plate, SEV, VIOL_LABEL, toast, drawer, store, statusLabel } from "./core.js";

const STAGES = ["detected", "verified", "dispatched", "on_scene", "clearing", "cleared"];
const STAGE_LABEL = { detected: "Detected", verified: "Verified", dispatched: "Dispatched", on_scene: "On scene", clearing: "Clearing", cleared: "Cleared" };
const UNIT = { police: "Police patrol", ambulance: "Ambulance", recovery: "Recovery truck", civil_defence: "Civil Defence" };
export const nav = { go: (hash) => { location.hash = hash; } };

export async function incidentDrawer(id) {
  const host = h("div");
  let timer;
  const d = drawer(host, () => clearInterval(timer));
  async function load() {
    let inc, chain;
    try { [inc, chain] = await Promise.all([api(`/incidents/${id}`), api(`/chain/${id}`)]); } catch { return; }
    const idx = STAGES.indexOf(inc.status);
    const act = (a, label, cls = "") => h("button", { class: "btn sm " + cls, onclick: async () => { await post(`/incidents/${id}/${a}`); toast(t(label)); load(); } }, t(label));
    host.replaceChildren(
      h("h2", null, `${inc.label} `, h("span", { class: "muted tnum" }, inc.id)),
      h("div", { class: "row" }, pill(inc.status), h("span", { class: "pill " + SEV[inc.severity][1] }, h("i"), t(SEV[inc.severity][0])), h("span", { class: "muted" }, `${inc.street} · ${inc.district_name}`)),
      h("div", { class: "stepper" }, STAGES.map((s, i) => h("div", { class: "s" + (i <= idx ? " done" : "") + (i === idx ? " cur" : "") }, t(STAGE_LABEL[s]), h("div", { class: "tnum faint" }, hhmm((inc.timeline.find(x => x.status === s) || {}).ts))))),
      h("div", { class: "row", style: { margin: "6px 0" } },
        inc.status === "detected" ? act("verify", "Verify", "primary") : null,
        idx < 2 ? act("dispatch", "Dispatch", idx === 1 ? "primary" : "") : null,
        idx < 3 ? act("arrive", "On scene") : null,
        inc.status !== "cleared" ? act("clear", "Clear") : null,
        h("button", { class: "btn sm", onclick: () => { d.close(); store.focus = { lat: inc.lat, lon: inc.lon, id: inc.id }; nav.go("#/map"); } }, t("Show on map"))),
      h("dl", { class: "kv" },
        h("dt", null, t("Detected")), h("dd", { class: "tnum" }, ymdhm(inc.detected), ` · ${inc.source.replace("_", " ")} · ${t("Confidence")} ${inc.ai_conf}`),
        h("dt", null, t("Response time")), h("dd", null, inc.response_min != null ? dur(inc.response_min) : t("pending")),
        h("dt", null, t("Clearance")), h("dd", null, inc.clearance_min != null ? dur(inc.clearance_min) : `${t("Active")} ${dur(inc.age_min)}`),
        h("dt", null, t("Vehicles")), h("dd", null, `${inc.vehicles}  ·  ${t("Injuries")} ${inc.injuries}`),
        h("dt", null, t("Traffic impact")), h("dd", null, `${num(inc.impact_vh, 0)} ${t("Vehicle-hours")} ${t("lost so far")}`),
        h("dt", null, t("Responders")), h("dd", null, inc.responders.length ? inc.responders.map(r => h("span", { class: "pill info", style: { marginInlineEnd: "6px" } }, `${UNIT[r.unit] || r.unit} · ETA ${r.eta_min}m`)) : "–")),
      h("h3", { style: { margin: "18px 0 4px" } }, t("Linked chain")),
      h("div", { class: "muted" }, t("From the first slowdown to the fine: one evidence trail.")),
      h("div", { class: "tl" }, chain.steps.map(s => h("div", { class: "e " + s.kind },
        h("div", { class: "tm" }, hhmmss(s.ts)), h("b", null, s.title), s.detail ? h("span", null, s.detail) : null,
        s.image ? h("img", { src: s.image, alt: "Evidence", style: { display: "block", width: "260px", borderRadius: "6px", border: "1px solid var(--rule)", margin: "6px 0" } }) : null,
        s.kind === "violation" ? h("div", null, h("a", { href: "javascript:void 0", onclick: () => { d.close(); violationDrawer(s.ref); } }, t("Open violation") + " →")) : null))),
      chain.violations.length ? h("div", { class: "callout", style: { marginTop: "8px" } }, `${t("Likely cause")}: ${chain.violations[0].type.replace("_", " ")} - ${chain.violations[0].plate}`) : null);
  }
  await load(); timer = setInterval(load, 2500);
}

export async function violationDrawer(id) {
  const host = h("div");
  const d = drawer(host);
  async function load() {
    let v;
    try { v = await api(`/violations/${id}`); } catch { host.replaceChildren(h("p", null, "Not found")); return; }
    const lbl = VIOL_LABEL()[v.type] || v.type;
    const act = (a, label, cls = "", body) => h("button", { class: "btn " + cls, onclick: async () => { await post(`/violations/${id}/${a}`, body); toast(t(label)); load(); } }, t(label));
    const buttons = [];
    if (v.status === "in_review") buttons.push(act("approve", "Approve & issue fine", "primary"), act("reject", "Reject", "danger", { reason: "Evidence insufficient" }));
    if (["issued", "overdue"].includes(v.status)) buttons.push(act("pay", "Mark paid", "primary"), act("appeal", "Open appeal"));
    if (v.status === "appealed") buttons.push(act("uphold_appeal", "Uphold appeal"), act("dismiss_appeal", "Dismiss appeal"));
    host.replaceChildren(
      h("h2", null, lbl, " ", plate(v.plate)),
      h("div", { class: "row" }, pill(v.status), v.repeat ? h("span", { class: "pill warn" }, h("i"), t("Repeat offender")) : null, v.auto ? h("span", { class: "pill mute" }, t("Auto-approved")) : null, h("span", { class: "muted tnum" }, `${v.id} · ${ymdhm(v.ts)}`)),
      h("div", { class: "frames" }, [0, 1, 2].map(i => h("img", { src: `/api/violations/${id}/evidence/${i}.png`, alt: `Evidence frame ${i + 1}`, onclick: () => window.open(`/api/violations/${id}/evidence/${i}.png`, "_blank") }))),
      h("div", { class: "row" }, h("img", { src: `/api/violations/${id}/evidence/plate.png`, alt: "Plate crop", style: { height: "54px", borderRadius: "5px" } }), h("span", { class: "muted" }, `ANPR ${v.anpr_conf} · AI ${v.ai_conf}  ·  ${v.vehicle}`)),
      h("div", { class: "card", style: { margin: "14px 0", background: "var(--raised)" } },
        h("div", { class: "row", style: { justifyContent: "space-between" } }, h("div", null, h("div", { class: "muted" }, t("Fine")), h("div", { style: { fontSize: "1.8rem", fontWeight: 600 } }, money(v.amount))),
          h("div", null, h("div", { class: "muted" }, t("Black points")), h("div", { style: { fontSize: "1.8rem", fontWeight: 600 } }, v.black_points)),
          h("div", null, h("div", { class: "muted" }, t("Impound")), h("div", { style: { fontSize: "1.8rem", fontWeight: 600 } }, `${v.impound_days} ${t("days")}`))),
        h("div", { class: "muted", style: { marginTop: "6px" } }, v.rule, v.measured ? ` · ${v.measured} / ${v.limit} ${t("km/h")}` : "")),
      h("div", { class: "row", style: { margin: "8px 0 14px" } }, buttons, v.incident ? h("button", { class: "btn", onclick: () => { d.close(); incidentDrawer(v.incident); } }, t("Open chain") + " →") : null),
      h("dl", { class: "kv" },
        h("dt", null, t("Location")), h("dd", null, `${v.device_name} · ${v.district_name}`),
        h("dt", null, t("Fine ref")), h("dd", { class: "tnum" }, v.fine_ref || "–"), h("dt", null, t("Due")), h("dd", { class: "tnum" }, v.due ? ymdhm(v.due) : "–"),
        h("dt", null, t("Reviewer")), h("dd", null, v.reviewer || "–"), v.reject_reason ? [h("dt", null, t("Reason")), h("dd", null, v.reject_reason)] : null,
        h("dt", null, t("Vehicle history")), h("dd", null, `${v.plate_history} ${v.plate_history === 1 ? t("violation") : t("violations")} · ${v.plate_points} ${t("black points")}`)),
      h("h3", { style: { margin: "14px 0 4px" } }, t("Lifecycle")),
      h("div", { class: "tl" }, v.timeline.map(s => h("div", { class: "e" }, h("div", { class: "tm" }, ymdhm(s.ts)), h("b", null, t(statusLabel(s.status)))))));
  }
  await load();
}
