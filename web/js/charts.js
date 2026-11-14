// Small SVG chart kit: thin marks, recessive grid, crosshair/hover tooltips, legends, table view.
import { h, t } from "./core.js";

const NS = "http://www.w3.org/2000/svg";
const S = (tag, a = {}, ...k) => { const e = document.createElementNS(NS, tag); for (const [x, v] of Object.entries(a)) e.setAttribute(x, v); k.forEach(c => c != null && e.append(c.nodeType ? c : document.createTextNode(c))); return e; };
export const C = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];

function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function legend(items) {
  return h("div", { class: "legend" }, items.map(i => h("span", null, h("i", { class: i.line ? (i.dash ? "dash" : "ln") : "", style: i.dash ? null : { background: i.color } }), i.name)));
}
function tipBox(wrap) { const el = h("div", { class: "tip", style: { display: "none" } }); wrap.append(el); return el; }
function placeTip(tip, wrap, ev, html) {
  const r = wrap.getBoundingClientRect();
  tip.innerHTML = html; tip.style.display = "block";
  let x = ev.clientX - r.left + 14, y = ev.clientY - r.top - 10;
  if (x + tip.offsetWidth > r.width) x = ev.clientX - r.left - tip.offsetWidth - 14;
  tip.style.left = Math.max(0, x) + "px"; tip.style.top = Math.max(0, y) + "px";
}

/** Line chart. series: [{name,color,data:[number|null],dash?,fmt?}], labels: x labels. opts: {height,yMin,yMax,band:{lo,hi,color},nowIndex,yFmt,xEvery,unit,forecastFrom} */
function responsive(wrap, build) {
  let w = 0;
  const draw = W => { const old = wrap.querySelector("svg"); const s = build(W); if (old) old.replaceWith(s); else wrap.prepend(s); };
  draw(720);
  const ro = new ResizeObserver(es => { const cw = Math.round(es[0].contentRect.width); if (cw > 40 && Math.abs(cw - w) > 6) { w = cw; requestAnimationFrame(() => draw(cw)); } });
  ro.observe(wrap);
}
export function lineChart(series, labels, o = {}) {
  const wrap = h("div", { class: "chart" }); const tip = tipBox(wrap);
  const items = series.map(s => ({ name: s.name, color: s.color, line: true, dash: s.dash })); if (o.band) items.push({ name: o.band.name || "Range", color: o.band.color || "var(--s1)" });
  responsive(wrap, W => lineSvg(W, series, labels, o, wrap, tip));
  return h("div", null, series.length + (o.band ? 1 : 0) >= 2 ? legend(items) : null, wrap);
}
function lineSvg(W, series, labels, o, wrap, tip) {
  const H = o.height || 230, m = { l: 42, r: 12, t: 10, b: 24 };
  const all = series.flatMap(s => s.data.filter(v => v != null)).concat(o.band ? o.band.lo.concat(o.band.hi) : []);
  let lo = o.yMin ?? Math.min(...all), hi = o.yMax ?? niceMax(Math.max(...all));
  if (o.yMin == null) lo = Math.min(0, Math.floor(lo / 10) * 10 === lo ? lo : Math.floor(lo / 10) * 10);
  const n = labels.length, X = i => m.l + (n <= 1 ? 0 : i / (n - 1)) * (W - m.l - m.r), Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.aria || "line chart" });
  const g = S("g", { class: "grid" });
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) { const v = lo + (hi - lo) * i / ticks, y = Y(v); g.append(S("line", { x1: m.l, x2: W - m.r, y1: y, y2: y })); svg.append(S("text", { x: m.l - 6, y: y + 4, "text-anchor": "end" }, (o.yFmt || (x => Math.round(x)))(v))); }
  svg.prepend(g);
  const every = o.xEvery || Math.ceil(n / Math.max(3, Math.floor(W / 80)));
  labels.forEach((lb, i) => { if (i % every === 0) svg.append(S("text", { x: X(i), y: H - 6, "text-anchor": "middle" }, lb)); });
  if (o.band) {
    const up = o.band.hi.map((v, i) => `${X(i)},${Y(v)}`), dn = o.band.lo.map((v, i) => `${X(i)},${Y(v)}`).reverse();
    svg.append(S("polygon", { points: up.concat(dn).join(" "), fill: o.band.color || "var(--s1)", opacity: .18 }));
  }
  series.forEach(s => {
    let d = "", pen = false;
    s.data.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); pen = true; });
    svg.append(S("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", ...(s.dash ? { "stroke-dasharray": "5 4" } : {}) }));
  });
  if (o.nowIndex != null) { svg.append(S("line", { x1: X(o.nowIndex), x2: X(o.nowIndex), y1: m.t, y2: H - m.b, stroke: "var(--faint)", "stroke-dasharray": "2 3" })); svg.append(S("text", { x: X(o.nowIndex) + 4, y: m.t + 10 }, t("Now"))); }
  const cross = S("line", { y1: m.t, y2: H - m.b, stroke: "var(--faint)", opacity: 0 }); svg.append(cross);
  const dots = series.map(s => { const c = S("circle", { r: 4, fill: s.color, stroke: "var(--panel)", "stroke-width": 2, opacity: 0 }); svg.append(c); return c; });
  const hit = S("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }); svg.append(hit);
  hit.addEventListener("mousemove", ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (W - m.l - m.r) * (n - 1))));
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("opacity", 1);
    series.forEach((s, k) => { const v = s.data[i]; dots[k].setAttribute("opacity", v == null ? 0 : 1); if (v != null) { dots[k].setAttribute("cx", X(i)); dots[k].setAttribute("cy", Y(v)); } });
    const u = o.unit || "";
    placeTip(tip, wrap, ev, `<b>${o.tipLabel ? o.tipLabel(i) : labels[i]}</b>` + series.map(s => s.data[i] == null ? "" : `<div><span style="color:${s.color}">●</span> ${s.name}: <b style="display:inline">${(s.fmt || (x => Math.round(x * 10) / 10))(s.data[i])}${u}</b></div>`).join("") + (o.band && o.band.lo[i] != null ? `<div class="muted">${t("Range")}: ${Math.round(o.band.lo[i])}–${Math.round(o.band.hi[i])}${u}</div>` : ""));
  });
  hit.addEventListener("mouseleave", () => { tip.style.display = "none"; cross.setAttribute("opacity", 0); dots.forEach(d => d.setAttribute("opacity", 0)); });
  return svg;
}

