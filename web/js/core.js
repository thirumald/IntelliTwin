// Core: DOM helper, API, live store, i18n (EN/AR), white-label brand, formatting.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? el.style.setProperty(sk, sv) : (el.style[sk] = sv); }
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);

// ---------------------------------------------------------------- API
export async function api(path, opts) {
  const r = await fetch("/api" + path, opts);
  if (r.status === 401 && !path.startsWith("/auth/login")) { location.replace("/login.html?next=" + encodeURIComponent(location.pathname + location.hash)); throw new Error("Not signed in"); }
  if (!r.ok) {
    let msg = r.statusText, code = null;
    try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); code = j.code || null; } catch {}
    const e = new Error(msg); e.status = r.status; e.code = code; throw e;
  }
  return r.json();
}
export const send = (method, path, body) => api(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
export const session = { user: null };
export const can = role => !session.user || ({ viewer: 0, operator: 1, admin: 2 }[session.user.role] >= { viewer: 0, operator: 1, admin: 2 }[role]);
export const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

// ---------------------------------------------------------------- store (polls /api/state)
export const store = { state: null, meta: null, roads: null, listeners: new Set(), ready: false };
export function onState(fn) { store.listeners.add(fn); if (store.state) fn(store.state); return () => store.listeners.delete(fn); }
let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try { store.state = await api("/state"); store.listeners.forEach(f => { try { f(store.state); } catch (e) { console.error(e); } }); } catch (e) { /* server restarting */ }
  polling = false;
}
export async function startStore() {
  store.meta = await api("/meta");
  store.cityId = store.meta.city.id;
  await poll();
  setInterval(poll, 1000);
  store.ready = true;
}
export async function reloadMeta() { store.meta = await api("/meta"); store.roads = null; store.cityId = store.meta.city.id; }

