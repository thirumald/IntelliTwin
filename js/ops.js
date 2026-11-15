/* IntelliTwin operations: alerts, forecast, what-if closure, exports, audit log and demo sign-in. */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, clock = C.clock, state = T.state;

  /* ---------- audit log (kept in this browser; optionally posted to a service) ---------- */
  var AUDIT_KEY = 'intellitwin.audit', user = { name: '', role: 'admin' };
  function readAudit() { try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch (e) { return []; } }
  function audit(action) {
    var entry = { time: new Date().toISOString(), user: user.name || CFG.auth.roles[user.role].label, role: user.role, action: action };
    try { var log = readAudit(); log.push(entry); localStorage.setItem(AUDIT_KEY, JSON.stringify(log.slice(-300))); } catch (e) { /* storage unavailable */ }
    if (CFG.api.auditUrl) { try { fetch(CFG.api.auditUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).catch(function () {}); } catch (e2) { /* ignore */ } }
    renderAudit();
  }
  function renderAudit() {
    var rows = readAudit().slice(-25).reverse();
    $('auditTable').innerHTML = rows.length ? rows.map(function (r) {
      return '<tr><td>' + esc(r.action) + '<span class="sub">' + esc(r.user) + ' · ' + esc(r.role) + '</span></td><td>' + esc(r.time.slice(0, 16).replace('T', ' ')) + '</td></tr>';
    }).join('') : '<tr><td class="muted">No entries yet.</td><td></td></tr>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  T.audit = audit;

  /* ---------- demo sign-in and roles ---------- */
  function can(action) { var r = CFG.auth.roles[user.role]; return !CFG.auth.enabled || (r && r.can.indexOf(action) >= 0); }
  function applyRole() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-need]'), function (el) {
      el.setAttribute('data-locked', can(el.getAttribute('data-need')) ? '0' : '1');
    });
    $('repLocked').setAttribute('data-locked', can('export') ? '1' : '0');
    var active = document.querySelector('#tabs [data-tab].on');
    if (active) { Array.prototype.forEach.call(document.querySelectorAll('.panel section[data-tab="' + active.getAttribute('data-tab') + '"]'), function (s) { s.hidden = s.getAttribute('data-locked') === '1'; }); }
    $('userBtn').hidden = !CFG.auth.enabled;
    $('userBtn').textContent = (user.name ? user.name + ' · ' : '') + CFG.auth.roles[user.role].label + ' ⏻';
    $('userBtn').title = 'Sign out';
  }
  function signIn(role, name) {
    user = { role: role, name: name };
    try { sessionStorage.setItem('intellitwin.user', JSON.stringify(user)); } catch (e) { /* ignore */ }
    $('login').hidden = true; applyRole(); audit('Signed in');
  }
  function initAuth() {
    if (!CFG.auth.enabled) { user.role = Object.keys(CFG.auth.roles)[0]; applyRole(); return; }
    Object.keys(CFG.auth.roles).forEach(function (id) {
      var b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = 'Continue as ' + CFG.auth.roles[id].label;
      b.addEventListener('click', function () { signIn(id, $('loginName').value.trim().slice(0, 40)); });
      $('loginRoles').appendChild(b);
    });
    $('userBtn').addEventListener('click', function () {
      audit('Signed out');
      try { sessionStorage.removeItem('intellitwin.user'); } catch (e) { /* ignore */ }
      $('login').hidden = false;
    });
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('intellitwin.user') || 'null'); } catch (e) { saved = null; }
    if (saved && CFG.auth.roles[saved.role]) { user = saved; applyRole(); } else { $('login').hidden = false; }
  }

  /* ---------- synthetic operational events ---------- */
  // Generated, not detected: each simulated minute may raise one event at a camera, chosen by a hash of
  // the date and minute, so the same date always replays the same events.
  var EVENT_TYPES = [
    { text: 'Stopped vehicle', sev: 2, min: 6, max: 18 }, { text: 'Stopped vehicle', sev: 2, min: 6, max: 18 },
    { text: 'Wrong-way vehicle', sev: 3, min: 3, max: 8 }, { text: 'Debris on road', sev: 2, min: 8, max: 25 },
    { text: 'Pedestrian on carriageway', sev: 3, min: 3, max: 10 }, { text: 'Queue building', sev: 1, min: 8, max: 20 },
    { text: 'Queue building', sev: 1, min: 8, max: 20 }, { text: 'Camera offline', sev: 1, min: 10, max: 30 },
    { text: 'Illegal stopping', sev: 1, min: 4, max: 12 }, { text: 'Slow vehicle in fast lane', sev: 1, min: 4, max: 10 }
  ];
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed, k) { var h = (Math.imul(seed ^ (k * 2654435761), 2246822519)) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function opsEvents() {
    var perHour = CFG.alerts.syntheticEventsPerHour || 0, cams = T.devices ? T.devices.cameras() : [];
    if (!perHour || !cams.length) { return []; }
    var out = [], nowMin = Math.floor(state.t / 60), dateSeed = hashStr(state.date);
    for (var m = Math.max(0, nowMin - 30); m <= nowMin; m++) {
      var seed = (dateSeed + m * 7919) >>> 0;
      if (rnd(seed, 1) >= perHour / 60) { continue; }
      var ty = EVENT_TYPES[Math.floor(rnd(seed, 2) * EVENT_TYPES.length)], cam = cams[Math.floor(rnd(seed, 3) * cams.length)];
      var dur = (ty.min + rnd(seed, 4) * (ty.max - ty.min)) * 60, start = m * 60;
      if (state.t < start + dur) { out.push({ type: ty, cam: cam, t: start, key: 'ops:' + state.date + ':' + m }); }
    }
    return out;
  }

  /* ---------- alerts ---------- */
  var current = [];
  function computeAlerts() {
    var a = CFG.alerts, out = [], k = C.kpiAt(state.scenario, state.t), fx = C.closure();
    if (fx) { out.push({ sev: 2, title: fx.name + ' closed (what-if)', sub: 'Estimated effect on roads within ' + (CFG.closure.radiusM / 1000) + ' km', go: function () { C.locate(fx.group); } }); }
    if (k.speed != null && k.speed < a.networkSpeedBelowKmh) {
      out.push({ key: 'network-speed', sev: 2, title: 'Network speed ' + Math.round(k.speed) + ' km/h', sub: 'Below the ' + a.networkSpeedBelowKmh + ' km/h threshold', go: function () { C.showTab('cong'); } });
    }
    var e = C.eventTotals(state.scenario, state.t);
    if (e && a.everyAccident) {
      e.active.forEach(function (x) {
        var sv = x.severity === 'Serious injury' ? 3 : x.severity === 'Minor injury' ? 2 : 1;
        out.push({ at: [x.lon, x.lat], key: 'acc:' + x.road + ':' + Math.round(x.t), sev: sv, title: (sv === 3 ? 'Serious accident: ' : 'Accident: ') + x.road,
          sub: x.severity + ' · reported ' + clock(x.t) + ' · illustrative', go: function () { C.flyTo(x.lon, x.lat); } });
      });
    } else if (e && a.seriousAccident) {
      e.active.filter(function (x) { return x.severity === 'Serious injury'; }).forEach(function (x) {
        out.push({ sev: 3, title: 'Serious accident: ' + x.road, sub: 'Reported ' + clock(x.t) + ' · illustrative', go: function () { C.flyTo(x.lon, x.lat); } });
      });
    }
    opsEvents().forEach(function (ev) {
      out.push({ at: [ev.cam.lon, ev.cam.lat], key: ev.key, sev: ev.type.sev, title: ev.type.text + ': ' + ev.cam.name, sub: ev.cam.id + ' · raised ' + clock(ev.t) + ' · synthetic',
        go: function () { if (ev.type.text === 'Camera offline') { C.flyTo(ev.cam.lon, ev.cam.lat, 15); } if (ev.type.text !== 'Camera offline' && T.devices) { T.devices.openCamera(ev.cam.id); } } });
    });
    // Environmental sensors over their thresholds (synthetic readings).
    if (CFG.environment && CFG.environment.alert && T.environment) {
      T.environment.alerts().slice(0, 4).forEach(function (x) {
        out.push({ at: [x.s.lon, x.s.lat], key: 'env:' + x.s.id, sev: x.sev, title: x.text + ': ' + x.s.name, sub: x.s.id + ' · synthetic sensor reading', go: function () { T.environment.open(x.s); } });
      });
    }
    // Critical sites in alert (defence, embassies, hospitals, schools …).
    if (CFG.zones && CFG.zones.alert && T.zones) {
      T.zones.alerts().slice(0, 6).forEach(function (s) {
        out.push({ at: [s.lon, s.lat], key: 'zone:' + s.id, sev: (CFG.zones.types[s.type] || {}).priority >= 3 ? 3 : 2, title: T.zones.label(s.type) + ' zone: ' + s.name, sub: s.reason,
          go: function () { T.zones.open(s); } });
      });
    }
    C.roadStats(C.binNow(), a.roadMinVehicles).filter(function (r) { return r.ratio < a.roadRatioBelow; }).slice(0, 8).forEach(function (r) {
      out.push({ sev: 1, title: 'Severe congestion: ' + r.name, sub: Math.round(r.speed) + ' km/h · ' + Math.round(r.ratio * 100) + '% of limit · ' + num(r.vehicles) + ' vehicles', go: function () { C.locate(r.g); } });
    });
    out.sort(function (x, y) { return y.sev - x.sev; });
    return out;
  }
  // Opening an alert: go to it and, when it has a location and matters, draw the quickest response route.
  function act(al) {
    if (al.go) { al.go(); }
    if (al.at && al.sev >= 2 && T.response) { T.response.routeTo(al.at[0], al.at[1], al.title, { fit: al.sev >= 3 }); }
  }
  // Push: every alert that was not active a minute ago is shown as a notification.
  var known = null, toastCount = 0;
  function toast(al) {
    var box = $('toasts');
    while (box.children.length >= CFG.alerts.pushMaxVisible) { box.removeChild(box.firstChild); }
    var t = document.createElement('button');
    t.type = 'button'; t.className = 'toast sev' + al.sev;
    t.innerHTML = '<strong></strong><span></span><em>' + clock(state.t) + ' · synthetic data</em>';
    t.querySelector('strong').textContent = al.title; t.querySelector('span').textContent = al.sub;
    t.addEventListener('click', function () { act(al); t.remove(); });
    // A critical alert gets the quickest response route straight away (without moving the map).
    if (al.sev >= 3 && al.at && T.response && T.response.auto()) { T.response.routeTo(al.at[0], al.at[1], al.title, { fit: false }); }
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, CFG.alerts.pushSeconds * 1000);
    if (document.hidden && window.Notification && Notification.permission === 'granted') {
      try { new Notification('IntelliTwin alert', { body: al.title + ' — ' + al.sub + ' (synthetic data)', tag: 'itw-' + (toastCount++ % 6) }); } catch (e) { /* notifications unavailable */ }
    }
  }
  function pushNew(list) {
    if (!CFG.alerts.push || !$('login').hidden) { return; }      // nothing is pushed behind the sign-in screen
    var now = {};
    list.forEach(function (al) { now[al.key || al.title] = 1; });
    var fresh = list.filter(function (al) { return !known || !known[al.key || al.title]; });
    // On the first pass announce only the most severe few, so the page does not open under a pile of notices.
    (known ? fresh : fresh.slice(0, 2)).slice(0, CFG.alerts.pushMaxVisible).forEach(toast);
    known = now;
  }
  function renderAlerts() {
    current = computeAlerts();
    pushNew(current);
    $('alertCount').textContent = current.length;
    $('alertBtn').classList.toggle('hot', current.some(function (x) { return x.sev >= 2; }));
    $('alertNote').textContent = current.length ? current.length + ' active' : '';
    var list = $('alertList'); list.innerHTML = '';
    current.slice(0, CFG.alerts.maxShown).forEach(function (al) {
      list.appendChild(C.listButton(al.sev >= 3 ? 'acc-active' : al.sev === 2 ? 'severe' : 'heavy', al.title, al.sub, '', function () { act(al); }));
    });
    if (!current.length) { list.innerHTML = '<li class="muted">No alerts at this time.</li>'; }
  }

  /* ---------- forecast ---------- */
  function renderForecast() {
    var now = C.kpiAt(state.scenario, state.t);
    $('forecastTiles').innerHTML = CFG.forecast.horizonsMin.map(function (m) {
      var k = C.kpiAt(state.scenario, state.t + m * 60), d = (k.speed || 0) - (now.speed || 0);
      return '<div class="kpi"><span class="k-label">+' + m + ' min · ' + clock(state.t + m * 60) + '</span><span class="k-value">' + Math.round(k.speed || 0) + '<small>km/h</small></span>' +
        '<span class="k-delta ' + (d < -1 ? 'bad' : d > 1 ? 'good' : '') + '">' + (Math.abs(d) < 1 ? 'steady' : (d > 0 ? '▲ +' : '▼ −') + Math.abs(d).toFixed(0) + ' km/h') + ' · ' + num(k.vehicles) + ' veh</span></div>';
    }).join('');
  }

  /* ---------- what-if closure ---------- */
  function closeRoad(name) {
    if (!can('whatif')) { return { error: 'Your role cannot run what-if closures.' }; }
    var before = C.kpiAt(state.scenario, state.t), fx = C.setClosure(name || null);
    $('closureRoad').value = fx ? name : '';
    if (!fx) { $('closureNote').textContent = ''; audit('Closure cleared'); return { cleared: true }; }
    var after = C.kpiAt(state.scenario, state.t), n = 0;
    for (var i = 0; i < fx.flag.length; i++) { if (fx.flag[i] === 2) { n++; } }
    $('closureNote').textContent = name + ' closed: about ' + num(n) + ' nearby links slow down. Network speed ' + Math.round(before.speed) + ' → ' + Math.round(after.speed) +
      ' km/h, delay ' + num(before.delay_h) + ' → ' + num(after.delay_h) + ' vehicle-hours per hour (estimate).';
    C.locate(fx.group); audit('What-if closure: ' + name);
    return { name: name, before: before, after: after, links: n };
  }

  /* ---------- exports ---------- */
  function download(name, rows) {
    var csv = rows.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'intellitwin_' + name + '_' + state.date + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  var NOTE = 'Synthetic data from IntelliTwin; not measured traffic.';
  function exportData(kind) {
    if (kind !== 'audit' && !can('export')) { return; }
    var sm = C.scenarioMeta(state.scenario), e = C.eventTotals(state.scenario, C.DAY - 1);
    if (kind === 'kpi') {
      download('kpis', [[NOTE], ['date', 'time', 'demand_case', 'avg_speed_kmh', 'vehicles_moving', 'extra_travel_time_pct', 'delay_veh_h_per_h']].concat(
        C.daySeriesKpi(state.scenario).map(function (k, s) { return [state.date, clock(s * C.SLOT), sm.label, k.speed, k.vehicles, k.extra, k.delay_h]; })));
    } else if (kind === 'roads') {
      download('roads_' + clock(state.t).replace(':', ''), [[NOTE], ['date', 'time', 'road', 'speed_kmh', 'share_of_limit_pct', 'vehicles']].concat(
        C.roadStats(C.binNow(), 1).map(function (r) { return [state.date, clock(state.t), r.name, r.speed.toFixed(1), Math.round(r.ratio * 100), Math.round(r.vehicles)]; })));
    } else if (kind === 'accidents') {
      download('accidents', [['Illustrative accidents generated by IntelliTwin; not real records.'], ['date', 'time', 'road', 'severity', 'duration_min', 'lon', 'lat']].concat(
        e.ev.accidents.map(function (a) { return [state.date, clock(a.t), a.road, a.severity, Math.round(a.dur / 60), a.lon.toFixed(5), a.lat.toFixed(5)]; })));
    } else if (kind === 'fines') {
      download('fines', [['Illustrative violations generated by IntelliTwin; not real records. Fine values are placeholders.'], ['date', 'site_road', 'lon', 'lat'].concat(window.TwinEvents.TYPES.map(function (t) { return t.id; })).concat(['total'])].concat(
        e.ev.sites.map(function (s) { return [state.date, s.road, s.lon.toFixed(5), s.lat.toFixed(5)].concat(s.byType).concat([s.byType.reduce(function (x, y) { return x + y; }, 0)]); })));
    } else if (kind === 'audit') {
      if (!can('audit')) { return; }
      download('audit', [['time_utc', 'user', 'role', 'action']].concat(readAudit().map(function (r) { return [r.time, r.user, r.role, r.action]; })));
    } else if (kind === 'print') { printReport(); }
    if (kind !== 'audit') { audit('Export: ' + kind); }
  }
  function printReport() {
    var k = C.kpiAt(state.scenario, state.t), e = C.eventTotals(state.scenario, state.t), roads = C.roadStats(C.binNow(), 15).slice(0, 10), day = C.day();
    $('report').innerHTML = '<h1>IntelliTwin traffic summary</h1>' +
      '<p>' + esc(C.prettyDate(state.date)) + ' · ' + clock(state.t) + ' · ' + esc(C.scenarioMeta(state.scenario).label) + ' · ' + esc(day.typeLabel) + '</p>' +
      '<p class="warn">Synthetic data. Traffic is simulated from assumptions and placed on an assumed daily curve; accidents and fines are illustrative. Not for planning, operational or safety decisions.</p>' +
      '<h2>Network</h2><table><tr><th>Average speed</th><th>Vehicles moving</th><th>Extra travel time</th><th>Delay per hour</th></tr><tr><td>' + Math.round(k.speed || 0) + ' km/h</td><td>' + num(k.vehicles) +
      '</td><td>+' + Math.round(k.extra) + '%</td><td>' + num(k.delay_h) + ' vehicle-hours</td></tr></table>' +
      '<h2>Slowest roads</h2><table><tr><th>Road</th><th>Speed</th><th>Share of limit</th><th>Vehicles</th></tr>' + roads.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>' + Math.round(r.speed) + ' km/h</td><td>' + Math.round(r.ratio * 100) + '%</td><td>' + num(r.vehicles) + '</td></tr>';
      }).join('') + '</table>' +
      '<h2>Alerts</h2><ul>' + (current.length ? current.map(function (a) { return '<li>' + esc(a.title) + ' — ' + esc(a.sub) + '</li>'; }).join('') : '<li>None</li>') + '</ul>' +
      '<h2>Accidents and fines today (illustrative)</h2><p>' + num(e.seen.length) + ' accidents, ' + num(e.active.length) + ' active, ' + num(e.injury) + ' with injury. ' +
      num(e.fines) + ' fines, AED ' + num(e.value) + ' at placeholder values.</p>';
    window.print();
  }

  function renderConfig() {
    $('cfgFacts').innerHTML =
      C.fact('Base map style', '', esc(String(CFG.map.styleUrl || 'raster only').replace(/^https?:\/\//, '').slice(0, 34))) +
      C.fact('Traffic feed', '', esc(CFG.feeds.traffic)) + C.fact('Accident feed', '', CFG.feeds.accidentsUrl ? 'connected' : 'illustrative') +
      C.fact('Configured cameras', 'with a stream', CFG.devices.cameras.length + ' · ' + CFG.devices.cameras.filter(function (c) { return c.stream; }).length) +
      C.fact('Assistant service', '', CFG.api.assistantUrl ? 'connected' : 'built-in rules') + C.fact('Audit service', '', CFG.api.auditUrl ? 'connected' : 'this browser only') +
      C.fact('Time zone', '', esc(CFG.time.timeZone)) + C.fact('Alert: network speed below', '', CFG.alerts.networkSpeedBelowKmh + ' km/h') +
      C.fact('Alert: road below', 'share of limit, minimum vehicles', Math.round(CFG.alerts.roadRatioBelow * 100) + '% · ' + CFG.alerts.roadMinVehicles);
  }

  /* ---------- start ---------- */
  T.ops = { events: opsEvents, closeRoad: closeRoad, alerts: function () { return current; }, can: can, user: function () { return user; } };
  C.onReady(function () {
    initAuth();
    C.majorRoads().forEach(function (g) { var o = document.createElement('option'); o.value = o.textContent = g.name; $('closureRoad').appendChild(o); });
    $('closureRoad').addEventListener('change', function () { closeRoad($('closureRoad').value); });
    $('alertBtn').addEventListener('click', function () { C.showTab('dash'); });
    var nb = $('notifyBtn');
    if (!window.Notification || !CFG.alerts.push) { nb.hidden = true; }
    else {
      var label = function () { nb.textContent = Notification.permission === 'granted' ? 'Browser notifications on' : Notification.permission === 'denied' ? 'Notifications blocked in browser' : 'Enable browser notifications'; nb.disabled = Notification.permission !== 'default'; };
      label();
      nb.addEventListener('click', function () { Notification.requestPermission().then(label, label); });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-export]'), function (b) { b.addEventListener('click', function () { exportData(b.getAttribute('data-export')); }); });
    $('auditClear').addEventListener('click', function () { try { localStorage.removeItem(AUDIT_KEY); } catch (e) { /* ignore */ } renderAudit(); });
    $('repLabel').textContent = 'Synthetic data';
    renderConfig(); renderAudit(); renderAlerts(); renderForecast();
    C.onMinute(function () { renderAlerts(); renderForecast(); });
  });
})();
