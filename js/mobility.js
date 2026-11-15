/* IntelliTwin mobility and safety modules: parking, vehicle search, freight, and pedestrian and school safety.
 *
 * All vehicles, plates, sightings, occupancies and counts here are SYNTHETIC examples generated in the
 * browser. Plates are demo values, not real registrations. See docs/operations-modules.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, clock = C.clock, state = T.state, K = T.kit;
  var rnd = K.rnd, hashStr = K.hashStr, dist = K.dist, tabOpen = K.tabOpen, esc = K.esc;
  function seed() { return hashStr(state.date); }
  function bell(h, mid, width) { return Math.exp(-Math.pow((h - mid) / width, 2)); }

  /* ============================================================ 4. Parking */
  var PK = CFG.parking || {};
  function parkNow(p, i, t) {
    var h = t / 3600, shape = p.kind === 'business' ? 0.25 + 0.7 * bell(h, 11.5, 4) : p.kind === 'leisure' ? 0.2 + 0.75 * bell(h, 19.5, 3.5) : p.kind === 'residential' ? 0.9 - 0.45 * bell(h, 12, 4.5) : 0.3 + 0.55 * bell(h, 14, 6);
    var occ = Math.max(0.03, Math.min(1, shape * (0.85 + 0.3 * rnd(seed(), i * 3 + Math.floor(t / 1800)))));
    return { occ: occ, used: Math.round(p.spaces * occ), free: Math.max(0, p.spaces - Math.round(p.spaces * occ)), status: occ >= 0.97 ? 'full' : occ >= 0.85 ? 'nearly full' : 'spaces' };
  }
  function renderPark() {
    if (!tabOpen('park')) { return; }
    var t = state.t, list = (PK.sites || []).map(function (p, i) { return { p: p, now: parkNow(p, i, t) }; }), spaces = 0, used = 0;
    list.forEach(function (x) { spaces += x.p.spaces; used += x.now.used; });
    $('pkSpaces').textContent = num(spaces); $('pkUsed').innerHTML = spaces ? Math.round(100 * used / spaces) + '<small>%</small>' : '–';
    $('pkFull').textContent = list.filter(function (x) { return x.now.status !== 'spaces'; }).length;
    $('pkFines').textContent = num(Math.round((PK.violationsPerDay || 900) * Math.min(1, t / 86400) * (0.9 + 0.2 * rnd(seed(), 77))));
    var ol = $('pkList'); ol.innerHTML = '';
    list.sort(function (a, b) { return b.now.occ - a.now.occ; }).forEach(function (x) {
      ol.appendChild(C.listButton(x.now.status === 'full' ? 'severe' : x.now.status === 'nearly full' ? 'heavy' : 'free', x.p.name, (x.p.street ? 'On-street zone' : 'Car park') + ' · ' + num(x.now.free) + ' free of ' + num(x.p.spaces) + ' · ' + x.now.status, Math.round(100 * x.now.occ) + '<small>%</small>', function () {
        if (T.getMap()) { T.getMap().easeTo({ center: x.p.at, zoom: 15.5, duration: 700 }); }
        var alt = list.filter(function (y) { return y !== x && y.now.status === 'spaces'; }).sort(function (a, b) { return dist(a.p.at, x.p.at) - dist(b.p.at, x.p.at); })[0];
        C.showPopup(x.p.at, x.p.name, [['Spaces', num(x.p.spaces)], ['Free now', num(x.now.free)], ['Occupancy', Math.round(100 * x.now.occ) + '%'], ['Guidance', x.now.status === 'spaces' ? 'Spaces available' : alt ? 'Direct drivers to ' + alt.p.name + ' (' + (dist(alt.p.at, x.p.at) / 1000).toFixed(1) + ' km)' : 'No alternative with space']], 'Synthetic occupancy, not a real car-park feed');
      }));
    });
  }

  /* ============================================================ 6. Vehicle search (synthetic plate reads) */
  var VS = CFG.vehicleSearch || {}, journey = null;
  function sightings(plate) {
    var cams = T.devices ? T.devices.cameras() : []; if (!cams.length) { return []; }
    var s = hashStr(plate.toUpperCase() + state.date), n = 3 + Math.floor(rnd(s, 1) * 5), start = (5 + rnd(s, 2) * 5) * 3600, t = start, out = [], last = -1;
    for (var k = 0; k < n; k++) {
      var ci = Math.floor(rnd(s, 10 + k) * cams.length); if (ci === last) { ci = (ci + 1) % cams.length; } last = ci;
      if (k) { t += (8 + rnd(s, 30 + k) * 70) * 60; }
      if (t > state.t) { break; }
      out.push({ cam: cams[ci], t: t, speed: Math.round(35 + rnd(s, 50 + k) * 75) });
    }
    return out;
  }
  function search(plate) {
    plate = String(plate || '').trim().toUpperCase(); if (!plate) { journey = null; renderSearch(); C.redraw(); return; }
    var list = sightings(plate), paths = [];
    for (var k = 1; k < list.length && T.response; k++) { var leg = T.response.pathBetween([list[k - 1].cam.lon, list[k - 1].cam.lat], [list[k].cam.lon, list[k].cam.lat]); if (leg) { paths.push(leg.path); list[k].km = leg.metres / 1000; } }
    var w = (VS.watchList || []).filter(function (x) { return x.plate.toUpperCase() === plate; })[0];
    journey = { plate: plate, list: list, paths: paths, watch: w };
    if (T.audit) { T.audit('Vehicle search: ' + plate); }
    renderSearch(); C.redraw();
    if (list.length && T.getMap()) { var last = list[list.length - 1]; T.getMap().easeTo({ center: [last.cam.lon, last.cam.lat], zoom: 13, duration: 800 }); }
  }
  function renderSearch() {
    if (!tabOpen('anpr')) { return; }
    var wl = $('vsWatch'); wl.innerHTML = '';
    (VS.watchList || []).forEach(function (w) {
      var s = sightings(w.plate), last = s[s.length - 1];
      wl.appendChild(C.listButton(last ? 'severe' : 'acc-past', w.plate, esc(w.reason) + ' · ' + (last ? 'last seen ' + clock(last.t) + ' at ' + last.cam.id : 'not seen today'), s.length + '<small>reads</small>', function () { $('vsPlate').value = w.plate; search(w.plate); }));
    });
    $('vsResult').hidden = !journey;
    if (!journey) { return; }
    $('vsTitle').textContent = journey.plate + (journey.watch ? ' · on the watch list' : '');
    var ol = $('vsList'); ol.innerHTML = '';
    journey.list.forEach(function (s, k) {
      var mins = k ? Math.round((s.t - journey.list[k - 1].t) / 60) : 0;
      ol.appendChild(C.listButton(k === journey.list.length - 1 ? 'severe' : 'site', clock(s.t) + ' · ' + s.cam.id + ' · ' + s.cam.name, (k ? mins + ' min after the previous read' + (s.km ? ' · ' + s.km.toFixed(1) + ' km by road' : '') : 'first read today') + ' · ' + s.speed + ' km/h', k === journey.list.length - 1 ? 'Last' : String(k + 1), function () { if (T.getMap()) { T.getMap().easeTo({ center: [s.cam.lon, s.cam.lat], zoom: 15.5, duration: 700 }); } }));
    });
    if (!journey.list.length) { ol.innerHTML = '<li class="muted">No reads for this plate so far today.</li>'; }
    $('vsFacts').innerHTML = C.fact('Reads today', 'at synthetic cameras', journey.list.length) + (journey.watch ? C.fact('Watch list', '', esc(journey.watch.reason)) : '') +
      (journey.list.length > 1 ? C.fact('Time between first and last read', '', Math.round((journey.list[journey.list.length - 1].t - journey.list[0].t) / 60) + ' min') : '');
  }

  /* ============================================================ 8. Freight and restricted vehicles */
  var FR = CFG.freight || {}, hazPath = null;
  function banNow(t) { var h = t / 3600; return (FR.banHours || []).filter(function (b) { return h >= b[0] && h < b[1]; })[0] || null; }
  function hazmat(t) {
    if (!hazPath && T.response && FR.hazmatFrom && FR.hazmatTo) { var leg = T.response.pathBetween(FR.hazmatFrom, FR.hazmatTo); if (leg) { var cum = [0]; for (var i = 1; i < leg.path.length; i++) { cum.push(cum[i - 1] + dist(leg.path[i], leg.path[i - 1])); } hazPath = { path: leg.path, cum: cum, len: cum[cum.length - 1] }; } }
    if (!hazPath) { return []; }
    var out = [];
    for (var n = 0; n < (FR.hazmatVehicles || 5); n++) {
      var d = (rnd(hashStr('haz'), n) * 2 * hazPath.len + t * 45 / 3.6) % (2 * hazPath.len); if (d > hazPath.len) { d = 2 * hazPath.len - d; }
      var j = 1; while (j < hazPath.cum.length - 1 && hazPath.cum[j] < d) { j++; }
      var a = hazPath.path[j - 1], b = hazPath.path[j], f = (d - hazPath.cum[j - 1]) / ((hazPath.cum[j] - hazPath.cum[j - 1]) || 1);
      out.push({ id: 'HZ-' + (101 + n), p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], load: ['Fuel', 'Industrial gas', 'Chemicals', 'Fuel', 'Bitumen'][n % 5] });
    }
    return out;
  }
  function renderFreight() {
    if (!tabOpen('frt')) { return; }
    var t = state.t, k = C.kpiAt(state.scenario, t) || {}, mix = window.TwinCars.MIX, mt = window.TwinCars.mixTotal, lorry = (mix.filter(function (m) { return m.id === 'lorry'; })[0] || { share: 0.05 }).share / mt;
    var lorries = Math.round((k.vehicles || 0) * lorry), ban = banNow(t), z = FR.zone || { at: [54.37, 24.48], radiusM: 5000 };
    var inside = ban ? Math.round(lorries * 0.3 * (FR.nonComplianceShare || 0.06) * (0.6 + 0.8 * rnd(seed(), Math.floor(t / 900)))) : 0;
    $('frLorries').textContent = num(lorries); $('frBan').textContent = ban ? 'In force' : 'Not in force';
    $('frViol').textContent = ban ? num(inside) : '0'; $('frHaz').textContent = hazmat(t).length;
    $('frNote').textContent = ban ? 'Lorry ban until ' + C.pad(Math.floor(ban[1])) + ':' + C.pad(Math.round(ban[1] % 1 * 60)) : 'Next ban: ' + ((FR.banHours || []).map(function (b) { return C.pad(Math.floor(b[0])) + ':' + C.pad(Math.round(b[0] % 1 * 60)); }).join(' and ') || 'none configured');
    var ol = $('frList'); ol.innerHTML = '';
    (FR.weighStations || []).forEach(function (w, i) {
      var h = t / 3600, flow = Math.round(w.perHour * (0.3 + 0.9 * bell(h, 13, 6)) * (ban ? 0.5 : 1)), over = Math.round(100 * (0.03 + 0.06 * rnd(seed(), i + Math.floor(t / 3600))));
      ol.appendChild(C.listButton(over >= 7 ? 'heavy' : 'free', w.name, flow + ' lorries an hour · ' + over + '% overweight', over + '<small>%</small>', function () {
        if (T.getMap()) { T.getMap().easeTo({ center: w.at, zoom: 14.5, duration: 700 }); }
        C.showPopup(w.at, w.name, [['Lorries an hour', flow], ['Overweight', over + '%'], ['Action', over >= 7 ? 'Targeted checks advised' : 'Routine checks']], 'Synthetic weigh station');
      }));
    });
    $('frFacts').innerHTML = C.fact('Restricted zone', 'centre and radius from config.js', (z.radiusM / 1000).toFixed(1) + ' km radius') + C.fact('Ban hours', 'lorries over ' + (FR.weightLimitT || 2.5) + ' t', (FR.banHours || []).map(function (b) { return C.pad(Math.floor(b[0])) + ':' + C.pad(Math.round(b[0] % 1 * 60)) + '–' + C.pad(Math.floor(b[1])) + ':' + C.pad(Math.round(b[1] % 1 * 60)); }).join(', ') || 'none');
  }

  /* ============================================================ 7. Pedestrian and school safety */
  var PD = CFG.pedestrians || {}, crossings = null;
  function schoolWindow(t) { var h = t / 3600; return (PD.schoolWindows || []).filter(function (w) { return h >= w[0] && h < w[1]; })[0] || null; }
  function schoolSpeed(s) { var e = C.edges(), sp = 0, o = 0; (s.edges || []).forEach(function (i) { var oc = C.occ(i); if (oc) { sp += oc * e[i].s * C.ratio(i); o += oc; } }); return o ? sp / o : null; }
  function loadCrossings() {
    if (crossings) { return crossings; }
    var cams = T.devices ? T.devices.cameras() : [];
    crossings = cams.filter(function (c, i) { return i % 2 === 0; }).slice(0, PD.crossings || 16).map(function (c, i) { return { id: 'PX-' + ('0' + (i + 1)).slice(-2), name: c.name, at: [c.lon, c.lat], i: i }; });
    return crossings;
  }
  function crossingNow(c, t) {
    var h = t / 3600, flow = Math.round((PD.peakPerHour || 420) * (0.08 + 0.5 * bell(h, 8, 1.8) + 0.9 * bell(h, 19, 3)) * (0.6 + 0.8 * rnd(hashStr('px'), c.i)));
    return { flow: flow, wait: Math.round(25 + 50 * rnd(seed(), c.i * 7 + Math.floor(t / 1800))), jay: Math.round(flow * (0.02 + 0.05 * rnd(seed(), c.i * 11 + Math.floor(t / 3600)))) };
  }
  function renderPed() {
    if (!tabOpen('ped')) { return; }
    var t = state.t, schools = (T.zones ? T.zones.all() : []).filter(function (s) { return s.type === 'school'; }), w = schoolWindow(t), limit = PD.schoolLimitKmh || 30;
    var fast = schools.map(function (s) { return { s: s, v: schoolSpeed(s) }; }).filter(function (x) { return x.v !== null && x.v > limit; }).sort(function (a, b) { return b.v - a.v; });
    $('pdSchools').textContent = num(schools.length); $('pdWindow').textContent = w ? w[2] : 'Outside school times';
    $('pdFast').textContent = w ? fast.length : '–'; 
    var cr = loadCrossings().map(function (c) { return { c: c, now: crossingNow(c, t) }; }), total = cr.reduce(function (s, x) { return s + x.now.flow; }, 0);
    $('pdFlow').textContent = num(total);
    $('pdNote').textContent = 'School speed limit ' + limit + ' km/h';
    var ol = $('pdSchoolList'); ol.innerHTML = '';
    (w ? fast.slice(0, 8) : []).forEach(function (x) {
      ol.appendChild(C.listButton(x.v > limit + 20 ? 'severe' : 'heavy', x.s.name, 'Traffic nearby at ' + Math.round(x.v) + ' km/h · ' + w[2].toLowerCase(), Math.round(x.v) + '<small>km/h</small>', function () { if (T.zones && T.zones.open) { T.zones.open(x.s); } else if (T.getMap()) { T.getMap().easeTo({ center: [x.s.lon, x.s.lat], zoom: 15.5, duration: 700 }); } }));
    });
    if (!ol.children.length) { ol.innerHTML = '<li class="muted">' + (w ? 'No school has nearby traffic above the school limit.' : 'School-zone checks run at arrival and dismissal times.') + '</li>'; }
    var cl = $('pdCrossList'); cl.innerHTML = '';
    cr.sort(function (a, b) { return b.now.jay - a.now.jay; }).slice(0, 8).forEach(function (x) {
      cl.appendChild(C.listButton(x.now.wait > 60 ? 'heavy' : 'free', x.c.id + ' · ' + x.c.name, x.now.flow + ' people an hour · wait ' + x.now.wait + ' s · ' + x.now.jay + ' crossing away from the signal', x.now.jay + '<small>/h</small>', function () {
        if (T.getMap()) { T.getMap().easeTo({ center: x.c.at, zoom: 16.5, duration: 700 }); }
        C.showPopup(x.c.at, 'Crossing ' + x.c.id, [['Road', x.c.name], ['People an hour', x.now.flow], ['Average wait', x.now.wait + ' s'], ['Crossing away from the signal', x.now.jay + ' an hour'], ['Suggested action', x.now.wait > 60 ? 'Shorter pedestrian wait in the signal plan' : 'No change']], 'Synthetic crossing counts');
      }));
    });
    var crowd = $('pdCrowd'); crowd.innerHTML = '';
    ((CFG.taxis || {}).ranks || []).slice(0, 8).forEach(function (r, i) {
      var h = t / 3600, lv = (0.15 + 0.8 * bell(h, 19.5, 3.5) + 0.3 * bell(h, 12.5, 2)) * (0.6 + 0.8 * rnd(seed(), i + 400)), label = lv > 0.75 ? 'High' : lv > 0.4 ? 'Medium' : 'Low';
      crowd.innerHTML += C.fact(esc(r.name), 'people on foot nearby', label);
    });
  }

  /* ============================================================ map layers */
  C.addLayers(function (ctx) {
    var out = [], t = state.t;
    if (tabOpen('park')) {
      out.push(new deck.ScatterplotLayer({ id: 'parking', data: (PK.sites || []).map(function (p, i) { return { p: p, now: parkNow(p, i, t) }; }), pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (x) { return x.p.at; }, getRadius: function (x) { return 7 + Math.min(8, x.p.spaces / 400); }, getFillColor: function (x) { return x.now.status === 'full' ? [208, 59, 59] : x.now.status === 'nearly full' ? [250, 178, 25] : [12, 163, 12]; }, getLineColor: [255, 255, 255], getLineWidth: 2,
        updateTriggers: { getFillColor: Math.floor(t / 1800) }, onClick: function (info) { if (info.object) { var x = info.object; C.showPopup(x.p.at, x.p.name, [['Free now', num(x.now.free) + ' of ' + num(x.p.spaces)], ['Status', x.now.status]], 'Synthetic occupancy'); } } }));
      out.push(new deck.TextLayer({ id: 'parking-p', data: PK.sites || [], getPosition: function (p) { return p.at; }, getText: function () { return 'P'; }, getSize: 12, getColor: [255, 255, 255], fontWeight: 700, fontFamily: 'system-ui, sans-serif' }));
    }
    if (journey && tabOpen('anpr')) {
      out.push(new deck.PathLayer({ id: 'vs-path', data: journey.paths, getPath: function (p) { return p; }, getColor: [213, 81, 129], getWidth: 14, widthUnits: 'meters', widthMinPixels: 3, capRounded: true, jointRounded: true }));
      out.push(new deck.ScatterplotLayer({ id: 'vs-reads', data: journey.list, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (s) { return [s.cam.lon, s.cam.lat]; }, getRadius: 10, getFillColor: [213, 81, 129], getLineColor: [255, 255, 255], getLineWidth: 2.5 }));
      out.push(new deck.TextLayer({ id: 'vs-order', data: journey.list.map(function (s, k) { return { s: s, k: k }; }), getPosition: function (o) { return [o.s.cam.lon, o.s.cam.lat]; }, getText: function (o) { return String(o.k + 1); }, getSize: 12, getColor: [255, 255, 255], fontWeight: 700, fontFamily: 'system-ui, sans-serif' }));
    }
    if (tabOpen('frt')) {
      var z = FR.zone, ban = banNow(t);
      if (z) { out.push(new deck.ScatterplotLayer({ id: 'freight-zone', data: [z], radiusUnits: 'meters', filled: true, stroked: true, lineWidthUnits: 'pixels', getPosition: function (q) { return q.at; }, getRadius: function (q) { return q.radiusM; }, getFillColor: ban ? [208, 59, 59, 34] : [143, 160, 189, 18], getLineColor: ban ? [208, 59, 59, 230] : [143, 160, 189, 180], getLineWidth: 2, updateTriggers: { getFillColor: !!ban, getLineColor: !!ban } })); }
      out.push(new deck.ScatterplotLayer({ id: 'weigh', data: FR.weighStations || [], pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (w) { return w.at; }, getRadius: 8, getFillColor: [201, 133, 0], getLineColor: [255, 255, 255], getLineWidth: 2 }));
      out.push(new deck.ScatterplotLayer({ id: 'hazmat', data: hazmat(t), pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (v) { return v.p; }, getRadius: 7, getFillColor: [217, 89, 38], getLineColor: [20, 20, 20], getLineWidth: 2,
        onClick: function (info) { if (info.object) { C.showPopup(info.object.p, 'Hazardous load ' + info.object.id, [['Load', info.object.load], ['Route', 'Designated corridor'], ['Status', 'On route']], 'Synthetic vehicle'); } } }));
    }
    if (tabOpen('ped')) {
      out.push(new deck.ScatterplotLayer({ id: 'crossings', data: loadCrossings(), pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (c) { return c.at; }, getRadius: 7, getFillColor: [25, 158, 112], getLineColor: [255, 255, 255], getLineWidth: 2,
        onClick: function (info) { if (info.object) { var n = crossingNow(info.object, state.t); C.showPopup(info.object.at, 'Crossing ' + info.object.id, [['People an hour', n.flow], ['Average wait', n.wait + ' s']], 'Synthetic crossing counts'); } } }));
    }
    return out;
  });

  C.onReady(function () {
    $('vsForm').addEventListener('submit', function (e) { e.preventDefault(); search($('vsPlate').value); });
    $('vsClear').addEventListener('click', function () { $('vsPlate').value = ''; search(''); });
    function all() { [renderPark, renderSearch, renderFreight, renderPed].forEach(function (fn) { try { fn(); } catch (err) { if (window.console) { console.warn('IntelliTwin module error:', err && err.message); } } }); }
    C.onTab(function () { all(); C.redraw(); });
    C.onMinute(all);
  });

  T.parking = { now: function () { return (PK.sites || []).map(function (p, i) { return { name: p.name, now: parkNow(p, i, state.t) }; }); } };
  T.vehicleSearch = { search: search, sightings: sightings, journey: function () { return journey; } };
  T.freight = { banNow: function () { return banNow(state.t); }, hazmat: function () { return hazmat(state.t); } };
  T.pedestrians = { crossings: loadCrossings };
})();
