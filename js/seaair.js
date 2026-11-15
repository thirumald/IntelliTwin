/* IntelliTwin sea and air movements (synthetic).
 *
 * Ships on example shipping lanes off Mina Zayed and aircraft on example approach and departure paths
 * at the two airports, drawn as moving icons with a wake or a trail. There is no public feed of vessel
 * or aircraft positions in this app: vessel names, flight numbers, times and positions are SYNTHETIC,
 * and the lanes and flight paths are approximate examples, not charted routes. See docs/buses.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, clock = C.clock, state = T.state, K = T.kit, rnd = K.rnd, hashStr = K.hashStr, esc = K.esc;
  var SEA = CFG.sea || {}, AIR = CFG.air || {}, kx = K.kx, ky = K.ky, show = { sea: true, air: true }, DAY = 86400;
  function seed() { return hashStr(state.date); }
  function icon(path) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#fff" d="' + path + '"/></svg>'); }
  // Both icons point up (north) at angle 0.
  var SHIP = icon('M32 3c7 9 10 17 10 26v26c0 3-4 6-10 6s-10-3-10-6V29c0-9 3-17 10-26zm-5 30v8h10v-8zm0 12v9h10v-9z');
  var PLANE = icon('M32 2c3 0 4 5 4 10v13l24 15v6l-24-8v14l8 6v4l-12-3-12 3v-4l8-6V38L4 46v-6l24-15V12c0-5 1-10 4-10z');

  function prep(def) {
    var cum = [0], p = def.path;
    for (var i = 1; i < p.length; i++) { cum.push(cum[i - 1] + Math.hypot((p[i][0] - p[i - 1][0]) * kx, (p[i][1] - p[i - 1][1]) * ky)); }
    def.cum = cum; def.len = cum[cum.length - 1]; return def;
  }
  // Position, heading (degrees clockwise from north) at fraction f of a path; reverse runs it backwards.
  function at(def, f, reverse) {
    f = Math.max(0, Math.min(1, reverse ? 1 - f : f));
    var d = f * def.len, j = 1; while (j < def.cum.length - 1 && def.cum[j] < d) { j++; }
    var a = def.path[j - 1], b = def.path[j], g = (d - def.cum[j - 1]) / ((def.cum[j] - def.cum[j - 1]) || 1), dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky;
    var brg = Math.atan2(dx, dy) * 180 / Math.PI; if (reverse) { brg += 180; }
    return { p: [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g], brg: brg };
  }
  // Samples of a movement for the animated trail: positions with times.
  function trail(def, start, dur, reverse, alt) {
    var path = [], ts = [], n = 24;
    for (var i = 0; i <= n; i++) { var f = i / n, q = at(def, f, reverse); path.push([q.p[0], q.p[1], alt ? alt(f) : 0]); ts.push(start + f * dur); }
    return { path: path, ts: ts };
  }

  /* ---------------------------------------------------------------- ships */
  var lanes = (SEA.lanes || []).map(prep), TYPES = SEA.types || [{ kind: 'Container ship', knots: 14, colour: [57, 135, 229] }];
  function ships(t) {
    if (!lanes.length) { return []; }
    var out = [], step = (SEA.everyMin || 22) * 60, s = seed();
    for (var k = Math.floor((t - 3 * 3600) / step); k <= Math.floor(t / step); k++) {
      if (k < 0) { continue; }
      var lane = lanes[Math.floor(rnd(s, k * 7 + 1) * lanes.length)], ty = TYPES[Math.floor(rnd(s, k * 7 + 2) * TYPES.length)], inbound = rnd(s, k * 7 + 3) < 0.5;
      var start = k * step, dur = lane.len / (ty.knots * 1.852 / 3.6), f = (t - start) / dur; if (f < 0 || f >= 1) { continue; }
      var q = at(lane, f, !inbound);   // lanes are drawn from the port out to sea; inbound ships run them backwards
      out.push({ id: 'V-' + (100 + (k % 900)), name: (SEA.namePrefix || 'MV Example') + ' ' + (100 + (k % 900)), kind: ty.kind, colour: ty.colour, knots: ty.knots, lane: lane, inbound: inbound, start: start, dur: dur, f: f, p: q.p, brg: q.brg, k: k,
        eta: start + dur });
    }
    return out;
  }
  function berths(t) {
    var n = SEA.berths || 8, s = seed(), used = 0; for (var i = 0; i < n; i++) { if (rnd(s, 300 + i + Math.floor(t / 7200) * 13) < 0.62) { used++; } }
    return { total: n, used: used };
  }

  /* ---------------------------------------------------------------- aircraft */
  var routes = (AIR.routes || []).map(prep);
  function altOf(arrival, f) { var top = AIR.topAltM || 2600; return arrival ? top * (1 - f) : top * f; }
  function flights(t, windowS) {
    if (!routes.length) { return []; }
    var out = [], step = 3600 / (AIR.movementsPerHour || 16), s = seed(), dur = AIR.inViewSec || 420, span = windowS || 0;
    for (var k = Math.floor((t - dur - 2700) / step); k <= Math.floor((t + span) / step); k++) {
      if (k < 0) { continue; }
      var arrival = k % 2 === 0, pool = routes.filter(function (r) { return r.arrival === arrival; }); if (!pool.length) { continue; }
      var r = pool[Math.floor(rnd(s, k * 5 + 1) * pool.length)], late = rnd(s, k * 5 + 2) < (AIR.delayedShare || 0.2) ? Math.round(10 + rnd(s, k * 5 + 3) * 35) * 60 : 0;
      var sched = k * step, start = sched + late - (arrival ? dur : 0), f = (t - start) / dur, cities = AIR.cities || ['Example City'];
      var q = f >= 0 && f < 1 ? at(r, f, false) : null;
      out.push({ id: (AIR.flightPrefix || 'FLT') + ' ' + (200 + (k % 700)), arrival: arrival, route: r, city: cities[Math.floor(rnd(s, k * 5 + 4) * cities.length)], sched: sched, time: sched + late, late: late / 60, start: start, dur: dur, f: f,
        active: !!q, p: q ? [q.p[0], q.p[1], altOf(arrival, f)] : null, brg: q ? q.brg : 0, k: k });
    }
    return out;
  }
  function statusOf(fl, t) {
    if (fl.active) { return fl.arrival ? 'On approach' : 'Climbing out'; }
    if (fl.arrival) { return t >= fl.time ? 'Landed' : fl.late ? 'Delayed ' + Math.round(fl.late) + ' min' : 'On time'; }
    return t >= fl.time + fl.dur ? 'Departed' : fl.late ? 'Delayed ' + Math.round(fl.late) + ' min' : t >= fl.time - 1500 ? 'Boarding' : 'On time';
  }

  function trackShip(v) {
    T.buses.track({ label: 'vessel ' + v.name, find: function (t) { var me = ships(t).filter(function (x) { return x.k === v.k; })[0]; if (!me) { return null; }
      return { p: me.p, rows: [['Type', me.kind], ['Movement', me.inbound ? 'Inbound to ' + (SEA.portName || 'the port') : 'Outbound to sea'], ['Lane', me.lane.name], ['Speed', me.knots + ' knots', 'synthetic'], [me.inbound ? 'Due at the port' : 'Leaves the area', clock(me.eta % DAY)]] }; } });
  }
  function trackFlight(fl) {
    T.buses.track({ label: 'flight ' + fl.id, find: function (t) { var me = flights(t).filter(function (x) { return x.k === fl.k; })[0]; if (!me || !me.active) { return null; }
      return { p: me.p, rows: [[me.arrival ? 'From' : 'To', me.city], ['Status', statusOf(me, t)], ['Path', me.route.name], ['Altitude', num(Math.round(me.p[2] / 10) * 10) + ' m', 'synthetic'], [me.arrival ? 'Lands' : 'Took off', clock((me.arrival ? me.time : me.start) % DAY)]] }; } });
  }

  function render() {
    if (!K.tabOpen('bus')) { return; }
    var t = state.t, vs = ships(t), b = berths(t);
    $('seaMoving').textContent = vs.length; $('seaBerth').textContent = b.used + ' of ' + b.total;
    $('seaIn').textContent = vs.filter(function (v) { return v.inbound; }).length; $('seaOut').textContent = vs.filter(function (v) { return !v.inbound; }).length;
    var sl = $('seaList'); sl.innerHTML = '';
    vs.sort(function (a, c) { return a.eta - c.eta; }).forEach(function (v) {
      sl.appendChild(C.listButton(v.inbound ? 'free' : 'site', v.name + ' · ' + v.kind, (v.inbound ? 'Inbound, due ' : 'Outbound, clear of the area ') + clock(v.eta % DAY) + ' · ' + v.knots + ' knots · ' + v.lane.name, Math.round(v.f * 100) + '<small>%</small>', function () { trackShip(v); }));
    });
    if (!sl.children.length) { sl.innerHTML = '<li class="muted">No vessel is moving in the area at this time.</li>'; }
    var fl = flights(t, 3600), air = fl.filter(function (f) { return f.active; }), hour = fl.filter(function (f) { return f.time >= t - 1800 && f.time < t + 1800; });
    $('airNow').textContent = air.length; $('airHour').textContent = hour.length;
    $('airOnTime').innerHTML = hour.length ? Math.round(100 * hour.filter(function (f) { return !f.late; }).length / hour.length) + '<small>%</small>' : '–';
    $('airDelay').innerHTML = hour.length ? Math.round(hour.reduce(function (s, f) { return s + f.late; }, 0) / hour.length) + '<small>min</small>' : '–';
    var al = $('airList'); al.innerHTML = '';
    fl.filter(function (f) { return f.time >= t - 900; }).sort(function (a, c) { return a.time - c.time; }).slice(0, 8).forEach(function (f) {
      var st = statusOf(f, t);
      al.appendChild(C.listButton(f.active ? 'free' : f.late ? 'heavy' : 'site', f.id + ' · ' + (f.arrival ? 'from ' : 'to ') + f.city, (f.arrival ? 'Arrival' : 'Departure') + ' · scheduled ' + clock(f.sched % DAY) + ' · ' + st, clock(f.time % DAY), function () { if (f.active) { trackFlight(f); } else if (T.getMap()) { T.getMap().easeTo({ center: AIR.airport || f.route.path[0], zoom: 12, duration: 700 }); } }));
    });
  }

  C.addLayers(function (ctx) {
    var out = [], t = state.t, big = ctx.zoom >= 12;
    if (show.sea && lanes.length) {
      var vs = ships(t);
      out.push(new deck.PathLayer({ id: 'sea-lanes', data: lanes, getPath: function (l) { return l.path; }, getColor: [90, 167, 255, 110], getWidth: 2, widthUnits: 'pixels', getDashArray: [6, 5], dashJustified: true, extensions: deck.PathStyleExtension ? [new deck.PathStyleExtension({ dash: true })] : [] }));
      out.push(new deck.TripsLayer({ id: 'sea-wake', data: vs.map(function (v) { return trail(v.lane, v.start, v.dur, !v.inbound); }), getPath: function (d) { return d.path; }, getTimestamps: function (d) { return d.ts; }, getColor: [190, 225, 255], widthMinPixels: 3, capRounded: true, jointRounded: true, trailLength: SEA.wakeSec || 900, currentTime: t, fadeTrail: true }));
      out.push(new deck.IconLayer({ id: 'ships', data: vs, pickable: true, billboard: false, sizeUnits: 'pixels', getIcon: function () { return { url: SHIP, width: 64, height: 64, mask: true }; }, getPosition: function (v) { return v.p; }, getSize: big ? 34 : 24, getAngle: function (v) { return -v.brg; }, getColor: function (v) { return v.colour; },
        onClick: function (info) { if (info.object) { trackShip(info.object); } } }));
      if (SEA.port) { out.push(new deck.ScatterplotLayer({ id: 'port', data: [SEA.port], pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (p) { return p; }, getRadius: 8, getFillColor: [57, 135, 229], getLineColor: [255, 255, 255], getLineWidth: 2,
        onClick: function () { var b = berths(state.t); C.showPopup(SEA.port, SEA.portName || 'Port', [['Berths in use', b.used + ' of ' + b.total], ['Vessels moving', ships(state.t).length]], 'Synthetic port status'); } })); }
    }
    if (show.air && routes.length) {
      var air = flights(t).filter(function (f) { return f.active; });
      out.push(new deck.PathLayer({ id: 'air-paths', data: routes, getPath: function (r) { return r.path; }, getColor: [240, 207, 127, 80], getWidth: 1.5, widthUnits: 'pixels' }));
      out.push(new deck.TripsLayer({ id: 'air-trail', data: air.map(function (f) { return trail(f.route, f.start, f.dur, false, function (g) { return altOf(f.arrival, g); }); }), getPath: function (d) { return d.path; }, getTimestamps: function (d) { return d.ts; }, getColor: [255, 255, 255], widthMinPixels: 2.5, capRounded: true, jointRounded: true, trailLength: AIR.trailSec || 150, currentTime: t, fadeTrail: true }));
      out.push(new deck.IconLayer({ id: 'aircraft', data: air, pickable: true, billboard: false, sizeUnits: 'pixels', getIcon: function () { return { url: PLANE, width: 64, height: 64, mask: true }; }, getPosition: function (f) { return f.p; }, getSize: big ? 40 : 30, getAngle: function (f) { return -f.brg; }, getColor: function (f) { return f.arrival ? [240, 207, 127] : [255, 255, 255]; },
        onClick: function (info) { if (info.object) { trackFlight(info.object); } } }));
    }
    return out;
  });

  C.onReady(function () {
    $('showSea').addEventListener('change', function (e) { show.sea = e.target.checked; C.redraw(); });
    $('showAir').addEventListener('change', function (e) { show.air = e.target.checked; C.redraw(); });
    $('seaView').addEventListener('click', function () { if (T.getMap() && SEA.port) { T.getMap().easeTo({ center: SEA.view || SEA.port, zoom: 11.3, pitch: 45, duration: 900 }); } });
    $('airView').addEventListener('click', function () { if (T.getMap() && AIR.airport) { T.getMap().easeTo({ center: AIR.airport, zoom: 10.8, pitch: 55, duration: 900 }); } });
    C.onTab(render); C.onMinute(render);
  });
  T.sea = { ships: function () { return ships(state.t); }, berths: function () { return berths(state.t); } };
  T.air = { flights: function (w) { return flights(state.t, w); } };
})();
