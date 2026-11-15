/* IntelliTwin illustrative events.
 *
 * Accidents and traffic fines shown in the app are NOT real records. No accident or enforcement
 * data is public for Abu Dhabi. They are generated here, deterministically, from the simulated
 * traffic so that the dashboard has something to show: accidents are placed in proportion to
 * vehicle-kilometres (more where traffic is slow), and violations are drawn at fixed "enforcement
 * sites" in proportion to the simulated flow passing them. See docs/methodology.md, section 10.
 */
(function (root) {
  'use strict';

  // Fine values are placeholders for the demo, not the official tariff.
  var TYPES = [
    { id: 'speed', label: 'Speeding', aed: 600 },
    { id: 'red', label: 'Red light', aed: 1000 },
    { id: 'lane', label: 'Lane discipline', aed: 400 },
    { id: 'phone', label: 'Phone use', aed: 800 },
    { id: 'belt', label: 'Seat belt', aed: 400 },
    { id: 'tail', label: 'Tailgating', aed: 400 }
  ];
  var SEVERITY = [['Damage only', 0.78], ['Minor injury', 0.17], ['Serious injury', 0.05]];
  var ACCIDENTS_BASE = 45;     // illustrative count for the typical weekday, 06:30–10:00
  var SITE_COUNT = 60;

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {             // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poisson(r, lam) {
    if (lam <= 0) { return 0; }
    if (lam < 30) {
      var L = Math.exp(-lam), k = 0, p = 1;
      do { k++; p *= r(); } while (p > L);
      return k - 1;
    }
    var u = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    return Math.max(0, Math.round(lam + Math.sqrt(lam) * u));
  }
  function pointOn(path, f) {
    var j = Math.min(path.length - 2, Math.floor(f * (path.length - 1))), k = f * (path.length - 1) - j;
    return [path[j][0] + (path[j + 1][0] - path[j][0]) * k, path[j][1] + (path[j + 1][1] - path[j][1]) * k];
  }

  // calib is shared between scenarios: the first (typical weekday) call fixes the accident rate
  // and the enforcement sites, so other demand cases are comparable with it.
  function generate(meta, edges, names, d, id, calib) {
    var n = edges.length, B = meta.bins, binSec = meta.bin_seconds, b, i;
    function ratio(bin, e) { var v = d.speed[bin * n + e]; return v === 255 ? 1 : v / 100; }

    /* ---- accidents ---- */
    var r = rng(hash('accidents:' + id)), binW = new Float64Array(B), total = 0;
    function weight(bin, e) {
      var o = d.occ[bin * n + e];
      if (!o) { return 0; }
      var q = ratio(bin, e);
      return o * 10 * (edges[e].s * q / 3600) * (1 + 2 * (1 - q));    // vehicle-km, weighted up when slow
    }
    for (b = 0; b < B; b++) { for (i = 0; i < n; i++) { binW[b] += weight(b, i); } total += binW[b]; }
    if (calib.accidentRate == null) { calib.accidentRate = total ? ACCIDENTS_BASE / total : 0; }
    var count = Math.round(calib.accidentRate * total), accidents = [];
    for (var k = 0; k < count; k++) {
      var x = r() * total, bin = 0;
      while (bin < B - 1 && x > binW[bin]) { x -= binW[bin]; bin++; }
      var y = r() * binW[bin], e = 0, acc = 0;
      for (i = 0; i < n; i++) { acc += weight(bin, i); if (acc >= y) { e = i; break; } }
      var s = r(), sev = SEVERITY[0][0], c = 0;
      for (i = 0; i < SEVERITY.length; i++) { c += SEVERITY[i][1]; if (s <= c) { sev = SEVERITY[i][0]; break; } }
      var pos = pointOn(edges[e].path, r());
      accidents.push({
        t: (bin + r()) * binSec, dur: 900 + r() * 1800, lon: pos[0], lat: pos[1],
        road: names[edges[e].n] || 'Unnamed road', severity: sev, edge: e
      });
    }
    accidents.sort(function (a, z) { return a.t - z.t; });

    /* ---- enforcement sites and violations ---- */
    if (!calib.sites) {
      var tot = new Float64Array(n);
      for (b = 0; b < B; b++) { for (i = 0; i < n; i++) { tot[i] += d.occ[b * n + i]; } }
      var cand = [];
      for (i = 0; i < n; i++) { if (edges[i].c <= 3 && !edges[i].k && names[edges[i].n] && edges[i].m >= 150) { cand.push(i); } }
      cand.sort(function (a, z) { return tot[z] / edges[z].m - tot[a] / edges[a].m; });
      var perRoad = {}, sites = [];
      for (i = 0; i < cand.length && sites.length < SITE_COUNT; i++) {
        var nm = edges[cand[i]].n;
        perRoad[nm] = (perRoad[nm] || 0) + 1;
        if (perRoad[nm] <= 2) { sites.push(cand[i]); }
      }
      calib.sites = sites;
    }
    var r2 = rng(hash('fines:' + id)), cumByType = TYPES.map(function () { return new Float64Array(B + 1); });
    var siteRows = calib.sites.map(function (ei) {
      var ed = edges[ei], pos2 = pointOn(ed.path, 0.5), cum = new Float64Array(B + 1), byType = TYPES.map(function () { return 0; });
      for (var bb = 0; bb < B; bb++) {
        var o = d.occ[bb * n + ei], q = ratio(bb, ei);
        var flow = o ? o * 10 * (ed.s / 3.6 * Math.max(q, 0.05)) / ed.m : 0;    // vehicles passing in the bin
        var lam = [
          flow * 0.006 * (q >= 0.85 ? 1 : q >= 0.6 ? 0.25 : 0.03),
          ed.c >= 2 ? flow * 0.0008 : 0,
          flow * 0.0010 * (q < 0.6 ? 1.5 : 1),
          flow * 0.0007,
          flow * 0.0005,
          flow * 0.0008 * (q < 0.8 && q > 0.4 ? 1.6 : 1)
        ];
        var sum = 0;
        for (var t = 0; t < TYPES.length; t++) {
          var cnt = poisson(r2, lam[t]);
          sum += cnt; byType[t] += cnt; cumByType[t][bb + 1] += cnt;
        }
        cum[bb + 1] = cum[bb] + sum;
      }
      return { edge: ei, lon: pos2[0], lat: pos2[1], road: names[ed.n], cum: cum, byType: byType };
    });
    cumByType.forEach(function (arr) { for (var q2 = 1; q2 <= B; q2++) { arr[q2] += arr[q2 - 1]; } });

    return { accidents: accidents, sites: siteRows, cumByType: cumByType };
  }

  // Value of a cumulative-per-bin array at simulated time t (seconds since the simulation began).
  function at(cum, t, binSec) {
    var x = Math.max(0, Math.min(cum.length - 1, t / binSec)), j = Math.min(cum.length - 2, Math.floor(x));
    return cum[j] + (cum[j + 1] - cum[j]) * (x - j);
  }

  root.TwinEvents = { TYPES: TYPES, generate: generate, at: at };
})(window);
