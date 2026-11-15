/* IntelliTwin support modules: weather and visibility, asset health and maintenance, scheduled reports
 * and before/after studies.
 *
 * Weather, asset health and work orders are SYNTHETIC examples. Reports are built in the browser from the
 * twin's simulated, synthetic and illustrative data. See docs/operations-modules.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, clock = C.clock, state = T.state, K = T.kit;
  var rnd = K.rnd, hashStr = K.hashStr, tabOpen = K.tabOpen, esc = K.esc;
  function seed() { return hashStr(state.date); }

  /* ============================================================ 9. Weather and visibility */
  var W = CFG.weather || {}, demo = W.demo || 'auto';
  var KIND = {
    clear: { label: 'Clear', vis: [9000, 10000], wind: [8, 22], limit: null, sign: '', advice: 'No weather restriction.' },
    fog: { label: 'Fog', vis: [80, 400], wind: [2, 8], limit: 80, sign: 'FOG · SLOW DOWN · 80', advice: 'Lower the limit on motorways, switch message signs to the fog warning, keep lorries in the right lane.' },
    sand: { label: 'Sandstorm', vis: [300, 1500], wind: [40, 70], limit: 100, sign: 'DUST · LOW VISIBILITY · 100', advice: 'Lower the limit on exposed motorways and warn drivers on message signs.' },
    rain: { label: 'Rain', vis: [1500, 5000], wind: [15, 35], limit: 100, sign: 'RAIN · WET ROAD · KEEP DISTANCE', advice: 'Warn of standing water in underpasses; expect more minor accidents.' }
  };
  function weatherAt(t) {
    var s = seed(), h = t / 3600, r = rnd(s, 901), kind = demo !== 'auto' ? demo : r < 0.10 && h >= 4 && h < 9 ? 'fog' : r >= 0.10 && r < 0.18 && h >= 11 && h < 18 ? 'sand' : r >= 0.18 && r < 0.22 ? 'rain' : 'clear';
    var k = KIND[kind] || KIND.clear, f = rnd(s, 902 + Math.floor(t / 1800)), temp = null;
    if (T.environment && T.environment.sensors().length) { var rd = T.environment.readingAt(T.environment.sensors()[0], t); temp = rd && rd.temp; }
    return { kind: kind, k: k, vis: Math.round((k.vis[0] + (k.vis[1] - k.vis[0]) * f) / 10) * 10, wind: Math.round(k.wind[0] + (k.wind[1] - k.wind[0]) * f), temp: temp };
  }
  function renderWeather() {
    if (!tabOpen('env')) { return; }
    var w = weatherAt(state.t);
    $('wxNow').textContent = w.k.label; $('wxVis').innerHTML = w.vis >= 1000 ? (w.vis / 1000).toFixed(1) + '<small>km</small>' : w.vis + '<small>m</small>';
    $('wxWind').innerHTML = w.wind + '<small>km/h</small>'; $('wxLimit').innerHTML = w.k.limit ? w.k.limit + '<small>km/h</small>' : 'Normal';
    $('wxFacts').innerHTML = C.fact('Advice', 'example rule set', esc(w.k.advice)) + (w.k.sign ? C.fact('Message sign text', 'suggested', esc(w.k.sign)) : '') + (w.temp !== null && w.temp !== undefined ? C.fact('Temperature', 'synthetic sensor', Math.round(w.temp) + ' °C') : '');
    $('wxCard').classList.toggle('wx-alert', w.kind !== 'clear');
  }

  /* ============================================================ 10. Asset health and maintenance */
  var AS = CFG.assets || {}, FAULTS = ['No video signal', 'Lens dirty', 'Communication loss', 'Power fault', 'Controller fault', 'Display pixels failed', 'Sensor drift', 'Cabinet door alarm', 'Pole damage'];
  function assetGroups() {
    var ev = C.events(), sig = C.signals();
    return [
      ['CCTV cameras', 'CAM', T.devices ? T.devices.cameras().length : 0], ['Message signs', 'VMS', T.devices ? T.devices.signs().length : 0], ['Traffic signals', 'SIG', sig ? sig.length : 0],
      ['Enforcement cameras', 'ENF', ev ? ev.sites.length : 0], ['Detectors', 'DET', (CFG.devices || {}).syntheticDetectors || 0], ['Environmental sensors', 'ENV', T.environment ? T.environment.sensors().length : 0]
    ].map(function (g, i) { var avail = 100 - (0.4 + 3.2 * rnd(seed(), 500 + i)); return { name: g[0], code: g[1], count: g[2], avail: avail, offline: Math.round(g[2] * (100 - avail) / 100) }; }).filter(function (g) { return g.count; });
  }
  function workOrders() {
    var groups = assetGroups(), s = seed(), out = [], n = AS.openWorkOrders || 14, sla = AS.slaDays || { P1: 1, P2: 3, P3: 7 };
    for (var k = 0; k < n && groups.length; k++) {
      var g = groups[Math.floor(rnd(s, 600 + k) * groups.length)], pr = rnd(s, 620 + k), p = pr < 0.15 ? 'P1' : pr < 0.55 ? 'P2' : 'P3', age = Math.round(rnd(s, 640 + k) * (sla[p] * 1.8) * 10) / 10;
      out.push({ id: 'WO-' + state.date.slice(2, 7).replace('-', '') + '-' + ('00' + (k + 1)).slice(-3), asset: g.code + '-' + ('00' + (1 + Math.floor(rnd(s, 660 + k) * g.count))).slice(-3), group: g.name, fault: FAULTS[Math.floor(rnd(s, 680 + k) * FAULTS.length)], p: p, age: age, sla: sla[p], overdue: age > sla[p] });
    }
    return out.sort(function (a, b) { return (b.overdue - a.overdue) || a.p.localeCompare(b.p) || b.age - a.age; });
  }
  function renderAssets() {
    if (!tabOpen('dev')) { return; }
    var groups = assetGroups(), wo = workOrders(), total = 0, off = 0;
    groups.forEach(function (g) { total += g.count; off += g.offline; });
    $('asTotal').textContent = num(total); $('asAvail').innerHTML = total ? (100 * (total - off) / total).toFixed(1) + '<small>%</small>' : '–';
    $('asOpen').textContent = wo.length; $('asOverdue').textContent = wo.filter(function (w) { return w.overdue; }).length;
    $('asBars').innerHTML = groups.map(function (g) { return C.barRow(esc(g.name), g.avail.toFixed(1) + '%', num(g.count) + ' assets · ' + g.offline + ' not working', g.avail / 100); }).join('');
    var ol = $('asList'); ol.innerHTML = '';
    wo.slice(0, 10).forEach(function (w) {
      ol.appendChild(C.listButton(w.overdue ? 'severe' : w.p === 'P1' ? 'heavy' : 'free', w.id + ' · ' + w.asset, w.fault + ' · ' + w.p + ' · open ' + w.age + ' days · due in ' + w.sla + (w.overdue ? ' · overdue' : ''), w.p, function () {
        if (/^CAM/.test(w.asset) && T.devices) { var c = T.devices.cameras().filter(function (x) { return x.id === w.asset; })[0]; if (c && T.getMap()) { T.getMap().easeTo({ center: [c.lon, c.lat], zoom: 16, duration: 700 }); } }
      }));
    });
  }

  /* ============================================================ 11. Scheduled reports and before/after study */
  var RP = CFG.reports || {};
  function nextRun(sch) {
    var d = new Date(state.date + 'T00:00:00Z'), p = String(sch.at || '06:00').split(':'), at = Number(p[0]) * 3600 + Number(p[1] || 0) * 60, add = 0;
    if (sch.every === 'day') { add = state.t < at ? 0 : 1; }
    else if (sch.every === 'week') { add = ((sch.weekday || 0) - d.getUTCDay() + 7) % 7; if (add === 0 && state.t >= at) { add = 7; } }
    else { var day = sch.day || 1, y = d.getUTCFullYear(), m = d.getUTCMonth(); var target = new Date(Date.UTC(y, m, day)); if (target < d || (target.getTime() === d.getTime() && state.t >= at)) { target = new Date(Date.UTC(y, m + 1, day)); } add = Math.round((target - d) / 864e5); }
    var run = new Date(d.getTime() + add * 864e5);
    return run.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) + ' ' + sch.at;
  }
  function reportHtml(sch) {
    var k = C.kpiAt(state.scenario, state.t) || {}, rows = function (list) { return list.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2] || '') + '</td></tr>'; }).join(''); };
    var body = '<h2>Network now</h2><table>' + rows([['Average speed', k.speed ? Math.round(k.speed) + ' km/h' : '–'], ['Vehicles moving', num(k.vehicles || 0)], ['Extra travel time', Math.round(k.extra || 0) + '%'], ['Delay', num(k.delay_h || 0) + ' vehicle-hours an hour']]) + '</table>';
    if (T.incidents) { var inc = T.incidents.list(), reached = inc.filter(function (x) { return x.stage >= 3; }); body += '<h2>Incidents today</h2><table>' + rows([['Incidents', inc.length], ['Open now', inc.filter(function (x) { return x.stage < 4; }).length], ['Average response', reached.length ? (reached.reduce(function (s, x) { return s + x.response; }, 0) / reached.length).toFixed(1) + ' min' : '–']]) + '</table>'; }
    if (T.sea && T.air) { var se = T.sea.stats(), ai = T.air.stats(); body += '<h2>Sea and air (synthetic)</h2><table>' + rows([['Vessels moving', se.moving + ' (' + se.inbound + ' inbound, ' + se.outbound + ' outbound)'], ['Berths in use', se.berthsUsed + ' of ' + se.berths], ['Vessel movements today', se.callsToday], ['Aircraft in the air nearby', ai.inAir], ['Flight movements today', ai.movementsToday], ['Flights on time this hour', ai.onTimePct === null ? '–' : Math.round(ai.onTimePct) + '%']]) + '</table>'; }
    if (T.analytics && T.analytics.scorecard) {
      try { T.analytics.scorecard().forEach(function (g) { body += '<h2>' + esc(g.goal) + '</h2><table><tr><th>KPI</th><th>Value</th><th>Target and status</th></tr>' + rows(g.kpis.map(function (q) { return [q.label, q.text + (q.unit && q.unit !== '%' ? ' ' + q.unit : ''), q.target === null || q.target === undefined ? 'for context' : (q.better === 'low' ? '≤ ' : '≥ ') + num(q.target) + ' · ' + ({ good: 'On target', warn: 'Watch', bad: 'Off target', none: 'No data' })[q.status]]; })) + '</table>'; }); } catch (e) { /* scorecard not available */ }
    }
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' + esc(sch.name) + '</title><style>body{font:14px/1.5 system-ui,sans-serif;color:#14213a;max-width:820px;margin:32px auto;padding:0 20px}h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 6px;border-bottom:2px solid #d2ab52;padding-bottom:4px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:5px 8px;border-bottom:1px solid #ddd;font-size:13px}.note{background:#fff8e1;border:1px solid #ecd58a;padding:8px 12px;border-radius:4px;font-size:12.5px;margin:12px 0}</style></head><body>' +
      '<h1>' + esc(sch.name) + '</h1><p>IntelliTwin · ' + esc(C.prettyDate(state.date)) + ' · ' + clock(state.t) + ' · audience: ' + esc(sch.audience || 'operations') + '</p>' +
      '<p class="note"><strong>Demonstration report.</strong> Traffic is simulated; accidents and fines are illustrative; alerts, sensors, buses and devices are synthetic. Targets are examples. Not for operational or planning decisions.</p>' + body + '</body></html>';
  }
  function generate(sch) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([reportHtml(sch)], { type: 'text/html;charset=utf-8' }));
    a.download = sch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + state.date + '.html'; document.body.appendChild(a); a.click(); a.remove();
    if (T.audit) { T.audit('Report generated: ' + sch.name); }
  }
  function dayStats(dateIso) {
    var bins = C.scenarioMeta(state.scenario).bins, d = window.TwinDay.build(bins, dateIso, CFG.time), sp = 0, veh = 0, delay = 0, peak = 0;
    for (var s = 0; s < C.SLOTS; s++) { var b = bins[d.map[s]]; if (!b) { continue; } sp += (b.speed || 0) * (b.vehicles || 0); veh += b.vehicles || 0; delay += (b.delay_h || 0) * C.SLOT / 3600; peak = Math.max(peak, b.vehicles || 0); }
    return { type: d.typeLabel, speed: veh ? sp / veh : 0, delay: delay, peak: peak };
  }
  function study() {
    var a = $('baBefore').value, b = $('baAfter').value; if (!a || !b) { return; }
    var A = dayStats(a), B = dayStats(b), ch = function (x, y, unit, dp) { var d = y - x; return (d >= 0 ? '+' : '−') + (dp ? Math.abs(d).toFixed(dp) : num(Math.round(Math.abs(d)))) + unit; };
    $('baFacts').innerHTML = C.fact('Day type', '', esc(A.type) + ' → ' + esc(B.type)) + C.fact('Average speed', ch(A.speed, B.speed, ' km/h', 1), A.speed.toFixed(1) + ' → ' + B.speed.toFixed(1) + ' km/h') +
      C.fact('Vehicle delay a day', ch(A.delay, B.delay, ' veh-h'), num(Math.round(A.delay)) + ' → ' + num(Math.round(B.delay))) + C.fact('Peak vehicles moving', ch(A.peak, B.peak, ''), num(A.peak) + ' → ' + num(B.peak));
    if (T.audit) { T.audit('Before/after study: ' + a + ' and ' + b); }
  }
  function renderReports() {
    if (!tabOpen('rep')) { return; }
    var ol = $('rpList'); ol.innerHTML = '';
    (RP.schedules || []).forEach(function (sch) {
      ol.appendChild(C.listButton('site', sch.name, ({ day: 'Every day', week: 'Every week', month: 'Every month' })[sch.every] + ' · next ' + nextRun(sch) + ' · for ' + (sch.audience || 'operations'), 'Get', function () { generate(sch); }));
    });
    if (!$('baBefore').value) { var d = new Date(state.date + 'T00:00:00Z'); $('baAfter').value = state.date; $('baBefore').value = new Date(d.getTime() - 7 * 864e5).toISOString().slice(0, 10); }
  }

  C.onReady(function () {
    $('wxDemo').value = demo;
    $('wxDemo').addEventListener('change', function () { demo = $('wxDemo').value; renderWeather(); if (T.audit) { T.audit('Weather demonstration: ' + demo); } });
    $('baRun').addEventListener('click', study);
    function all() { renderWeather(); renderAssets(); renderReports(); }
    C.onTab(all);
    C.onMinute(function () { renderWeather(); renderAssets(); });
    all();
  });

  T.weather = { now: function () { return weatherAt(state.t); }, demo: function (k) { demo = k; renderWeather(); } };
  T.assets = { groups: assetGroups, workOrders: workOrders };
  T.reports = { html: reportHtml, study: dayStats };
})();
