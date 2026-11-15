/* IntelliTwin environmental sensors.
 *
 * Example roadside sensors measuring air quality (PM2.5, PM10, NO2, CO, O3), noise, temperature
 * and humidity. Unless real sensors are listed in config.js, both the sensor positions and every
 * reading are SYNTHETIC: readings are generated from the synthetic traffic around each sensor, a
 * daily background pattern and a small repeatable variation. They show how the monitoring works
 * and are not measurements. See docs/environment.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, state = T.state;
  var EN = CFG.environment, sensors = [], show = true, kx = 111320 * Math.cos(24.4 * Math.PI / 180), ky = 110570;
  // Air-quality bands by index value; colours are the reserved status colours.
  var BANDS = [
    { max: 50, label: 'Good', color: [12, 163, 12], css: '#0ca30c' },
    { max: 100, label: 'Moderate', color: [250, 178, 25], css: '#fab219' },
    { max: 150, label: 'Unhealthy for sensitive groups', color: [236, 131, 90], css: '#ec835a' },
    { max: 1e9, label: 'Unhealthy', color: [208, 59, 59], css: '#d03b3b' }
  ];
  function band(aqi) { for (var i = 0; i < BANDS.length; i++) { if (aqi <= BANDS[i].max) { return BANDS[i]; } } return BANDS[BANDS.length - 1]; }

  function hash01(a, b) { var h = (Math.imul(a + 3, 2654435761) ^ Math.imul(b + 11, 1597334677)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }
  // Index from a concentration, by linear interpolation between breakpoints (US EPA style, 24-hour PM bands used as a guide).
  function subIndex(c, pts) {
    for (var i = 1; i < pts.length; i++) { if (c <= pts[i][0]) { return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (c - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); } }
    return pts[pts.length - 1][1];
  }
  var PM25 = [[0, 0], [12, 50], [35.4, 100], [55.4, 150], [150.4, 200], [250.4, 300]], PM10 = [[0, 0], [54, 50], [154, 100], [254, 150], [354, 200], [424, 300]];
  var NO2 = [[0, 0], [100, 50], [188, 100], [677, 150], [1220, 200]];           // µg/m³, 1-hour

  // Road-traffic noise at 10 m from the kerb (CoRTN basic level and speed/heavy-vehicle correction), as LAeq ≈ L10 − 3.
  function noiseDb(flowVehH, speedKmh, heavyPct) {
    var q = Math.max(30, flowVehH), v = Math.max(15, speedKmh);
    return 42.2 + 10 * Math.log10(q) + 33 * Math.log10(v + 40 + 500 / v) + 10 * Math.log10(1 + 5 * heavyPct / v) - 68.8 - 3;
  }
  function heavyPct() {
    var mix = window.TwinCars.MIX, tot = window.TwinCars.mixTotal, h = 0;
    mix.forEach(function (m) { if (m.id === 'lorry' || m.id === 'bus') { h += m.share; } });
    return 100 * h / tot;
  }

  function setup() {
    var edges = C.edges(), names = C.names(), cell = 0.005, grid = {};
    edges.forEach(function (e, i) { var p = e.path[e.path.length >> 1], k = Math.floor(p[0] / cell) + ':' + Math.floor(p[1] / cell); (grid[k] = grid[k] || []).push(i); });
    var list = (EN.sensors || []).map(function (s, i) { return { id: s.id || 'ENV-' + (i + 1), name: s.name || 'Sensor ' + (i + 1), lon: s.lon, lat: s.lat, real: true }; });
    if (!list.length) {
      // Synthetic sensors: one beside each of the longest named roads, spread out by at least 2.5 km.
      var roads = C.groups().slice().sort(function (a, b) { return b.m - a.m; });
      for (var r = 0; r < roads.length && list.length < EN.syntheticSensors; r++) {
        var e = edges[roads[r].idx[Math.floor(roads[r].idx.length / 2)]], p = e.path[e.path.length >> 1];
        if (list.every(function (s) { return Math.hypot((s.lon - p[0]) * kx, (s.lat - p[1]) * ky) > 2500; })) {
          list.push({ id: 'ENV-' + String(list.length + 1).padStart(2, '0'), name: roads[r].name, lon: p[0], lat: p[1], real: false });
        }
      }
    }
    sensors = list.map(function (s, n) {
      var gx = Math.floor(s.lon / cell), gy = Math.floor(s.lat / cell), near = [];
      for (var dx = -1; dx <= 1; dx++) { for (var dy = -1; dy <= 1; dy++) { (grid[(gx + dx) + ':' + (gy + dy)] || []).forEach(function (i) {
        var q = edges[i].path[edges[i].path.length >> 1]; if (Math.hypot((q[0] - s.lon) * kx, (q[1] - s.lat) * ky) <= EN.radiusM) { near.push(i); }
      }); } }
      s.n = n; s.edges = near; return s;
    });
  }

  // Synthetic reading of one sensor at time t (seconds of the day).
  function readingAt(s, t) {
    var edges = C.edges(), bin = C.binAt(t), veh = 0, slow = 0, flow = 0, spd = 0;
    s.edges.forEach(function (i) {
      var o = C.occAt(bin, i); if (!o) { return; }
      var r = C.ratioAt(bin, i), v = edges[i].s * r;
      veh += o; slow += o * (1 - r); flow += o * (v / 3.6) / Math.max(25, edges[i].m) * 3600; spd += o * v;
    });
    var meanSpeed = veh ? spd / veh : 60, meanFlow = s.edges.length ? flow / Math.max(1, s.edges.length) * 2 : 0;       // both directions
    var load = Math.min(1.6, (veh + 2 * slow) / 260);                           // traffic intensity around the sensor, 0 to about 1.6
    var h = t / 3600, slot = Math.floor(t / 300), jit = function (k) { return 1 + (hash01(s.n * 31 + k, slot + hash(state.date)) - 0.5) * 0.16; };
    var temp = 26 + 6 * Math.sin((h - 9) / 24 * 2 * Math.PI), sun = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));
    var pm25 = (16 + 34 * load) * jit(1), pm10 = (48 + 70 * load) * jit(2), no2 = (14 + 85 * load) * jit(3), co = (0.3 + 1.6 * load) * jit(4);
    var o3 = Math.max(8, (30 + 70 * sun - 0.25 * no2)) * jit(5), db = noiseDb(meanFlow, meanSpeed, heavyPct()) + (hash01(s.n, slot) - 0.5) * 1.5;
    var aqi = Math.max(subIndex(pm25, PM25), subIndex(pm10, PM10), subIndex(no2, NO2));
    return { pm25: pm25, pm10: pm10, no2: no2, co: co, o3: o3, noise: veh ? db : 42 + 6 * load, temp: temp + (hash01(s.n, 9) - 0.5) * 1.5, humidity: Math.max(25, Math.min(90, 62 - 2.2 * (temp - 26) + (hash01(s.n, 7) - 0.5) * 8)),
      aqi: aqi, band: band(aqi), vehicles: veh };
  }
  function hash(str) { var x = 2166136261; for (var i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0) % 100000; }

  function averageAt(t) {
    var out = { pm25: 0, pm10: 0, no2: 0, co: 0, o3: 0, noise: 0, aqi: 0 }, n = sensors.length || 1;
    sensors.forEach(function (s) { var r = readingAt(s, t); Object.keys(out).forEach(function (k) { out[k] += r[k] / n; }); });
    return out;
  }

  function popup(s) {
    var r = readingAt(s, state.t);
    C.showPopup([s.lon, s.lat], s.id + ' · ' + s.name, [
      ['Air quality index', Math.round(r.aqi) + ' · ' + r.band.label], ['PM2.5', r.pm25.toFixed(0) + ' µg/m³'], ['PM10', r.pm10.toFixed(0) + ' µg/m³'],
      ['NO₂', r.no2.toFixed(0) + ' µg/m³'], ['CO', r.co.toFixed(1) + ' mg/m³'], ['O₃', r.o3.toFixed(0) + ' µg/m³'],
      ['Noise', r.noise.toFixed(0) + ' dB(A)'], ['Temperature · humidity', r.temp.toFixed(0) + ' °C · ' + r.humidity.toFixed(0) + '%']
    ], (s.real ? 'Sensor position from config.js' : 'Synthetic sensor') + ' · synthetic readings at ' + C.clock(state.t));
  }

  function render() {
    if (!sensors.length) { return; }
    var rows = sensors.map(function (s) { return { s: s, r: readingAt(s, state.t) }; }), avg = averageAt(state.t);
    $('eAqi').textContent = Math.round(avg.aqi); $('eNoise').innerHTML = avg.noise.toFixed(0) + '<small>dB(A)</small>'; $('ePm').innerHTML = avg.pm25.toFixed(0) + '<small>µg/m³</small>';
    $('eNo2').innerHTML = avg.no2.toFixed(0) + '<small>µg/m³</small>';
    $('envNote').textContent = sensors.length + ' sensors · ' + band(avg.aqi).label;
    var ol = $('envList'); ol.innerHTML = '';
    rows.sort(function (a, b) { return b.r.aqi - a.r.aqi; }).slice(0, 12).forEach(function (row) {
      var cls = row.r.aqi > 150 ? 'zone-alert' : row.r.aqi > 100 ? 'heavy' : row.r.aqi > 50 ? 'zone-watch' : 'zone-ok';
      ol.appendChild(C.listButton(cls, row.s.id + ' · ' + row.s.name, row.r.band.label + ' · PM2.5 ' + row.r.pm25.toFixed(0) + ' · NO₂ ' + row.r.no2.toFixed(0) + ' · ' + row.r.noise.toFixed(0) + ' dB(A)',
        Math.round(row.r.aqi) + '<small>AQI</small>', function () { C.flyTo(row.s.lon, row.s.lat, 15); popup(row.s); }));
    });
  }

  C.addLayers(function () {
    if (!show || !sensors.length) { return []; }
    var stamp = Math.floor(state.t / 300) + ':' + state.scenario + ':' + state.date;
    return [new deck.ScatterplotLayer({
      id: 'env-sensors', data: sensors, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
      getPosition: function (s) { return [s.lon, s.lat]; }, getRadius: 7, getLineColor: [255, 255, 255], getLineWidth: 2,
      getFillColor: function (s) { return readingAt(s, state.t).band.color.concat([255]); }, updateTriggers: { getFillColor: stamp },
      onClick: function (info) { if (info.object) { popup(info.object); } }
    })];
  });

  C.onReady(function () {
    setup(); render();
    $('showEnv').addEventListener('change', function (e) { show = e.target.checked; C.redraw(); });
    C.onMinute(render);
  });

  T.environment = {
    sensors: function () { return sensors; }, readingAt: readingAt, averageAt: averageAt, bands: BANDS, band: band, noiseDb: noiseDb, heavyPct: heavyPct,
    // Sensors over the alert thresholds, used by the alert list.
    alerts: function () {
      var out = [];
      sensors.forEach(function (s) {
        var r = readingAt(s, state.t);
        if (r.aqi > EN.alertAqiAbove) { out.push({ s: s, text: 'Air quality ' + Math.round(r.aqi) + ' (' + r.band.label + ')', sev: 2 }); }
        else if (r.noise > EN.alertNoiseAboveDb) { out.push({ s: s, text: 'Noise ' + r.noise.toFixed(0) + ' dB(A)', sev: 1 }); }
      });
      return out;
    },
    open: function (s) { C.flyTo(s.lon, s.lat, 15); popup(s); }
  };
})();
