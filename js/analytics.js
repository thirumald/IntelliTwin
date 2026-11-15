/* IntelliTwin predictive analytics.
 *
 * A separate full-screen view with planning-level projections: road expansion, traffic signals,
 * demand management, accident risk and emissions. Everything is computed in the browser from the
 * synthetic traffic, using a standard volume-delay (BPR) curve to project growth. The numbers are
 * illustrations of the method, not forecasts for decisions. See docs/analytics.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, state = T.state;
  var A = CFG.analytics;
  // Categorical colours validated for the dark surface (blue, orange, aqua, yellow), assigned in this fixed order.
  var COL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c'], INK = '#e8eef9', MUTED = '#8fa0bd', GRID = '#22314d';
  // Text and grid colours follow the page theme.
  function themeInk() { var cs = getComputedStyle(document.body), g = function (n, f) { return cs.getPropertyValue(n).trim() || f; }; INK = g('--text', '#e8eef9'); MUTED = g('--muted', '#8fa0bd'); GRID = g('--line', '#22314d'); }
  var STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ================= charts (canvas, with hover) ================= */
  var tip = null;
  function showTip(ev, html) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'an-tip'; document.body.appendChild(tip); }
    tip.innerHTML = html; tip.hidden = false;
    var x = ev.clientX + 14, y = ev.clientY + 14;
    tip.style.left = Math.min(x, window.innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.min(y, window.innerHeight - tip.offsetHeight - 8) + 'px';
  }
  function hideTip() { if (tip) { tip.hidden = true; } }
  function setup(cv) {
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = '11px system-ui, sans-serif';
    return { g: g, w: w, h: h };
  }
  function niceMax(v) { var p = Math.pow(10, Math.floor(Math.log10(v || 1))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function legend(el, series) {
    el.innerHTML = series.length < 2 ? '' : series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + '</span>'; }).join('');
  }
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  // Line chart: o = { labels, series: [{ name, color, values, dash }], unit, yMin }
  function lineChart(id, o) {
    var cv = $(id); if (!cv || !cv.clientWidth) { return; }
    legend($(id + 'Key'), o.series);
    var c = setup(cv), g = c.g, pl = 40, pr = 12, pt = 10, pb = 22, n = o.labels.length;
    var all = []; o.series.forEach(function (s) { all = all.concat(s.values); });
    var top = niceMax(Math.max.apply(null, all)), bottom = o.yMin || 0;
    function x(i) { return pl + (c.w - pl - pr) * (n > 1 ? i / (n - 1) : 0.5); }
    function y(v) { return pt + (c.h - pt - pb) * (1 - (v - bottom) / (top - bottom)); }
    g.strokeStyle = GRID; g.fillStyle = MUTED; g.lineWidth = 1; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (var k = 0; k <= 4; k++) { var v = bottom + (top - bottom) * k / 4; g.beginPath(); g.moveTo(pl, y(v)); g.lineTo(c.w - pr, y(v)); g.stroke(); g.fillText(num(v), pl - 6, y(v)); }
    g.textAlign = 'center'; g.textBaseline = 'top';
    var step = Math.max(1, Math.ceil(n / 8));
    o.labels.forEach(function (lb, i) { if (i % step === 0 || i === n - 1) { g.fillText(lb, Math.min(Math.max(x(i), pl + 12), c.w - pr - 12), c.h - pb + 6); } });
    o.series.forEach(function (s) {
      g.beginPath(); s.values.forEach(function (v, i) { if (i) { g.lineTo(x(i), y(v)); } else { g.moveTo(x(i), y(v)); } });
      g.strokeStyle = s.color; g.lineWidth = 2; g.setLineDash(s.dash || []); g.lineJoin = 'round'; g.stroke(); g.setLineDash([]);
    });
    cv.onmousemove = function (ev) {
      var r = cv.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round((ev.clientX - r.left - pl) / (c.w - pl - pr) * (n - 1))));
      lineChart._draw && 0;
      showTip(ev, '<b>' + esc(o.labels[i]) + '</b>' + o.series.map(function (s) { return '<div><i style="background:' + s.color + '"></i>' + esc(s.name) + ': ' + num(s.values[i]) + ' ' + (o.unit || '') + '</div>'; }).join(''));
    };
    cv.onmouseleave = hideTip;
  }

  // Horizontal bars: o = { rows: [{ label, value, sub, color }], unit }
  function hbarChart(id, o) {
    var cv = $(id); if (!cv || !cv.clientWidth) { return; }
    var rowH = 26; cv.style.height = Math.max(60, o.rows.length * rowH + 8) + 'px';
    var c = setup(cv), g = c.g, labelW = Math.min(190, c.w * 0.42), pr = 64;
    var max = Math.max.apply(null, o.rows.map(function (r) { return r.value; }).concat([1]));
    o.rows.forEach(function (r, i) {
      var yy = 4 + i * rowH, bw = Math.max(2, (c.w - labelW - pr) * r.value / max);
      g.fillStyle = INK; g.textAlign = 'left'; g.textBaseline = 'middle';
      var lb = r.label; while (g.measureText(lb).width > labelW - 10 && lb.length > 4) { lb = lb.slice(0, -2); }
      g.fillText(lb === r.label ? lb : lb + '…', 0, yy + rowH / 2 - 2);
      g.fillStyle = r.color || COL[0]; roundRect(g, labelW, yy + 5, bw, rowH - 12, 4); g.fill();
      g.fillStyle = MUTED; g.fillText(num(r.value) + (o.unit ? ' ' + o.unit : ''), labelW + bw + 6, yy + rowH / 2 - 2);
    });
    cv.onmousemove = function (ev) {
      var r = cv.getBoundingClientRect(), i = Math.floor((ev.clientY - r.top - 4) / rowH), row = o.rows[i];
      if (row) { showTip(ev, '<b>' + esc(row.label) + '</b><div>' + num(row.value) + ' ' + (o.unit || '') + '</div>' + (row.sub ? '<div>' + esc(row.sub) + '</div>' : '')); } else { hideTip(); }
    };
    cv.onmouseleave = hideTip;
  }

  // Vertical bars: o = { labels, series: [{ name, color, values }], unit }
  function barChart(id, o) {
    var cv = $(id); if (!cv || !cv.clientWidth) { return; }
    legend($(id + 'Key'), o.series);
    var c = setup(cv), g = c.g, pl = 40, pr = 8, pt = 16, pb = 22, n = o.labels.length, m = o.series.length;
    var all = []; o.series.forEach(function (s) { all = all.concat(s.values); });
    var top = niceMax(Math.max.apply(null, all.concat([1])));
    function y(v) { return pt + (c.h - pt - pb) * (1 - v / top); }
    g.strokeStyle = GRID; g.fillStyle = MUTED; g.lineWidth = 1; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (var k = 0; k <= 4; k++) { var v = top * k / 4; g.beginPath(); g.moveTo(pl, y(v)); g.lineTo(c.w - pr, y(v)); g.stroke(); g.fillText(num(v), pl - 6, y(v)); }
    var band = (c.w - pl - pr) / n, bw = Math.min(34, (band - 10) / m - 2);
    o.labels.forEach(function (lb, i) {
      g.fillStyle = MUTED; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(lb, pl + band * (i + 0.5), c.h - pb + 6);
      o.series.forEach(function (s, j) {
        var bx = pl + band * (i + 0.5) - (m * (bw + 2)) / 2 + j * (bw + 2) + 1, by = y(s.values[i]);
        g.fillStyle = s.color; roundRect(g, bx, by, bw, Math.max(1, c.h - pb - by), 4); g.fill();
        if (m === 1) { g.fillStyle = MUTED; g.textBaseline = 'bottom'; g.fillText(num(s.values[i]), bx + bw / 2, by - 2); g.textBaseline = 'top'; }
      });
    });
    cv.onmousemove = function (ev) {
      var r = cv.getBoundingClientRect(), i = Math.floor((ev.clientX - r.left - pl) / band);
      if (i >= 0 && i < n) { showTip(ev, '<b>' + esc(o.labels[i]) + '</b>' + o.series.map(function (s) { return '<div><i style="background:' + s.color + '"></i>' + esc(s.name) + ': ' + num(s.values[i]) + ' ' + (o.unit || '') + '</div>'; }).join('')); } else { hideTip(); }
    };
    cv.onmouseleave = hideTip;
  }

  // Donut: o = { rows: [{ label, value, color }], unit, centre }. The key beside it carries every label and value.
  function pieChart(id, o) {
    var cv = $(id); if (!cv || !cv.clientWidth) { return; }
    var c = setup(cv), g = c.g, rows = o.rows.filter(function (r) { return r.value > 0; }), total = rows.reduce(function (s, r) { return s + r.value; }, 0) || 1;
    var cx = c.w / 2, cy = c.h / 2, R = Math.min(c.w, c.h) / 2 - 6, r0 = R * 0.58, a = -Math.PI / 2, arcs = [];
    rows.forEach(function (r) {
      var da = 2 * Math.PI * r.value / total, gap = rows.length > 1 ? 0.012 : 0;
      g.beginPath(); g.arc(cx, cy, R, a + gap, a + da - gap); g.arc(cx, cy, r0, a + da - gap, a + gap, true); g.closePath(); g.fillStyle = r.color; g.fill();
      arcs.push({ from: a, to: a + da, row: r }); a += da;
    });
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 20px system-ui, sans-serif'; g.fillText(o.centre != null ? o.centre : num(total), cx, cy - 6);
    g.fillStyle = MUTED; g.font = '11px system-ui, sans-serif'; g.fillText(o.unit || '', cx, cy + 14);
    $(id + 'Key').innerHTML = o.rows.map(function (r) { return '<div><i style="background:' + r.color + '"></i><span>' + esc(r.label) + '</span><b>' + (o.decimals ? r.value.toFixed(o.decimals) : num(r.value)) + ' · ' + Math.round(100 * r.value / total) + '%</b></div>'; }).join('');
    cv.onmousemove = function (ev) {
      var b = cv.getBoundingClientRect(), dx = ev.clientX - b.left - cx, dy = ev.clientY - b.top - cy, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      if (ang < -Math.PI / 2) { ang += 2 * Math.PI; }
      var hit = d >= r0 && d <= R ? arcs.filter(function (x) { return ang >= x.from && ang < x.to; })[0] : null;
      if (hit) { showTip(ev, '<b>' + esc(hit.row.label) + '</b><div>' + num(hit.row.value) + ' ' + (o.unit || '') + ' · ' + Math.round(100 * hit.row.value / total) + '%</div>'); } else { hideTip(); }
    };
    cv.onmouseleave = hideTip;
  }

  /* ================= model ================= */
  var growth = A.growthPerYear, horizon = A.horizonYears, M = null;
  // Volume-delay (BPR): speed ratio r = 1 / (1 + a·x^b), x = volume ÷ capacity. Invert it to read x from today's
  // ratio, grow x with demand, and read the future ratio back.
  function xOf(r) { return r >= 0.985 ? 0.35 : Math.pow((1 / Math.max(r, 0.04) - 1) / A.bprAlpha, 1 / A.bprBeta); }
  function rOf(x) { return 1 / (1 + A.bprAlpha * Math.pow(x, A.bprBeta)); }

  function build() {
    var edges = C.edges(), names = C.names(), n = edges.length, meta = C.meta();
    var bins = C.scenarioMeta(state.scenario).bins, wd = window.TwinDay.build(bins, '2026-01-06', CFG.time).map;   // a reference working day
    var peakBin = wd[Math.floor(8 * 3600 / C.SLOT)];
    var r0 = new Float32Array(n), occ = new Float32Array(n), x0 = new Float32Array(n);
    for (var i = 0; i < n; i++) { r0[i] = C.ratioAt(peakBin, i); occ[i] = C.occAt(peakBin, i); x0[i] = xOf(r0[i]); }

    /* ---- roads ---- */
    var roads = C.groups().filter(function (g) { return g.c <= 3; }).map(function (g) {
      var o = 0, fr = 0, xs = 0, lanes = 0, len = 0;
      g.idx.forEach(function (i) { o += occ[i]; fr += occ[i] * r0[i]; xs += occ[i] * x0[i]; lanes += edges[i].l * edges[i].m; len += edges[i].m; });
      if (o < 40) { return null; }
      var L = Math.max(1, Math.round(lanes / len)), x = xs / o, ratio = fr / o;
      return { g: g, name: g.name, cls: g.c, lanes: L, vehicles: o, x: x, ratio: ratio, km: len / 2000 };
    }).filter(Boolean);
    function project(rd, years, extraLanes) {
      var f = Math.pow(1 + growth, years), x = rd.x * f * (extraLanes ? rd.lanes / (rd.lanes + extraLanes) : 1), r = rOf(x);
      return { ratio: r, delay: rd.vehicles * f * (1 - r) };          // vehicle-hours lost in the peak hour
    }
    roads.forEach(function (rd) {
      rd.now = project(rd, 0, 0); rd.future = project(rd, horizon, 0); rd.widened = project(rd, horizon, 1);
      rd.saved = rd.future.delay - rd.widened.delay;
      rd.criticalYear = null;
      for (var yv = 0; yv <= 20; yv++) { if (project(rd, yv, 0).ratio < A.criticalRatio) { rd.criticalYear = yv; break; } }
    });
    roads.sort(function (a, b) { return b.saved - a.saved; });
    var widenSet = {}; roads.slice(0, A.roadsToWiden).forEach(function (rd) { rd.g.idx.forEach(function (i) { widenSet[i] = rd.lanes; }); });

    /* ---- signals ---- */
    var sig = C.signals() || [], junctions = [];
    if (sig.length) {
      var cell = 0.0015, grid = {};
      edges.forEach(function (e, i) { var p = e.path[e.path.length - 1], k = Math.floor(p[0] / cell) + ':' + Math.floor(p[1] / cell); (grid[k] = grid[k] || []).push(i); });
      var kx = 111320 * Math.cos(24.4 * Math.PI / 180), ky = 110570;
      sig.forEach(function (p, si) {
        var gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell), app = [];
        for (var dx = -1; dx <= 1; dx++) { for (var dy = -1; dy <= 1; dy++) { (grid[(gx + dx) + ':' + (gy + dy)] || []).forEach(function (i) {
          var q = edges[i].path[edges[i].path.length - 1]; if (Math.hypot((q[0] - p[0]) * kx, (q[1] - p[1]) * ky) < 90) { app.push(i); }
        }); } }
        if (!app.length) { return; }
        var o = 0, fr = 0, count = {};
        app.forEach(function (i) { o += occ[i]; fr += occ[i] * r0[i]; var nm = names[edges[i].n]; if (nm) { count[nm] = (count[nm] || 0) + occ[i] + 0.01; } });
        if (o < 3) { return; }
        var top2 = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 2);
        var ratio = fr / o;
        junctions.push({ id: 'SIG-' + String(si + 1).padStart(3, '0'), name: top2.join(' / ') || 'Unnamed junction', lon: p[0], lat: p[1], approaches: app, vehicles: o,
          ratio: ratio, delay: o * (1 - ratio), los: ratio >= 0.85 ? 'A' : ratio >= 0.7 ? 'B' : ratio >= 0.55 ? 'C' : ratio >= 0.4 ? 'D' : ratio >= 0.25 ? 'E' : 'F' });
      });
      junctions.sort(function (a, b) { return b.delay - a.delay; });
    }
    var sigSet = {}; junctions.slice(0, A.signalsToUpgrade).forEach(function (j) { j.approaches.forEach(function (i) { sigSet[i] = 1; }); });

    /* ---- network by year, three cases ---- */
    var years = [], sDo = [], sRoad = [], sBoth = [], critical = [];
    for (var yv = 0; yv <= horizon; yv++) {
      var f = Math.pow(1 + growth, yv), vk = [0, 0, 0], vh = [0, 0, 0];
      for (var e = 0; e < n; e++) {
        if (!occ[e]) { continue; }
        var ff = edges[e].s, veh = occ[e] * f, x = x0[e] * f;
        var ra = rOf(x), rb = rOf(widenSet[e] ? x * widenSet[e] / (widenSet[e] + 1) : x);
        // Adaptive signal control is modelled as a share of the approach delay removed.
        var rc = sigSet[e] ? 1 - (1 - rb) * (1 - A.adaptiveSignalDelayReduction) : rb;
        [ra, rb, rc].forEach(function (r, k) { vk[k] += veh * ff * r; vh[k] += veh; });
      }
      years.push('+' + yv); sDo.push(vk[0] / vh[0]); sRoad.push(vk[1] / vh[1]); sBoth.push(vk[2] / vh[2]);
      critical.push(roads.filter(function (rd) { return project(rd, yv, 0).ratio < A.criticalRatio; }).length);
    }

    /* ---- day-level figures ---- */
    var dayK = bins && wd ? Array.prototype.map.call(wd, function (b) { return bins[b]; }) : [];
    var dailyDelay = dayK.reduce(function (s, k) { return s + k.delay_h * C.SLOT / 3600; }, 0);
    var hours = [], co2 = [];
    for (var h = 0; h < 24; h++) {
      var tot = 0;
      for (var s2 = h * 12; s2 < h * 12 + 12; s2++) { var k = dayK[s2]; if (k && k.speed) { tot += k.vehicles * k.speed * (A.co2.baseGPerKm + A.co2.congestionGKmh / k.speed) / 12; } }
      hours.push(C.pad(h)); co2.push(tot / 1e6);                         // tonnes in the hour
    }
    function daySeries(id, key) { var sm = C.scenarioMeta(id); if (!sm) { return null; } var mp = window.TwinDay.build(sm.bins, '2026-01-06', CFG.time).map, out = []; for (var hh = 0; hh < 24; hh++) { out.push(sm.bins[mp[hh * 12 + 6]][key || 'speed']); } return out; }

    /* ---- accident risk (relative exposure index, illustrative) ---- */
    var risk = C.groups().map(function (g) {
      var v = 0; g.idx.forEach(function (i) { v += occ[i] * (edges[i].s * r0[i]) * (1 + 2 * (1 - r0[i])); });
      return { g: g, name: g.name, value: v };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    var rmax = risk.length ? risk[0].value : 1; risk.forEach(function (r) { r.value = 100 * r.value / rmax; });

    /* ---- noise by road, peak hour ---- */
    var EV = T.environment, heavy = EV ? EV.heavyPct() : 8, noiseBands = [0, 0, 0, 0, 0];
    if (EV) {
      C.groups().forEach(function (g) {
        var fl = 0, sp = 0, o = 0, len = 0;
        g.idx.forEach(function (i) { if (occ[i]) { var v = edges[i].s * r0[i]; fl += occ[i] * (v / 3.6) / Math.max(25, edges[i].m) * 3600; sp += occ[i] * v; o += occ[i]; } len += edges[i].m; });
        if (!o) { return; }
        var db = EV.noiseDb(fl / g.idx.length * 2, sp / o, heavy), km = len / 2000;
        noiseBands[db < 60 ? 0 : db < 65 ? 1 : db < 70 ? 2 : db < 75 ? 3 : 4] += km;
      });
    }
    /* ---- environmental sensors: peak readings and the day profile (synthetic) ---- */
    var env = null;
    if (EV && EV.sensors().length) {
      var peakT = 8 * 3600, rows2 = EV.sensors().map(function (sn) { return { s: sn, r: EV.readingAt(sn, peakT) }; }), prof = { pm25: [], pm10: [], no2: [], noise: [] };
      for (var eh = 0; eh < 24; eh++) { var av = EV.averageAt(eh * 3600 + 1800); prof.pm25.push(av.pm25); prof.pm10.push(av.pm10); prof.no2.push(av.no2); prof.noise.push(av.noise); }
      env = { rows: rows2, prof: prof, peak: EV.averageAt(peakT) };
    }
    /* ---- accidents and violations for the day shown in the twin (illustrative) ---- */
    var evd = C.events(), safety = null, TY = window.TwinEvents.TYPES;
    if (evd) {
      var sev = {}, accHour = new Array(24).fill(0), vioHour = new Array(24).fill(0), E2 = window.TwinEvents;
      evd.accidents.forEach(function (ac) { sev[ac.severity] = (sev[ac.severity] || 0) + 1; accHour[Math.min(23, Math.floor(ac.t / 3600))]++; });
      var byType = TY.map(function (ty, i) { var cum = evd.cumByType[i]; return cum[cum.length - 1]; });
      for (var vh2 = 0; vh2 < 24; vh2++) { TY.forEach(function (ty, i) { vioHour[vh2] += E2.at(evd.cumByType[i], (vh2 + 1) * 3600) - E2.at(evd.cumByType[i], vh2 * 3600); }); }
      safety = { sev: sev, accHour: accHour, vioHour: vioHour, byType: byType, total: evd.accidents.length,
        fines: byType.reduce(function (a, b) { return a + b; }, 0), value: byType.reduce(function (a, b, i) { return a + b * TY[i].aed; }, 0),
        sites: evd.sites.map(function (st) { return { label: st.road, value: st.cum[st.cum.length - 1] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8) };
    }
    var peakVehicles = 0; for (var pv = 0; pv < n; pv++) { peakVehicles += occ[pv]; }
    M = { noiseBands: noiseBands, env: env, safety: safety, vehDay: { base: daySeries('base', 'vehicles'), high: daySeries('high', 'vehicles'), low: daySeries('low', 'vehicles') }, peakVehicles: peakVehicles, railKm: C.railKm(), cycleKm: C.cycleKm(), roads: roads, junctions: junctions, years: years, sDo: sDo, sRoad: sRoad, sBoth: sBoth, critical: critical, dailyDelay: dailyDelay,
      hours: hours, co2: co2, risk: risk, speeds: { base: daySeries('base'), high: daySeries('high'), low: daySeries('low') }, meta: meta };
  }

  /* ================= rendering ================= */
  function safeScore() { try { renderScore(); } catch (err) { $('scBody').innerHTML = '<p class="muted">The scorecard could not be worked out: ' + esc(String(err && err.message)) + '</p>'; } }
  function tile(label, value, sub, tone) { return '<div class="an-tile' + (tone ? ' ' + tone : '') + '"><span>' + label + '</span><b>' + value + '</b><em>' + (sub || '') + '</em></div>'; }
  function statusWord(r) { return r < A.criticalRatio ? ['Critical', 'critical'] : r < 0.6 ? ['Congested', 'serious'] : r < 0.8 ? ['Busy', 'warning'] : ['Free-flowing', 'good']; }
  function chip(r) { var s = statusWord(r); return '<span class="an-status"><i style="background:' + STATUS[s[1]] + '"></i>' + s[0] + '</span>'; }
  function locate(fn) { return function () { close(); fn(); }; }

  function render() {
    themeInk();
    if (!M) { build(); }
    safeScore();
    if (T.analyticsOps) { try { T.analyticsOps.render(); } catch (err) { if (window.console) { console.warn('IntelliTwin analytics (operations): ' + err.message); } } }
    var H = horizon, roads = M.roads, J = M.junctions, last = M.years.length - 1;
    var cost = M.dailyDelay * A.valueOfTimeAedPerHour * A.workingDaysPerYear, fMid = Math.min(5, H);
    var losCount = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }; J.forEach(function (j) { losCount[j.los]++; });
    var sigDelay = J.reduce(function (s, j) { return s + j.delay; }, 0), upgSaved = J.slice(0, A.signalsToUpgrade).reduce(function (s, j) { return s + j.delay * A.adaptiveSignalDelayReduction; }, 0);
    var co2Day = M.co2.reduce(function (s, v) { return s + v; }, 0);

    /* ---- overview ---- */
    $('anOverTiles').innerHTML =
      tile('Peak network speed today', Math.round(M.sDo[0]) + ' km/h', 'working day, 08:00') +
      tile('In ' + H + ' years, no action', Math.round(M.sDo[last]) + ' km/h', (M.sDo[last] - M.sDo[0] >= 0 ? '+' : '−') + Math.abs(Math.round(M.sDo[last] - M.sDo[0])) + ' km/h at ' + (growth * 100).toFixed(1) + '% growth a year', 'bad') +
      tile('With road and signal measures', Math.round(M.sBoth[last]) + ' km/h', '+' + Math.round(M.sBoth[last] - M.sDo[last]) + ' km/h against no action', 'good') +
      tile('Critical roads at the peak', M.critical[0] + ' → ' + M.critical[last], 'today → in ' + H + ' years (under ' + Math.round(A.criticalRatio * 100) + '% of limit)') +
      tile('Junctions at service level E or F', (losCount.E + losCount.F) + ' of ' + J.length, J.length ? 'signalised, peak hour' : 'signal positions not loaded') +
      tile('Delay cost a year', 'AED ' + num(cost / 1e6) + ' m', num(M.dailyDelay) + ' vehicle-hours a day × AED ' + A.valueOfTimeAedPerHour);
    lineChart('anNet', { labels: M.years, unit: 'km/h', yMin: Math.max(0, Math.floor(Math.min.apply(null, M.sDo) / 10) * 10 - 10), series: [
      { name: 'No action', color: COL[0], values: M.sDo }, { name: 'Widen ' + A.roadsToWiden + ' roads', color: COL[1], values: M.sRoad },
      { name: 'Roads + ' + A.signalsToUpgrade + ' adaptive signals', color: COL[2], values: M.sBoth, dash: [7, 5] }] });
    barChart('anCrit', { labels: M.years, unit: 'roads', series: [{ name: 'Critical roads', color: COL[0], values: M.critical }] });
    $('anRecs').innerHTML = '';
    roads.slice(0, 3).forEach(function (rd) {
      $('anRecs').appendChild(C.listButton('severe', 'Widen ' + rd.name, 'Saves about ' + num(rd.saved) + ' vehicle-hours in the peak hour in ' + H + ' years', '+1 lane', locate(function () { C.locate(rd.g); })));
    });
    J.slice(0, 3).forEach(function (j) {
      $('anRecs').appendChild(C.listButton('heavy', 'Adaptive control at ' + j.name, 'Service level ' + j.los + ' · about ' + num(j.delay * A.adaptiveSignalDelayReduction) + ' vehicle-hours saved in the peak hour', j.id, locate(function () { C.flyTo(j.lon, j.lat, 16); })));
    });

    /* ---- road expansion ---- */
    var crit5 = roads.filter(function (rd) { return rd.criticalYear != null && rd.criticalYear <= fMid; }).length;
    var savedTop = roads.slice(0, A.roadsToWiden).reduce(function (s, rd) { return s + rd.saved; }, 0), kmTop = roads.slice(0, A.roadsToWiden).reduce(function (s, rd) { return s + rd.km; }, 0);
    $('anRoadTiles').innerHTML =
      tile('Roads assessed', roads.length, 'primary to secondary, with peak traffic') +
      tile('Critical within ' + fMid + ' years', crit5, 'peak speed under ' + Math.round(A.criticalRatio * 100) + '% of limit', crit5 ? 'bad' : '') +
      tile('Top ' + A.roadsToWiden + ' widening schemes', num(kmTop) + ' km', 'one extra lane each way') +
      tile('Peak-hour delay saved', num(savedTop) + ' veh-h', 'in ' + H + ' years, against no action', 'good');
    var topR = roads.slice(0, 10);
    hbarChart('anRoadBar', { unit: 'veh-h', rows: topR.map(function (rd) { return { label: rd.name, value: rd.saved, sub: rd.lanes + ' → ' + (rd.lanes + 1) + ' lanes · peak speed ' + Math.round(rd.future.ratio * 100) + '% → ' + Math.round(rd.widened.ratio * 100) + '% of limit' }; }) });
    barChart('anRoadCmp', { labels: topR.slice(0, 6).map(function (rd) { return rd.name.length > 14 ? rd.name.slice(0, 13) + '…' : rd.name; }), unit: '% of limit', series: [
      { name: 'Today', color: COL[0], values: topR.slice(0, 6).map(function (rd) { return rd.now.ratio * 100; }) },
      { name: 'In ' + H + ' years', color: COL[1], values: topR.slice(0, 6).map(function (rd) { return rd.future.ratio * 100; }) },
      { name: 'In ' + H + ' years, widened', color: COL[2], values: topR.slice(0, 6).map(function (rd) { return rd.widened.ratio * 100; }) }] });
    $('anRoadTable').innerHTML = '<tr><th>Road</th><th>Lanes</th><th>Peak speed today</th><th>In ' + H + ' years</th><th>Widened</th><th>Critical in</th><th>Delay saved</th><th></th></tr>' +
      roads.slice(0, 15).map(function (rd, i) {
        return '<tr><td>' + esc(rd.name) + '</td><td>' + rd.lanes + '</td><td>' + Math.round(rd.now.ratio * 100) + '% ' + chip(rd.now.ratio) + '</td><td>' + Math.round(rd.future.ratio * 100) + '% ' + chip(rd.future.ratio) +
          '</td><td>' + Math.round(rd.widened.ratio * 100) + '%</td><td>' + (rd.criticalYear == null ? 'over 20 years' : rd.criticalYear === 0 ? 'now' : rd.criticalYear + ' years') + '</td><td>' + num(rd.saved) + ' veh-h</td><td><button class="btn small" data-road="' + i + '">Map</button></td></tr>';
      }).join('');
    Array.prototype.forEach.call($('anRoadTable').querySelectorAll('[data-road]'), function (b) { b.onclick = locate(function () { C.locate(roads[Number(b.getAttribute('data-road'))].g); }); });

    /* ---- signals ---- */
    $('anSigTiles').innerHTML = J.length ?
      tile('Signalised junctions', J.length, 'positions from OpenStreetMap') +
      tile('Service level E or F', losCount.E + losCount.F, 'peak hour, by approach speed', (losCount.E + losCount.F) ? 'bad' : '') +
      tile('Approach delay at the peak', num(sigDelay) + ' veh-h', 'all junctions, per hour') +
      tile('Saved by ' + A.signalsToUpgrade + ' adaptive signals', num(upgSaved) + ' veh-h', Math.round(A.adaptiveSignalDelayReduction * 100) + '% of their delay (assumed)', 'good') :
      tile('Signalised junctions', '–', 'signal positions are not in this data build');
    barChart('anLos', { labels: ['A', 'B', 'C', 'D', 'E', 'F'], unit: 'junctions', series: [{ name: 'Junctions', color: COL[0], values: ['A', 'B', 'C', 'D', 'E', 'F'].map(function (k) { return losCount[k]; }) }] });
    hbarChart('anSigBar', { unit: 'veh-h', rows: J.slice(0, 10).map(function (j) { return { label: j.name, value: j.delay, sub: j.id + ' · service level ' + j.los + ' · ' + num(j.vehicles) + ' vehicles on approaches' }; }) });
    $('anSigTable').innerHTML = '<tr><th>Junction</th><th>Id</th><th>Service level</th><th>Approach speed</th><th>Peak delay</th><th>Adaptive control saves</th><th></th></tr>' +
      J.slice(0, 15).map(function (j, i) {
        return '<tr><td>' + esc(j.name) + '</td><td>' + j.id + '</td><td>' + j.los + ' ' + chip(j.ratio) + '</td><td>' + Math.round(j.ratio * 100) + '% of limit</td><td>' + num(j.delay) + ' veh-h</td><td>' +
          num(j.delay * A.adaptiveSignalDelayReduction) + ' veh-h</td><td><button class="btn small" data-sig="' + i + '">Map</button></td></tr>';
      }).join('');
    Array.prototype.forEach.call($('anSigTable').querySelectorAll('[data-sig]'), function (b) { b.onclick = locate(function () { var j = J[Number(b.getAttribute('data-sig'))]; C.flyTo(j.lon, j.lat, 16); }); });

    /* ---- population and fleet ---- */
    var hasPop = !!A.population, P = A.population || { year: new Date().getFullYear(), abuDhabiRegion: 0, alAinRegion: 0, alDhafraRegion: 0, emirate: 0, growthPerYear: 0 }, mix = window.TwinCars.MIX, mt = window.TwinCars.mixTotal, peakVeh = M.peakVehicles;
    var popSeries = [], popLabels = [];
    for (var py = 0; py <= H; py++) { popLabels.push(String(P.year + py)); popSeries.push(P.abuDhabiRegion * Math.pow(1 + P.growthPerYear, py) / 1e6); }
    $('anPopTiles').innerHTML =
      (hasPop ? tile('Abu Dhabi Region residents', num(P.abuDhabiRegion), P.year + ', as quoted from SCAD') +
      tile('Emirate residents', num(P.emirate), 'three regions') +
      tile('Region residents in ' + H + ' years', (popSeries[H]).toFixed(1) + ' m', 'at ' + (P.growthPerYear * 100).toFixed(1) + '% a year, if the ' + (P.year - 1) + '–' + P.year + ' rate held') : tile('Residents', '–', 'Population figures are set for Abu Dhabi only; add this region’s in config.js')) +
      tile('Vehicles moving at the peak', num(peakVeh), 'synthetic, working day 08:00') +
      tile('Railway in the study area', M.railKm ? num(M.railKm) + ' km' : '–', M.railKm ? 'from OpenStreetMap' : 'not in this data build') +
      tile('Cycle tracks', M.cycleKm ? num(M.cycleKm) + ' km' : '–', M.cycleKm ? 'from OpenStreetMap' : 'not in this data build');
    if (hasPop) { barChart('anPopReg', { labels: ['Abu Dhabi', 'Al Ain', 'Al Dhafra'], unit: 'residents', series: [{ name: 'Residents', color: COL[0], values: [P.abuDhabiRegion, P.alAinRegion, P.alDhafraRegion] }] });
    lineChart('anPopLine', { labels: popLabels, unit: 'million', yMin: 0, series: [{ name: 'Residents', color: COL[0], values: popSeries.map(function (v) { return Math.round(v * 100) / 100; }) }] }); }
    hbarChart('anFleet', { unit: 'vehicles', rows: mix.map(function (mx) { return { label: mx.label, value: peakVeh * mx.share / mt, sub: Math.round(100 * mx.share / mt) + '% of traffic (assumed share)' }; }) });
    var kmc = (M.meta.network || {}).km_by_class || {}, roadKm = Object.keys(kmc).reduce(function (sum, k) { return sum + kmc[k]; }, 0);
    hbarChart('anModes', { unit: 'km', rows: [{ label: 'Roads in the model (by direction)', value: roadKm }, { label: 'Cycle tracks', value: M.cycleKm }, { label: 'Railway', value: M.railKm }] });

    /* ---- demand, safety, environment ---- */
    var sp = M.speeds, ser = [{ name: 'Typical weekday', color: COL[0], values: sp.base }];
    if (sp.high) { ser.push({ name: 'Demand +20%', color: COL[1], values: sp.high }); }
    if (sp.low) { ser.push({ name: 'Demand −20% (staggered hours)', color: COL[2], values: sp.low }); }
    var pk = 8;
    $('anOtherTiles').innerHTML =
      tile('Staggered hours at the peak', sp.low ? '+' + Math.round(sp.low[pk] - sp.base[pk]) + ' km/h' : '–', '20% fewer trips at 08:00', 'good') +
      tile('Growth of 20% at the peak', sp.high ? Math.round(sp.high[pk] - sp.base[pk]) + ' km/h' : '–', 'no new capacity', 'bad') +
      tile('Peak vehicles moving', num(Math.max.apply(null, M.vehDay.base)), 'typical working day') +
      tile('Quietest hour', C.pad(M.vehDay.base.indexOf(Math.min.apply(null, M.vehDay.base))) + ':00', 'fewest vehicles moving');
    lineChart('anDemand', { labels: M.hours, unit: 'km/h', yMin: 0, series: ser });
    var vser = [{ name: 'Typical weekday', color: COL[0], values: M.vehDay.base }];
    if (M.vehDay.high) { vser.push({ name: 'Demand +20%', color: COL[1], values: M.vehDay.high }); }
    if (M.vehDay.low) { vser.push({ name: 'Demand −20% (staggered hours)', color: COL[2], values: M.vehDay.low }); }
    lineChart('anVehDay', { labels: M.hours, unit: 'vehicles', yMin: 0, series: vser });

    /* ---- environment: air quality, noise, CO2 ---- */
    var EVN = T.environment, env = M.env, TF = A.co2.typeFactor || {}, mixE = window.TwinCars.MIX;
    var wsum = mixE.reduce(function (sm, mx) { return sm + mx.share * (TF[mx.id] || 1); }, 0) || 1;
    var loud = env ? env.rows.filter(function (x) { return x.r.noise >= 70; }).length : 0;
    $('anEnvTiles').innerHTML = (env ?
      tile('Air quality index at the peak', Math.round(env.peak.aqi), EVN.band(env.peak.aqi).label + ', sensor average', env.peak.aqi > 100 ? 'bad' : '') +
      tile('PM2.5 · NO₂ at the peak', env.peak.pm25.toFixed(0) + ' · ' + env.peak.no2.toFixed(0), 'µg/m³, sensor average') +
      tile('Noise at the peak', env.peak.noise.toFixed(0) + ' dB(A)', loud + ' of ' + env.rows.length + ' sensors at 70 dB(A) or more', loud ? 'bad' : '') :
      tile('Environmental sensors', '–', 'none available')) +
      tile('CO₂ from traffic a day', num(co2Day) + ' t', 'emission factor assumed') +
      tile('Roads at 70 dB(A) or more', num(M.noiseBands[3] + M.noiseBands[4]) + ' km', 'at 10 m from the kerb, peak hour');
    if (env) {
      var cnt = EVN.bands.map(function () { return 0; });
      env.rows.forEach(function (x) { cnt[EVN.bands.indexOf(x.r.band)]++; });
      pieChart('anAqiPie', { unit: 'sensors', rows: EVN.bands.map(function (bd, i) { return { label: bd.label, value: cnt[i], color: bd.css }; }) });
      lineChart('anPoll', { labels: M.hours, unit: 'µg/m³', yMin: 0, series: [{ name: 'PM10', color: COL[0], values: env.prof.pm10 }, { name: 'NO₂', color: COL[1], values: env.prof.no2 }, { name: 'PM2.5', color: COL[2], values: env.prof.pm25 }] });
      hbarChart('anNoiseBar', { unit: 'dB(A)', rows: env.rows.slice().sort(function (x, y) { return y.r.noise - x.r.noise; }).slice(0, 10).map(function (x) { return { label: x.s.id + ' · ' + x.s.name, value: Math.round(x.r.noise), sub: 'Synthetic reading at 08:00' }; }) });
    }
    barChart('anNoiseBand', { labels: ['under 60', '60–65', '65–70', '70–75', '75 or more'], unit: 'km', series: [{ name: 'Road length', color: COL[0], values: M.noiseBands.map(Math.round) }] });
    lineChart('anCo2', { labels: M.hours, unit: 't CO₂', yMin: 0, series: [{ name: 'CO₂ per hour', color: COL[0], values: M.co2 }] });
    pieChart('anCo2Pie', { unit: 't CO₂ a day', rows: mixE.map(function (mx, i) { return { label: mx.label, value: co2Day * mx.share * (TF[mx.id] || 1) / wsum, color: COL[i % COL.length] }; }) });

    /* ---- accidents and violations (illustrative) ---- */
    var S = M.safety, TYP = window.TwinEvents.TYPES;
    if (S) {
      var sevOrder = [['Damage only', STATUS.warning], ['Minor injury', STATUS.serious], ['Serious injury', STATUS.critical]], pkA = S.accHour.indexOf(Math.max.apply(null, S.accHour)), pkV = S.vioHour.indexOf(Math.max.apply(null, S.vioHour));
      $('anSafeTiles').innerHTML =
        tile('Accidents in the day', num(S.total), 'illustrative · busiest hour ' + C.pad(pkA) + ':00') +
        tile('With injury', num((S.sev['Minor injury'] || 0) + (S.sev['Serious injury'] || 0)), num(S.sev['Serious injury'] || 0) + ' serious', (S.sev['Serious injury'] || 0) ? 'bad' : '') +
        tile('Violations in the day', num(S.fines), 'illustrative · busiest hour ' + C.pad(pkV) + ':00') +
        tile('Fine value', 'AED ' + num(S.value), 'placeholder fine values');
      pieChart('anAccPie', { unit: 'accidents', rows: sevOrder.map(function (x) { return { label: x[0], value: S.sev[x[0]] || 0, color: x[1] }; }) });
      barChart('anAccHour', { labels: M.hours, unit: 'accidents', series: [{ name: 'Accidents', color: COL[0], values: S.accHour }] });
      pieChart('anVioPie', { unit: 'violations', rows: TYP.map(function (ty, i) { return { label: ty.label, value: Math.round(S.byType[i]), color: COL[i % COL.length] }; }) });
      lineChart('anVioHour', { labels: M.hours, unit: 'violations', yMin: 0, series: [{ name: 'Violations', color: COL[0], values: S.vioHour.map(Math.round) }] });
      hbarChart('anVioSites', { unit: 'violations', rows: S.sites.map(function (x) { return { label: x.label, value: Math.round(x.value), sub: 'Illustrative enforcement site' }; }) });
    }
    hbarChart('anRisk', { unit: '', rows: M.risk.map(function (r) { return { label: r.name, value: r.value, sub: 'Relative exposure index: traffic volume, weighted up where it is slow. Not an accident count.' }; }) });
    $('anAssume').textContent = 'Growth ' + (growth * 100).toFixed(1) + '% a year over ' + H + ' years · volume-delay curve a = ' + A.bprAlpha + ', b = ' + A.bprBeta +
      ' · value of time AED ' + A.valueOfTimeAedPerHour + ' per vehicle-hour · ' + A.workingDaysPerYear + ' working days · adaptive signals remove ' + Math.round(A.adaptiveSignalDelayReduction * 100) + '% of approach delay.';
  }

  /* ================= city scorecard ================= */
  // One KPI: value against an example target. better = 'low' (at or under the target) or 'high' (at or over it).
  function kpi(label, value, unit, target, better, basis, fmt) {
    var ok = value !== null && isFinite(value), ratio = !ok ? null : better === 'low' ? (target ? value / target : (value ? 2 : 1)) : (value ? target / value : 2);
    var st = !ok ? 'none' : ratio <= 1 ? 'good' : ratio <= 1.25 ? 'warn' : 'bad';
    return { label: label, value: value, unit: unit, target: target, better: better, basis: basis, status: st, ratio: ratio, text: !ok ? '–' : (fmt ? fmt(value) : num(Math.round(value * 10) / 10)) };
  }
  var ST = { good: ['✓', 'On target'], warn: ['!', 'Watch'], bad: ['✕', 'Off target'], none: ['–', 'No data'] };
  function scorecard() {
    var G = (A.targets || {}), t = state.t, peak = C.kpiAt(state.scenario, 8 * 3600) || {}, now = C.kpiAt(state.scenario, t) || {}, J = M.junctions, S = M.safety || {};
    var ef = J.filter(function (j) { return j.los === 'E' || j.los === 'F'; }).length, co2Day = M.co2.reduce(function (a, v) { return a + v; }, 0);
    var buses = 0, onTime = 0;
    if (T.buses) { T.buses.routes().forEach(function (r) { var l = T.buses.busesOn(r, t); buses += l.length; l.forEach(function (b) { if (b.late < ((CFG.buses || {}).onTimeWithinMin || 3)) { onTime++; } }); }); }
    var z = T.zones ? T.zones.summary() : { total: 0, watch: 0, alert: 0 }, cams = T.devices ? T.devices.cameras().length : 0;
    var offline = T.ops ? T.ops.events().filter(function (e) { return /offline/i.test(e.type.label || e.type.id || ''); }).length : 0;
    var crit = T.ops ? T.ops.alerts().filter(function (a) { return a.sev >= 3; }).length : 0;
    var env = T.environment ? T.environment.averageAt(t) : null, serious = 0;
    Object.keys(S.sev || {}).forEach(function (k) { if (/serious|severe|fatal|major/i.test(k)) { serious += S.sev[k]; } });
    var topType = 0, topName = ''; (S.byType || []).forEach(function (v, i) { if (v > topType) { topType = v; topName = window.TwinEvents.TYPES[i].label || window.TwinEvents.TYPES[i].id; } });
    var top5 = (S.sites || []).slice(0, 5).reduce(function (a, r) { return a + r.value; }, 0), last = M.years.length - 1, pop = (A.population || {});
    var pct = function (v) { return Math.round(v) + '%'; };
    return [
      { goal: 'Smooth traffic', note: 'Simulated traffic for this day type', kpis: [
        kpi('Network speed at the morning peak', peak.speed, 'km/h', G.peakSpeedKmh, 'high', '08:00, all roads'),
        kpi('Extra travel time at the peak', peak.extra, '%', G.extraTravelPct, 'low', 'against free flow', pct),
        kpi('Vehicle delay a day', M.dailyDelay, 'veh-h', G.dailyDelayVehH, 'low', 'whole network, 24 hours'),
        kpi('Critical roads at the peak', M.critical[0], 'roads', G.criticalRoads, 'low', 'under ' + Math.round(A.criticalRatio * 100) + '% of the limit'),
        kpi('Junctions at service level E or F', J.length ? 100 * ef / J.length : null, '%', G.junctionsEFPct, 'low', ef + ' of ' + J.length + ' signalised', pct),
        kpi('Buses on time now', buses ? 100 * onTime / buses : null, '%', G.busOnTimePct, 'high', buses + ' synthetic buses in service', pct)] },
      { goal: 'Fewer accidents', note: 'Illustrative accident records, not real ones', kpis: [
        kpi('Accidents a day', S.total, '', G.accidentsPerDay, 'low', 'illustrative'),
        kpi('Serious accidents a day', S.total === undefined ? null : serious, '', G.seriousAccidentsPerDay, 'low', 'illustrative'),
        kpi('Accidents in the worst hour', S.accHour ? Math.max.apply(null, S.accHour) : null, '', G.accidentsWorstHour, 'low', S.accHour ? 'hour starting ' + C.pad(S.accHour.indexOf(Math.max.apply(null, S.accHour))) + ':00, illustrative' : ''),
        kpi('Critical alerts open now', crit, '', G.criticalAlertsOpen, 'low', 'synthetic alert feed')] },
      { goal: 'Fewer violations', note: 'Illustrative fines, not real ones', kpis: [
        kpi('Fines a day', S.fines, '', G.finesPerDay, 'low', 'all enforcement sites, illustrative'),
        kpi('Fines in the worst hour', S.vioHour ? Math.max.apply(null, S.vioHour) : null, '', G.finesWorstHour, 'low', S.vioHour ? 'hour starting ' + C.pad(S.vioHour.indexOf(Math.max.apply(null, S.vioHour))) + ':00, illustrative' : ''),
        kpi('Largest violation type', S.fines ? 100 * topType / S.fines : null, '%', G.topViolationSharePct, 'low', topName || 'share of all fines', pct),
        kpi('Share at the five busiest sites', S.fines ? 100 * top5 / S.fines : null, '%', G.topSitesSharePct, 'low', 'concentration of violations', pct)] },
      { goal: 'Safe and secure city', note: 'OpenStreetMap sites with synthetic status', kpis: [
        kpi('Critical sites monitored', z.total, 'sites', G.sitesMonitored, 'high', 'defence, embassies, hospitals, schools and others'),
        kpi('Sites on alert now', z.total ? 100 * z.alert / z.total : null, '%', G.sitesOnAlertPct, 'low', z.alert + ' on alert, ' + z.watch + ' on watch', function (v) { return v.toFixed(1) + '%'; }),
        kpi('Cameras online', cams ? 100 * (cams - offline) / cams : null, '%', G.camerasOnlinePct, 'high', cams + ' synthetic cameras', pct)] },
      { goal: 'Sea and air connections', note: 'Synthetic ship and flight movements', kpis: (function () {
        var se = T.sea ? T.sea.stats() : null, ai = T.air ? T.air.stats() : null;
        return [
          kpi('Flights on time this hour', ai ? ai.onTimePct : null, '%', G.flightsOnTimePct, 'high', ai ? ai.movementsHour + ' movements this hour' : '', pct),
          kpi('Average flight delay', ai ? ai.avgDelayMin : null, 'min', G.flightDelayMin, 'low', 'all movements this hour'),
          kpi('Flight movements today', ai ? ai.movementsToday : null, '', null, 'high', 'arrivals and departures so far'),
          kpi('Berths in use', se ? 100 * se.berthsUsed / se.berths : null, '%', G.berthUsePct, 'low', se ? se.berthsUsed + ' of ' + se.berths + ' berths' : '', pct),
          kpi('Vessel movements today', se ? se.callsToday : null, '', null, 'high', se ? se.moving + ' moving now' : '')];
      })() },
      { goal: 'Clean and liveable', note: 'Estimated emissions and synthetic sensors', kpis: [
        kpi('Road traffic CO₂ a day', co2Day, 't', G.co2TonnesPerDay, 'low', 'estimated from simulated traffic'),
        kpi('Air quality index, average now', env ? env.aqi : null, '', G.aqi, 'low', 'synthetic sensors'),
        kpi('Roadside noise, average now', env ? env.noise : null, 'dB', G.noiseDb, 'low', 'synthetic sensors')] },
      (function () {
        var cs = T.cityCases ? T.cityCases.stats() : null; if (!cs) { return null; }
        return { goal: 'Resilient city services', note: 'Synthetic and estimated figures from the operational sections', kpis: [
          kpi('Venues above 80% of capacity', cs.venuesHighPct, '%', G.venuesHighPct, 'low', cs.venues + ' venues watched, synthetic', pct),
          kpi('School zones with calm traffic', cs.schoolOkPct, '%', G.schoolZonesOkPct, 'high', cs.schoolTime ? 'school time now' : 'outside school time', pct),
          kpi('Corridors under adaptive control', cs.adaptivePct, '%', G.adaptiveCorridorsPct, 'high', 'set in Signals, simulated', pct),
          kpi('Asset health score', cs.assetHealth, '/100', G.assetHealth, 'high', cs.assetsAtRisk + ' assets likely to fail in 30 days, synthetic'),
          kpi('Planned work conflicts', cs.planConflicts, '', G.planConflicts, 'low', 'overlapping work within 2 km'),
          kpi('Average bus lateness now', cs.busLateMin, 'min', G.busLateMin, 'low', 'synthetic buses')] };
      })(),
      { goal: 'City development', note: 'Projection at ' + (growth * 100).toFixed(1) + '% growth a year', kpis: [
        kpi('Peak speed in ' + horizon + ' years, no action', M.sDo[last], 'km/h', G.futureSpeedKmh, 'high', 'against ' + Math.round(M.sDo[0]) + ' km/h today'),
        kpi('Peak speed in ' + horizon + ' years, with measures', M.sBoth[last], 'km/h', G.futureSpeedKmh, 'high', 'road widening and adaptive signals'),
        kpi('Critical roads in ' + horizon + ' years, no action', M.critical[last], 'roads', G.futureCriticalRoads, 'low', 'against ' + M.critical[0] + ' today'),
        kpi('Cycle track', M.cycleKm || null, 'km', G.cycleKm, 'high', 'OpenStreetMap'),
        kpi('Delay cost a year', M.dailyDelay * A.valueOfTimeAedPerHour * A.workingDaysPerYear / 1e6, 'AED m', G.delayCostAedMillion, 'low', 'value of time AED ' + A.valueOfTimeAedPerHour + ' an hour'),
        kpi('Residents, Abu Dhabi region', pop.abuDhabiRegion || null, '', null, 'high', pop.year ? 'census ' + pop.year + ', for context' : 'not set for this region')] }
    ].filter(function (g) { return g; });
  }
  function renderScore() {
    var goals = scorecard(), all = 0, good = 0, warn = 0, bad = 0, html = '';
    goals.forEach(function (g) {
      var scored = g.kpis.filter(function (k) { return k.target !== null && k.target !== undefined && k.status !== 'none'; }), ok = scored.filter(function (k) { return k.status === 'good'; }).length;
      scored.forEach(function (k) { all++; if (k.status === 'good') { good++; } else if (k.status === 'warn') { warn++; } else { bad++; } });
      html += '<section class="sc-goal"><h3>' + esc(g.goal) + '<span class="sc-count">' + ok + ' of ' + scored.length + ' on target</span><span class="sc-note">' + esc(g.note) + '</span></h3><div class="sc-grid">' +
        g.kpis.map(function (k) {
          var has = k.target !== null && k.target !== undefined, st = has ? k.status : 'none', okv = k.value !== null && isFinite(k.value), scale = has && okv ? Math.max(k.value, k.target, 1e-9) * 1.2 : 1;
          var fill = has && okv ? Math.max(2, 100 * k.value / scale) : 0, tick = has ? 100 * k.target / scale : 0;
          return '<div class="sc-kpi ' + st + '"><span class="sc-label">' + esc(k.label) + '</span><b>' + k.text + (k.unit && k.unit !== '%' ? ' <small>' + esc(k.unit) + '</small>' : '') + '</b>' +
            (has ? '<span class="sc-status"><i>' + ST[st][0] + '</i>' + ST[st][1] + ' · target ' + (k.better === 'low' ? '≤ ' : '≥ ') + num(k.target) + (k.unit === '%' ? '%' : '') + '</span><span class="sc-bullet" title="Value against the target (the marker)"><span class="sc-zone ' + (k.better === 'low' ? 'low' : 'high') + '" style="' + (k.better === 'low' ? 'width:' + tick.toFixed(1) + '%' : 'left:' + tick.toFixed(1) + '%;right:0') + '"></span><span class="sc-fill" style="width:' + Math.min(100, fill).toFixed(1) + '%"></span><i style="left:' + tick.toFixed(1) + '%"></i></span>' : '<span class="sc-status">For context</span>') +
            '<em>' + esc(k.basis) + '</em></div>';
        }).join('') + '</div></section>';
    });
    $('scBody').innerHTML = html;
    // Graphics above the detail: status split of all KPIs, and the share on target for each goal.
    pieChart('scDonut', { unit: 'KPIs', centre: all ? Math.round(100 * good / all) + '%' : '–', rows: [{ label: 'On target', color: STATUS.good, value: good }, { label: 'Watch', color: STATUS.warning, value: warn }, { label: 'Off target', color: STATUS.critical, value: bad }] });
    hbarChart('scGoals', { unit: '%', rows: goals.map(function (g) {
      var sc = g.kpis.filter(function (k) { return k.target !== null && k.target !== undefined && k.status !== 'none'; }), okn = sc.filter(function (k) { return k.status === 'good'; }).length, p = sc.length ? Math.round(100 * okn / sc.length) : 0;
      return { label: g.goal, value: p, color: p >= 75 ? STATUS.good : p >= 40 ? STATUS.warning : STATUS.critical, sub: okn + ' of ' + sc.length + ' KPIs on target' };
    }) });
    var gaps = []; goals.forEach(function (g) { g.kpis.forEach(function (k) { if (k.target !== null && k.target !== undefined && k.status === 'bad' && k.ratio && isFinite(k.ratio)) { gaps.push({ label: k.label, value: Math.round((k.ratio - 1) * 100), color: STATUS.critical, sub: g.goal + ' · ' + k.text + ' against a target of ' + num(k.target) }); } }); });
    hbarChart('scGaps', { unit: '%', rows: gaps.sort(function (a, b) { return b.value - a.value; }).slice(0, 8) });
    $('scGapsCard').hidden = !gaps.length;
    $('scSummary').innerHTML = tile('KPIs on target', good + ' of ' + all, 'across ' + goals.length + ' goals', 'good') + tile('To watch', warn, 'within 25% of the target') + tile('Off target', bad, 'more than 25% from the target', bad ? 'bad' : '') +
      tile('Scorecard time', C.clock(state.t), C.prettyDate(state.date) + ' · synthetic data');
  }

  /* ================= window ================= */
  function section(id) {
    Array.prototype.forEach.call($('anMenu').children, function (b) { var on = b.getAttribute('data-an') === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    Array.prototype.forEach.call(document.querySelectorAll('#analytics [data-an-sec]'), function (s) { s.hidden = s.getAttribute('data-an-sec') !== id; });
    render();
    $('anBody').scrollTop = 0;
  }
  function open(id) {
    $('analytics').hidden = false; document.body.classList.add('an-open');
    if (state.playing && T.api) { wasPlaying = true; }
    section(id || 'kpi');
    if (T.audit) { T.audit('Opened predictive analytics'); }
  }
  var wasPlaying = false;
  function close() { $('analytics').hidden = true; document.body.classList.remove('an-open'); hideTip(); }

  // Dashboard card: vehicles moving now, split by the assumed type mix.
  function renderMix() {
    var k = C.kpiAt(state.scenario, state.t), mix = window.TwinCars.MIX, mt = window.TwinCars.mixTotal, max = Math.max.apply(null, mix.map(function (m) { return m.share; }));
    $('mixBars').innerHTML = mix.map(function (m) { return C.barRow(esc(m.label), Math.round(100 * m.share / mt) + '%', num(k.vehicles * m.share / mt), m.share / max); }).join('');
  }

  C.onReady(function () {
    renderMix(); C.onMinute(renderMix);
    $('analyticsBtn').addEventListener('click', function () { if ($('analytics').hidden) { open('kpi'); } else { close(); } });
    C.onMinute(function () { if (!$('analytics').hidden && !$('scBody').closest('[data-an-sec]').hidden) { safeScore(); } });
    $('anClose').addEventListener('click', close);
    $('anMenu').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { section(b.getAttribute('data-an')); } });
    [3, 5, 7.5, 10].forEach(function (p) { var o = document.createElement('option'); o.value = p / 100; o.textContent = p + '% a year'; $('anGrowth').appendChild(o); });
    [5, 10, 15, 20].forEach(function (y) { var o = document.createElement('option'); o.value = y; o.textContent = y + ' years'; $('anHorizon').appendChild(o); });
    if (!$('anGrowth').querySelector('[value="' + growth + '"]')) { var og = document.createElement('option'); og.value = growth; og.textContent = (growth * 100) + '% a year'; $('anGrowth').appendChild(og); }
    $('anGrowth').value = growth; $('anHorizon').value = horizon;
    function changed() { growth = Number($('anGrowth').value); horizon = Number($('anHorizon').value); M = null; render(); }
    $('anGrowth').addEventListener('change', changed); $('anHorizon').addEventListener('change', changed);
    window.addEventListener('resize', function () { if (!$('analytics').hidden) { render(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('analytics').hidden) { close(); } });
  });

  T.analytics = { charts: { line: lineChart, hbar: hbarChart, bar: barChart, pie: pieChart, tile: tile, COL: COL, STATUS: STATUS }, open: open, close: close, scorecard: function () { if (!M) { build(); } return scorecard(); }, model: function () { if (!M) { build(); } return M; } };
})();