/** Vertical bars. groups: labels; series: [{name,color,data,fmt}], opts: {stacked,height,yFmt}. */
export function barChart(series, labels, o = {}) {
  const wrap = h("div", { class: "chart" }); const tip = tipBox(wrap);
  responsive(wrap, W => barSvg(W, series, labels, o, wrap, tip));
  return h("div", null, series.length >= 2 ? legend(series.map(s => ({ name: s.name, color: s.color }))) : null, wrap);
}
function barSvg(W, series, labels, o, wrap, tip) {
  const H = o.height || 220, m = { l: 46, r: 8, t: 10, b: 24 }, n = labels.length;
  const tot = labels.map((_, i) => o.stacked ? series.reduce((a, s) => a + (s.data[i] || 0), 0) : Math.max(...series.map(s => s.data[i] || 0)));
  const hi = niceMax(Math.max(...tot, 1)), Y = v => m.t + (1 - v / hi) * (H - m.t - m.b);
  const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.aria || "bar chart" }), g = S("g", { class: "grid" });
  for (let i = 0; i <= 4; i++) { const v = hi * i / 4, y = Y(v); g.append(S("line", { x1: m.l, x2: W - m.r, y1: y, y2: y })); svg.append(S("text", { x: m.l - 6, y: y + 4, "text-anchor": "end" }, (o.yFmt || (x => Math.round(x)))(v))); }
  svg.prepend(g);
  const slot = (W - m.l - m.r) / n, bw = o.stacked ? Math.min(46, slot * 0.62) : Math.min(30, slot * 0.8 / series.length);
  const every = Math.ceil(n / Math.max(4, Math.floor(W / 52)));
  labels.forEach((lb, i) => {
    const cx = m.l + slot * (i + 0.5);
    if (i % every === 0) svg.append(S("text", { x: cx, y: H - 6, "text-anchor": "middle" }, lb));
    let acc = 0;
    series.forEach((s, k) => {
      const v = s.data[i] || 0; if (!v) return;
      const x = o.stacked ? cx - bw / 2 : cx - (bw * series.length + 2 * (series.length - 1)) / 2 + k * (bw + 2);
      const y1 = Y(o.stacked ? acc + v : v), y0 = Y(o.stacked ? acc : 0), hgt = Math.max(1, y0 - y1 - (o.stacked ? 2 : 0));
      const r = Math.min(4, bw / 2, hgt);
      svg.append(S("path", { d: `M${x} ${y1 + hgt}V${y1 + r}Q${x} ${y1} ${x + r} ${y1}H${x + bw - r}Q${x + bw} ${y1} ${x + bw} ${y1 + r}V${y1 + hgt}Z`, fill: s.color }));
      if (o.stacked) acc += v;
    });
    const hit = S("rect", { x: m.l + slot * i, y: m.t, width: slot, height: H - m.t - m.b, fill: "transparent" }); svg.append(hit);
    hit.addEventListener("mousemove", ev => placeTip(tip, wrap, ev, `<b>${o.tipLabel ? o.tipLabel(i) : lb}</b>` + series.map(s => `<div><span style="color:${s.color}">●</span> ${s.name}: <b style="display:inline">${(s.fmt || (x => Math.round(x).toLocaleString()))(s.data[i] || 0)}</b></div>`).join("")));
    hit.addEventListener("mouseleave", () => tip.style.display = "none");
  });
  return svg;
}