// ---------------------------------------------------------------- i18n
const QP = new URLSearchParams(location.search);
export const lang = { code: QP.get("lang") || localStorage.getItem("it.lang") || "en" };
const AR = {
  "Overview": "نظرة عامة", "Live map": "الخريطة المباشرة", "Congestion": "الازدحام", "Incidents": "الحوادث", "Violations & fines": "المخالفات والغرامات",
  "Operations": "العمليات", "Enforcement": "الإنفاذ", "City & brand": "المدينة والعلامة", "Command": "القيادة", "Analytics": "التحليلات", "Admin": "الإدارة",
  "Start storyline": "بدء السيناريو", "Reset": "إعادة", "Simulated data": "بيانات محاكاة", "Network health": "صحة الشبكة", "Avg speed": "متوسط السرعة",
  "Congested": "مزدحم", "Active incidents": "الحوادث النشطة", "Violations today": "مخالفات اليوم", "Fines issued": "الغرامات الصادرة", "Collected": "المحصّل",
  "Collection rate": "نسبة التحصيل", "Review queue": "قائمة المراجعة", "Delay": "التأخير", "Forecast": "التوقعات", "Preview": "معاينة", "Alerts": "التنبيهات",
  "Hotspots": "النقاط الساخنة", "Corridors": "المحاور", "Districts": "المناطق", "Status": "الحالة", "Type": "النوع", "Street": "الشارع", "District": "المنطقة",
  "Severity": "الخطورة", "Detected": "تم الرصد", "Plate": "اللوحة", "Amount": "المبلغ", "Device": "الجهاز", "Time": "الوقت", "Details": "التفاصيل",
  "Approve & issue fine": "اعتماد وإصدار الغرامة", "Reject": "رفض", "Mark paid": "تسجيل السداد", "Open appeal": "فتح اعتراض", "Uphold appeal": "قبول الاعتراض",
  "Dismiss appeal": "رفض الاعتراض", "Verify": "تحقق", "Dispatch": "إرسال", "On scene": "في الموقع", "Clear": "إغلاق", "Evidence": "الأدلة", "Linked chain": "السلسلة المترابطة",
  "Language": "اللغة", "Brand": "العلامة", "City": "المدينة", "Speed": "السرعة", "Now": "الآن", "typical": "المعتاد", "today": "اليوم", "Search plate, ID, street": "ابحث عن لوحة أو رقم أو شارع",
  "All": "الكل", "In review": "قيد المراجعة", "Issued": "صادرة", "Paid": "مدفوعة", "Overdue": "متأخرة", "Appealed": "معترض عليها", "Rejected": "مرفوضة", "Cancelled": "ملغاة",
  "Response time": "زمن الاستجابة", "Clearance": "زمن الإغلاق", "Black spots": "النقاط السوداء", "Repeat offenders": "المخالفون المتكررون", "Revenue": "الإيرادات",
  "Traffic police": "شرطة المرور", "Executive": "التنفيذي", "Predicted": "المتوقع", "Worsening": "يزداد سوءاً", "Improving": "يتحسن", "Steady": "مستقر", "At risk in the next hour": "معرّضة للخطر خلال الساعة القادمة",
  "Detection to fine": "من الرصد إلى الغرامة", "Fine schedule": "جدول الغرامات", "Plug-and-play cities": "مدن جاهزة للتشغيل", "White-label": "علامة بيضاء",
  "km/h": "كم/س", "min": "دقيقة", "Vehicle-hours": "ساعات مركبات", "Active": "نشط", "Show on map": "عرض على الخريطة", "Open chain": "فتح السلسلة", "Close": "إغلاق",
  "Hour": "الساعة", "Vehicles": "المركبات", "Injuries": "إصابات", "Responders": "الاستجابة", "Timeline": "الجدول الزمني", "View as table": "عرض كجدول", "View as chart": "عرض كمخطط",
  "Confidence": "الثقة", "Rule": "القاعدة", "Due": "الاستحقاق", "Black points": "النقاط السوداء", "Impound": "الحجز", "days": "أيام", "Reviewer": "المراجع", "Lifecycle": "دورة الحياة",
  "Paused": "متوقف", "Play": "تشغيل", "Pause": "إيقاف", "Free flow": "انسيابي", "Gridlock": "اختناق", "Layers": "الطبقات", "Cameras": "الكاميرات", "Incident": "حادث",
  "Daily violations": "المخالفات اليومية", "Fines issued vs collected": "الغرامات الصادرة مقابل المحصّلة", "Network speed vs typical": "سرعة الشبكة مقابل المعتاد",
  "Congested network share by hour and weekday": "نسبة الازدحام حسب الساعة واليوم", "Violations by type": "المخالفات حسب النوع", "Violations by hour": "المخالفات حسب الساعة",
  "Top enforcement locations": "أكثر مواقع الإنفاذ", "Active incidents": "الحوادث النشطة", "Recent incidents": "أحدث الحوادث", "Incidents by hour": "الحوادث حسب الساعة",
  "Incidents by type": "الحوادث حسب النوع", "Average response by severity": "متوسط الاستجابة حسب الخطورة", "Collision black spots": "النقاط السوداء للتصادمات",
};
export function t(s) { return lang.code === "ar" && AR[s] ? AR[s] : s; }
export function setLang(c) {
  lang.code = c; localStorage.setItem("it.lang", c);
  document.documentElement.lang = c; document.documentElement.dir = c === "ar" ? "rtl" : "ltr";
}
export const nameOf = o => (lang.code === "ar" && o.name_ar) ? o.name_ar : o.name;

// ---------------------------------------------------------------- brand (white-label)
export const brand = { cfg: null, all: [] };
export async function loadBrand() {
  brand.all = await (await fetch("/brand/brands.json")).json();
  const id = QP.get("brand") || localStorage.getItem("it.brand") || "presight";
  applyBrand(brand.all.find(b => b.id === id) || brand.all[0]);
}
export function applyBrand(b) {
  brand.cfg = b; localStorage.setItem("it.brand", b.id);
  const r = document.documentElement.style;
  r.setProperty("--brand", b.accent); r.setProperty("--brand-strong", b.accent_strong); r.setProperty("--brand2", b.accent2 || b.accent_strong);
  document.title = `${b.product} ${b.byline}`.trim();
}

