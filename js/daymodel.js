/* IntelliTwin synthetic day.
 *
 * The SUMO simulation covers one weekday morning (06:30–10:00). There is no live feed and no
 * recorded history. To offer a full 24 hours and any date, this module builds a SYNTHETIC day:
 * for each 5-minute slot it picks the simulated traffic state whose network load matches an
 * assumed daily demand curve for that kind of day. The road-by-road speeds and counts therefore
 * come from the simulation, but the time of day they are shown at is assumed. The afternoon peak
 * reuses morning states, so its direction of travel is not reversed. See docs/methodology.md.
 */
(function (root) {
  'use strict';
  var SLOT = 300, SLOTS = 288;

  function g(h, mu, sigma) { var d = h - mu; return Math.exp(-d * d / (2 * sigma * sigma)); }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Assumed share of peak network load by hour of day, for three kinds of day.
  function level(h, type) {
    var v;
    if (type === 'weekend') {
      v = 0.05 + 0.32 * g(h, 11.5, 2.2) + 0.62 * g(h, 18.5, 2.6) + 0.28 * g(h, 22, 1.4);
    } else if (type === 'short') {       // Friday
      v = 0.05 + 0.68 * g(h, 7.8, 1.2) + 0.55 * g(h, 11.6, 0.9) + 0.6 * g(h, 17.5, 2.4) + 0.3 * g(h, 21.5, 1.5);
    } else {
      v = 0.04 + 0.96 * g(h, 7.9, 1.25) + 0.5 * g(h, 13, 2.6) + 0.9 * g(h, 18, 1.7) + 0.22 * g(h, 21.3, 1.4);
    }
    return Math.min(1, v);
  }

  function dayType(iso, cfg) {
    var d = new Date(iso + 'T12:00:00Z'), wd = isNaN(d) ? 2 : d.getUTCDay();
    if ((cfg.weekendDays || [6, 0]).indexOf(wd) >= 0) { return 'weekend'; }
    return wd === cfg.shortDay ? 'short' : 'weekday';
  }
  var TYPE_LABEL = { weekday: 'working day', short: 'Friday', weekend: 'weekend' };

  /* bins: per-bin KPIs of one scenario from meta.json. Returns the simulated bin for each slot. */
  function build(bins, iso, cfg) {
    var type = dayType(iso, cfg), r = rng(hash('day:' + iso));
    // The simulated morning's build-up (first bin to its busiest bin before 09:00) is the ladder of states.
    var top = 0, limit = Math.min(bins.length, 30);
    for (var i = 1; i < limit; i++) { if (bins[i].vehicles > bins[top].vehicles) { top = i; } }
    var peak = bins[top].vehicles || 1, dayFactor = 0.93 + r() * 0.14, map = new Uint8Array(SLOTS), lv = new Float32Array(SLOTS), wobble = 0;
    for (var s = 0; s < SLOTS; s++) {
      wobble = wobble * 0.85 + (r() - 0.5) * 0.03;                   // slow day-to-day variation
      var L = Math.max(0, Math.min(1, level((s + 0.5) * SLOT / 3600, type) * dayFactor + wobble));
      var target = L * peak, best = 0, diff = Infinity;
      for (var b = 0; b <= top; b++) { var dd = Math.abs(bins[b].vehicles - target); if (dd < diff) { diff = dd; best = b; } }
      map[s] = best; lv[s] = L;
    }
    return { map: map, level: lv, type: type, typeLabel: TYPE_LABEL[type], date: iso };
  }

  root.TwinDay = { SLOT: SLOT, SLOTS: SLOTS, build: build, dayType: dayType, level: level };
})(window);
