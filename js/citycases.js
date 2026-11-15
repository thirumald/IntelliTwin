/* IntelliTwin: critical smart-city use cases, added to the existing menu sections.
 *
 *   Pedestrians  crowd safety at venues; school zones now
 *   Incidents    unified command across agencies
 *   Emergency    utility failure impact (power, water, lighting, telecom)
 *   Signals      adaptive control by corridor
 *   Zones        site protection level
 *   Search       tracking a vehicle across cameras
 *   Devices      asset health forecast
 *   Events       impact and conflicts of planned work
 *   Transit      service performance by route
 *   Model        development impact screening
 *   Environment  emissions and exceedances
 *   Analytics    "Resilient city services" goal on the scorecard (through T.cityCases.stats)
 *
 * Everything here is computed in the browser from the simulated traffic, OpenStreetMap positions and
 * seeded synthetic values. Nothing is sent to a field system; each card says what its figures are.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, clock = C.clock, state = T.state, K = T.kit;
  var CC = CFG.cityCases || {}, rnd = K.rnd, hashStr = K.hashStr, esc = K.esc;
  var kx = 111320 * Math.cos(((C.meta() || {}).bbox ? (C.meta().bbox[1] + C.meta().bbox[3]) / 2 : 24.4) * Math.PI / 180), ky = 110570;
  function metres(a, b) { return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky); }
  function audit(text) { if (T.audit) { T.audit(text); } }
  function tile(label, id) { return '<div class="kpi"><span class="k-label">' + label + '</span><span class="k-value" id="' + id + '">–</span></div>'; }
  function set(id, html) { var el = $(id); if (el) { el.innerHTML = html; } }
  function pct(v) { return Math.round(v) + '<small>%</small>'; }

  // A card added after the last card of an existing menu section.
  function card(tab, id, title, sub, notice, body) {
    var sec = document.createElement('section'); sec.className = 'card'; sec.id = id; sec.setAttribute('data-tab', tab); sec.hidden = true;
    sec.innerHTML = (notice ? '<p class="notice">' + notice + '</p>' : '') + '<div class="card-head"><h2>' + title + '</h2><span class="muted" id="' + id + 'Sub">' + (sub || '') + '</span></div>' + body;
    var all = document.querySelectorAll('.panel section[data-tab="' + tab + '"]'), last = all[all.length - 1];
    if (last) { last.parentNode.insertBefore(sec, last.nextSibling); } else { document.querySelector('.panel').appendChild(sec); }
    return sec;
  }
  function fillSelect(id, rows, keep) { var el = $(id), v = keep ? el.value : ''; el.innerHTML = ''; rows.forEach(function (r) { var o = document.createElement('option'); o.value = r[0]; o.textContent = r[1]; el.appendChild(o); }); if (v) { el.value = v; } }

  // Road midpoints, for "what is within this distance" questions.
  var mids = null;
  function roadMids() { if (!mids) { mids = C.edges().map(function (e) { return e.path[e.path.length >> 1]; }); } return mids; }
  function roadsNear(at, r) { var m = roadMids(), out = []; for (var i = 0; i < m.length; i++) { if (Math.abs((m[i][1] - at[1]) * ky) <= r && metres(m[i], at) <= r) { out.push(i); } } return out; }
  function places() { return C.sites().map(function (s) { return { name: s[0], at: [s[1], s[2]], kind: s[4] || '' }; }); }

  /* ============================================================ 4. Crowd safety (Pedestrians) */
  var hold = {}, crowdSel = -1;
  function venues() {
    var seed = hashStr('crowd' + C.region.id), day = new Date(state.date + 'T00:00:00Z').getUTCDay(), weekend = day === 5 || day === 6 ? 1.25 : 1;
    return places().slice(0, CC.venues || 10).map(function (p, n) {
      var cap = Math.round((4 + 36 * rnd(seed, n)) * 100) * 10, area = cap / (2.2 + rnd(seed, n + 50)), h = state.t / 3600;
      var shape = 0.12 + 0.5 * Math.exp(-Math.pow((h - 12.5) / 2.2, 2)) + 0.85 * Math.exp(-Math.pow((h - 19.5 - rnd(seed, n + 100)) / 2.4, 2));
      var load = Math.min(1.12, shape * weekend * (0.75 + 0.5 * rnd(seed, n + 150)) * (hold[n] ? 0.82 : 1));
      var people = Math.round(cap * load), dens = people / area, lvl = load >= 1 || dens >= 4 ? 3 : load >= 0.8 || dens >= 3 ? 2 : load >= 0.6 ? 1 : 0;
      return { n: n, name: p.name, at: p.at, cap: cap, people: people, load: load, dens: dens, lvl: lvl, inflow: Math.round(cap * 0.02 * shape * (hold[n] ? 0.2 : 1)), outflow: Math.round(cap * 0.012 * (0.4 + shape)) };
    });
  }
  var LVL = ['Normal', 'Busy', 'Crowded', 'Over capacity'], LCOL = [[46, 160, 110], [230, 180, 60], [240, 130, 50], [230, 70, 70]], LDOT = ['free', 'moderate', 'heavy', 'severe'];
  function renderCrowd() {
    var v = venues(); if (!v.length) { $('ccCrowd').hidden = true; return; }
    set('ccCrowdN', v.length); set('ccCrowdP', num(v.reduce(function (s, x) { return s + x.people; }, 0)));
    set('ccCrowdHigh', v.filter(function (x) { return x.load >= 0.8; }).length);
    set('ccCrowdDens', Math.max.apply(null, v.map(function (x) { return x.dens; })).toFixed(1) + '<small>p/m²</small>');
    var ol = $('ccCrowdList'); ol.innerHTML = '';
    v.slice().sort(function (a, b) { return b.load - a.load; }).forEach(function (x) {
      ol.appendChild(C.listButton(LDOT[x.lvl], x.name, LVL[x.lvl] + ' · ' + num(x.people) + ' of ' + num(x.cap) + (hold[x.n] ? ' · entry held' : ''), Math.round(x.load * 100) + '<small>%</small>', function () { crowdSel = x.n; C.flyTo(x.at[0], x.at[1], 15.5); showVenue(x); renderCrowd(); }));
    });
    var s = v.filter(function (x) { return x.n === crowdSel; })[0], b = $('ccCrowdHold');
    b.hidden = !s; if (s) { b.textContent = hold[s.n] ? 'Release entry at ' + s.name : 'Hold entry at ' + s.name; b.disabled = !K.canAct(); }
  }
  function showVenue(x) {
    var act = x.lvl >= 3 ? 'Hold entry, open all exits, send stewards and a patrol' : x.lvl === 2 ? 'Open extra gates, meter entry, message signs to alternative parking' : x.lvl === 1 ? 'Watch the trend' : 'No action';
    C.showPopup(x.at, x.name, [['Status', LVL[x.lvl]], ['People inside', num(x.people) + ' of ' + num(x.cap)], ['Density', x.dens.toFixed(1) + ' people/m²'], ['Entering', num(x.inflow) + ' a minute'], ['Leaving', num(x.outflow) + ' a minute'], ['Suggested action', act]], 'Synthetic crowd figures');
  }

  /* ============================================================ 10. School zones now (Pedestrians) */
  var schoolCache = null;
  function schools() {
    if (schoolCache || !T.zones) { return schoolCache || []; }
    schoolCache = T.zones.all().filter(function (s) { return /school|kindergarten|college/i.test(s.type || ''); }).slice(0, 400).map(function (s) { return { name: s.name, at: [s.lon, s.lat], roads: roadsNear([s.lon, s.lat], CC.schoolZoneM || 200) }; }).filter(function (s) { return s.roads.length; });
    return schoolCache;
  }
  function schoolTime(t) { var h = t / 3600; return (h >= 6.5 && h < 8.25) || (h >= 12.75 && h < 14.75); }
  function schoolNow() {
    var e = C.edges(), lim = CC.schoolLimitKmh || 40, active = schoolTime(state.t);
    return schools().map(function (s) {
      var fast = 0, top = 0, veh = 0;
      s.roads.forEach(function (i) { var sp = e[i].s * C.ratio(i), o = C.occ(i); veh += o; if (sp > lim) { fast += o; } if (sp > top && o > 0.2) { top = sp; } });
      return { s: s, veh: veh, over: veh ? fast / veh : 0, top: top, active: active };
    });
  }
  function renderSchool() {
    var rows = schoolNow(), lim = CC.schoolLimitKmh || 40, act = schoolTime(state.t), busy = rows.filter(function (r) { return r.veh > 1; });
    $('ccSchoolSub').textContent = act ? 'School time: ' + lim + ' km/h limit in force' : 'Outside school time';
    set('ccSchoolN', rows.length); set('ccSchoolOk', busy.length ? pct(100 * busy.filter(function (r) { return r.over < 0.3; }).length / busy.length) : '–');
    set('ccSchoolVeh', num(Math.round(rows.reduce(function (s, r) { return s + r.veh; }, 0)))); set('ccSchoolTop', busy.length ? Math.round(Math.max.apply(null, busy.map(function (r) { return r.top; }))) + '<small>km/h</small>' : '–');
    var ol = $('ccSchoolList'); ol.innerHTML = '';
    busy.sort(function (a, b) { return b.over * b.veh - a.over * a.veh; }).slice(0, 8).forEach(function (r) {
      ol.appendChild(C.listButton(r.over > 0.6 ? 'severe' : r.over > 0.3 ? 'heavy' : 'free', r.s.name, Math.round(r.over * 100) + '% of vehicles above ' + lim + ' km/h · fastest road ' + Math.round(r.top) + ' km/h', Math.round(r.veh) + '<small>veh</small>', function () {
        C.flyTo(r.s.at[0], r.s.at[1], 16); C.showPopup(r.s.at, r.s.name, [['Zone', (CC.schoolZoneM || 200) + ' m around the school'], ['Vehicles in the zone', Math.round(r.veh)], ['Above ' + lim + ' km/h', Math.round(r.over * 100) + '%'], ['Suggested measure', r.over > 0.6 ? 'Speed camera or raised crossing' : r.over > 0.3 ? 'Flashing school sign, patrol at school time' : 'None']], 'Simulated speeds near a real school position');
      }));
    });
  }

  /* ============================================================ 5. Unified command (Incidents) */
  var major = {}, AG = [['Police', 0], ['Ambulance', 1], ['Civil Defence', 2], ['Traffic control centre', 3], ['Municipality', 4]];
  function agencies(x) {
    var seed = hashStr(x.id), need = x.sev === 3 || major[x.id] ? 5 : x.sev === 2 ? 3 : 2, t = state.t;
    return AG.map(function (a, k) {
      var called = k < need || (k === 3), notified = x.ack + 20 + 40 * rnd(seed, k), eta = k === 3 ? notified : x.disp + 60 * (3 + 9 * rnd(seed, k + 10)), done = x.clear - 120 * rnd(seed, k + 20);
      if (major[x.id] && k >= 2 && need === 5 && x.sev < 3) { notified = Math.max(notified, major[x.id]); eta = notified + 60 * (4 + 8 * rnd(seed, k + 10)); }
      var st = !called ? 'Not required' : t >= done && x.stage === 4 ? 'Stood down' : t >= eta ? (k === 3 ? 'Managing signals and signs' : 'On scene') : t >= notified ? 'En route' : 'Being notified';
      return { name: a[0], called: called, notified: notified, eta: eta, status: st, unit: k === 0 ? x.unit : k === 1 ? 'Ambulance ' + (201 + Math.floor(rnd(seed, 30) * 40)) : k === 2 ? 'Fire unit ' + (31 + Math.floor(rnd(seed, 31) * 12)) : k === 3 ? 'Duty operator' : 'Roads crew ' + (1 + Math.floor(rnd(seed, 32) * 6)) };
    });
  }
  function renderCommand() {
    if (!T.incidents) { return; }
    var open = T.incidents.list().filter(function (x) { return x.stage < 4; }).sort(function (a, b) { return b.sev - a.sev || b.opened - a.opened; });
    var sel = $('ccCmdSel'), was = sel.value;
    fillSelect('ccCmdSel', open.map(function (x) { return [x.id, x.id + ' · ' + x.title]; }));
    if (open.some(function (x) { return x.id === was; })) { sel.value = was; }
    var x = open.filter(function (i) { return i.id === sel.value; })[0], box = $('ccCmdBody');
    $('ccCmdMajor').hidden = !x;
    if (!x) { box.innerHTML = '<p class="muted">No open incident right now.</p>'; return; }
    var ag = agencies(x), on = ag.filter(function (a) { return a.called; });
    var rows = on.map(function (a) { return C.fact(a.name, a.unit, a.status + (a.status === 'En route' ? ' · due ' + clock(a.eta) : '')); }).join('');
    var log = [[x.opened, 'Incident reported: ' + x.a.severity], [x.ack, 'Acknowledged by the control room']];
    on.forEach(function (a) { log.push([a.notified, a.name + ' notified']); if (a.name !== 'Traffic control centre') { log.push([a.eta, a.name + ' on scene']); } });
    if (major[x.id]) { log.push([major[x.id], 'Major incident declared: all agencies called']); }
    log = log.filter(function (l) { return l[0] <= state.t; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 8);
    box.innerHTML = '<table class="facts">' + rows + '</table><h3 class="cc-h">Shared timeline</h3><ul class="cc-log">' + log.map(function (l) { return '<li><span>' + clock(l[0]) + '</span>' + esc(l[1]) + '</li>'; }).join('') + '</ul>';
    var b = $('ccCmdMajor'); b.disabled = !!major[x.id] || !K.canAct(); b.textContent = major[x.id] ? 'Major incident declared' : 'Declare major incident';
    $('ccCmdSub').textContent = on.length + ' agencies on this incident';
  }

  /* ============================================================ 16. Utility failure impact (Emergency) */
  var UT = { power: ['Power outage', 1200, 'Signals go dark and cameras run on battery. Police control the main junctions by hand.'], water: ['Water main burst', 500, 'Carriageway flooding closes lanes around the burst.'],
    light: ['Street lighting failure', 1500, 'No signal impact. Night-time accident risk rises on unlit roads.'], telecom: ['Telecom outage', 2000, 'Signals keep their local plans but cannot be adjusted; cameras and signs lose their link.'] };
  var util = null;
  function buildUtil() {
    var kind = $('ccUtilKind').value, p = places()[Number($('ccUtilAt').value)]; if (!kind || !p) { util = null; return; }
    var r = UT[kind][1], e = C.edges(), roads = roadsNear(p.at, r), sig = (C.signals() || []).filter(function (s) { return metres(s, p.at) <= r; });
    var cams = (T.devices ? T.devices.cameras() : []).filter(function (c) { return metres([c.lon, c.lat], p.at) <= r; });
    var sites = (T.zones ? T.zones.all() : []).filter(function (s) { return metres([s.lon, s.lat], p.at) <= r; });
    var veh = 0, km = 0; roads.forEach(function (i) { veh += C.occ(i); km += e[i].m / 1000; });
    var night = state.t < 6 * 3600 || state.t > 18.5 * 3600, cut = kind === 'power' ? 0.4 : kind === 'water' ? 0.5 : 0;
    util = { kind: kind, at: p.at, name: p.name, r: r, roads: roads, sig: sig, cams: cams, sites: sites, veh: veh, km: km, cut: cut, night: night,
      hospitals: sites.filter(function (s) { return /hospital|clinic/i.test(s.type || ''); }).length, delay: veh * cut * 0.12 };
  }
  function renderUtil() {
    var box = $('ccUtilBody'); if (!util) { box.innerHTML = '<p class="muted">Choose a failure and where it happens.</p>'; return; }
    var u = util, acts = { power: ['Send police to the ' + Math.min(u.sig.length, 6) + ' busiest dark junctions', 'Message signs: signals out, drive with care', u.hospitals ? 'Confirm generator power at ' + u.hospitals + ' health sites' : 'Check generator power at critical sites', 'Ask the utility for a restoration time'],
      water: ['Close the flooded lanes and sign a diversion', 'Send a roads crew and the water utility', 'Warn buses on the affected roads'], light: [u.night ? 'Patrol the unlit roads now' : 'Repair before dusk', 'Lower speed on message signs after dark', 'Raise a P1 work order for the lighting circuit'],
      telecom: ['Switch signals to local time-of-day plans', 'Use radio for field units', 'Ask the operator for a restoration time'] }[u.kind];
    box.innerHTML = '<p class="insight">' + esc(UT[u.kind][2]) + '</p><div class="kpis">' + tile('Roads affected', 'ccU1') + tile('Vehicles there now', 'ccU2') + tile(u.kind === 'light' ? 'Road length unlit' : 'Signals affected', 'ccU3') + tile('Critical sites inside', 'ccU4') + '</div>' +
      '<table class="facts">' + C.fact('Area', '', esc(u.name) + ' · ' + (u.r / 1000).toFixed(1) + ' km radius') + C.fact('Cameras affected', 'synthetic positions', u.cams.length) +
      (u.cut ? C.fact('Estimated extra delay', 'screening estimate', num(Math.round(u.delay)) + ' veh-h an hour') : '') + (u.kind === 'light' ? C.fact('Risk now', '', u.night ? 'Raised: it is dark' : 'Low until dusk') : '') + '</table>' +
      '<h3 class="cc-h">Suggested actions</h3><ul class="cc-log">' + acts.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
    set('ccU1', num(u.roads.length)); set('ccU2', num(Math.round(u.veh))); set('ccU3', u.kind === 'light' ? u.km.toFixed(1) + '<small>km</small>' : u.kind === 'water' ? 0 : u.sig.length); set('ccU4', u.sites.length);
  }

  /* ============================================================ 8. Adaptive control (Signals) */
  var mode = {}, MODES = { fixed: ['Fixed time plan', 0], adaptive: ['Adaptive', 0.14], wave: ['Green wave', 0.2] };
  function corridorRows() {
    if (!T.signalControl) { return []; }
    var e = C.edges();
    return T.signalControl.corridors().map(function (c, n) {
      var veh = 0, lost = 0; c.g.idx.forEach(function (i) { var r = Math.max(0.05, C.ratio(i)), o = C.occ(i); veh += o; lost += o * (1 - r); });
      var m = mode[n] || 'fixed', gain = MODES[m][1] * (c.ratio < 0.75 ? 1 : 0.5), saved = lost * gain;
      return { n: n, c: c, veh: veh, lost: lost, mode: m, saved: saved, speedNow: c.g.idx.length ? c.g.idx.reduce(function (s, i) { return s + e[i].s * C.ratio(i); }, 0) / c.g.idx.length : 0, gain: gain };
    });
  }
  function renderAdaptive() {
    var rows = corridorRows(), box = $('ccSigList'); box.innerHTML = '';
    var j = 0, saved = 0; rows.forEach(function (r) { if (r.mode !== 'fixed') { j += r.c.js.length; } saved += r.saved; });
    set('ccSigCorr', rows.filter(function (r) { return r.mode !== 'fixed'; }).length + '<small>of ' + rows.length + '</small>'); set('ccSigJ', j); set('ccSigSaved', num(Math.round(saved)) + '<small>veh-h/h</small>');
    rows.forEach(function (r) {
      var d = document.createElement('div'); d.className = 'cc-row';
      d.innerHTML = '<div><strong></strong><span class="muted">' + r.c.js.length + ' signals · ' + Math.round(r.speedNow) + ' km/h now' + (r.mode !== 'fixed' ? ' · about ' + Math.round(r.speedNow * (1 + r.gain * 0.6)) + ' km/h expected' : '') + '</span></div>';
      d.querySelector('strong').textContent = r.c.g.name;
      var s = document.createElement('select'); s.setAttribute('aria-label', 'Control mode for ' + r.c.g.name);
      Object.keys(MODES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = MODES[k][0]; s.appendChild(o); });
      s.value = r.mode; s.disabled = !K.canAct();
      s.addEventListener('change', function () { mode[r.n] = s.value; audit('Signal control: ' + r.c.g.name + ' set to ' + MODES[s.value][0] + ' (simulated)'); renderAdaptive(); });
      d.appendChild(s); d.firstChild.addEventListener('click', function () { C.locate(r.c.g); });
      box.appendChild(d);
    });
    if (!rows.length) { box.innerHTML = '<p class="muted">No corridor with three or more signals in this region.</p>'; }
  }

  /* ============================================================ 11. Site protection (Zones) */
  var posture = {}, POST = ['Normal', 'Elevated', 'Lockdown'];
  function protSites() {
    if (!T.zones) { return []; }
    var a = T.zones.alerts().slice(0, 6), ids = {}; a.forEach(function (s) { ids[s.id] = 1; });
    T.zones.all().forEach(function (s) { if (posture[s.id] && !ids[s.id]) { a.push(s); ids[s.id] = 1; } });
    if (a.length < 6) { T.zones.all().some(function (s) { if (!ids[s.id] && /defen|military|embassy|government|police|hospital/i.test(s.type || '')) { a.push(s); ids[s.id] = 1; } return a.length >= 6; }); }
    return a;
  }
  function renderProt() {
    var list = protSites(), sel = $('ccProtSel'), was = sel.value;
    fillSelect('ccProtSel', list.map(function (s) { return [s.id, s.name + (posture[s.id] ? ' · ' + POST[posture[s.id]] : '')]; })); if (list.some(function (s) { return String(s.id) === was; })) { sel.value = was; }
    var s = list.filter(function (x) { return String(x.id) === sel.value; })[0], box = $('ccProtBody');
    var counts = [0, 0, 0]; T.zones && T.zones.all().forEach(function (x) { counts[posture[x.id] || 0]++; });
    set('ccProtEl', counts[1]); set('ccProtLock', counts[2]);
    if (!s) { box.innerHTML = '<p class="muted">No site to protect in this region.</p>'; $('ccProtBtns').hidden = true; return; }
    $('ccProtBtns').hidden = false;
    var at = [s.lon, s.lat], cams = (T.devices ? T.devices.cameras() : []).filter(function (c) { return metres([c.lon, c.lat], at) <= 600; }).length, e = C.edges(), veh = 0;
    (s.edges || []).forEach(function (i) { veh += C.occ(i); });
    var names = {}; (s.edges || []).forEach(function (i) { var nm = C.names()[e[i].n]; if (nm) { names[nm] = 1; } });
    var p = posture[s.id] || 0, acts = [['Routine patrols'], ['Patrol sent to the site', 'Cameras within 600 m on the video wall', 'Vehicle search alerts for the watch list near the site'], ['Close the approach roads: ' + (Object.keys(names).slice(0, 3).join(', ') || 'nearest roads'), 'Units at every access point', 'Divert traffic and buses around the zone', 'Notify the site security lead']][p];
    box.innerHTML = '<table class="facts">' + C.fact('Site', esc(T.zones.label ? T.zones.label(s.type) : s.type), esc(s.name)) + C.fact('Status from traffic', '', s.status === 'alert' ? 'Alert: ' + esc(s.reason || 'traffic stopped nearby') : s.status === 'watch' ? 'Watch' : 'Clear') +
      C.fact('Protection level', '', POST[p]) + C.fact('Cameras within 600 m', 'synthetic positions', cams) + C.fact('Vehicles on the approach roads', 'simulated', Math.round(veh)) + '</table><h3 class="cc-h">Actions at this level</h3><ul class="cc-log">' + acts.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
    Array.prototype.forEach.call($('ccProtBtns').children, function (b, i) { b.classList.toggle('on', i === p); b.disabled = !K.canAct(); });
  }

  /* ============================================================ 13. Tracking across cameras (Search) */
  function renderTrack() {
    var j = T.vehicleSearch ? T.vehicleSearch.journey() : null, box = $('ccTrackBody');
    if (!j || !j.list.length) { box.innerHTML = '<p class="muted">Search a plate above to follow it from camera to camera.</p>'; $('ccTrackAlert').hidden = true; return; }
    var L = j.list, last = L[L.length - 1], ago = (state.t - last.t) / 60, cams = T.devices.cameras(), prev = L.length > 1 ? L[L.length - 2] : null;
    var legs = L.slice(1).map(function (s, k) { var min = (s.t - L[k].t) / 60; return C.fact(esc(L[k].cam.id) + ' → ' + esc(s.cam.id), clock(L[k].t) + ' to ' + clock(s.t), (s.km ? s.km.toFixed(1) + ' km · ' : '') + Math.round(min) + ' min' + (s.km ? ' · ' + Math.round(s.km / (min / 60)) + ' km/h' : '')); }).join('');
    // Cameras the vehicle is most likely to pass next: nearest ones ahead of its last direction of travel.
    var dir = prev ? [last.cam.lon - prev.cam.lon, last.cam.lat - prev.cam.lat] : [0, 0];
    var next = cams.filter(function (c) { return c !== last.cam; }).map(function (c) { var d = metres([c.lon, c.lat], [last.cam.lon, last.cam.lat]), ahead = (c.lon - last.cam.lon) * dir[0] + (c.lat - last.cam.lat) * dir[1]; return { c: c, d: d, ahead: ahead >= 0 }; })
      .filter(function (x) { return x.d < 6000; }).sort(function (a, b) { return (b.ahead - a.ahead) || a.d - b.d; }).slice(0, 3);
    box.innerHTML = '<table class="facts">' + C.fact('Last seen', esc(last.cam.name), esc(last.cam.id) + ' · ' + clock(last.t) + ' · ' + Math.round(ago) + ' min ago') + C.fact('Cameras passed', 'today', L.length) + legs + '</table>' +
      '<h3 class="cc-h">Likely next cameras</h3><ol class="corridors" id="ccTrackNext"></ol>';
    next.forEach(function (x) { $('ccTrackNext').appendChild(C.listButton(x.ahead ? 'heavy' : 'moderate', x.c.id + ' · ' + x.c.name, (x.d / 1000).toFixed(1) + ' km away' + (x.ahead ? ' · in the direction of travel' : ''), '~' + Math.max(1, Math.round(x.d / 1000 / 45 * 60)) + '<small>min</small>', function () { C.flyTo(x.c.lon, x.c.lat, 16); })); });
    var b = $('ccTrackAlert'); b.hidden = false; b.disabled = !K.canAct(); b.textContent = 'Alert units near ' + (next[0] ? next[0].c.id : last.cam.id);
    b.onclick = function () { audit('Vehicle tracking: units alerted for ' + j.plate + ' near ' + (next[0] ? next[0].c.id : last.cam.id)); b.textContent = 'Units alerted'; b.disabled = true; };
  }

  /* ============================================================ 17. Asset health forecast (Devices) */
  function assetHealth() {
    if (!T.assets) { return []; }
    var seed = hashStr('health' + state.date.slice(0, 7));
    return T.assets.groups().map(function (g, i) {
      var age = 2 + 7 * rnd(seed, i), health = Math.max(40, Math.min(99, g.avail - 2.2 * age + 6 * rnd(seed, i + 20))), risk = Math.max(0, Math.round(g.count * (100 - health) / 100 * 0.18));
      return { g: g, age: age, health: health, risk: risk, mttr: 3 + 9 * rnd(seed, i + 40) };
    });
  }
  function renderHealth() {
    var rows = assetHealth(), total = rows.reduce(function (s, r) { return s + r.g.count; }, 0), wo = T.assets ? T.assets.workOrders() : [];
    set('ccAhScore', total ? Math.round(rows.reduce(function (s, r) { return s + r.health * r.g.count; }, 0) / total) + '<small>/100</small>' : '–');
    set('ccAhRisk', rows.reduce(function (s, r) { return s + r.risk; }, 0)); set('ccAhOver', wo.filter(function (w) { return w.overdue; }).length);
    set('ccAhMttr', rows.length ? (rows.reduce(function (s, r) { return s + r.mttr; }, 0) / rows.length).toFixed(1) + '<small>h</small>' : '–');
    $('ccAhBars').innerHTML = rows.sort(function (a, b) { return a.health - b.health; }).map(function (r) { return C.barRow(esc(r.g.name), r.risk + ' likely to fail in 30 days · average age ' + r.age.toFixed(1) + ' years', Math.round(r.health) + '/100', r.health / 100); }).join('');
  }

  /* ============================================================ 15. Impact and conflicts (Events) */
  function planImpact() {
    if (!T.planned) { return { rows: [], conflicts: [] }; }
    var e = C.edges(), rows = T.planned.list().map(function (x) {
      var near = roadsNear(x.at, x.it.type === 'roadworks' ? 500 : 900), veh = 0; near.forEach(function (i) { veh += C.occ(i); });
      var cut = x.it.type === 'roadworks' ? 0.35 : 0.2, delay = x.active ? veh * cut * 0.15 : 0, big = null;
      near.forEach(function (i) { if (e[i].c <= 2 && (!big || e[i].m > e[big].m)) { big = i; } });
      return { x: x, veh: veh, delay: delay, roads: near.length, main: big !== null ? C.names()[e[big].n] : '' };
    }), conflicts = [];
    for (var a = 0; a < rows.length; a++) { for (var b = a + 1; b < rows.length; b++) {
      var A = rows[a].x, B = rows[b].x;
      if (A.it.fromDay <= B.it.toDay && B.it.fromDay <= A.it.toDay && metres(A.at, B.at) <= (CC.conflictM || 2000)) { conflicts.push([rows[a], rows[b], metres(A.at, B.at)]); }
    } }
    return { rows: rows, conflicts: conflicts };
  }
  function renderPlan() {
    var p = planImpact();
    set('ccPlActive', p.rows.filter(function (r) { return r.x.active; }).length); set('ccPlConf', p.conflicts.length);
    set('ccPlDelay', num(Math.round(p.rows.reduce(function (s, r) { return s + r.delay; }, 0))) + '<small>veh-h/h</small>');
    var ol = $('ccPlList'); ol.innerHTML = '';
    p.conflicts.forEach(function (c) { ol.appendChild(C.listButton('severe', 'Conflict: ' + c[0].x.title + ' and ' + c[1].x.title, (c[2] / 1000).toFixed(1) + ' km apart with overlapping dates · stagger the dates or share one diversion', '!', function () { C.flyTo(c[0].x.at[0], c[0].x.at[1], 13.5); })); });
    p.rows.sort(function (a, b) { return b.delay - a.delay || b.veh - a.veh; }).forEach(function (r) {
      ol.appendChild(C.listButton(r.x.active ? 'heavy' : 'free', r.x.title, (r.x.active ? 'Active now' : r.x.when) + ' · ' + Math.round(r.veh) + ' vehicles nearby' + (r.main ? ' · divert by ' + r.main : ''), r.x.active ? Math.round(r.delay) + '<small>veh-h</small>' : '–', function () { C.flyTo(r.x.at[0], r.x.at[1], 15); }));
    });
    if (!p.rows.length) { ol.innerHTML = '<li class="muted">No planned work or event in this region.</li>'; }
  }

  /* ============================================================ 14. Service performance (Transit) */
  function busPerf() {
    if (!T.buses) { return []; }
    var lim = (CFG.buses || {}).onTimeWithinMin || 3, seed = hashStr('riders' + state.date), h = state.t / 3600, peak = 0.35 + 0.65 * Math.max(Math.exp(-Math.pow((h - 7.75) / 1.6, 2)), Math.exp(-Math.pow((h - 17.75) / 2, 2)));
    return T.buses.routes().map(function (r, n) {
      var on = T.buses.busesOn(r, state.t), late = on.length ? on[0].late : 0, load = Math.min(1.15, peak * (0.55 + 0.6 * rnd(seed, n)));
      return { r: r, buses: on.length, late: late, ok: late < lim, load: load, riders: Math.round(on.length * 70 * load), headway: r.headway };
    }).filter(function (x) { return x.buses; });
  }
  function renderBusPerf() {
    var rows = busPerf(), buses = rows.reduce(function (s, r) { return s + r.buses; }, 0);
    set('ccBpOn', buses ? pct(100 * rows.filter(function (r) { return r.ok; }).reduce(function (s, r) { return s + r.buses; }, 0) / buses) : '–');
    set('ccBpLate', buses ? (rows.reduce(function (s, r) { return s + r.late * r.buses; }, 0) / buses).toFixed(1) + '<small>min</small>' : '–');
    set('ccBpRiders', num(rows.reduce(function (s, r) { return s + r.riders; }, 0))); set('ccBpFull', rows.filter(function (r) { return r.load >= 0.9; }).length);
    $('ccBpBars').innerHTML = rows.length ? rows.sort(function (a, b) { return b.late - a.late; }).slice(0, 10).map(function (r) {
      return C.barRow(esc(r.r.id + ' ' + r.r.name), r.buses + ' buses · every ' + r.headway + ' min · ' + Math.round(r.load * 100) + '% full', r.late.toFixed(1) + ' min late', Math.min(1, r.late / 10)); }).join('') : '<p class="muted">No bus in service at this time.</p>';
  }

  /* ============================================================ 19. Development impact (Model) */
  var dev = null;
  function buildDev() {
    var p = places()[Number($('ccDevAt').value)], homes = Math.max(0, Number($('ccDevHomes').value) || 0), jobs = Math.max(0, Number($('ccDevJobs').value) || 0); if (!p) { dev = null; return; }
    var R = CC.development || {}, trips = homes * (R.tripsPerHome || 7) + jobs * (R.tripsPerJob || 3), peak = trips * (R.peakHourShare || 0.1) * (R.carShare || 0.8);
    var e = C.edges(), bin = C.binAt(8 * 3600), mid = roadMids(), near = roadsNear(p.at, R.radiusM || 2000).filter(function (i) { return e[i].c <= 3 && e[i].m >= 5; }), cap = 0;
    var capOf = function (i) { return (e[i].l || 1) * (e[i].c <= 1 ? 1900 : e[i].c === 2 ? 1500 : 900); };
    // Roads closer to the site carry more of the added traffic.
    var wOf = function (i) { var d = metres(mid[i], p.at) / 700; return capOf(i) * e[i].m / (1 + d * d); };
    near.forEach(function (i) { cap += wOf(i); });
    var groups = {}, before = 0, after = 0, w = 0;
    near.forEach(function (i) {
      var rr = C.ratioAt(bin, i), r0 = Math.max(0.12, isFinite(rr) ? Math.min(1, rr) : 1), vc0 = Math.pow(Math.max(0, (1 / r0 - 1) / 0.6), 0.25), add = cap ? peak * (wOf(i) / cap) * (R.avgTripKmNearby || 3) * 1000 / e[i].m : 0;
      var vc1 = vc0 + add / capOf(i), r1 = Math.max(0.12, 1 / (1 + 0.6 * Math.pow(vc1, 4))), nm = C.names()[e[i].n] || 'Unnamed road';
      var g = groups[nm] = groups[nm] || { name: nm, m: 0, s0: 0, s1: 0, mid: e[i].path[0] }; g.m += e[i].m; g.s0 += e[i].s * r0 * e[i].m; g.s1 += e[i].s * r1 * e[i].m;
      before += e[i].s * r0 * e[i].m; after += e[i].s * r1 * e[i].m; w += e[i].m;
    });
    var rows = Object.keys(groups).map(function (k) { var g = groups[k]; return { name: g.name, mid: g.mid, m: g.m, s0: g.s0 / g.m, s1: g.s1 / g.m }; }).filter(function (g) { return g.m > 300; }).sort(function (a, b) { return (b.s0 - b.s1) - (a.s0 - a.s1); });
    dev = { at: p.at, name: p.name, homes: homes, jobs: jobs, trips: trips, peak: peak, roads: near.length, s0: w ? before / w : 0, s1: w ? after / w : 0, rows: rows, r: R.radiusM || 2000,
      critical: rows.filter(function (g) { return g.s1 < 0.5 * g.s0 || g.s1 < 20; }).length };
  }
  function renderDev() {
    var box = $('ccDevBody'); if (!dev) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="kpis">' + tile('Added trips a day', 'ccD1') + tile('Added cars in the peak hour', 'ccD2') + tile('Peak speed nearby', 'ccD3') + tile('Roads under strain', 'ccD4') + '</div><ol class="corridors" id="ccDevList"></ol>';
    set('ccD1', num(Math.round(dev.trips))); set('ccD2', num(Math.round(dev.peak))); set('ccD3', Math.round(dev.s0) + ' → ' + Math.round(dev.s1) + '<small>km/h</small>'); set('ccD4', dev.critical);
    dev.rows.slice(0, 6).forEach(function (g) { $('ccDevList').appendChild(C.listButton(g.s1 < 0.6 * g.s0 ? 'severe' : g.s1 < 0.85 * g.s0 ? 'heavy' : 'free', g.name, Math.round(g.s0) + ' km/h today at 08:00 · ' + Math.round(g.s1) + ' km/h with the development', '−' + Math.round(g.s0 - g.s1) + '<small>km/h</small>', function () { C.flyTo(g.mid[0], g.mid[1], 14.5); })); });
  }

  /* ============================================================ 20. Emissions and exceedances (Environment) */
  var exCache = { key: '', rows: [] };
  function exceed() {
    if (!T.environment) { return []; }
    var lim = (CFG.environment || {}).alertAqiAbove || 100, key = state.date + state.scenario + T.environment.sensors().length;
    if (exCache.key !== key) {
      exCache = { key: key, rows: T.environment.sensors().map(function (s) { var hrs = []; for (var h = 0; h < 24; h++) { hrs.push(T.environment.readingAt(s, h * 3600 + 1800).aqi); } return { s: s, hrs: hrs }; }) };
    }
    var hNow = Math.floor(state.t / 3600);
    return exCache.rows.map(function (r) { var over = 0, peak = 0; for (var h = 0; h <= hNow; h++) { if (r.hrs[h] > lim) { over++; } peak = Math.max(peak, r.hrs[h]); } return { s: r.s, over: over, peak: peak, now: T.environment.readingAt(r.s, state.t).aqi }; });
  }
  function renderEmis() {
    var rows = exceed(), lim = (CFG.environment || {}).alertAqiAbove || 100, M = T.analytics ? T.analytics.model() : null, h = state.t / 3600, co2 = 0;
    if (M && M.co2) { for (var k = 0; k < Math.floor(h); k++) { co2 += M.co2[k]; } co2 += (M.co2[Math.floor(h)] || 0) * (h - Math.floor(h)); }
    var cls = [0, 0, 0], e = C.edges(), F = [1, 2.6, 4.2];                       // relative emission of a car, a van or bus, a truck
    for (var i = 0; i < e.length; i += 3) { var o = C.occ(i), heavy = e[i].c <= 1 ? 0.14 : e[i].c === 2 ? 0.09 : 0.04; cls[0] += o * (1 - heavy - 0.05) * F[0]; cls[1] += o * 0.05 * F[1]; cls[2] += o * heavy * F[2]; }
    var tot = cls[0] + cls[1] + cls[2] || 1;
    set('ccEmCo2', co2 ? num(Math.round(co2)) + '<small>t</small>' : '–'); set('ccEmOver', rows.filter(function (r) { return r.now > lim; }).length + '<small>of ' + rows.length + '</small>');
    set('ccEmHours', rows.length ? Math.max.apply(null, rows.map(function (r) { return r.over; })) + '<small>h</small>' : '–'); set('ccEmTruck', pct(100 * cls[2] / tot));
    $('ccEmBars').innerHTML = C.barRow('Cars and taxis', 'share of road CO₂ now', Math.round(100 * cls[0] / tot) + '%', cls[0] / tot) + C.barRow('Vans and buses', '', Math.round(100 * cls[1] / tot) + '%', cls[1] / tot) + C.barRow('Trucks', 'most on motorways', Math.round(100 * cls[2] / tot) + '%', cls[2] / tot);
    var ol = $('ccEmList'); ol.innerHTML = '';
    rows.filter(function (r) { return r.over; }).sort(function (a, b) { return b.over - a.over || b.peak - a.peak; }).slice(0, 6).forEach(function (r) {
      ol.appendChild(C.listButton(r.now > lim ? 'severe' : 'heavy', r.s.name, 'Peak index ' + Math.round(r.peak) + ' today · ' + Math.round(r.now) + ' now · limit ' + lim, r.over + '<small>h over</small>', function () { C.flyTo(r.s.lon, r.s.lat, 15); }));
    });
    if (!ol.children.length) { ol.innerHTML = '<li class="muted">No sensor has been above the limit today.</li>'; }
  }

  /* ============================================================ build the cards */
  var SYN = '<strong>Synthetic.</strong> ', EST = '<strong>Screening estimate.</strong> ';
  function build() {
    card('ped', 'ccCrowd', 'Crowd safety', 'Venues in this region', SYN + 'Crowd numbers are generated for the region’s sites; no people counter is connected.',
      '<div class="kpis">' + tile('Venues watched', 'ccCrowdN') + tile('People inside now', 'ccCrowdP') + tile('Above 80% of capacity', 'ccCrowdHigh') + tile('Highest density', 'ccCrowdDens') + '</div><ol class="corridors" id="ccCrowdList"></ol><div class="search-row"><button type="button" class="btn small" id="ccCrowdHold" hidden></button></div>');
    card('ped', 'ccSchool', 'School zones now', '', '<strong>Real school positions, simulated speeds.</strong> The simulation does not apply the school-time limit, so this shows where a limit would bite. No speed sensor is connected.',
      '<div class="kpis">' + tile('School zones', 'ccSchoolN') + tile('Zones with calm traffic', 'ccSchoolOk') + tile('Vehicles in zones', 'ccSchoolVeh') + tile('Fastest zone road', 'ccSchoolTop') + '</div><ol class="corridors" id="ccSchoolList"></ol>');
    card('inc', 'ccCmd', 'Unified command', '', SYN + 'Agency units and times are generated from the illustrative incident; no dispatch system is connected.',
      '<label class="field"><span>Incident</span><select id="ccCmdSel"></select></label><div id="ccCmdBody"></div><div class="search-row"><button type="button" class="btn small" id="ccCmdMajor" hidden>Declare major incident</button></div>');
    card('emg', 'ccUtil', 'Utility failure impact', 'Power, water, lighting, telecom', EST + 'Counts come from the twin’s roads, signals and sites inside the affected area; no utility network is connected.',
      '<label class="field"><span>Failure</span><select id="ccUtilKind"></select></label><label class="field"><span>Where</span><select id="ccUtilAt"></select></label><div id="ccUtilBody"></div><div class="search-row"><button type="button" class="btn small" id="ccUtilClear">Clear</button></div>');
    card('sig', 'ccSig', 'Adaptive control', 'By corridor', '<strong>Simulated control.</strong> Setting a mode sends nothing to a signal controller; the saving is an estimate from the simulated delay.',
      '<div class="kpis">' + tile('Corridors under control', 'ccSigCorr') + tile('Signals included', 'ccSigJ') + tile('Estimated delay saved', 'ccSigSaved') + '</div><div id="ccSigList"></div>');
    card('zones', 'ccProt', 'Site protection', '', SYN + 'Protection levels are set here for the exercise; no access control or site system is connected.',
      '<div class="kpis">' + tile('Sites at Elevated', 'ccProtEl') + tile('Sites in Lockdown', 'ccProtLock') + '</div><label class="field"><span>Site</span><select id="ccProtSel"></select></label><div id="ccProtBody"></div><div class="seg" id="ccProtBtns" role="group" aria-label="Protection level"><button type="button">Normal</button><button type="button">Elevated</button><button type="button">Lockdown</button></div>');
    card('anpr', 'ccTrack', 'Tracking across cameras', '', SYN + 'Sightings are generated; no plate reader is connected.', '<div id="ccTrackBody"></div><div class="search-row"><button type="button" class="btn small" id="ccTrackAlert" hidden></button></div>');
    card('dev', 'ccAh', 'Asset health forecast', 'Next 30 days', SYN + 'Health scores and failure forecasts are generated; no asset system is connected.',
      '<div class="kpis">' + tile('Health score', 'ccAhScore') + tile('Likely to fail in 30 days', 'ccAhRisk') + tile('Work orders overdue', 'ccAhOver') + tile('Average repair time', 'ccAhMttr') + '</div><div id="ccAhBars"></div>');
    card('plan', 'ccPl', 'Impact and conflicts', '', EST + 'Delay is estimated from the simulated vehicles near each site.',
      '<div class="kpis">' + tile('Active now', 'ccPlActive') + tile('Conflicts', 'ccPlConf') + tile('Estimated extra delay', 'ccPlDelay') + '</div><ol class="corridors" id="ccPlList"></ol>');
    card('bus', 'ccBp', 'Service performance', 'Buses now', SYN + 'Lateness and passenger loads are generated; no vehicle location or ticketing feed is connected.',
      '<div class="kpis">' + tile('Buses on time', 'ccBpOn') + tile('Average lateness', 'ccBpLate') + tile('Passengers on board', 'ccBpRiders') + tile('Routes above 90% full', 'ccBpFull') + '</div><div id="ccBpBars"></div>');
    card('model', 'ccDev', 'Development impact', 'Screening', EST + 'Added trips are spread over the nearby main roads and the speed is re-estimated with a volume-delay curve. It is not a simulation run.',
      '<label class="field"><span>Where</span><select id="ccDevAt"></select></label><div class="cc-two"><label class="field"><span>New homes</span><input id="ccDevHomes" type="number" min="0" step="500" value="5000"></label><label class="field"><span>New jobs</span><input id="ccDevJobs" type="number" min="0" step="500" value="3000"></label></div><div class="search-row"><button type="button" class="btn small" id="ccDevRun">Assess</button><button type="button" class="btn small" id="ccDevClear">Clear</button></div><div id="ccDevBody"></div>');
    card('env', 'ccEm', 'Emissions and exceedances', 'Today so far', '<strong>Estimated.</strong> CO₂ is estimated from simulated traffic; air-quality sensors are synthetic.',
      '<div class="kpis">' + tile('Road CO₂ so far today', 'ccEmCo2') + tile('Sensors above the limit now', 'ccEmOver') + tile('Longest time above the limit', 'ccEmHours') + tile('Share from trucks', 'ccEmTruck') + '</div><div id="ccEmBars"></div><ol class="corridors" id="ccEmList"></ol>');

    var P = places().map(function (p, i) { return [i, p.name]; });
    fillSelect('ccUtilKind', [['', 'Choose…']].concat(Object.keys(UT).map(function (k) { return [k, UT[k][0]]; }))); fillSelect('ccUtilAt', P); fillSelect('ccDevAt', P);
    $('ccCrowdHold').addEventListener('click', function () { var v = venues().filter(function (x) { return x.n === crowdSel; })[0]; if (!v) { return; } hold[v.n] = !hold[v.n]; audit('Crowd safety: entry ' + (hold[v.n] ? 'held' : 'released') + ' at ' + v.name + ' (simulated)'); renderCrowd(); C.redraw(); });
    $('ccCmdSel').addEventListener('change', renderCommand);
    $('ccCmdMajor').addEventListener('click', function () { var id = $('ccCmdSel').value; if (!id) { return; } major[id] = state.t; audit('Unified command: major incident declared for ' + id + ' (simulated)'); renderCommand(); });
    ['ccUtilKind', 'ccUtilAt'].forEach(function (id) { $(id).addEventListener('change', function () { buildUtil(); renderUtil(); C.redraw(); if (util) { C.flyTo(util.at[0], util.at[1], 13.5); audit('Utility failure assessed: ' + UT[util.kind][0] + ' at ' + util.name); } }); });
    $('ccUtilClear').addEventListener('click', function () { $('ccUtilKind').value = ''; util = null; renderUtil(); C.redraw(); });
    $('ccProtSel').addEventListener('change', function () { renderProt(); var s = protSites().filter(function (x) { return String(x.id) === $('ccProtSel').value; })[0]; if (s) { C.flyTo(s.lon, s.lat, 15.5); } });
    Array.prototype.forEach.call($('ccProtBtns').children, function (b, i) { b.addEventListener('click', function () { var s = protSites().filter(function (x) { return String(x.id) === $('ccProtSel').value; })[0]; if (!s) { return; } if (i) { posture[s.id] = i; } else { delete posture[s.id]; } audit('Site protection: ' + s.name + ' set to ' + POST[i] + ' (simulated)'); renderProt(); C.redraw(); }); });
    $('ccDevRun').addEventListener('click', function () { buildDev(); renderDev(); C.redraw(); if (dev) { C.flyTo(dev.at[0], dev.at[1], 13); audit('Development impact assessed at ' + dev.name + ': ' + dev.homes + ' homes, ' + dev.jobs + ' jobs'); } });
    $('ccDevClear').addEventListener('click', function () { dev = null; renderDev(); C.redraw(); });
    document.addEventListener('click', function (e) { if (K.tabOpen('anpr') && e.target.closest && e.target.closest('[data-tab="anpr"] button')) { setTimeout(renderTrack, 400); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && K.tabOpen('anpr')) { setTimeout(renderTrack, 400); } });
  }

  var RENDER = { ped: [renderCrowd, renderSchool], inc: [renderCommand], emg: [renderUtil], sig: [renderAdaptive], zones: [renderProt], anpr: [renderTrack], dev: [renderHealth], plan: [renderPlan], bus: [renderBusPerf], model: [renderDev], env: [renderEmis] };
  function renderOpen() { Object.keys(RENDER).forEach(function (tab) { if (K.tabOpen(tab)) { RENDER[tab].forEach(function (fn) { fn(); }); } }); }

  /* ---------------------------------------------------------------- map layers */
  C.addLayers(function () {
    var out = [];
    if (K.tabOpen('ped')) {
      out.push(new deck.ScatterplotLayer({ id: 'cc-crowd', data: venues(), pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (v) { return v.at; },
        getRadius: function (v) { return 8 + 16 * Math.min(1, v.load); }, getFillColor: function (v) { return LCOL[v.lvl].concat(150); }, getLineColor: function (v) { return LCOL[v.lvl]; }, getLineWidth: 2,
        updateTriggers: { getRadius: Math.floor(state.t / 300), getFillColor: Math.floor(state.t / 300) }, onClick: function (info) { if (info.object) { crowdSel = info.object.n; showVenue(info.object); renderCrowd(); } } }));
    }
    if (util && K.tabOpen('emg')) {
      out.push(new deck.ScatterplotLayer({ id: 'cc-util-area', data: [util], radiusUnits: 'meters', stroked: true, filled: true, lineWidthUnits: 'pixels', getPosition: function (u) { return u.at; }, getRadius: function (u) { return u.r; }, getFillColor: [240, 130, 50, 40], getLineColor: [240, 130, 50, 230], getLineWidth: 2 }));
      if (util.kind !== 'light' && util.kind !== 'water') { out.push(new deck.ScatterplotLayer({ id: 'cc-util-sig', data: util.sig, radiusUnits: 'pixels', getPosition: function (s) { return s; }, getRadius: 5, getFillColor: [40, 40, 40], stroked: true, lineWidthUnits: 'pixels', getLineColor: [240, 130, 50], getLineWidth: 2 })); }
    }
    if (dev && K.tabOpen('model')) { out.push(new deck.ScatterplotLayer({ id: 'cc-dev-area', data: [dev], radiusUnits: 'meters', stroked: true, filled: true, lineWidthUnits: 'pixels', getPosition: function (d) { return d.at; }, getRadius: function (d) { return d.r; }, getFillColor: [80, 140, 240, 35], getLineColor: [80, 140, 240, 230], getLineWidth: 2 })); }
    if (K.tabOpen('zones') && T.zones) {
      var marked = T.zones.all().filter(function (s) { return posture[s.id]; });
      if (marked.length) { out.push(new deck.ScatterplotLayer({ id: 'cc-prot', data: marked, radiusUnits: 'meters', stroked: true, filled: true, lineWidthUnits: 'pixels', getPosition: function (s) { return [s.lon, s.lat]; }, getRadius: 350,
        getFillColor: function (s) { return posture[s.id] === 2 ? [230, 70, 70, 50] : [230, 180, 60, 45]; }, getLineColor: function (s) { return posture[s.id] === 2 ? [230, 70, 70] : [230, 180, 60]; }, getLineWidth: 2.5, updateTriggers: { getFillColor: JSON.stringify(posture), getLineColor: JSON.stringify(posture) } })); }
    }
    return out;
  });

  /* ---------------------------------------------------------------- scorecard figures (Analytics) */
  function stats() {
    var v = venues(), sc = schoolNow().filter(function (r) { return r.veh > 1; }), rows = corridorRows(), ah = assetHealth(), total = ah.reduce(function (s, r) { return s + r.g.count; }, 0), p = planImpact(), bp = busPerf(), buses = bp.reduce(function (s, r) { return s + r.buses; }, 0);
    return { venues: v.length, venuesHighPct: v.length ? 100 * v.filter(function (x) { return x.load >= 0.8; }).length / v.length : null,
      schoolOkPct: sc.length ? 100 * sc.filter(function (r) { return r.over < 0.3; }).length / sc.length : null, schoolTime: schoolTime(state.t),
      adaptivePct: rows.length ? 100 * rows.filter(function (r) { return r.mode !== 'fixed'; }).length / rows.length : null,
      assetHealth: total ? ah.reduce(function (s, r) { return s + r.health * r.g.count; }, 0) / total : null, assetsAtRisk: ah.reduce(function (s, r) { return s + r.risk; }, 0),
      planConflicts: p.conflicts.length, busLateMin: buses ? bp.reduce(function (s, r) { return s + r.late * r.buses; }, 0) / buses : null };
  }

  C.onReady(function () { build(); renderOpen(); });
  C.onTab(function () { renderOpen(); C.redraw(); });
  C.onMinute(renderOpen);
  T.cityCases = { stats: stats, venues: venues, utility: function () { return util; }, development: function () { return dev; } };
})();
