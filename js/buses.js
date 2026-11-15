/* IntelliTwin synthetic bus network.
 *
 * No usable public bus timetable could be obtained for Abu Dhabi, so this module builds an example
 * one. Routes run between major sites along the quickest road path, with stops every few hundred
 * metres, a fixed-headway timetable and buses that move to it. Route numbers, stops, timetables and
 * delays are SYNTHETIC; they are not Abu Dhabi's real bus services. See docs/buses.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, clock = C.clock, state = T.state;
  var B = CFG.buses, routes = [], show = true, selected = null, kx = 111320 * Math.cos(24.4 * Math.PI / 180), ky = 110570;
  var BLUE = [57, 135, 229], HI = [255, 255, 255];

  function measure(path) {
    var cum = [0];
    for (var i = 1; i < path.length; i++) { cum.push(cum[i - 1] + Math.hypot((path[i][0] - path[i - 1][0]) * kx, (path[i][1] - path[i - 1][1]) * ky)); }
    return cum;
  }
  function pointAt(r, d) {
    var cum = r.cum, j = 1; d = Math.max(0, Math.min(r.len, d));
    while (j < cum.length - 1 && cum[j] < d) { j++; }
    var a = r.path[j - 1], b = r.path[j], seg = (cum[j] - cum[j - 1]) || 1, t = (d - cum[j - 1]) / seg;
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0], yaw: Math.atan2((b[1] - a[1]) * ky, (b[0] - a[0]) * kx) * 180 / Math.PI };
  }

  function setup() {
    if (!T.response) { return; }
    routes = [];
    (B.routes || []).forEach(function (def) {
      var out = T.response.pathBetween(def.from, def.to), back = T.response.pathBetween(def.to, def.from);
      if (!out || out.metres < 1500) { return; }
      [out, back].forEach(function (leg, dir) {
        if (!leg) { return; }
        var cum = measure(leg.path), len = cum[cum.length - 1], stops = [], edges = C.edges(), names = C.names(), ends = def.name.split(' – ');
        if (dir === 1) { ends.reverse(); }
        // Each stop takes the name of the road it stands on, with a number where a road has several stops.
        var linkEnd = [], run = 0, seen = {}, li = 0;
        leg.links.forEach(function (i) { run += edges[i].m; linkEnd.push(run); });
        for (var d = 0; d <= len; d += B.stopSpacingM) {
          while (li < linkEnd.length - 1 && linkEnd[li] * len / (run || 1) < d) { li++; }
          var road = names[edges[leg.links[li]].n] || 'Unnamed road'; seen[road] = (seen[road] || 0) + 1;
          stops.push({ d: d, code: def.id + (dir ? 'B' : 'A') + C.pad(stops.length + 1), road: road, n: seen[road] });
        }
        stops.forEach(function (st, k) {
          st.name = k === 0 ? ends[0] + ' terminus' : k === stops.length - 1 && len - st.d < B.stopSpacingM ? ends[1] + ' terminus' : st.road + (seen[st.road] > 1 ? ' ' + st.n : '');
        });
        routes.push({ id: def.id, name: dir === 0 ? def.name : def.name.split(' – ').reverse().join(' – '), dir: dir, key: def.id + ':' + dir, headway: def.headwayMin,
          path: leg.path, links: leg.links, cum: cum, len: len, stops: stops, minutes: len / 1000 / B.scheduleKmh * 60 });
      });
    });
  }

  // Headway in minutes at time t (seconds of the day); 0 = no service.
  function headwayAt(r, t) {
    var h = t / 3600;
    if (h < B.firstHour || h >= B.lastHour) { return 0; }
    var peak = (h >= 6 && h < 9.5) || (h >= 16 && h < 20);
    return r.headway * (peak ? 1 : B.offPeakFactor);
  }
  // Delay of a route right now, from the synthetic traffic along it: part of the extra travel time reaches the buses.
  function delayMin(r) {
    var occ = 0, free = 0;
    r.links.forEach(function (i) { var o = C.occ(i); if (o) { occ += o; free += o * C.ratio(i); } });
    var ratio = occ ? free / occ : 1;
    return Math.max(0, Math.min(25, (1 / Math.max(ratio, 0.2) - 1) * r.minutes * B.delayShare));
  }
  // Buses on a route at time t: one for every departure still on its way.
  function busesOn(r, t) {
    var out = [], dur = r.minutes * 60, first = B.firstHour * 3600, late = delayMin(r) * 60;
    for (var dep = first, guard = 0; dep <= t && guard < 400; guard++) {
      var hw = headwayAt(r, dep) * 60; if (!hw) { break; }
      var prog = (t - dep) / (dur + late);
      // The bus number is the route, the direction and the running number of the departure that day.
      if (prog >= 0 && prog < 1) { var pos = pointAt(r, prog * r.len); out.push({ p: pos.p, yaw: pos.yaw, route: r, dep: dep, prog: prog, no: r.id + (r.dir ? 'B' : 'A') + '-' + C.pad(guard + 1), late: late / 60 }); }
      dep += hw;
    }
    return out;
  }
  function nextDepartures(r, t, count) {
    var out = [], first = B.firstHour * 3600;
    for (var dep = first, guard = 0; out.length < count && guard < 400; guard++) {
      var hw = headwayAt(r, dep) * 60; if (!hw) { break; }
      if (dep >= t) { out.push(dep); }
      dep += hw;
    }
    return out;
  }

  // Next arrival (seconds of the day) of any bus at a stop of route r, or null when none is due today.
  function nextArrival(r, st, t) {
    var dur = r.minutes * 60, late = delayMin(r) * 60, best = null;
    busesOn(r, t).forEach(function (b) { if (b.prog * r.len <= st.d) { var eta = t + (st.d / r.len - b.prog) * (dur + late); if (best === null || eta < best) { best = eta; } } });
    if (best === null) { var nd = nextDepartures(r, t, 1); if (nd.length) { best = nd[0] + st.d / r.len * (dur + late); } }
    return best;
  }
  function nextStop(b) { var d = b.prog * b.route.len, st = b.route.stops; for (var i = 0; i < st.length; i++) { if (st[i].d >= d) { return st[i]; } } return st[st.length - 1]; }

  /* ---------- live tracking: the map follows one vehicle (a bus here; taxis and shuttles use it too) ---------- */
  var tracked = null, lastCentre = null;
  // item: { label, sub, find: function (t) -> { p, rows: [[label, value]...] } or null }
  function track(item) {
    tracked = item || null; lastCentre = null;
    $('trackCard').setAttribute('data-locked', tracked ? '0' : '1'); $('trackCard').hidden = !tracked;
    if (tracked) {
      var now = tracked.find(state.t), map = T.getMap();
      if (now && map) { map.easeTo({ center: [now.p[0], now.p[1]], zoom: Math.max(map.getZoom(), 15.5), duration: 700 }); }
      C.showTab('bus'); if (T.audit) { T.audit('Tracking ' + tracked.label); }
    }
    renderTrack(); C.redraw();
  }
  function renderTrack() {
    if (!tracked) { return; }
    var now = tracked.find(state.t);
    $('trackTitle').textContent = 'Tracking ' + tracked.label;
    $('trackFacts').innerHTML = now ? now.rows.map(function (r) { return C.fact(r[0], r[2] || '', r[1]); }).join('') : C.fact('Status', '', 'No longer in service');
  }
  function follow() {
    if (!tracked) { return; }
    var now = tracked.find(state.t), map = T.getMap();
    if (!now || !map || map.isEasing()) { return; }
    if (lastCentre && Math.hypot((now.p[0] - lastCentre[0]) * kx, (now.p[1] - lastCentre[1]) * ky) < 3) { return; }
    lastCentre = [now.p[0], now.p[1]]; map.jumpTo({ center: lastCentre });
  }
  function trackBus(b) {
    var r = b.route, dep = b.dep;
    track({ label: 'bus ' + b.no, find: function (t) {
      var list = busesOn(r, t), me = null; list.forEach(function (x) { if (x.dep === dep) { me = x; } });
      if (!me) { return null; }
      var st = nextStop(me), eta = nextArrival(r, st, t);
      return { p: me.p, rows: [['Route', r.id + ' · ' + r.name], ['Next stop', st.name + ' (' + st.code + ')', eta ? 'due ' + clock(eta) : ''], ['Journey done', Math.round(me.prog * 100) + '%', 'left the first stop at ' + clock(dep)],
        ['Delay', me.late < 1 ? 'on time' : Math.round(me.late) + ' min late', 'from traffic on the route']] };
    } });
  }

  function select(r) {
    selected = r;
    $('busDetail').setAttribute('data-locked', r ? '0' : '1'); $('busDetail').hidden = !r;
    if (r) {
      var lons = r.path.map(function (p) { return p[0]; }), lats = r.path.map(function (p) { return p[1]; });
      if (T.getMap()) { T.getMap().fitBounds([[Math.min.apply(null, lons), Math.min.apply(null, lats)], [Math.max.apply(null, lons), Math.max.apply(null, lats)]], { padding: { top: 100, bottom: 130, left: 40, right: 40 }, maxZoom: 14, duration: 800 }); }
      if (T.audit) { T.audit('Bus route: ' + r.id); }
    }
    render(); C.redraw();
  }

  function render() {
    if (!routes.length) { $('busEmpty').hidden = false; return; }
    $('busEmpty').hidden = true;
    var t = state.t, inService = 0, onTime = 0, hw = [], rows = routes.map(function (r) {
      var list = busesOn(r, t), late = delayMin(r), head = headwayAt(r, t);
      inService += list.length; if (late < B.onTimeWithinMin) { onTime += list.length; } if (head) { hw.push(head); }
      return { r: r, buses: list.length, late: late, head: head };
    });
    var lines = {}; routes.forEach(function (r) { lines[r.id] = 1; });
    $('bRoutes').textContent = Object.keys(lines).length;
    $('bBuses').textContent = num(inService);
    $('bHeadway').innerHTML = hw.length ? Math.round(hw.reduce(function (a, b) { return a + b; }, 0) / hw.length) + '<small>min</small>' : '–';
    $('bOnTime').innerHTML = inService ? Math.round(100 * onTime / inService) + '<small>%</small>' : '–';
    $('busNote2').textContent = hw.length ? 'In service' : 'No service at this hour';
    var ol = $('busList'); ol.innerHTML = '';
    rows.forEach(function (row) {
      var r = row.r, cls = !row.head ? 'acc-past' : row.late >= 8 ? 'severe' : row.late >= B.onTimeWithinMin ? 'heavy' : 'free';
      var sub = row.head ? 'Every ' + Math.round(row.head) + ' min · ' + row.buses + ' buses · ' + (row.late < 1 ? 'on time' : Math.round(row.late) + ' min late') + ' · ' + (r.len / 1000).toFixed(1) + ' km' : 'Not running now · ' + (r.len / 1000).toFixed(1) + ' km';
      var li = C.listButton(cls, r.id + ' · ' + r.name, sub, Math.round(r.minutes) + '<small>min</small>', function () { select(selected === r ? null : r); });
      if (selected === r) { li.firstChild.style.borderColor = 'var(--accent)'; }
      ol.appendChild(li);
    });
    if (selected) {
      var nd = nextDepartures(selected, t, 4), late = delayMin(selected);
      $('busDetailTitle').textContent = selected.id + ' · ' + selected.name;
      $('busFacts').innerHTML =
        C.fact('Next departures', 'from the first stop', nd.length ? nd.map(clock).join(' · ') : 'none today') +
        C.fact('Stops', 'about every ' + B.stopSpacingM + ' m', selected.stops.length) +
        C.fact('Timetabled journey', 'at ' + B.scheduleKmh + ' km/h including stops', Math.round(selected.minutes) + ' min') +
        C.fact('Delay now', 'from traffic on the route', late < 1 ? 'on time' : Math.round(late) + ' min') +
        C.fact('Buses on the route now', 'tap one below to track it', busesOn(selected, t).length) +
        C.fact('Service hours', '', C.pad(Math.floor(B.firstHour)) + ':' + C.pad(Math.round((B.firstHour % 1) * 60)) + '–' + C.pad(Math.floor(B.lastHour)) + ':' + C.pad(Math.round((B.lastHour % 1) * 60)));
      var fl = $('busFleet'); fl.innerHTML = '';
      busesOn(selected, t).forEach(function (b) {
        var st = nextStop(b);
        fl.appendChild(C.listButton(b.late >= B.onTimeWithinMin ? 'heavy' : 'free', 'Bus ' + b.no, 'Next stop: ' + st.name + ' · ' + (b.late < 1 ? 'on time' : Math.round(b.late) + ' min late'), Math.round(b.prog * 100) + '<small>%</small>', function () { trackBus(b); }));
      });
      if (!fl.children.length) { fl.innerHTML = '<li class="muted">No buses on this route at this hour.</li>'; }
      var sl = $('busStops'); sl.innerHTML = '';
      selected.stops.forEach(function (st) {
        var eta = nextArrival(selected, st, t), pos = pointAt(selected, st.d).p;
        sl.appendChild(C.listButton('site', st.name, 'Stop ' + st.code + ' · ' + (st.d / 1000).toFixed(1) + ' km from the start', eta ? clock(eta) : '–', function () {
          if (T.getMap()) { T.getMap().easeTo({ center: [pos[0], pos[1]], zoom: 16, duration: 700 }); }
          C.showPopup(pos, st.name, [['Stop number', st.code], ['Route', selected.id + ' · ' + selected.name], ['Next bus', eta ? clock(eta) : 'none today']], 'Synthetic stop on a synthetic timetable');
        }));
      });
    }
    renderTrack();
  }

  C.addLayers(function (ctx) {
    follow();
    var out = [], t = state.t, stamp = selected ? selected.key : '';
    if (tracked) {
      // A ring marks the vehicle being tracked.
      var tn = tracked.find(t);
      if (tn) { out.push(new deck.ScatterplotLayer({ id: 'track-ring', data: [tn.p], radiusUnits: 'pixels', filled: false, stroked: true, lineWidthUnits: 'pixels', getPosition: function (p) { return p; }, getRadius: 20, getLineColor: [210, 171, 82], getLineWidth: 3 })); }
    }
    if (!show || !routes.length) { return out; }
    out.push(new deck.PathLayer({
      id: 'bus-routes', data: routes.filter(function (r) { return r.dir === 0 || r === selected; }), pickable: true,
      getPath: function (r) { return r.path; }, getColor: function (r) { return r === selected ? [255, 255, 255, 255] : [57, 135, 229, selected ? 70 : 150]; },
      getWidth: function (r) { return r === selected ? 16 : 8; }, widthUnits: 'meters', widthMinPixels: 2, capRounded: true, jointRounded: true,
      updateTriggers: { getColor: stamp, getWidth: stamp }, onClick: function (info) { if (info.object) { C.showTab('bus'); select(info.object); } }
    }));
    if (selected && ctx.zoom >= 12.5) {
      var stopData = selected.stops.map(function (st) { return { st: st, p: pointAt(selected, st.d).p }; });
      out.push(new deck.ScatterplotLayer({ id: 'bus-stops', data: stopData, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (o) { return o.p; }, getRadius: 5, getFillColor: [255, 255, 255], getLineColor: BLUE, getLineWidth: 2,
        onClick: function (info) { if (info.object) { var o = info.object, eta = nextArrival(selected, o.st, state.t); C.showPopup(o.p, o.st.name, [['Stop number', o.st.code], ['Route', selected.id + ' · ' + selected.name], ['Next bus', eta ? clock(eta) : 'none today']], 'Synthetic stop on a synthetic timetable'); } } }));
      if (ctx.zoom >= 14.5) {
        out.push(new deck.TextLayer({ id: 'bus-stop-names', data: stopData, getPosition: function (o) { return o.p; }, getText: function (o) { return o.st.name; }, getSize: 11, getColor: [235, 240, 250],
          getPixelOffset: [0, -14], background: true, getBackgroundColor: [12, 31, 63, 220], backgroundPadding: [4, 2], fontFamily: 'system-ui, sans-serif', characterSet: 'auto' }));
      }
    }
    var fleet = []; routes.forEach(function (r) { fleet = fleet.concat(busesOn(r, t)); });
    if (ctx.zoom >= window.TwinCars.MIN_ZOOM) {
      var scale = ctx.zoom >= 17 ? 1.3 : ctx.zoom >= 16 ? 2 : ctx.zoom >= 15 ? 3 : 4.5, props = { data: fleet, getPosition: function (b) { return b.p; }, getOrientation: function (b) { return [0, b.yaw, 0]; }, getScale: [2.9, 1.45, 2.2], sizeScale: scale };
      out.push(new deck.SimpleMeshLayer(Object.assign({ id: 'syn-buses', mesh: window.TwinCars.MESH, pickable: true, onClick: function (info) { if (info.object) { trackBus(info.object); } }, getColor: function (b) { return b.route === selected ? HI : [70, 150, 235]; }, updateTriggers: { getColor: stamp } }, props)));
      out.push(new deck.SimpleMeshLayer(Object.assign({ id: 'syn-buses-dark', mesh: window.TwinCars.MESH_DARK, getColor: [22, 30, 46] }, props)));
    } else {
      out.push(new deck.ScatterplotLayer({ id: 'syn-bus-dots', data: fleet, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (b) { return b.p; }, getRadius: ctx.zoom < 11.5 ? 3.5 : 5, getFillColor: function (b) { return b.route === selected ? HI : [70, 150, 235]; }, getLineColor: [8, 20, 44], getLineWidth: 1.5,
        updateTriggers: { getFillColor: stamp },
        onClick: function (info) { if (info.object) { trackBus(info.object); } } }));
    }
    return out;
  });

  C.onReady(function () {
    setup(); render();
    $('showSynBuses').addEventListener('change', function (e) { show = e.target.checked; C.redraw(); });
    $('busClear').addEventListener('click', function () { select(null); });
    $('trackStop').addEventListener('click', function () { track(null); });
    T.getMap() && T.getMap().on('dragstart', function () { if (tracked) { track(null); } });
    C.onMinute(render);
  });

  T.buses = { routes: function () { return routes; }, select: select, track: track, tracking: function () { return tracked; }, busesOn: busesOn, nextArrival: nextArrival, inService: function () { var n = 0; routes.forEach(function (r) { n += busesOn(r, state.t).length; }); return n; } };
})();
