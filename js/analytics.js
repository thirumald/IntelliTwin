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
  var COL = ['#3987e5', '#d95926', '#199e70', '#c98500'], INK = '#e8eef9', MUTED = '#8fa0bd', GRID = '#22314d';
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
    function daySeries(id) { var sm = C.scenarioMeta(id); if (!sm) { return null; } var mp = window.TwinDay.build(sm.bins, '2026-01-06', CFG.time).map, out = []; for (var hh = 0; hh < 24; hh++) { out.push(sm.bins[mp[hh * 12 + 6]].speed); } return out; }

    /* ---- accident risk (relative exposure index, illustrative) ---- */
    var risk = C.groups().map(function (g) {
      var v = 0; g.idx.forEach(function (i) { v += occ[i] * (edges[i].s * r0[i]) * (1 + 2 * (1 - r0[i])); });
      return { g: g, name: g.name, value: v };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    var rmax = risk.length ? risk[0].value : 1; risk.forEach(function (r) { r.value = 100 * r.value / rmax; });

    var peakVehicles = 0; for (var pv = 0; pv < n; pv++) { peakVehicles += occ[pv]; }
    M = { peakVehicles: peakVehicles, railKm: C.railKm(), cycleKm: C.cycleKm(), roads: roads, junctions: junctions, years: years, sDo: sDo, sRoad: sRoad, sBoth: sBoth, critical: critical, dailyDelay: dailyDelay,
      hours: hours, co2: co2, risk: risk, speeds: { base: daySeries('base'), high: daySeries('high'), low: daySeries('low') }, meta: meta };
  }

  /* ================= rendering ================= */
  function tile(label, value, sub, tone) { return '<div class="an-tile' + (tone ? ' ' + tone : '') + '"><span>' + label + '</span><b>' + value + '</b><em>' + (sub || '') + '</em></div>'; }
  function statusWord(r) { return r < A.criticalRatio ? ['Critical', 'critical'] : r < 0.6 ? ['Congested', 'serious'] : r < 0.8 ? ['Busy', 'warning'] : ['Free-flowing', 'good']; }
  function chip(r) { var s = statusWord(r); return '<span class="an-status"><i style="background:' + STATUS[s[1]] + '"></i>' + s[0] + '</span>'; }
  function locate(fn) { return function () { close(); fn(); }; }

  function render() {
    if (!M) { build(); }
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
    var P = A.population, mix = window.TwinCars.MIX, mt = window.TwinCars.mixTotal, peakVeh = M.peakVehicles;
    var popSeries = [], popLabels = [];
    for (var py = 0; py <= H; py++) { popLabels.push(String(P.year + py)); popSeries.push(P.abuDhabiRegion * Math.pow(1 + P.growthPerYear, py) / 1e6); }
    $('anPopTiles').innerHTML =
      tile('Abu Dhabi Region residents', num(P.abuDhabiRegion), P.year + ', as quoted from SCAD') +
      tile('Emirate residents', num(P.emirate), 'three regions') +
      tile('Region residents in ' + H + ' years', (popSeries[H]).toFixed(1) + ' m', 'at ' + (P.growthPerYear * 100).toFixed(1) + '% a year, if the ' + (P.year - 1) + '–' + P.year + ' rate held') +
      tile('Vehicles moving at the peak', num(peakVeh), 'synthetic, working day 08:00') +
      tile('Railway in the study area', M.railKm ? num(M.railKm) + ' km' : '–', M.railKm ? 'from OpenStreetMap' : 'not in this data build') +
      tile('Cycle tracks', M.cycleKm ? num(M.cycleKm) + ' km' : '–', M.cycleKm ? 'from OpenStreetMap' : 'not in this data build');
    barChart('anPopReg', { labels: ['Abu Dhabi', 'Al Ain', 'Al Dhafra'], unit: 'residents', series: [{ name: 'Residents', color: COL[0], values: [P.abuDhabiRegion, P.alAinRegion, P.alDhafraRegion] }] });
    lineChart('anPopLine', { labels: popLabels, unit: 'million', yMin: 0, series: [{ name: 'Residents', color: COL[0], values: popSeries.map(function (v) { return Math.round(v * 100) / 100; }) }] });
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
      tile('CO₂ from traffic a day', num(co2Day) + ' t', 'emission factor assumed') +
      tile('Highest-risk road', M.risk.length ? esc(M.risk[0].name) : '–', 'exposure index, illustrative');
    lineChart('anDemand', { labels: M.hours, unit: 'km/h', yMin: 0, series: ser });
    hbarChart('anRisk', { unit: '', rows: M.risk.map(function (r) { return { label: r.name, value: r.value, sub: 'Relative exposure index: traffic volume, weighted up where it is slow. Not an accident count.' }; }) });
    lineChart('anCo2', { labels: M.hours, unit: 't CO₂', yMin: 0, series: [{ name: 'CO₂ per hour', color: COL[0], values: M.co2 }] });
    $('anAssume').textContent = 'Growth ' + (growth * 100).toFixed(1) + '% a year over ' + H + ' years · volume-delay curve a = ' + A.bprAlpha + ', b = ' + A.bprBeta +
      ' · value of time AED ' + A.valueOfTimeAedPerHour + ' per vehicle-hour · ' + A.workingDaysPerYear + ' working days · adaptive signals remove ' + Math.round(A.adaptiveSignalDelayReduction * 100) + '% of approach delay.';
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
    section(id || 'over');
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
    $('analyticsBtn').addEventListener('click', function () { open('over'); });
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

  T.analytics = { open: open, close: close, model: function () { if (!M) { build(); } return M; } };
})();