// ---------------------------------------------------------------- formatting
export const num = (x, d = 0) => x == null ? "–" : Number(x).toLocaleString(lang.code === "ar" ? "en-US" : "en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
export const money = x => `${num(x)} ${store.meta ? (lang.code === "ar" ? store.meta.city.currency_ar : store.meta.city.currency) : ""}`;
export const hhmm = iso => iso ? iso.slice(11, 16) : "–";
export const hhmmss = iso => iso ? iso.slice(11, 19) : "–";
export const ymdhm = iso => iso ? iso.slice(5, 10) + " " + iso.slice(11, 16) : "–";
export const dur = m => m == null ? "–" : m < 60 ? `${num(m, 0)} ${t("min")}` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;

export const LOS = ["A", "B", "C", "D", "E", "F"];
// traffic ramp built from the reserved status colours (good, warning, serious, critical) plus a dark red for gridlock
export const RAMP = [[0.2, "#8e1b1b"], [0.4, "#d03b3b"], [0.55, "#ec835a"], [0.7, "#fab219"], [0.85, "#0ca30c"]];
export const LOS_COL = ["#0ca30c", "#6fb81b", "#fab219", "#ec835a", "#d03b3b", "#8e1b1b"];
export function rampColor(r) {
  if (r <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) if (r <= RAMP[i][0]) {
    const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], f = (r - a) / (b - a);
    const pa = parseInt(ca.slice(1), 16), pb = parseInt(cb.slice(1), 16);
    const ch = s => Math.round(((pa >> s) & 255) * (1 - f) + ((pb >> s) & 255) * f);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  return RAMP[RAMP.length - 1][1];
}
export const SEV = { 1: ["Minor", "ok"], 2: ["Major", "warn"], 3: ["Critical", "crit"] };
export const VIOL_LABEL = () => Object.fromEntries((store.meta?.city.fines || []).map(f => [f.id, lang.code === "ar" ? f.label_ar : f.label]));
export const STATUS_PILL = {
  detected: "mute", in_review: "warn", rejected: "mute", issued: "info", paid: "ok", overdue: "crit", appealed: "warn", cancelled: "mute",
  verified: "info", dispatched: "info", on_scene: "warn", clearing: "warn", cleared: "ok",
};
export const statusLabel = s => ({ in_review: "In review", on_scene: "On scene" }[s] || s.charAt(0).toUpperCase() + s.slice(1).replace("_", " "));
export const pill = (s, text) => h("span", { class: "pill " + (STATUS_PILL[s] || "mute") }, h("i"), t(text || statusLabel(s)));
export const plate = p => h("span", { class: "plate" }, p);

const ICONS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.6 4 2.6 4 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  traffic: '<rect x="8" y="2" width="8" height="20" rx="3"/><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v5M12 18v.01"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  play: '<path d="M7 4v16l13-8z"/>', pause: '<path d="M7 4v16M17 4v16"/>', bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', refresh: '<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',
};
export function icon(n) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ic"); s.innerHTML = ICONS[n] || ""; return s; }

export function modal(title, body, onOk, cancellable = true, okLabel = t("Save")) {
  const scrim = h("div", { class: "scrim", style: { zIndex: 60 } });
  const close = () => { scrim.remove(); box.remove(); document.removeEventListener("keydown", esc); };
  const esc = e => { if (e.key === "Escape" && cancellable) close(); };
  const ok = h("button", { class: "btn primary", onclick: async () => { ok.disabled = true; try { if (await onOk()) close(); } finally { ok.disabled = false; } } }, okLabel);
  const box = h("div", { class: "modal", role: "dialog", "aria-modal": "true" }, h("h3", null, title), h("div", { class: "mbody" }, body), h("div", { class: "mfoot" }, cancellable ? h("button", { class: "btn", onclick: close }, t("Cancel")) : null, ok));
  document.body.append(scrim, box); document.addEventListener("keydown", esc);
  return { close, box };
}

export function toast(msg) { const el = h("div", { class: "toast" }, msg); document.body.append(el); setTimeout(() => el.remove(), 2600); }

