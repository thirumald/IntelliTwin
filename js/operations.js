/* IntelliTwin operations modules: incident management, signal control, planned events and roadworks,
 * and emergency (evacuation) planning.
 *
 * Everything here is SYNTHETIC or ESTIMATED from the twin's own data: incidents follow the illustrative
 * accidents, signal plans and events are examples, and evacuation times are a simple capacity estimate.
 * See docs/operations-modules.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, clock = C.clock, state = T.state;
  var kx = 111320 * Math.cos(24.4 * Math.PI / 180), ky = 110570;
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed, k) { var h = (Math.imul(seed ^ (k * 2654435761), 2246822519)) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function dist(a, b) { return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tabOpen(id) { var b = document.querySelector('#tabs [data-tab=' + id + ']'); return !!b && b.classList.contains('on'); }
  function csv(name, rows) {
    var text = rows.map(function (r) { return r.map(function (v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function canAct() { return !T.ops || T.ops.can('whatif'); }
  function travelMin(leg) { var e = C.edges(), s = 0; leg.links.forEach(function (i) { s += e[i].m / (e[i].s / 3.6); }); return s / 60; }
  T.kit = { hashStr: hashStr, rnd: rnd, dist: dist, esc: esc, tabOpen: tabOpen, csv: csv, canAct: canAct, travelMin: travelMin, kx: kx, ky: ky };

  /* ============================================================ 1. Incident management */
  var I = CFG.incidents || {}, manual = {}, selInc = null, STAGES = ['Reported', 'Acknowledged', 'Unit dispatched', 'Unit on scene', 'Cleared'];
  function incidents() {
    var ev = C.events(); if (!ev) { return []; }
    var seed = hashStr(state.date), t = state.t, list = ev.accidents.slice().sort(function (a, b) { return a.t - b.t; });
    return list.map(function (a, n) {
      var id = 'INC-' + state.date.replace(/-/g, '').slice(2) + '-' + ('00' + (n + 1)).slice(-3), sev = a.severity === 'Serious injury' ? 3 : a.severity === 'Minor injury' ? 2 : 1;
      var ack = a.t + 60 * (1 + 2 * rnd(seed, n * 5 + 1)), disp = ack + 60 * (1 + 3 * rnd(seed, n * 5 + 2)), travel = 60 * ((sev === 3 ? 3 : 4) + (sev === 3 ? 4 : 8) * rnd(seed, n * 5 + 3));
      var m = manual[id] || {};
      if (m.ack !== undefined) { ack = m.ack; disp = Math.max(disp, ack + 30); }
      if (m.disp !== undefined) { disp = m.disp; }
      var scene = disp + travel, clear = Math.max(scene + 300, a.t + a.dur);
      if (m.clear !== undefined) { clear = m.clear; }
      var stage = t >= clear ? 4 : t >= scene ? 3 : t >= disp ? 2 : t >= ack ? 1 : 0;
      return { id: id, n: n, a: a, sev: sev, title: a.road, at: [a.lon, a.lat], opened: a.t, ack: ack, disp: disp, scene: scene, clear: clear, stage: stage, manual: m,
        unit: 'Patrol unit ' + (11 + Math.floor(rnd(seed, n * 5 + 4) * 24)), response: (scene - a.t) / 60 };
    }).filter(function (x) { return x.opened <= t; });
  }
  function renderInc() {
    var all = incidents(), open = all.filter(function (x) { return x.stage < 4; }), reached = all.filter(function (x) { return x.stage >= 3; }), target = I.responseTargetMin || 12;
    var avg = reached.length ? reached.reduce(function (s, x) { return s + x.response; }, 0) / reached.length : null, within = reached.filter(function (x) { return x.response <= target; }).length;
    $('incOpen').textContent = open.length; $('incCleared').textContent = all.length - open.length;
    $('incResp').innerHTML = avg === null ? '–' : avg.toFixed(1) + '<small>min</small>';
    $('incSla').innerHTML = reached.length ? Math.round(100 * within / reached.length) + '<small>%</small>' : '–';
    $('incNote').textContent = 'Target: on scene within ' + target + ' min';
    var ol = $('incList'); ol.innerHTML = '';
    open.sort(function (a, b) { return b.sev - a.sev || b.opened - a.opened; }).concat(all.filter(function (x) { return x.stage === 4; }).sort(function (a, b) { return b.clear - a.clear; }).slice(0, 6)).forEach(function (x) {
      var li = C.listButton(x.stage === 4 ? 'acc-past' : x.sev === 3 ? 'severe' : x.sev === 2 ? 'heavy' : 'moderate', x.id + ' · ' + x.title, x.a.severity + ' · ' + STAGES[x.stage] + ' · reported ' + clock(x.opened), x.stage >= 3 ? Math.round(x.response) + '<small>min</small>' : '…', function () { selectInc(x.id); });
      if (selInc === x.id) { li.firstChild.style.borderColor = 'var(--accent)'; }
      ol.appendChild(li);
    });
    if (!ol.children.length) { ol.innerHTML = '<li class="muted">No incidents so far today.</li>'; }
    var x = all.filter(function (y) { return y.id === selInc; })[0];
    $('incDetail').setAttribute('data-locked', x ? '0' : '1'); $('incDetail').hidden = !x || !tabOpen('inc');
    if (x) {
      $('incTitle').textContent = x.id + ' · ' + x.title;
      var steps = [['Reported', x.opened, 'illustrative accident record'], ['Acknowledged', x.ack, x.manual.ack !== undefined ? 'by the operator' : 'control room'], ['Unit dispatched', x.disp, x.unit + (x.manual.disp !== undefined ? ', by the operator' : '')], ['Unit on scene', x.scene, 'response time ' + Math.round(x.response) + ' min'], ['Cleared', x.clear, x.manual.clear !== undefined ? 'closed by the operator' : 'road clear']];
      $('incFacts').innerHTML = C.fact('Severity', '', x.a.severity) + C.fact('Status', '', STAGES[x.stage]) + C.fact('Assigned', '', x.stage >= 2 ? x.unit : 'not yet') +
        steps.map(function (s, k) { return C.fact(s[0], s[2], k <= x.stage ? clock(s[1]) : 'expected ' + clock(s[1])); }).join('');
      var act = canAct();
      $('incAck').disabled = !act || x.stage >= 1; $('incDisp').disabled = !act || x.stage >= 2; $('incClose').disabled = !act || x.stage >= 4;
    }
  }
  function selectInc(id) {
    selInc = selInc === id ? null : id;
    var x = incidents().filter(function (y) { return y.id === selInc; })[0];
    if (x && T.getMap()) { T.getMap().easeTo({ center: x.at, zoom: Math.max(T.getMap().getZoom(), 14.5), duration: 700 }); }
    renderInc(); C.redraw();
  }
  function incAction(kind) {
    var x = incidents().filter(function (y) { return y.id === selInc; })[0]; if (!x || !canAct()) { return; }
    manual[x.id] = manual[x.id] || {}; manual[x.id][kind] = state.t;
    if (kind === 'disp' && manual[x.id].ack === undefined && x.stage < 1) { manual[x.id].ack = state.t; }
    if (T.audit) { T.audit('Incident ' + x.id + ': ' + { ack: 'acknowledged', disp: 'unit dispatched', clear: 'closed' }[kind]); }
    if (kind === 'disp' && T.response) { T.response.routeTo(x.at[0], x.at[1], x.id + ' · ' + x.title, { fit: false }); }
    renderInc(); C.redraw();
  }

  /* ============================================================ 2. Signal control */
  var S = CFG.signalControl || {}, junc = null, corridors = null, priority = null;
  function loadJunctions() {
    if (junc || !T.analytics) { return junc || []; }
    junc = T.analytics.model().junctions.slice();
    var seed = hashStr('signals');
    junc.forEach(function (j, n) { j.adaptive = n < (S.adaptiveJunctions || 25); j.split = 0.45 + 0.2 * rnd(seed, n); j.base = { A: 70, B: 80, C: 90, D: 110, E: 120, F: 140 }[j.los]; });
    corridors = C.majorRoads().map(function (g) {
      var js = junc.filter(function (j) { return j.name.indexOf(g.name) >= 0; });
      return { g: g, js: js, ratio: js.length ? js.reduce(function (s, j) { return s + j.ratio; }, 0) / js.length : 0, adaptive: js.filter(function (j) { return j.adaptive; }).length };
    }).filter(function (c) { return c.js.length >= 3; }).sort(function (a, b) { return b.js.length - a.js.length; }).slice(0, 6);
    return junc;
  }
  function period(t) { var h = t / 3600; return h < 6 ? ['Night plan', 0.7] : h < 10 ? ['Morning peak plan', 1.1] : h < 16 ? ['Daytime plan', 0.95] : h < 20 ? ['Evening peak plan', 1.1] : ['Late evening plan', 0.8]; }
  function renderSig() {
    if (!tabOpen('sig')) { return; }
    var J = loadJunctions(), p = period(state.t), ad = J.filter(function (j) { return j.adaptive; }).length;
    $('sgCount').textContent = num(J.length); $('sgAdaptive').textContent = num(ad);
    $('sgCycle').innerHTML = J.length ? Math.round(J.reduce(function (s, j) { return s + j.base * p[1]; }, 0) / J.length) + '<small>s</small>' : '–';
    $('sgPoor').textContent = J.filter(function (j) { return j.los === 'E' || j.los === 'F'; }).length;
    $('sgNote').textContent = p[0];
    var ol = $('sgList'); ol.innerHTML = '';
    J.slice(0, 12).forEach(function (j) {
      var cyc = Math.round(j.base * p[1] / 5) * 5, g1 = Math.round(cyc * j.split), pre = priority && priority.ids[j.id];
      ol.appendChild(C.listButton(pre ? 'site' : j.los >= 'E' ? 'severe' : j.los === 'D' ? 'heavy' : 'free', j.id + ' · ' + j.name, (pre ? 'Emergency priority · ' : '') + 'Level ' + j.los + ' · ' + (j.adaptive ? 'adaptive' : 'fixed time') + ' · green ' + g1 + ' s / ' + (cyc - g1 - 8) + ' s', cyc + '<small>s</small>', function () {
        if (T.getMap()) { T.getMap().easeTo({ center: [j.lon, j.lat], zoom: 16, duration: 700 }); }
        C.showPopup([j.lon, j.lat], j.id + ' · ' + j.name, [['Service level at the peak', j.los], ['Control', j.adaptive ? 'Adaptive (example pilot)' : 'Fixed time'], ['Plan now', p[0]], ['Cycle', cyc + ' s'], ['Main / side green', g1 + ' s / ' + (cyc - g1 - 8) + ' s'], ['Approaches', j.approaches.length]], 'Example signal plan, not the real controller timings');
      }));
    });
    var cl = $('sgCorr'); cl.innerHTML = '';
    (corridors || []).forEach(function (c) {
      var band = Math.round(100 * Math.min(1, c.ratio + (c.adaptive / c.js.length) * 0.15));
      cl.appendChild(C.listButton(band >= 60 ? 'free' : band >= 45 ? 'heavy' : 'severe', c.g.name, c.js.length + ' signals · ' + c.adaptive + ' adaptive · progression at ' + (S.progressionKmh || 60) + ' km/h', band + '<small>%</small>', function () { C.locate(c.g); }));
    });
    if (!cl.children.length) { cl.innerHTML = '<li class="muted">No corridor has three or more signals in this build.</li>'; }
    var route = T.response && T.response.current();
    $('sgPriority').disabled = !route || !canAct();
    $('sgPriorityNote').textContent = priority ? priority.count + ' signals held green for ' + priority.label + ' · about ' + Math.round(priority.count * (S.prioritySavingSec || 12) / 60 * 10) / 10 + ' min saved (estimate)' : route ? 'Active response route: ' + route.label : 'No response route is active. Route a unit to an alert or incident first.';
  }
  function givePriority() {
    var route = T.response && T.response.current(); if (!route) { return; }
    var ids = {}, count = 0;
    loadJunctions().forEach(function (j) { for (var k = 0; k < route.path.length; k += 2) { if (dist(route.path[k], [j.lon, j.lat]) < 70) { ids[j.id] = 1; count++; break; } } });
    priority = { ids: ids, count: count, label: route.label, until: state.t + 900 };
    if (T.audit) { T.audit('Signal priority requested: ' + count + ' signals'); }
    renderSig(); C.redraw();
  }

  /* ============================================================ 3. Planned events and roadworks */
  var P = CFG.planned || {};
  function hm(s) { var p = String(s).split(':'); return Number(p[0]) * 3600 + Number(p[1] || 0) * 60; }
  function planned() {
    var roads = C.majorRoads();
    return (P.items || []).map(function (it, n) {
      var g = it.type === 'roadworks' && roads.length ? roads[it.roadIndex % roads.length] : null;
      var at = g ? [(g.bounds[0][0] + g.bounds[1][0]) / 2, (g.bounds[0][1] + g.bounds[1][1]) / 2] : it.at;
      var s = hm(it.start), e = hm(it.end), inDays = 0 >= it.fromDay && 0 <= it.toDay, t = state.t, inTime = s <= e ? (t >= s && t < e) : (t >= s || t < e);
      var d0 = new Date(state.date + 'T00:00:00Z'), f = new Date(d0.getTime() + it.fromDay * 864e5), l = new Date(d0.getTime() + it.toDay * 864e5);
      var fmt = function (d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
      return { it: it, n: n, g: g, at: at, active: inDays && inTime, today: inDays, when: (it.fromDay === it.toDay ? fmt(f) : fmt(f) + ' – ' + fmt(l)) + ' · ' + it.start + '–' + it.end,
        title: it.type === 'roadworks' ? 'Roadworks: ' + g.name : it.title };
    }).filter(function (x) { return x.at && x.it.toDay >= 0; });
  }
  function impact(x) {
    if (x.g) { var veh = 0; x.g.idx.forEach(function (i) { veh += C.occ(i); }); return Math.round(veh) + ' vehicles on the road now · ' + x.it.lanes + ' lane' + (x.it.lanes > 1 ? 's' : '') + ' closed'; }
    return num(x.it.attendance) + ' expected · about ' + num(Math.round(x.it.attendance / (P.peoplePerCar || 2.5) * (P.carShare || 0.6))) + ' extra vehicles';
  }
  function renderPlan() {
    if (!tabOpen('plan')) { return; }
    var all = planned(), now = all.filter(function (x) { return x.active; });
    $('plNow').textContent = now.length; $('plToday').textContent = all.filter(function (x) { return x.today; }).length;
    $('plWorks').textContent = all.filter(function (x) { return x.g; }).length; $('plEvents').textContent = all.filter(function (x) { return !x.g; }).length;
    var ol = $('plList'); ol.innerHTML = '';
    all.sort(function (a, b) { return (b.active - a.active) || (a.it.fromDay - b.it.fromDay); }).forEach(function (x) {
      ol.appendChild(C.listButton(x.active ? 'severe' : x.today ? 'heavy' : 'acc-past', x.title, x.when + ' · ' + impact(x), x.active ? 'Now' : x.today ? 'Today' : 'In ' + x.it.fromDay + '<small>d</small>', function () {
        if (x.g) { C.locate(x.g); } else if (T.getMap()) { T.getMap().easeTo({ center: x.at, zoom: 14.5, duration: 700 }); }
        C.showPopup(x.at, x.title, [['When', x.when], ['Status', x.active ? 'Active now' : x.today ? 'Today, not at this hour' : 'Upcoming'], ['Expected effect', impact(x)], ['Suggested action', x.g ? 'Sign the diversion; test it with the road-closure what-if' : 'Extra signal time on approach roads; parking guidance']], 'Example entry, not a real permit or event');
      }));
    });
    var sel = $('plRoad'); if (!sel.options.length) { all.filter(function (x) { return x.g; }).forEach(function (x) { var o = document.createElement('option'); o.value = x.g.name; o.textContent = x.g.name; sel.appendChild(o); }); }
    $('plTest').disabled = !canAct() || !sel.options.length;
  }

  /* ============================================================ 5. Emergency and evacuation planning */
  var EM = CFG.emergency || {}, plan = null;
  function nearest(type, from) { var best = null; (T.zones ? T.zones.all() : []).forEach(function (s) { if (s.type !== type) { return; } var d = dist(from, [s.lon, s.lat]); if (d > 150 && (!best || d < best.d)) { best = { s: s, d: d }; } }); return best && best.s; }
  function buildPlan(id) {
    var s = (T.zones ? T.zones.all() : []).filter(function (z) { return String(z.id) === String(id); })[0]; if (!s || !T.response) { plan = null; return; }
    var from = [s.lon, s.lat], ap = null;
    (EM.assemblyPoints || []).forEach(function (a) { var d = dist(from, a.at); if (d > 400 && (!ap || d < ap.d)) { ap = { a: a, d: d }; } });
    var people = (EM.occupancy || {})[s.type] || 300, perVeh = s.type === 'school' ? (EM.peoplePerBus || 40) : (EM.peoplePerCar || 2.5), vehicles = Math.ceil(people / perVeh);
    var leg = ap ? T.response.pathBetween(from, ap.a.at) : null, drive = leg ? travelMin(leg) : null, lanes = EM.routeLanes || 2, perMin = lanes * (EM.laneCapacityPerHour || 1500) / 60;
    var services = ['hospital', 'police', 'fire'].map(function (ty) {
      var z = nearest(ty, from), l = z ? T.response.pathBetween([z.lon, z.lat], from) : null;
      return { type: ty, z: z, leg: l, min: l ? travelMin(l) / ((CFG.response || {}).speedFactor || 1.25) : null };
    });
    plan = { s: s, ap: ap && ap.a, leg: leg, people: people, vehicles: vehicles, drive: drive, clear: leg ? vehicles / perMin + drive + (EM.mobilisationMin || 10) : null, services: services };
    if (T.audit) { T.audit('Evacuation plan: ' + s.name); }
  }
  function renderEmg() {
    if (!tabOpen('emg')) { return; }
    var sel = $('emSite');
    if (sel.options.length <= 1 && T.zones && T.zones.all().length) {
      var by = {}; T.zones.all().forEach(function (s) { if (/unnamed/.test(s.name)) { return; } (by[s.type] = by[s.type] || []).push(s); });
      Object.keys(by).sort().forEach(function (ty) {
        var og = document.createElement('optgroup'); og.label = T.zones.label ? T.zones.label(ty) : ty;
        by[ty].sort(function (a, b) { return a.name.localeCompare(b.name); }).slice(0, 120).forEach(function (s) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.name; og.appendChild(o); });
        sel.appendChild(og);
      });
    }
    renderDisaster();
    $('emResult').hidden = !plan;
    if (!plan) { return; }
    $('emTitle').textContent = plan.s.name;
    $('emFacts').innerHTML = C.fact('People to move', 'assumed for this type of site', num(plan.people)) + C.fact('Vehicles needed', plan.s.type === 'school' ? 'buses' : 'cars', num(plan.vehicles)) +
      C.fact('Assembly point', plan.ap ? 'nearest in the list' : '', plan.ap ? esc(plan.ap.name) : 'none configured') + C.fact('Drive to the assembly point', 'free-flow', plan.drive === null ? 'no route' : Math.round(plan.drive) + ' min · ' + (plan.leg.metres / 1000).toFixed(1) + ' km') +
      C.fact('Estimated clearance time', 'mobilisation + loading at road capacity + drive', plan.clear === null ? '–' : Math.round(plan.clear) + ' min') +
      plan.services.map(function (v) { return C.fact('Nearest ' + v.type + (v.type === 'fire' ? ' station' : v.type === 'police' ? ' station' : ''), v.z ? esc(v.z.name) : '', v.min === null ? 'none found' : Math.round(v.min) + ' min'); }).join('');
  }

  /* ============================================================ Natural disaster scenarios (what-if exercises) */
  var dz = null;
  function buildDisaster(id) {
    var d = (EM.disasters || []).filter(function (x) { return x.id === id; })[0]; if (!d) { dz = null; return; }
    var edges = C.edges(), names = C.names(), inside = function (p) { return d.areas.some(function (a) { return dist(p, a.at) <= a.radiusM; }); };
    var km = 0, veh = 0, byRoad = {}, paths = [];
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i], mp = e.path[e.path.length >> 1]; if (!inside(mp)) { continue; }
      var o = C.occ(i); km += e.m / 1000; veh += o; var nm = names[e.n]; if (nm) { byRoad[nm] = (byRoad[nm] || 0) + o; }
      if (paths.length < 4000) { paths.push(e.path); }
    }
    var sites = (T.zones ? T.zones.all() : []).filter(function (z) { return inside([z.lon, z.lat]); }), byType = {};
    sites.forEach(function (z) { byType[z.type] = (byType[z.type] || 0) + 1; });
    var areaKm2 = d.areas.reduce(function (s, a) { return s + Math.PI * a.radiusM * a.radiusM / 1e6; }, 0), people = Math.round(areaKm2 * (EM.peoplePerKm2 || 3500) / 100) * 100;
    var shelters = (EM.assemblyPoints || []).filter(function (a) { return !inside(a.at); });
    var perMin = (EM.routeLanes || 2) * (EM.laneCapacityPerHour || 1500) / 60 * Math.max(1, d.areas.length * 2);
    dz = { d: d, km: km, veh: veh, paths: paths, sites: sites, byType: byType, people: people, shelters: shelters, clear: veh / perMin + (EM.mobilisationMin || 10),
      roads: Object.keys(byRoad).sort(function (a, b) { return byRoad[b] - byRoad[a]; }).slice(0, 5) };
    if (T.audit) { T.audit('Disaster exercise: ' + d.name); }
  }
  function renderDisaster() {
    var sel = $('dzType');
    if (sel.options.length <= 1) { (EM.disasters || []).forEach(function (d) { var o = document.createElement('option'); o.value = d.id; o.textContent = d.name; sel.appendChild(o); }); }
    $('dzResult').hidden = !dz;
    if (!dz) { return; }
    $('dzTitle').textContent = dz.d.name + ' exercise';
    var types = Object.keys(dz.byType).sort(function (a, b) { return dz.byType[b] - dz.byType[a]; }).map(function (ty) { return dz.byType[ty] + ' ' + (T.zones && T.zones.label ? T.zones.label(ty).toLowerCase() : ty); }).join(', ');
    $('dzFacts').innerHTML = C.fact('Areas in the scenario', '', dz.d.areas.map(function (a) { return esc(a.name); }).join(', ')) + C.fact('Roads affected', esc(dz.d.roadEffect), dz.km.toFixed(0) + ' km') +
      C.fact('Vehicles in the area now', 'from the simulated traffic', num(Math.round(dz.veh))) + C.fact('Busiest affected roads', '', dz.roads.map(esc).join(', ') || 'none') +
      C.fact('People in the area', 'assumed density', 'about ' + num(dz.people)) + C.fact('Critical sites inside', types || '', dz.sites.length) +
      C.fact('Time to clear vehicles', 'at road capacity, estimate', Math.round(dz.clear) + ' min') + C.fact('Assembly points outside the area', '', dz.shelters.length ? dz.shelters.slice(0, 3).map(function (a) { return esc(a.name); }).join(', ') : 'none');
    $('dzActions').innerHTML = dz.d.actions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');
  }

  /* ============================================================ map layers */
  C.addLayers(function () {
    var out = [];
    var open = incidents().filter(function (x) { return x.stage < 4; });
    if (open.length) {
      out.push(new deck.ScatterplotLayer({ id: 'incidents', data: open, pickable: true, radiusUnits: 'pixels', filled: false, stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (x) { return x.at; }, getRadius: function (x) { return x.id === selInc ? 18 : 13; }, getLineColor: function (x) { return x.sev === 3 ? [208, 59, 59] : x.sev === 2 ? [236, 131, 90] : [250, 178, 25]; }, getLineWidth: function (x) { return x.id === selInc ? 4 : 2.5; },
        updateTriggers: { getRadius: selInc, getLineWidth: selInc }, onClick: function (info) { if (info.object) { C.showTab('inc'); selInc = null; selectInc(info.object.id); } } }));
    }
    if (priority) {
      if (state.t > priority.until || state.t < priority.until - 900) { priority = null; }
      else { out.push(new deck.ScatterplotLayer({ id: 'signal-priority', data: (junc || []).filter(function (j) { return priority.ids[j.id]; }), radiusUnits: 'pixels', filled: true, stroked: true, lineWidthUnits: 'pixels', getPosition: function (j) { return [j.lon, j.lat]; }, getRadius: 9, getFillColor: [12, 163, 12], getLineColor: [255, 255, 255], getLineWidth: 2 })); }
    }
    if (tabOpen('plan')) {
      out.push(new deck.ScatterplotLayer({ id: 'planned', data: planned(), pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (x) { return x.at; }, getRadius: 9,
        getFillColor: function (x) { return x.g ? [217, 89, 38] : [213, 81, 129]; }, getLineColor: function (x) { return x.active ? [255, 255, 255] : [20, 20, 20]; }, getLineWidth: function (x) { return x.active ? 3 : 1.5; }, updateTriggers: { getLineColor: Math.floor(state.t / 300), getLineWidth: Math.floor(state.t / 300) },
        onClick: function (info) { if (info.object) { C.showPopup(info.object.at, info.object.title, [['When', info.object.when], ['Expected effect', impact(info.object)]], 'Example entry, not a real permit or event'); } } }));
    }
    if (dz && tabOpen('emg')) {
      out.push(new deck.ScatterplotLayer({ id: 'dz-areas', data: dz.d.areas, radiusUnits: 'meters', filled: true, stroked: true, lineWidthUnits: 'pixels', getPosition: function (a) { return a.at; }, getRadius: function (a) { return a.radiusM; }, getFillColor: [57, 135, 229, 40], getLineColor: [57, 135, 229, 230], getLineWidth: 2 }));
      out.push(new deck.PathLayer({ id: 'dz-roads', data: dz.paths, getPath: function (p) { return p; }, getColor: [236, 131, 90, 220], getWidth: 10, widthUnits: 'meters', widthMinPixels: 1.5 }));
      out.push(new deck.ScatterplotLayer({ id: 'dz-sites', data: dz.sites, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (z) { return [z.lon, z.lat]; }, getRadius: 5, getFillColor: [208, 59, 59], getLineColor: [255, 255, 255], getLineWidth: 1.5,
        onClick: function (info) { if (info.object) { C.showPopup([info.object.lon, info.object.lat], info.object.name, [['Type', T.zones.label ? T.zones.label(info.object.type) : info.object.type], ['Scenario', dz.d.name]], 'Inside the exercise area'); } } }));
      out.push(new deck.ScatterplotLayer({ id: 'dz-shelters', data: dz.shelters, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (a) { return a.at; }, getRadius: 9, getFillColor: [12, 163, 12], getLineColor: [255, 255, 255], getLineWidth: 2.5 }));
    }
    if (plan && tabOpen('emg')) {
      var paths = []; if (plan.leg) { paths.push({ path: plan.leg.path, c: [12, 163, 12], w: 22 }); }
      plan.services.forEach(function (v) { if (v.leg) { paths.push({ path: v.leg.path, c: v.type === 'hospital' ? [213, 81, 129] : v.type === 'police' ? [57, 135, 229] : [217, 89, 38], w: 9 }); } });
      out.push(new deck.PathLayer({ id: 'evac-routes', data: paths, getPath: function (p) { return p.path; }, getColor: function (p) { return p.c; }, getWidth: function (p) { return p.w; }, widthUnits: 'meters', widthMinPixels: 3, capRounded: true, jointRounded: true }));
      var pts = [{ p: [plan.s.lon, plan.s.lat], c: [208, 59, 59] }]; if (plan.ap) { pts.push({ p: plan.ap.at, c: [12, 163, 12] }); }
      out.push(new deck.ScatterplotLayer({ id: 'evac-points', data: pts, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (p) { return p.p; }, getRadius: 10, getFillColor: function (p) { return p.c; }, getLineColor: [255, 255, 255], getLineWidth: 2.5 }));
    }
    return out;
  });

  C.onReady(function () {
    renderInc();
    $('incAck').addEventListener('click', function () { incAction('ack'); });
    $('incDisp').addEventListener('click', function () { incAction('disp'); });
    $('incClose').addEventListener('click', function () { incAction('clear'); });
    $('incExport').addEventListener('click', function () {
      csv('incidents-' + state.date + '.csv', [['Incident', 'Road', 'Severity', 'Status', 'Reported', 'Acknowledged', 'Dispatched', 'On scene', 'Cleared', 'Response min', 'Note']].concat(incidents().map(function (x) {
        return [x.id, x.title, x.a.severity, STAGES[x.stage], clock(x.opened), x.stage >= 1 ? clock(x.ack) : '', x.stage >= 2 ? clock(x.disp) : '', x.stage >= 3 ? clock(x.scene) : '', x.stage >= 4 ? clock(x.clear) : '', x.stage >= 3 ? x.response.toFixed(1) : '', 'illustrative, not a real record']; })));
    });
    $('sgPriority').addEventListener('click', givePriority);
    $('plTest').addEventListener('click', function () { var name = $('plRoad').value; if (name) { C.setClosure(name); C.showTab('cong'); if (T.audit) { T.audit('Roadworks closure test: ' + name); } } });
    $('emSite').addEventListener('change', function () { buildPlan($('emSite').value); renderEmg(); C.redraw(); if (plan && T.getMap()) { T.getMap().easeTo({ center: [plan.s.lon, plan.s.lat], zoom: 13.5, duration: 800 }); } });
    $('dzType').addEventListener('change', function () {
      buildDisaster($('dzType').value); renderEmg(); C.redraw();
      if (dz && T.getMap()) { var a = dz.d.areas[0]; T.getMap().easeTo({ center: a.at, zoom: dz.d.areas.length > 1 ? 11.5 : 12.5, duration: 800 }); }
    });
    C.onTab(function () { renderInc(); renderSig(); renderPlan(); renderEmg(); C.redraw(); });
    C.onMinute(function () { renderInc(); renderSig(); renderPlan(); });
  });

  T.incidents = { list: incidents, select: selectInc };
  T.signalControl = { junctions: loadJunctions, corridors: function () { loadJunctions(); return corridors || []; }, priority: function () { return priority; } };
  T.planned = { list: planned };
  T.emergency = { disaster: function (id) { buildDisaster(id); renderEmg(); C.redraw(); return dz; }, plan: function (id) { buildPlan(id); renderEmg(); C.redraw(); return plan; } };
})();
