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
        var cum = measure(leg.path), len = cum[cum.length - 1], stops = [];
        for (var d = 0; d <= len; d += B.stopSpacingM) { stops.push(d); }
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
      if (prog >= 0 && prog < 1) { var pos = pointAt(r, prog * r.len); out.push({ p: pos.p, yaw: pos.yaw, route: r, dep: dep, prog: prog }); }
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
        C.fact('Service hours', '', C.pad(Math.floor(B.firstHour)) + ':' + C.pad(Math.round((B.firstHour % 1) * 60)) + '–' + C.pad(Math.floor(B.lastHour)) + ':' + C.pad(Math.round((B.lastHour % 1) * 60)));
    }
  }

  C.addLayers(function (ctx) {
    if (!show || !routes.length) { return []; }
    var out = [], t = state.t, stamp = selected ? selected.key : '';
    out.push(new deck.PathLayer({
      id: 'bus-routes', data: routes.filter(function (r) { return r.dir === 0 || r === selected; }), pickable: true,
      getPath: function (r) { return r.path; }, getColor: function (r) { return r === selected ? [255, 255, 255, 255] : [57, 135, 229, selected ? 70 : 150]; },
      getWidth: function (r) { return r === selected ? 16 : 8; }, widthUnits: 'meters', widthMinPixels: 2, capRounded: true, jointRounded: true,
      updateTriggers: { getColor: stamp, getWidth: stamp }, onClick: function (info) { if (info.object) { C.showTab('bus'); select(info.object); } }
    }));
    if (selected && ctx.zoom >= 12.5) {
      out.push(new deck.ScatterplotLayer({ id: 'bus-stops', data: selected.stops.map(function (d) { return pointAt(selected, d).p; }), radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (p) { return p; }, getRadius: 4, getFillColor: [255, 255, 255], getLineColor: BLUE, getLineWidth: 2 }));
    }
    var fleet = []; routes.forEach(function (r) { fleet = fleet.concat(busesOn(r, t)); });
    if (ctx.zoom >= window.TwinCars.MIN_ZOOM) {
      var scale = ctx.zoom >= 17 ? 1.3 : ctx.zoom >= 16 ? 2 : ctx.zoom >= 15 ? 3 : 4.5, props = { data: fleet, getPosition: function (b) { return b.p; }, getOrientation: function (b) { return [0, b.yaw, 0]; }, getScale: [2.9, 1.45, 2.2], sizeScale: scale };
      out.push(new deck.SimpleMeshLayer(Object.assign({ id: 'syn-buses', mesh: window.TwinCars.MESH, getColor: function (b) { return b.route === selected ? HI : [70, 150, 235]; }, updateTriggers: { getColor: stamp } }, props)));
      out.push(new deck.SimpleMeshLayer(Object.assign({ id: 'syn-buses-dark', mesh: window.TwinCars.MESH_DARK, getColor: [22, 30, 46] }, props)));
    } else {
      out.push(new deck.ScatterplotLayer({ id: 'syn-buses', data: fleet, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (b) { return b.p; }, getRadius: ctx.zoom < 11.5 ? 3.5 : 5, getFillColor: function (b) { return b.route === selected ? HI : [70, 150, 235]; }, getLineColor: [8, 20, 44], getLineWidth: 1.5,
        updateTriggers: { getFillColor: stamp },
        onClick: function (info) { if (info.object) { var b = info.object; C.showPopup(b.p, 'Bus on route ' + b.route.id, [['Route', b.route.name], ['Left the first stop', clock(b.dep)], ['Journey done', Math.round(b.prog * 100) + '%']], 'Synthetic bus on a synthetic timetable'); } } }));
    }
    return out;
  });

  C.onReady(function () {
    setup(); render();
    $('showSynBuses').addEventListener('change', function (e) { show = e.target.checked; C.redraw(); });
    $('busClear').addEventListener('click', function () { select(null); });
    C.onMinute(render);
  });

  T.buses = { routes: function () { return routes; }, select: select, inService: function () { var n = 0; routes.forEach(function (r) { n += busesOn(r, state.t).length; }); return n; } };
})();
