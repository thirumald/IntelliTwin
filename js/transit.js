/* IntelliTwin synthetic taxis and on-demand shuttles.
 *
 * There is no public feed of taxi or shuttle positions for Abu Dhabi, so this module builds an example
 * fleet: taxis that move along corridors between the taxi ranks, and shuttles that circulate inside
 * their service zones. Vehicle numbers, positions, statuses and waiting times are SYNTHETIC.
 * See docs/buses.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, state = T.state;
  var X = CFG.taxis || {}, S = CFG.shuttles || {}, kx = 111320 * Math.cos(24.4 * Math.PI / 180), ky = 110570;
  var corridors = [], taxis = [], shuttles = [], show = { taxi: true, shuttle: true };
  var COL = { vacant: [12, 163, 12], hired: [201, 133, 0], call: [57, 135, 229] }, LABEL = { vacant: 'Vacant', hired: 'Hired', call: 'On the way to a booking' };

  function hash(a, b) { var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }
  function measure(path) { var cum = [0]; for (var i = 1; i < path.length; i++) { cum.push(cum[i - 1] + Math.hypot((path[i][0] - path[i - 1][0]) * kx, (path[i][1] - path[i - 1][1]) * ky)); } return cum; }
  function pointAt(path, cum, d) {
    var j = 1; while (j < cum.length - 1 && cum[j] < d) { j++; }
    var a = path[j - 1], b = path[j], seg = (cum[j] - cum[j - 1]) || 1, f = (d - cum[j - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0];
  }
  // Back and forth along a path of length len.
  function pingPong(d, len) { var m = d % (2 * len); return m <= len ? m : 2 * len - m; }

  function setup() {
    if (!T.response) { return; }
    var ranks = X.ranks || [];
    // Corridors: each rank to the next two in the list, along the quickest road path.
    for (var i = 0; i < ranks.length; i++) {
      for (var k = 1; k <= 2; k++) {
        var a = ranks[i], b = ranks[(i + k) % ranks.length], leg = T.response.pathBetween(a.at, b.at);
        if (leg && leg.metres > 1200) { var cum = measure(leg.path); corridors.push({ path: leg.path, cum: cum, len: cum[cum.length - 1], from: a.name, to: b.name }); }
      }
    }
    if (corridors.length) {
      for (var n = 0; n < (X.count || 0); n++) { taxis.push({ id: 'TX-' + ('000' + (1000 + n)).slice(-4), n: n, c: corridors[Math.floor(hash(n, 1) * corridors.length)], phase: hash(n, 2), kmh: (X.speedKmh || 32) * (0.8 + 0.4 * hash(n, 3)) }); }
    }
    // Shuttles circulate on the streets inside their zone.
    var edges = C.edges();
    (S.zones || []).forEach(function (z, zi) {
      var inside = [];
      for (var e = 0; e < edges.length; e++) {
        var mp = edges[e].path[edges[e].path.length >> 1];
        if (edges[e].m > 120 && Math.hypot((mp[0] - z.at[0]) * kx, (mp[1] - z.at[1]) * ky) <= z.radiusM) { inside.push(e); }
      }
      z.list = [];
      for (var v = 0; v < z.vehicles && inside.length; v++) {
        var ed = edges[inside[Math.floor(hash(zi * 31 + v, 7) * inside.length)]], cum = measure(ed.path);
        var sh = { id: 'SH-' + (zi + 1) + C.pad(v + 1), zone: z, path: ed.path, cum: cum, len: cum[cum.length - 1], phase: hash(zi * 31 + v, 8) };
        z.list.push(sh); shuttles.push(sh);
      }
    });
  }

  function hiredShare(t) { var h = t / 3600, peak = (h >= 7 && h < 10) || (h >= 17 && h < 22); return h < 5 ? (X.hiredShareNight || 0.25) : peak ? (X.hiredSharePeak || 0.7) : (X.hiredShareDay || 0.5); }
  function taxiAt(x, t) {
    var d = pingPong(x.phase * 2 * x.c.len + t * x.kmh / 3.6, x.c.len), r = hash(x.n, Math.floor(t / 600) + 11), share = hiredShare(t);
    var status = r < share ? 'hired' : r < share + (X.bookingShare || 0.1) ? 'call' : 'vacant';
    return { p: pointAt(x.c.path, x.c.cum, d), status: status, x: x };
  }
  function shuttleAt(sh, t) { return { p: pointAt(sh.path, sh.cum, pingPong(sh.phase * 2 * sh.len + t * (S.speedKmh || 24) / 3.6, sh.len)), sh: sh, riders: Math.floor(hash(sh.phase * 99, Math.floor(t / 900)) * ((S.seats || 12) + 1)) }; }
  function rankNow(rk, i, t) {
    var share = hiredShare(t), waiting = Math.max(0, Math.round((rk.bays || 8) * (1 - share) * (0.5 + hash(i, Math.floor(t / 900)))));
    return { waiting: waiting, waitMin: waiting ? Math.round(1 + 3 * hash(i + 5, Math.floor(t / 900))) : Math.round(4 + 8 * share) };
  }
  function shuttleWait(z, t) { var h = t / 3600, busy = (h >= 7 && h < 10) || (h >= 17 && h < 21); return Math.round((z.waitMin || 8) * (busy ? 1.6 : 1)); }

  function trackTaxi(x) {
    T.buses.track({ label: 'taxi ' + x.id, find: function (t) { var a = taxiAt(x, t); return { p: a.p, rows: [['Status', LABEL[a.status]], ['Corridor', x.c.from + ' – ' + x.c.to], ['Speed', Math.round(x.kmh) + ' km/h', 'synthetic']] }; } });
  }
  function trackShuttle(sh) {
    T.buses.track({ label: 'shuttle ' + sh.id, find: function (t) { var a = shuttleAt(sh, t); return { p: a.p, rows: [['Service zone', sh.zone.name], ['Passengers on board', a.riders + ' of ' + (S.seats || 12)], ['Booking wait in the zone', shuttleWait(sh.zone, t) + ' min', 'synthetic']] }; } });
  }

  function render() {
    var t = state.t, c = { vacant: 0, hired: 0, call: 0 };
    taxis.forEach(function (x) { c[taxiAt(x, t).status]++; });
    $('txTotal').textContent = num(taxis.length);
    $('txHired').innerHTML = taxis.length ? Math.round(100 * c.hired / taxis.length) + '<small>%</small>' : '–';
    $('txVacant').textContent = num(c.vacant);
    $('txCall').textContent = num(c.call);
    var ol = $('rankList'); ol.innerHTML = '';
    (X.ranks || []).forEach(function (rk, i) {
      var now = rankNow(rk, i, t);
      ol.appendChild(C.listButton(now.waiting ? 'free' : 'heavy', rk.name, now.waiting + ' taxis waiting · passenger wait about ' + now.waitMin + ' min', now.waiting + '<small>taxis</small>', function () {
        if (T.getMap()) { T.getMap().easeTo({ center: rk.at, zoom: 15.5, duration: 700 }); }
        C.showPopup(rk.at, rk.name + ' taxi rank', [['Taxis waiting', now.waiting], ['Passenger wait', 'about ' + now.waitMin + ' min'], ['Bays', rk.bays || 8]], 'Synthetic taxi rank');
      }));
    });
    var riders = 0, sl = $('shuttleList'); sl.innerHTML = '';
    (S.zones || []).forEach(function (z) {
      var on = 0; (z.list || []).forEach(function (sh) { on += shuttleAt(sh, t).riders; }); riders += on;
      sl.appendChild(C.listButton('free', z.name, (z.list || []).length + ' shuttles · ' + on + ' passengers on board · booking wait about ' + shuttleWait(z, t) + ' min', shuttleWait(z, t) + '<small>min</small>', function () {
        if (T.getMap()) { T.getMap().easeTo({ center: z.at, zoom: 14.5, duration: 700 }); }
      }));
    });
    $('shVehicles').textContent = num(shuttles.length); $('shRiders').textContent = num(riders);
    var km = C.railKm();
    $('railFact').innerHTML = C.fact('Railway track in the area', 'from OpenStreetMap; no passenger timetable is published', km ? num(km) + ' km' : 'not in this build');
  }

  C.addLayers(function (ctx) {
    var out = [], t = state.t, bucket = Math.floor(t / 600);
    if (show.taxi && taxis.length) {
      out.push(new deck.ScatterplotLayer({ id: 'taxi-ranks', data: X.ranks, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (r) { return r.at; }, getRadius: 7, getFillColor: [250, 178, 25], getLineColor: [20, 20, 20], getLineWidth: 2,
        onClick: function (info) { if (info.object) { var i = X.ranks.indexOf(info.object), now = rankNow(info.object, i, state.t); C.showPopup(info.object.at, info.object.name + ' taxi rank', [['Taxis waiting', now.waiting], ['Passenger wait', 'about ' + now.waitMin + ' min']], 'Synthetic taxi rank'); } } }));
      out.push(new deck.ScatterplotLayer({ id: 'taxis', data: taxis.map(function (x) { return taxiAt(x, t); }), pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (a) { return a.p; }, getRadius: ctx.zoom < 12 ? 2.5 : ctx.zoom < 14.5 ? 4 : 6, getFillColor: function (a) { return COL[a.status]; }, getLineColor: [255, 255, 255], getLineWidth: ctx.zoom < 12 ? 0 : 1,
        updateTriggers: { getFillColor: bucket }, onClick: function (info) { if (info.object) { trackTaxi(info.object.x); } } }));
    }
    if (show.shuttle && shuttles.length) {
      out.push(new deck.ScatterplotLayer({ id: 'shuttle-zones', data: S.zones, radiusUnits: 'meters', stroked: true, filled: true, lineWidthUnits: 'pixels',
        getPosition: function (z) { return z.at; }, getRadius: function (z) { return z.radiusM; }, getFillColor: [213, 81, 129, 22], getLineColor: [213, 81, 129, 200], getLineWidth: 1.5 }));
      out.push(new deck.ScatterplotLayer({ id: 'shuttles', data: shuttles.map(function (sh) { return shuttleAt(sh, t); }), pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (a) { return a.p; }, getRadius: ctx.zoom < 12 ? 3 : 5.5, getFillColor: [213, 81, 129], getLineColor: [255, 255, 255], getLineWidth: 1.5,
        onClick: function (info) { if (info.object) { trackShuttle(info.object.sh); } } }));
    }
    return out;
  });

  C.onReady(function () {
    setup(); render();
    $('showTaxis').addEventListener('change', function (e) { show.taxi = e.target.checked; C.redraw(); });
    $('showShuttles').addEventListener('change', function (e) { show.shuttle = e.target.checked; C.redraw(); });
    C.onMinute(render);
  });

  T.transit = { taxis: function () { return taxis; }, shuttles: function () { return shuttles; }, corridors: function () { return corridors; } };
})();
