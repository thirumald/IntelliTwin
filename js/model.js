/* IntelliTwin traffic model — synthetic, deterministic, runs entirely in the browser.
 * Corridor alignments are schematic and all volumes are illustrative assumptions.
 */
(function (root) {
  'use strict';

  // lng, lat — schematic alignments of major Abu Dhabi corridors (approximate).
  var CORRIDORS = [
    { id: 'corniche', name: 'Corniche Road', ar: 'شارع الكورنيش', ff: 60, cap: 5400, load: 0.78, bias: 0.05,
      path: [[54.3225, 24.4705], [54.3330, 24.4790], [54.3470, 24.4880], [54.3610, 24.4960], [54.3740, 24.5010]] },
    { id: 'szbs', name: 'Sheikh Zayed bin Sultan St', ar: 'شارع الشيخ زايد بن سلطان', ff: 80, cap: 7200, load: 0.95, bias: 0.30,
      path: [[54.3800, 24.4985], [54.3900, 24.4850], [54.4050, 24.4680], [54.4250, 24.4500], [54.4500, 24.4330], [54.4800, 24.4200], [54.5000, 24.4100]] },
    { id: 'khaleej', name: 'Al Khaleej Al Arabi St', ar: 'شارع الخليج العربي', ff: 80, cap: 7200, load: 0.88, bias: 0.25,
      path: [[54.3300, 24.4720], [54.3500, 24.4520], [54.3750, 24.4300], [54.4050, 24.4080], [54.4400, 24.3900], [54.4700, 24.3700], [54.4850, 24.3650]] },
    { id: 'muroor', name: 'Sultan bin Zayed the First St', ar: 'شارع سلطان بن زايد الأول', ff: 60, cap: 5400, load: 0.90, bias: 0.20,
      path: [[54.3650, 24.4900], [54.3800, 24.4700], [54.3980, 24.4500], [54.4200, 24.4300], [54.4500, 24.4100]] },
    { id: 'airport', name: 'Sheikh Rashid bin Saeed St', ar: 'شارع الشيخ راشد بن سعيد', ff: 80, cap: 7200, load: 0.92, bias: 0.28,
      path: [[54.3560, 24.4880], [54.3720, 24.4680], [54.3900, 24.4470], [54.4130, 24.4260], [54.4450, 24.4050], [54.4750, 24.4000], [54.4950, 24.4000]] },
    { id: 'hazza', name: 'Hazza bin Zayed St', ar: 'شارع هزاع بن زايد', ff: 60, cap: 3600, load: 0.85, bias: 0.05,
      path: [[54.3600, 24.4560], [54.3780, 24.4680], [54.3950, 24.4790]] },
    { id: 'reem', name: 'Al Reem Island Link', ar: 'وصلة جزيرة الريم', ff: 60, cap: 3600, load: 0.97, bias: 0.35,
      path: [[54.4100, 24.5000], [54.4000, 24.4950], [54.3900, 24.4850]] },
    { id: 'e12', name: 'Sheikh Khalifa bin Zayed Hwy (E12)', ar: 'طريق الشيخ خليفة بن زايد', ff: 120, cap: 9000, load: 0.62, bias: 0.20,
      path: [[54.6000, 24.4900], [54.5700, 24.5050], [54.5000, 24.5300], [54.4400, 24.5350], [54.4100, 24.5200], [54.3880, 24.4950]] },
    { id: 'e10', name: 'Sheikh Zayed bin Sultan Rd (E10)', ar: 'طريق الشيخ زايد بن سلطان', ff: 120, cap: 9000, load: 0.80, bias: 0.30,
      path: [[54.6800, 24.5200], [54.6300, 24.4800], [54.5900, 24.4500], [54.5400, 24.4300], [54.5000, 24.4100]] },
    { id: 'e22', name: 'Abu Dhabi – Al Ain Rd (E22)', ar: 'طريق أبوظبي – العين', ff: 120, cap: 9000, load: 0.74, bias: 0.30,
      path: [[54.6300, 24.3500], [54.5800, 24.3700], [54.5300, 24.3850], [54.4950, 24.4000]] },
    { id: 'mussafah', name: 'Mussafah Rd (E30)', ar: 'طريق المصفح', ff: 100, cap: 7200, load: 0.90, bias: -0.25,
      path: [[54.5600, 24.3300], [54.5300, 24.3400], [54.5050, 24.3500], [54.4850, 24.3650]] }
  ];

  var R = 6371; // km
  function haversine(a, b) {
    var toRad = Math.PI / 180;
    var dLat = (b[1] - a[1]) * toRad, dLng = (b[0] - a[0]) * toRad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  CORRIDORS.forEach(function (c) {
    c.seg = [];
    c.km = 0;
    for (var i = 1; i < c.path.length; i++) {
      var d = haversine(c.path[i - 1], c.path[i]);
      c.seg.push(d);
      c.km += d;
    }
  });

  function bump(t, mu, sigma) {
    var d = t - mu;
    return Math.exp(-(d * d) / (2 * sigma * sigma));
  }

  // Share of peak demand at hour-of-day t (0–24). AM peak ~07:30, midday shoulder, PM peak ~18:00.
  // dir: +1 = towards the city centre (path order is outer → inner for radial roads), -1 = outbound.
  function demandShare(t, bias, dir) {
    t = ((t % 24) + 24) % 24;
    var am = bump(t, 7.5, 1.1), pm = bump(t, 18, 1.5), mid = bump(t, 13, 2.4);
    var night = 0.07;
    var amW = 1 + dir * bias, pmW = 1 - dir * bias;
    return night + 0.88 * am * amW + 0.42 * mid + 0.86 * pm * pmW;
  }

  var DEFAULT_SCENARIO = { demand: 1, incident: null, rain: false };

  // State of one corridor direction at time t under a scenario. BPR volume-delay function.
  function linkState(c, dir, t, sc) {
    sc = sc || DEFAULT_SCENARIO;
    var lanesCap = c.cap, ff = c.ff;
    if (sc.rain) { lanesCap *= 0.85; ff *= 0.9; }
    if (sc.incident === c.id) { lanesCap *= 0.5; }
    var vol = c.load * c.cap * demandShare(t, c.bias, dir) * (sc.demand || 1);
    // Traffic diverted away from an incident adds a little load elsewhere.
    if (sc.incident && sc.incident !== c.id) { vol *= 1.06; }
    var vc = vol / lanesCap;
    var speed = ff / (1 + 0.6 * Math.pow(vc, 4));
    speed = Math.max(speed, 6);
    return {
      volume: vol,                 // veh/h
      vc: vc,                      // volume / capacity
      speed: speed,                // km/h
      ratio: speed / c.ff,         // share of free-flow speed
      minutes: (c.km / speed) * 60,
      delay: (c.km / speed - c.km / c.ff) * 60,
      density: vol / speed         // veh/km
    };
  }

  function corridorState(c, t, sc) {
    var a = linkState(c, 1, t, sc), b = linkState(c, -1, t, sc);
    var worst = a.speed <= b.speed ? a : b;
    return { inbound: a, outbound: b, worst: worst, worstDir: a.speed <= b.speed ? 1 : -1 };
  }

  function networkState(t, sc) {
    var vkt = 0, vht = 0, vhtFree = 0, onRoad = 0, rows = [];
    CORRIDORS.forEach(function (c) {
      var s = corridorState(c, t, sc);
      [s.inbound, s.outbound].forEach(function (l) {
        vkt += l.volume * c.km;
        vht += l.volume * c.km / l.speed;
        vhtFree += l.volume * c.km / c.ff;
        onRoad += l.density * c.km;
      });
      rows.push({ corridor: c, state: s });
    });
    var avgSpeed = vkt / vht;
    return {
      rows: rows,
      avgSpeed: avgSpeed,
      congestion: (vht / vhtFree - 1) * 100,   // % extra travel time vs free flow
      vehicles: Math.round(onRoad),
      delayHours: vht - vhtFree                 // vehicle-hours of delay per hour
    };
  }

  function level(ratio) {
    if (ratio >= 0.8) return 'free';
    if (ratio >= 0.6) return 'moderate';
    if (ratio >= 0.4) return 'heavy';
    return 'severe';
  }

  // Position at fraction f (0–1) along a corridor path.
  function pointAt(c, f) {
    var target = Math.min(Math.max(f, 0), 1) * c.km, acc = 0;
    for (var i = 0; i < c.seg.length; i++) {
      if (acc + c.seg[i] >= target || i === c.seg.length - 1) {
        var k = c.seg[i] ? (target - acc) / c.seg[i] : 0;
        var p = c.path[i], q = c.path[i + 1];
        return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
      }
      acc += c.seg[i];
    }
    return c.path[c.path.length - 1];
  }

  var api = {
    CORRIDORS: CORRIDORS,
    DEFAULT_SCENARIO: DEFAULT_SCENARIO,
    demandShare: demandShare,
    linkState: linkState,
    corridorState: corridorState,
    networkState: networkState,
    level: level,
    pointAt: pointAt
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.TwinModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