/** Horizontal bar list (value labelled at the end). rows: [{label,value,sub,color,onclick}] */
export function hbars(rows, o = {}) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return h("div", { style: { display: "grid", gap: "7px" } }, rows.map(r => h("div", { style: { cursor: r.onclick ? "pointer" : "default" }, onclick: r.onclick },
    h("div", { class: "row", style: { justifyContent: "space-between", gap: "8px", marginBottom: "2px" } }, h("span", null, r.label), h("span", { class: "tnum muted" }, (o.fmt || (x => x.toLocaleString()))(r.value), r.sub ? " · " + r.sub : "")),
    h("div", { style: { height: "7px", background: "var(--raised)", borderRadius: "4px", overflow: "hidden" } }, h("div", { style: { width: (r.value / max * 100) + "%", height: "100%", background: r.color || "var(--s1)", borderRadius: "4px" } })))));
}

/** Heatmap (rows x cols), sequential single-hue ramp (blue), values shown on hover. */
export function heatmap(matrix, rowLabels, colLabels, o = {}) {
  const flat = matrix.flat().filter(v => v != null), mx = Math.max(...flat, 1);
  const ramp = ["#103c70", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#86b6ef", "#b7d3f6"];
  const colour = v => v == null ? "var(--raised)" : ramp[Math.min(ramp.length - 1, Math.floor(v / mx * (ramp.length - 1)))];
  const wrap = h("div", { class: "chart" }), tip = tipBox(wrap);
  const grid = h("div", { class: "hm", style: { gridTemplateColumns: `44px repeat(${colLabels.length},minmax(0,1fr))` } });
  grid.append(h("div"));
  colLabels.forEach((c, i) => grid.append(h("div", { class: "faint", style: { fontSize: "10px", textAlign: "center" } }, i % 3 === 0 ? c : "")));
  matrix.forEach((row, r) => {
    grid.append(h("div", { class: "muted", style: { fontSize: "11px", alignSelf: "center" } }, rowLabels[r]));
    row.forEach((v, c) => {
      const cell = h("div", { class: "c", style: { background: colour(v) } });
      cell.onmousemove = ev => placeTip(tip, wrap, ev, `<b>${rowLabels[r]} ${colLabels[c]}</b>${v == null ? "–" : v + (o.unit || "")}`);
      cell.onmouseleave = () => tip.style.display = "none";
      grid.append(cell);
    });
  });
  wrap.append(grid);
  const key = h("div", { class: "row faint", style: { fontSize: "11px", marginTop: "8px", gap: "6px" } }, "0", h("div", { style: { width: "120px", height: "8px", borderRadius: "4px", background: `linear-gradient(90deg,${ramp.join(",")})` } }), `${Math.round(mx)}${o.unit || ""}`);
  return h("div", null, wrap, key);
}

/** Card with a title, optional tools, and a chart/table toggle for accessibility. */
export function chartCard(title, chart, table, extra) {
  let showTable = false;
  const body = h("div"), btn = h("button", { class: "btn sm", onclick: toggle }, t("View as table"));
  function render() { body.replaceChildren(showTable && table ? table() : chart()); btn.textContent = showTable ? t("View as chart") : t("View as table"); }
  function toggle() { showTable = !showTable; render(); }
  render();
  return h("section", { class: "card" }, h("h3", null, title, h("span", { class: "spacer" }), extra, table ? h("span", { class: "tools" }, btn) : null), body);
}

export function simpleTable(head, rows) {
  return h("div", { class: "scroll", style: { maxHeight: "260px" } }, h("table", { class: "t" }, h("thead", null, h("tr", null, head.map(x => h("th", null, x)))), h("tbody", null, rows.map(r => h("tr", null, r.map((c, i) => h("td", { class: i ? "num" : "" }, c)))))));
}