export function drawer(content, onClose) {
  const scrim = h("div", { class: "scrim" });
  const d = h("aside", { class: "drawer" }, h("button", { class: "btn sm x", onclick: close }, "✕"), content);
  function close() { scrim.remove(); d.remove(); document.removeEventListener("keydown", esc); onClose && onClose(); }
  function esc(e) { if (e.key === "Escape") close(); }
  scrim.onclick = close; document.addEventListener("keydown", esc);
  document.body.append(scrim, d);
  return { close, el: d };
}
Object.assign(AR, { "Loaded city pack": "تم تحميل المدينة", "Storyline started": "بدأ السيناريو", "Demo reset": "تمت إعادة التشغيل", "Violations": "المخالفات", "Issued": "الصادرة", "Fine": "الغرامة", "Location": "الموقع", "Reason": "السبب", "Vehicle": "المركبة", "Vehicle history": "سجل المركبة", "Fine ref": "مرجع الغرامة", "Likely cause": "السبب المحتمل", "Open violation": "فتح المخالفة", "Traffic impact": "الأثر المروري", "lost so far": "حتى الآن", "Repeat offender": "مخالف متكرر", "Auto-approved": "اعتماد تلقائي", "violations": "مخالفات", "black points": "نقاط سوداء", "pending": "قيد الانتظار", "Collisions": "التصادمات", "Severe": "الخطيرة", "Violation": "المخالفة", "All types": "كل الأنواع", "Show more": "عرض المزيد", "records": "سجل", "Nothing here": "لا يوجد شيء", "Level of service": "مستوى الخدمة", "No congestion hotspots": "لا توجد نقاط ازدحام", "Since": "منذ", "active": "نشطة", "Most congested corridors": "أكثر المحاور ازدحاماً", "No active incidents": "لا توجد حوادث نشطة", "No incidents": "لا توجد حوادث", "Network speed expected to hold steady": "السرعة المتوقعة مستقرة", "Network speed expected to fall to": "من المتوقع أن تنخفض السرعة إلى", "Network speed expected to recover to": "من المتوقع أن تتحسن السرعة إلى", "by": "بحلول", "Active incident factored in": "يشمل أثر الحوادث النشطة", "Corridor": "المحور", "Today": "اليوم", "Typical": "المعتاد", "Day": "اليوم", "Range": "النطاق", "Speed vs free flow": "السرعة مقابل الانسياب", "Detection to fine": "من الرصد إلى الغرامة" });
Object.assign(AR, {
  "City traffic health, safety and enforcement at a glance": "صحة المرور والسلامة والإنفاذ في المدينة بنظرة واحدة", "vs typical": "مقارنة بالمعتاد", "congested": "مزدحم", "lost per hour": "في الساعة",
  "major/critical": "كبرى/حرجة", "avg response": "متوسط الاستجابة", "fines issued": "غرامة صادرة", "awaiting review": "بانتظار المراجعة", "median review": "متوسط المراجعة",
  "Where traffic is slow, how long it has been slow, and where it is heading": "أين تبطؤ الحركة، ومنذ متى، وإلى أين تتجه", "Detection, verification, dispatch and clearance of every road incident": "رصد كل حادث والتحقق منه وإرسال الفرق وإغلاقه",
  "Detection, evidence, review, fine, payment and appeal in one workflow": "الرصد والأدلة والمراجعة والغرامة والسداد والاعتراض في مسار واحد", "Incident response performance, black spots and workload": "أداء الاستجابة للحوادث والنقاط السوداء وحجم العمل",
  "Violations, fines, collection and repeat offenders (last 7 days)": "المخالفات والغرامات والتحصيل والمخالفون المتكررون (آخر 7 أيام)", "One product, any city, any customer brand": "منتج واحد، لأي مدينة وأي علامة تجارية",
  "Range (80%)": "النطاق (80٪)", "high-confidence, no human touch": "ثقة عالية دون تدخل بشري", "Congestion forecast, next 60 min": "توقع الازدحام خلال 60 دقيقة", "Auto-approved": "اعتماد تلقائي",
  "From the first slowdown to the fine: one evidence trail.": "من أول تباطؤ إلى الغرامة: مسار أدلة واحد", "Vehicle-hours": "ساعات مركبات", "Incident verified": "تم التحقق من الحادث",
  "Major": "كبير", "Minor": "طفيف", "Critical": "حرج", "Cameras": "الكاميرات", "Detected": "تم الرصد", "Fine issued": "غرامة صادرة", "Congestion": "الازدحام",
});
