/* IntelliTwin response routing.
 *
 * Finds the quickest route from the nearest response unit to an alert, over the road network at
 * the current (synthetic) speeds, and draws it on the map with an arrival estimate.
 *
 * The road links are joined into a graph by matching each link's end to link starts within 45 m.
 * Turn restrictions are not known, so the route is indicative. Unit positions come from config.js
 * and are synthetic placeholders.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, state = T.state;
  var R = CFG.response || { bases: [], speedFactor: 1.2, auto: true };
  var next = null, kx = 111320 * Math.cos(24.4 * Math.PI / 180), ky = 110570, route = null, show = true;

  function dist(a, b) { return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky); }

  function buildGraph() {
    var edges = C.edges(), cell = 0.0005, starts = {};
    edges.forEach(function (e, i) { var p = e.path[0], k = Math.floor(p[0] / cell) + ':' + Math.floor(p[1] / cell); (starts[k] = starts[k] || []).push(i); });
    next = edges.map(function (e, i) {
      var p = e.path[e.path.length - 1], gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell), out = [];
      for (var dx = -1; dx <= 1; dx++) { for (var dy = -1; dy <= 1; dy++) {
        (starts[(gx + dx) + ':' + (gy + dy)] || []).forEach(function (j) { if (j !== i && dist(edges[j].path[0], p) < 45) { out.push(j); } });
      } }
      return out;
    });
  }
  function nearestEdge(p, useStart) {
    var edges = C.edges(), best = -1, bd = Infinity;
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i], q = useStart ? e.path[0] : e.path[e.path.length >> 1], d = dist(q, p);
      if (!useStart) { d = Math.min(d, dist(e.path[0], p), dist(e.path[e.path.length - 1], p)); }
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // Seconds to drive a link at the current speed, for a response vehicle.
  var cost = function (i) {
    var e = C.edges()[i], kmh = Math.max(4, Math.min(e.s * 1.15, e.s * C.ratio(i) * R.speedFactor));
    return e.m / (kmh / 3.6);
  };

  /* ---- Dijkstra over links, with a small binary heap ---- */
  function shortest(from, to) {
    var n = next.length, time = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), heap = [[cost(from), from]];
    time[from] = cost(from);
    function push(item) { heap.push(item); var i = heap.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) { break; } var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }
    function pop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) { m = l; } if (r < heap.length && heap[r][0] < heap[m][0]) { m = r; } if (m === i) { break; } var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } }
      return top;
    }
    while (heap.length) {
      var cur = pop(), u = cur[1];
      if (cur[0] > time[u]) { continue; }
      if (u === to) { break; }
      var nb = next[u];
      for (var k = 0; k < nb.length; k++) { var v = nb[k], t2 = cur[0] + cost(v); if (t2 < time[v]) { time[v] = t2; prev[v] = u; push([t2, v]); } }
    }
    if (!isFinite(time[to])) { return null; }
    var chain = []; for (var x = to; x !== -1; x = prev[x]) { chain.push(x); }
    chain.reverse();
    return { seconds: time[to], links: chain };
  }

  // Free-flow path between two points, for other modules (for example the synthetic bus routes).
  function pathBetween(a, b) {
    if (!next) { buildGraph(); }
    var edges = C.edges(), saved = cost;
    cost = function (i) { return edges[i].m / (edges[i].s / 3.6); };
    var r = shortest(nearestEdge(a, true), nearestEdge(b, false));
    cost = saved;
    if (!r) { return null; }
    var path = [], metres = 0;
    r.links.forEach(function (i) { edges[i].path.forEach(function (p, k) { if (k || !path.length) { path.push(p); } }); metres += edges[i].m; });
    return { path: path, links: r.links, metres: metres };
  }

  function routeTo(lon, lat, label, opts) {
    opts = opts || {};
    if (!R.bases || !R.bases.length) { return null; }
    if (!next) { buildGraph(); }
    var goal = nearestEdge([lon, lat], false), best = null, edges = C.edges();
    R.bases.forEach(function (b) {
      var r = shortest(nearestEdge([b.lon, b.lat], true), goal);
      if (r && (!best || r.seconds < best.seconds)) { best = r; best.base = b; }
    });
    if (!best) { $('respText').textContent = 'No connected route to "' + label + '" was found in the model network.'; return null; }
    var path = [[best.base.lon, best.base.lat]], metres = 0;
    best.links.forEach(function (i) { edges[i].path.forEach(function (p) { path.push(p); }); metres += edges[i].m; });
    path.push([lon, lat]);
    route = { path: path, base: best.base, minutes: best.seconds / 60, km: metres / 1000, label: label, target: [lon, lat] };
    $('respText').textContent = best.base.name + ' → ' + label + ': about ' + Math.max(1, Math.round(route.minutes)) + ' min, ' + route.km.toFixed(1) +
      ' km at current speeds. Indicative route (turn restrictions unknown; unit position synthetic).';
    $('respClear').hidden = false;
    C.redraw();
    if (opts.fit !== false && T.getMap()) {
      var lons = path.map(function (p) { return p[0]; }), lats = path.map(function (p) { return p[1]; });
      T.getMap().fitBounds([[Math.min.apply(null, lons), Math.min.apply(null, lats)], [Math.max.apply(null, lons), Math.max.apply(null, lats)]],
        { padding: { top: 110, bottom: 140, left: 50, right: 50 }, maxZoom: 15, pitch: 40, duration: 900 });
    }
    if (T.audit) { T.audit('Response route: ' + best.base.name + ' → ' + label); }
    return route;
  }
  function clear() { route = null; $('respText').textContent = 'No route yet. Tap an alert, or wait for a critical one.'; $('respClear').hidden = true; C.redraw(); }

  C.addLayers(function () {
    var out = [];
    if (show && R.bases && R.bases.length) {
      out.push(new deck.ScatterplotLayer({ id: 'bases', data: R.bases, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (b) { return [b.lon, b.lat]; }, getRadius: 6, getFillColor: [255, 255, 255], getLineColor: [57, 135, 229], getLineWidth: 3,
        onClick: function (info) { if (info.object) { C.showPopup([info.object.lon, info.object.lat], info.object.name, [['Role', 'Response unit']], 'Synthetic position from config.js'); } } }));
    }
    if (route) {
      out.push(new deck.PathLayer({ id: 'route-casing', data: [route], getPath: function (r) { return r.path; }, getColor: [0, 30, 40, 230], getWidth: 26, widthUnits: 'meters', widthMinPixels: 8, capRounded: true, jointRounded: true }));
      out.push(new deck.PathLayer({ id: 'route', data: [route], getPath: function (r) { return r.path; }, getColor: [0, 229, 255, 255], getWidth: 14, widthUnits: 'meters', widthMinPixels: 4, capRounded: true, jointRounded: true }));
      out.push(new deck.ScatterplotLayer({ id: 'route-target', data: [route], radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (r) { return r.target; }, getRadius: 10, getFillColor: [0, 229, 255, 90], getLineColor: [0, 229, 255], getLineWidth: 3 }));
    }
    return out;
  });

  C.onReady(function () {
    $('respClear').addEventListener('click', clear);
    $('showBases').addEventListener('change', function (e) { show = e.target.checked; C.redraw(); });
  });

  T.response = { pathBetween: pathBetween, routeTo: routeTo, clear: clear, current: function () { return route; }, auto: function () { return !!R.auto; } };
})();
