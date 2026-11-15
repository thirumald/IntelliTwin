/* IntelliTwin street-level 3D vehicles.
 *
 * The app draws one vehicle for every vehicle the simulation has on each road link (a dot when
 * zoomed out, a 3D car at street zoom), moving at that link's simulated speed and spread across its lanes. The counts and speeds
 * are the simulation's; the individual cars are drawn to match them and are not tracked vehicles.
 */
(function (root) {
  'use strict';

  /* ---- a low-polygon car, length along +X (the front), metres ---- */
  function hexahedron(out, x0, x1, y0, y1, z0, z1, insetFront, insetBack, insetSide) {
    var c = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0 + insetBack, y0 + insetSide, z1], [x1 - insetFront, y0 + insetSide, z1],
      [x1 - insetFront, y1 - insetSide, z1], [x0 + insetBack, y1 - insetSide, z1]
    ];
    [[0, 3, 2, 1], [4, 5, 6, 7], [1, 2, 6, 5], [0, 4, 7, 3], [0, 1, 5, 4], [3, 7, 6, 2]].forEach(function (f) {
      var a = c[f[0]], b = c[f[1]], d = c[f[2]], e = c[f[3]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      [a, b, d, a, d, e].forEach(function (p) { out.pos.push(p[0], p[1], p[2]); out.nor.push(nx / len, ny / len, nz / len); });
    });
  }
  var geo = { pos: [], nor: [] };
  hexahedron(geo, -2.2, 2.2, -0.9, 0.9, 0.22, 0.92, 0.12, 0.08, 0.06);     // body
  hexahedron(geo, -1.45, 0.75, -0.8, 0.8, 0.92, 1.5, 0.55, 0.3, 0.14);      // cabin, set back from the bonnet
  var MESH = {
    positions: { value: new Float32Array(geo.pos), size: 3 },
    normals: { value: new Float32Array(geo.nor), size: 3 },
    texCoords: { value: new Float32Array(geo.pos.length / 3 * 2), size: 2 }
  };

  // Paint colours, weighted towards the whites and silvers common on UAE roads.
  var PAINT = [[240, 240, 240], [240, 240, 240], [240, 240, 240], [240, 240, 240], [196, 200, 206], [196, 200, 206],
    [120, 124, 130], [40, 42, 48], [40, 42, 48], [150, 30, 36], [36, 70, 140], [176, 150, 110]];
  var LANE_M = 3.3, MAX_CARS = 5000;

  // Vehicle types. The simulation has one type; the shares are assumptions from config.js (vehicles.mix).
  // scale = [length, width, height] against the car mesh; paint = body colours.
  var SHAPE = {
    car: { scale: [1, 1, 1], paint: PAINT },
    taxi: { scale: [1, 1, 1.05], paint: [[236, 200, 60]] },
    van: { scale: [1.2, 1.08, 1.5], paint: [[240, 240, 240], [196, 200, 206], [60, 70, 90]] },
    lorry: { scale: [2.4, 1.35, 2.2], paint: [[215, 110, 50], [200, 200, 205], [60, 90, 150]] },
    bus: { scale: [2.7, 1.4, 2.1], paint: [[70, 140, 220], [240, 240, 240]] },
    moto: { scale: [0.45, 0.35, 0.85], paint: [[30, 30, 34], [150, 30, 36]] }
  };
  var MIX = ((window.INTELLITWIN_CONFIG || {}).vehicles || {}).mix || [{ id: 'car', label: 'Cars', share: 1 }];
  var mixTotal = MIX.reduce(function (s, m) { return s + m.share; }, 0) || 1;
  function typeOf(h, roadClass) {
    var acc = 0;
    for (var i = 0; i < MIX.length; i++) {
      acc += MIX[i].share / mixTotal;
      if (h < acc) { return (MIX[i].id === 'lorry' && roadClass >= 4) ? 'van' : (SHAPE[MIX[i].id] ? MIX[i].id : 'car'); }   // no lorries on the smallest streets
    }
    return 'car';
  }

  function hash01(a, b) {
    var h = (Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 1597334677)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  // Cumulative length along an edge's path in metres, cached on the edge.
  function prepare(e, kx, ky) {
    if (e._cum) { return; }
    var cum = [0];
    for (var i = 1; i < e.path.length; i++) {
      cum.push(cum[i - 1] + Math.hypot((e.path[i][0] - e.path[i - 1][0]) * kx, (e.path[i][1] - e.path[i - 1][1]) * ky));
    }
    e._cum = cum; e._len = cum[cum.length - 1] || 1;
  }

  /* o: { edges, visible (edge indices), occ(e) vehicles present, ratio(e) speed ÷ limit,
   *      progress (Float32Array per edge, 0–1), simDt (simulated seconds since the last frame), lat } */
  function build(o) {
    var kx = 111320 * Math.cos(o.lat * Math.PI / 180), ky = 110570, cars = [];
    var count = o.visible ? o.visible.length : o.edges.length, max = o.max || MAX_CARS;
    for (var v = 0; v < count && cars.length < max; v++) {
      var ei = o.visible ? o.visible[v] : v, e = o.edges[ei], present = o.occ(ei);
      if (!present) { continue; }
      prepare(e, kx, ky);
      var speed = e.s / 3.6 * o.ratio(ei);
      o.progress[ei] = (o.progress[ei] + speed * o.simDt / e._len) % 1;
      var n = Math.floor(present) + (hash01(ei, 991) < present - Math.floor(present) ? 1 : 0);
      n = Math.min(n, Math.max(1, Math.floor(e._len * e.l / 7)));
      for (var k = 0; k < n; k++) {
        var f = ((k + hash01(ei, k) * 0.6) / n + o.progress[ei]) % 1, s = f * e._len, j = 1;
        while (j < e._cum.length - 1 && e._cum[j] < s) { j++; }
        var a = e.path[j - 1], b = e.path[j], seg = (e._cum[j] - e._cum[j - 1]) || 1, t = (s - e._cum[j - 1]) / seg;
        var dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky, dl = Math.hypot(dx, dy) || 1;
        var lane = (k % e.l) - (e.l - 1) / 2, off = lane * LANE_M;       // metres to the right of the centre line
        cars.push({
          p: [a[0] + (b[0] - a[0]) * t + (dy / dl) * off / kx, a[1] + (b[1] - a[1]) * t - (dx / dl) * off / ky, 0],
          yaw: Math.atan2(dy, dx) * 180 / Math.PI,
          c: null, s: null, type: ''
        });
        var car = cars[cars.length - 1], ty = typeOf(hash01(ei * 17 + k, 77), e.c), sh = SHAPE[ty];
        car.type = ty; car.s = sh.scale; car.c = sh.paint[Math.floor(hash01(ei * 31 + k, 5) * sh.paint.length)];
      }
    }
    return cars;
  }

  root.TwinCars = { MESH: MESH, build: build, MIN_ZOOM: 14.3, MIX: MIX, mixTotal: mixTotal };
})(window);
