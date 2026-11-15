/* IntelliTwin — replays the SUMO pipeline output in data/ with MapLibre and deck.gl. */
(function () {
  'use strict';

  var RGB = { free: [45, 212, 167], moderate: [245, 197, 66], heavy: [245, 138, 66], severe: [239, 75, 90] };
  var LEVEL_LABEL = { free: 'Free flow', moderate: 'Moderate', heavy: 'Heavy', severe: 'Severe' };
  var CLASS_NAME = ['Motorway', 'Trunk road', 'Primary road', 'Secondary road', 'Tertiary road'];
  var CLASS_WIDTH = [16, 14, 11, 9, 7];           // metres
  var $ = function (id) { return document.getElementById(id); };

  // Major sites for quick navigation: [name, lon, lat, zoom]. Locations are approximate.
  var SITES = [
    ['Downtown', 54.3570, 24.4870, 14],
    ['Corniche', 54.3400, 24.4750, 14],
    ['Qasr Al Hosn', 54.3545, 24.4823, 15],
    ['Emirates Palace', 54.3170, 24.4615, 14.5],
    ['Qasr Al Watan', 54.3050, 24.4625, 14.5],
    ['Etihad Towers', 54.3215, 24.4585, 15],
    ['Al Maryah Island', 54.3900, 24.5020, 14.5],
    ['Al Reem Island', 54.4050, 24.4980, 14],
    ['Mina Zayed', 54.3780, 24.5220, 14],
    ['Saadiyat Island', 54.3983, 24.5338, 13.5],
    ['ADNEC', 54.4370, 24.4180, 14.5],
    ['Sheikh Zayed Grand Mosque', 54.4750, 24.4128, 14.5],
    ['Sheikh Zayed Bridge', 54.4970, 24.4190, 14.5],
    ['Mussafah', 54.5000, 24.3550, 13],
    ['Mohamed Bin Zayed City', 54.5450, 24.3400, 13.5],
    ['Khalifa City', 54.5770, 24.4200, 13],
    ['Masdar City', 54.6170, 24.4290, 14],
    ['Yas Island', 54.6031, 24.4672, 13.5],
    ['Zayed International Airport', 54.6511, 24.4330, 13]
  ];

  function level(r) { return r >= 0.8 ? 'free' : r >= 0.6 ? 'moderate' : r >= 0.4 ? 'heavy' : 'severe'; }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }
  function clock(sec) {
    var m = Math.floor(sec / 60), h = Math.floor(m / 60) % 24; m = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(url); } return r.json(); }); }
  function getBuf(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(url); } return r.arrayBuffer(); }); }

  // Binary trajectories: uint32 count, uint32 offsets[count + 1], float32 (lon, lat, t)[points].
  function parsePaths(buf) {
    var n = new DataView(buf).getUint32(0, true);
    var off = new Uint32Array(buf.slice(4, 4 + 4 * (n + 1)));
    var f = new Float32Array(buf.slice(4 + 4 * (n + 1)));
    var out = [];
    for (var i = 0; i < n; i++) {
      var path = [], ts = [];
      for (var k = off[i]; k < off[i + 1]; k++) { path.push([f[3 * k], f[3 * k + 1]]); ts.push(f[3 * k + 2]); }
      out.push({ path: path, ts: ts });
    }
    return out;
  }

  var meta, edges = [], names = [], groups = [], scen = {}, buses = null, buildings = null;
  var map = null, overlay = null, popup = null, vectorBase = false;
  var carProgress = null, simDt = 0, prevT = 0, visibleEdges = [], visibleKey = '';
  var state = { t: 0, playing: true, rate: 120, scenario: 'base', cars: true, buses: true, bld: false, acc: true, sites: true };
  var calib = {};          // shared by the illustrative accident and fine generator (js/events.js)
  var E = window.TwinEvents;
  var t0 = 0, t1 = 0;      // display window, seconds since the simulation began

  /* ---------- live and historical modes ---------- */
  // The model holds one simulated morning. "Live" shows today's date and the current Abu Dhabi time and,
  // inside the modelled hours, follows the clock. "Historical" lets the user pick a date and a 24-hour time.
  // Neither is recorded data: both replay the simulated morning, and the note on screen says so.
  var TZ = 'Asia/Dubai', mode = 'live', histDate = '', outsideNote = '';
  function dubaiNow() {
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    var iso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return { tod: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second), hm: p.hour + ':' + p.minute, date: p.weekday + ' ' + p.day + ' ' + p.month + ' ' + p.year, iso: iso };
  }
  function prettyDate(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    return isNaN(d) ? iso : new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(d).replace(',', '');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function windowText() { return clock(meta.display_begin) + '–' + clock(meta.sim_end); }
  function setMode(m) {
    mode = m;
    Array.prototype.forEach.call($('mode').children, function (b) {
      var on = b.getAttribute('data-mode') === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('histControls').hidden = m !== 'hist';
    if (m === 'hist' && !histDate) { histDate = dubaiNow().iso; $('hDate').value = histDate; }
    outsideNote = '';
    updateModeUI(true);
  }
  // Jump the model to a time of day (seconds after midnight); outside the modelled hours the nearest time is used.
  function jumpToTimeOfDay(tod) {
    var clamped = Math.max(meta.display_begin, Math.min(meta.sim_end, tod));
    outsideNote = clamped === tod ? '' : 'No model data for ' + clock(tod) + '; showing the nearest modelled time, ' + clock(clamped) + '. ';
    state.t = clamped - meta.sim_begin; dirty = true;
  }
  var lastModeKey = '';
  function updateModeUI(force) {
    var now = dubaiNow(), simTime = clock(meta.sim_begin + state.t), key = mode + now.hm + simTime + histDate + outsideNote + state.scenario;
    if (!force && key === lastModeKey) { return; }
    lastModeKey = key;
    $('simClock').textContent = simTime;
    if (mode === 'live') {
      var inWindow = now.tod >= meta.display_begin && now.tod <= meta.sim_end;
      $('dateLabel').textContent = now.date;
      $('clock').textContent = now.hm;
      $('modeNote').textContent = (inWindow ? 'Following the Abu Dhabi clock. ' : 'It is outside the modelled hours (' + windowText() + '), so the modelled morning is replaying. ') +
        'Simulated traffic, not a live feed.';
    } else {
      $('dateLabel').textContent = prettyDate(histDate);
      $('clock').textContent = simTime;
      if (document.activeElement !== $('hHour') && document.activeElement !== $('hMin')) {
        var tod = meta.sim_begin + state.t;
        if (!outsideNote) { $('hHour').value = pad(Math.floor(tod / 3600) % 24); $('hMin').value = pad(Math.floor(tod % 3600 / 300) * 5); }
      }
      $('modeNote').textContent = outsideNote + 'No recorded history is stored yet: every date replays the modelled ' + scenarioMeta(state.scenario).label.toLowerCase() + ' (' + windowText() + ').';
    }
  }

  function scenarioMeta(id) { return meta.scenarios.filter(function (s) { return s.id === id; })[0]; }
  function binOf(t) { return Math.max(0, Math.min(meta.bins - 1, Math.floor(t / meta.bin_seconds))); }
  function ratioOf(d, bin, i) { var v = d.speed[bin * edges.length + i]; return v === 255 ? 1 : v / 100; }

  function loadScenario(id) {
    if (scen[id]) { return Promise.resolve(scen[id]); }
    return Promise.all([getBuf('data/' + id + '_speed.bin'), getBuf('data/' + id + '_occ.bin')])
      .then(function (r) {
        scen[id] = { speed: new Uint8Array(r[0]), occ: new Uint16Array(r[1]) };
        scen[id].ev = E.generate(meta, edges, names, scen[id], id, calib);
        return scen[id];
      });
  }

  /* ---------- map ---------- */
  function initMap() {
    var b = meta.bbox;
    try {
      // High-resolution vector base map built from OpenStreetMap data (OpenFreeMap, no key needed).
      // If it cannot be loaded, fall back to OpenStreetMap's standard raster tiles, dimmed for the dark theme.
      var RASTER = {
        version: 8,
        sources: { base: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#0a101c' } },
          { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': 0.9, 'raster-brightness-max': 0.42, 'raster-saturation': -0.55, 'raster-contrast': 0.1 } }
        ]
      };
      map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/dark',
        bounds: [[b[0], b[1]], [b[2], b[3]]],
        fitBoundsOptions: { padding: 10 },
        minZoom: 8, maxZoom: 19, maxPitch: 70,
        attributionControl: false
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
      var fellBack = false;
      var fallback = function () { if (!vectorBase && !fellBack) { fellBack = true; map.setStyle(RASTER); } };
      map.on('error', fallback);
      setTimeout(fallback, 8000);
      map.once('load', function () {
        if (fellBack) { return; }
        vectorBase = true;
        // Extrude OpenStreetMap buildings from the vector tiles for the 3D view.
        var sources = map.getStyle().sources, src = Object.keys(sources).filter(function (k) { return sources[k].type === 'vector'; })[0];
        if (src && !map.getLayer('itw-buildings')) {
          try {
            map.addLayer({
              id: 'itw-buildings', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 13,
              paint: {
                'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#2b3850', 60, '#42557a', 200, '#5f77a6'],
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.9
              }
            });
          } catch (err) { /* the style has no building layer: keep the flat map */ }
        }
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');
      overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
      map.addControl(overlay);
    } catch (e) {
      $('map').innerHTML = '<p style="padding:16px;color:#8fa0bd">The map needs WebGL, which is unavailable in this browser. The panels still work.</p>';
      map = null; overlay = null;
    }
  }

  function roadPopup(i, coordinate) {
    if (!map) { return; }
    var e = edges[i], d = scen[state.scenario], bin = binOf(state.t);
    var r = ratioOf(d, bin, i), occ = d.occ[bin * edges.length + i] * 10 / meta.bin_seconds;
    if (popup) { popup.remove(); }
    var box = document.createElement('div');
    box.className = 'pop';
    box.innerHTML = '<h3></h3><table>' +
      '<tr><td>Simulated speed</td><td>' + Math.round(e.s * r) + ' km/h</td></tr>' +
      '<tr><td>Speed limit in model</td><td>' + e.s + ' km/h</td></tr>' +
      '<tr><td>Vehicles on this link</td><td>' + occ.toFixed(occ < 10 ? 1 : 0) + '</td></tr>' +
      '<tr><td>Lanes · length</td><td>' + e.l + ' · ' + num(e.m) + ' m</td></tr></table>' +
      '<div class="muted">' + CLASS_NAME[e.c] + (e.k ? ' ramp' : '') + ' · ' + LEVEL_LABEL[level(r)] + ' · simulated at ' + clock(meta.sim_begin + state.t) + '</div>';
    box.querySelector('h3').textContent = names[e.n] || 'Unnamed road';
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(coordinate).setDOMContent(box).addTo(map);
  }

  function showPopup(lngLat, title, rows, note) {
    if (!map) { return; }
    if (popup) { popup.remove(); }
    var box = document.createElement('div');
    box.className = 'pop';
    box.innerHTML = '<h3></h3><table>' + rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') +
      '</table><div class="muted">' + note + '</div>';
    box.querySelector('h3').textContent = title;
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(lngLat).setDOMContent(box).addTo(map);
  }
  function accidentPopup(a) {
    var active = state.t >= a.t && state.t < a.t + a.dur;
    showPopup([a.lon, a.lat], a.road, [
      ['Reported', clock(meta.sim_begin + a.t)], ['Severity', a.severity],
      ['Status', state.t < a.t ? 'Not yet occurred' : active ? 'Active' : 'Cleared ' + clock(meta.sim_begin + a.t + a.dur)]
    ], 'Illustrative accident, not a real record');
  }
  function sitePopup(st) {
    var rows = [['Violations since 06:30', num(E.at(st.cum, state.t, meta.bin_seconds))]];
    E.TYPES.forEach(function (ty, i) { if (st.byType[i]) { rows.push([ty.label + ' (whole morning)', num(st.byType[i])]); } });
    showPopup([st.lon, st.lat], st.road, rows, 'Illustrative enforcement site, not a real camera');
  }
  function flyToPoint(lon, lat) {
    if (!map) { return; }
    orbiting = false; $('orbit').setAttribute('aria-pressed', 'false');
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14), duration: 1000 });
    if (window.matchMedia('(max-width: 860px)').matches) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  var roadLayer = null, roadKey = '', drawnSig = '';
  function buildLayers() {
    if (!overlay) { return; }
    var d = scen[state.scenario];
    if (!d) { return; }
    var bin = binOf(state.t), key = state.scenario + ':' + bin;
    // Skip the redraw when nothing visible has changed (for example while paused).
    var ctr = map.getCenter(), zoom = map.getZoom();
    var sig = [key, state.t, state.rate, state.cars, state.buses && !!buses, state.bld && !!buildings, zoom >= 11.5, state.acc, state.sites, zoom.toFixed(2), ctr.lng.toFixed(4), ctr.lat.toFixed(4)].join('|');
    if (sig === drawnSig && roadLayer) { return; }
    drawnSig = sig;
    if (key !== roadKey || !roadLayer) {
      roadKey = key;
      roadLayer = new deck.PathLayer({
        id: 'roads', data: edges, pickable: true,
        getPath: function (e) { return e.path; },
        getColor: function (e) {
          var lv = level(ratioOf(d, bin, e.i)), c = RGB[lv];
          return [c[0], c[1], c[2], lv === 'free' ? 110 : 235];
        },
        getWidth: function (e) { return CLASS_WIDTH[e.c] * (e.k ? 0.6 : 1); },
        widthUnits: 'meters', widthMinPixels: 1.2, capRounded: true, jointRounded: true,
        updateTriggers: { getColor: key },
        onClick: function (info) { if (info.object) { roadPopup(info.object.i, info.coordinate); } }
      });
    }
    var layers = [];
    if (state.bld && buildings) {
      layers.push(new deck.PolygonLayer({
        id: 'buildings', data: buildings, extruded: true, wireframe: false,
        getPolygon: function (b) { return b.ring; }, getElevation: function (b) { return b.h; },
        getFillColor: [72, 92, 128, 210], material: { ambient: 0.5, diffuse: 0.6, shininess: 8 },
        visible: map.getZoom() >= 11.5
      }));
    }
    layers.push(roadLayer);
    var trail = Math.max(12, state.rate * 0.2);
    // Vehicles: one per simulated vehicle on every link, moving at the link's simulated speed.
    // Zoomed out they are dots; at street level they are 3D cars on the links near the view centre.
    if (state.cars) {
      var n = edges.length, street = zoom >= window.TwinCars.MIN_ZOOM, list = null;
      if (street) {
        var radius = Math.min(4000, 1500 * Math.pow(2, 15.5 - zoom)), vk = [ctr.lng.toFixed(3), ctr.lat.toFixed(3), zoom.toFixed(1)].join(',');
        if (vk !== visibleKey) {
          visibleKey = vk; visibleEdges = [];
          var kx = 111320 * Math.cos(ctr.lat * Math.PI / 180), ky = 110570;
          for (var ei = 0; ei < n; ei++) {
            var mid = edges[ei].path[edges[ei].path.length >> 1];
            if (Math.hypot((mid[0] - ctr.lng) * kx, (mid[1] - ctr.lat) * ky) <= radius + edges[ei].m / 2) { visibleEdges.push(ei); }
          }
        }
        list = visibleEdges;
      }
      if (!carProgress) { carProgress = new Float32Array(n); for (var pi = 0; pi < n; pi++) { carProgress[pi] = (pi * 0.6180339887) % 1; } }
      var cars = window.TwinCars.build({
        edges: edges, visible: list, progress: carProgress, simDt: simDt, lat: ctr.lat, max: street ? 6000 : 250000,
        occ: function (e) { return d.occ[bin * n + e] * 10 / meta.bin_seconds; },
        ratio: function (e) { return ratioOf(d, bin, e); }
      });
      simDt = 0;
      if (street) {
        layers.push(new deck.SimpleMeshLayer({
          id: 'cars3d', data: cars, mesh: window.TwinCars.MESH,
          getPosition: function (c) { return c.p; }, getOrientation: function (c) { return [0, c.yaw, 0]; },
          getColor: function (c) { return c.c; },
          sizeScale: zoom >= 17 ? 1.3 : zoom >= 16 ? 2 : zoom >= 15 ? 3 : 4.5,
          material: { ambient: 0.5, diffuse: 0.65, shininess: 28, specularColor: [70, 70, 70] }
        }));
      } else {
        layers.push(new deck.ScatterplotLayer({
          id: 'cars', data: cars, radiusUnits: 'pixels',
          getPosition: function (c) { return c.p; },
          // Small and translucent when zoomed out, so the congestion colours of the roads stay readable.
          getFillColor: [255, 255, 255, zoom < 11.5 ? 110 : zoom < 13 ? 170 : 230],
          getRadius: zoom < 11.5 ? 0.6 : zoom < 13 ? 1 : 1.8,
          updateTriggers: { getFillColor: zoom < 11.5 ? 0 : zoom < 13 ? 1 : 2 }
        }));
      }
    }
    if (state.buses && buses) {
      layers.push(new deck.TripsLayer({
        id: 'buses', data: buses, getPath: function (v) { return v.path; }, getTimestamps: function (v) { return v.ts; },
        getColor: [88, 166, 255], widthMinPixels: 5, capRounded: true, jointRounded: true,
        trailLength: trail * 1.5, currentTime: state.t, fadeTrail: true
      }));
    }
    var minute = Math.floor(state.t / 60), ev = d.ev;
    if (state.sites && ev) {
      layers.push(new deck.ScatterplotLayer({
        id: 'sites', data: ev.sites, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (st) { return [st.lon, st.lat]; },
        getRadius: function (st) { return Math.min(13, 3.5 + Math.sqrt(E.at(st.cum, state.t, meta.bin_seconds)) / 3); },
        getFillColor: [181, 140, 255, 210], getLineColor: [20, 12, 40], getLineWidth: 1,
        updateTriggers: { getRadius: state.scenario + ':' + minute },
        onClick: function (info) { if (info.object) { sitePopup(info.object); } }
      }));
    }
    if (state.acc && ev) {
      var seen = ev.accidents.filter(function (a) { return a.t <= state.t; });
      layers.push(new deck.ScatterplotLayer({
        id: 'accidents', data: seen, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (a) { return [a.lon, a.lat]; },
        getRadius: function (a) { return state.t < a.t + a.dur ? 8 : 4.5; },
        getFillColor: function (a) { return state.t < a.t + a.dur ? [239, 75, 90, 255] : [239, 75, 90, 110]; },
        getLineColor: [255, 255, 255], getLineWidth: function (a) { return state.t < a.t + a.dur ? 2 : 0; },
        updateTriggers: { getRadius: minute, getFillColor: minute, getLineWidth: minute },
        onClick: function (info) { if (info.object) { accidentPopup(info.object); } }
      }));
    }
    overlay.setProps({ layers: layers });
  }

  /* ---------- panels ---------- */
  function setDelta(el, diff, unit, higherIsBad) {
    if (state.scenario === 'base' || Math.abs(diff) < 0.5) { el.textContent = ''; el.className = 'k-delta'; return; }
    var bad = higherIsBad ? diff > 0 : diff < 0;
    el.textContent = (diff > 0 ? '▲ +' : '▼ −') + num(Math.abs(diff)) + unit + ' vs typical';
    el.className = 'k-delta ' + (bad ? 'bad' : 'good');
  }

  function slowestRoads(d, bin) {
    var n = edges.length, rows = [];
    groups.forEach(function (g) {
      var occ = 0, free = 0, dist = 0;
      for (var k = 0; k < g.idx.length; k++) {
        var i = g.idx[k], o = d.occ[bin * n + i];
        if (!o) { continue; }
        var r = ratioOf(d, bin, i);
        occ += o; free += o * r; dist += o * r * edges[i].s;
      }
      if (occ * 10 / meta.bin_seconds >= 15) {         // at least 15 vehicles on the road
        rows.push({ g: g, ratio: free / occ, speed: dist / occ, vehicles: occ * 10 / meta.bin_seconds });
      }
    });
    rows.sort(function (a, b) { return a.ratio - b.ratio; });
    return rows.slice(0, 8);
  }

  function renderPanels() {
    var sm = scenarioMeta(state.scenario), base = scenarioMeta('base') || sm;
    var bin = binOf(state.t), k = sm.bins[bin], kb = base.bins[bin], d = scen[state.scenario];
    $('viewLabel').textContent = sm.label;
    $('kSpeed').innerHTML = (k.speed == null ? '–' : Math.round(k.speed)) + '<small>km/h</small>';
    $('kCong').innerHTML = '+' + Math.round(k.extra) + '<small>%</small>';
    $('kVeh').textContent = num(k.vehicles);
    $('kDelay').innerHTML = num(k.delay_h) + '<small>veh-h</small>';
    setDelta($('dSpeed'), (k.speed || 0) - (kb.speed || 0), ' km/h', false);
    setDelta($('dCong'), k.extra - kb.extra, ' pts', true);
    setDelta($('dVeh'), k.vehicles - kb.vehicles, '', true);
    setDelta($('dDelay'), k.delay_h - kb.delay_h, ' veh-h', true);

    var rows = d ? slowestRoads(d, bin) : [];
    var later = sm.bins[Math.min(meta.bins - 1, bin + 6)];
    var trend = (later.speed || 0) - (k.speed || 0);
    var trendText = Math.abs(trend) < 1.5 ? 'holds steady' : (trend < 0 ? 'drops about ' + Math.abs(trend).toFixed(0) + ' km/h' : 'recovers about ' + trend.toFixed(0) + ' km/h');
    $('insight').textContent = (rows.length ? 'Slowest named road: ' + rows[0].g.name + ' at ' + Math.round(rows[0].speed) + ' km/h. ' : '') +
      'Over the following 30 simulated minutes network speed ' + trendText + '.';

    var list = $('corridors');
    list.innerHTML = '';
    rows.forEach(function (r) {
      var lv = level(r.ratio), li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="dot ' + lv + '"></span><span><span class="c-name"></span><br><span class="c-sub">' + LEVEL_LABEL[lv] +
        ' · ' + Math.round(r.ratio * 100) + '% of limit · ' + num(r.vehicles) + ' vehicles</span></span>' +
        '<span class="c-speed">' + Math.round(r.speed) + '<small>km/h</small></span>';
      b.querySelector('.c-name').textContent = r.g.name;
      b.addEventListener('click', function () { locate(r.g); });
      li.appendChild(b); list.appendChild(li);
    });
    if (!rows.length) { list.innerHTML = '<li class="muted">No named road has enough traffic at this time.</li>'; }
    if (d) { renderClassBars(d, bin); }
    renderEvents();
    drawChart();
  }

  function barRow(label, sub, value, share) {
    return '<div class="bar-row"><span>' + label + (sub ? ' <span class="sub">' + sub + '</span>' : '') + '</span><span class="val">' + value +
      '</span><div class="track"><div class="fill" style="width:' + Math.max(0, Math.min(100, share * 100)).toFixed(1) + '%"></div></div></div>';
  }

  function eventTotals(id, t) {
    var ev = scen[id] && scen[id].ev;
    if (!ev) { return null; }
    var fines = 0, value = 0, byType = E.TYPES.map(function (ty, i) {
      var c = E.at(ev.cumByType[i], t, meta.bin_seconds); fines += c; value += c * ty.aed; return c;
    });
    var seen = ev.accidents.filter(function (a) { return a.t <= t; });
    return {
      ev: ev, fines: fines, value: value, byType: byType, seen: seen,
      active: seen.filter(function (a) { return t < a.t + a.dur; }).length,
      injury: seen.filter(function (a) { return a.severity !== 'Damage only'; }).length
    };
  }

  // Accidents, fines and their dashboard tiles. Runs once per simulated minute.
  function renderEvents() {
    var cur = eventTotals(state.scenario, state.t), base = eventTotals('base', state.t);
    if (!cur) { return; }
    $('kAcc').textContent = num(cur.seen.length);
    $('kFines').textContent = num(cur.fines);
    if (base && state.scenario !== 'base') {
      setDelta($('dAcc'), cur.seen.length - base.seen.length, '', true);
      setDelta($('dFines'), cur.fines - base.fines, '', true);
    } else { $('dAcc').textContent = ''; $('dFines').textContent = ''; }

    $('aTotal').textContent = num(cur.seen.length);
    $('aActive').textContent = num(cur.active);
    $('aInjury').textContent = num(cur.injury);
    var list = $('accList'); list.innerHTML = '';
    cur.seen.slice().reverse().slice(0, 12).forEach(function (a) {
      var active = state.t < a.t + a.dur, li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="dot ' + (active ? 'acc-active' : 'acc-past') + '"></span><span><span class="c-name"></span><br><span class="c-sub">' +
        a.severity + ' · ' + (active ? 'active' : 'cleared ' + clock(meta.sim_begin + a.t + a.dur)) + '</span></span>' +
        '<span class="c-speed">' + clock(meta.sim_begin + a.t) + '</span>';
      b.querySelector('.c-name').textContent = a.road;
      b.addEventListener('click', function () { flyToPoint(a.lon, a.lat); accidentPopup(a); });
      li.appendChild(b); list.appendChild(li);
    });
    if (!cur.seen.length) { list.innerHTML = '<li class="muted">No accidents yet this morning.</li>'; }

    $('fTotal').textContent = num(cur.fines);
    $('fValue').innerHTML = num(cur.value) + '<small>AED</small>';
    var maxType = Math.max.apply(null, cur.byType.concat([1]));
    $('typeBars').innerHTML = E.TYPES.map(function (ty, i) {
      return barRow(ty.label, 'AED ' + num(ty.aed) + ' each', num(cur.byType[i]), cur.byType[i] / maxType);
    }).join('');
    var top = cur.ev.sites.map(function (st) { return { st: st, n: E.at(st.cum, state.t, meta.bin_seconds) }; })
      .sort(function (a, z) { return z.n - a.n; }).slice(0, 8);
    var sl = $('siteList'); sl.innerHTML = '';
    top.forEach(function (row) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="dot site"></span><span><span class="c-name"></span><br><span class="c-sub">' + CLASS_NAME[edges[row.st.edge].c] +
        '</span></span><span class="c-speed">' + num(row.n) + '<small>fines</small></span>';
      b.querySelector('.c-name').textContent = row.st.road;
      b.addEventListener('click', function () { flyToPoint(row.st.lon, row.st.lat); sitePopup(row.st); });
      li.appendChild(b); sl.appendChild(li);
    });
  }

  function renderClassBars(d, bin) {
    var n = edges.length, tot = [0, 0, 0, 0, 0], slow = [0, 0, 0, 0, 0];
    for (var i = 0; i < n; i++) {
      var o = d.occ[bin * n + i];
      if (!o) { continue; }
      tot[edges[i].c] += o;
      if (ratioOf(d, bin, i) < 0.6) { slow[edges[i].c] += o; }
    }
    $('classBars').innerHTML = CLASS_NAME.map(function (name, c) {
      var share = tot[c] ? slow[c] / tot[c] : 0;
      return barRow(name + 's', num(tot[c] * 10 / meta.bin_seconds) + ' vehicles', Math.round(share * 100) + '%', share);
    }).join('');
  }

  function locate(g) {
    if (!map) { return; }
    map.fitBounds(g.bounds, { padding: { top: 70, bottom: 120, left: 40, right: 40 }, maxZoom: 14, duration: 800 });
    if (window.matchMedia('(max-width: 860px)').matches) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  function fact(label, sub, value) {
    return '<tr><td>' + label + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</td><td>' + value + '</td></tr>';
  }

  function renderFacts() {
    var sm = scenarioMeta(state.scenario), s = sm.stats || {}, nw = meta.network, kc = nw.km_by_class || {};
    var bs = meta.buses || {}, bl = meta.buildings || {};
    $('winLabel').textContent = clock(meta.sim_begin) + '–' + clock(meta.sim_end);
    $('tripFacts').innerHTML =
      fact('Vehicle trips simulated', 'assumed total, not counted', num(sm.trips)) +
      fact('Trips completed in the window', '', num(s.completed || 0)) +
      fact('Average trip', 'inside the study area', (s.km || '–') + ' km · ' + (s.min || '–') + ' min') +
      fact('Average trip speed', '', (s.kmh || '–') + ' km/h') +
      fact('Average time lost', 'against free-flowing roads', (s.min_lost || '–') + ' min') +
      fact('Trip ends placed by', '', meta.demand.trip_ends);
    $('builtLabel').textContent = 'Built ' + meta.built;
    $('netFacts').innerHTML =
      fact('Roads in the model', 'motorway to tertiary, by direction', num(nw.km) + ' km') +
      fact('Motorway · trunk', '', num(kc.motorway || 0) + ' · ' + num(kc.trunk || 0) + ' km') +
      fact('Primary · secondary · tertiary', '', num(kc.primary || 0) + ' · ' + num(kc.secondary || 0) + ' · ' + num(kc.tertiary || 0) + ' km') +
      fact('Road links · junctions', '', num(nw.edges) + ' · ' + num(nw.junctions)) +
      fact('Traffic signals', 'positions from OpenStreetMap; timings generic', num(nw.signals)) +
      fact('Bus runs in the window', bs.available ? num(bs.lines) + ' lines, from the timetable' : 'timetable not loaded in this build', bs.available ? num(bs.runs) : '–') +
      fact('Building footprints', bl.available ? num(bl.shown) + ' largest drawn' : 'not loaded in this build', bl.available ? num(bl.count) : '–') +
      fact('Road data date', 'OpenStreetMap via Geofabrik', String(meta.osm_timestamp).slice(0, 10));
  }

  /* ---------- chart ---------- */
  function drawChart() {
    var cv = $('chart'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !meta) { return; }
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    var b0 = binOf(t0), b1 = meta.bins - 1;
    function series(id) { return scenarioMeta(id).bins.slice(b0, b1 + 1).map(function (x) { return x.speed || 0; }); }
    var base = series(scenarioMeta('base') ? 'base' : state.scenario), cur = series(state.scenario), all = base.concat(cur);
    var top = Math.ceil(Math.max.apply(null, all) / 10) * 10, bottom = Math.max(0, Math.floor(Math.min.apply(null, all) / 10) * 10 - 10);
    if (top <= bottom) { top = bottom + 10; }
    var padL = 30, padR = 8, padT = 8, padB = 20, n = cur.length;
    function x(i) { return padL + (w - padL - padR) * (n > 1 ? i / (n - 1) : 0); }
    function y(v) { return padT + (h - padT - padB) * (1 - (v - bottom) / (top - bottom)); }
    g.font = '10.5px system-ui, sans-serif'; g.fillStyle = '#8fa0bd'; g.strokeStyle = '#22314d'; g.lineWidth = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    [bottom, (top + bottom) / 2, top].forEach(function (v) {
      g.beginPath(); g.moveTo(padL, y(v)); g.lineTo(w - padR, y(v)); g.stroke(); g.fillText(Math.round(v), padL - 6, y(v));
    });
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (var s = Math.ceil((meta.sim_begin + t0) / 3600) * 3600; s <= meta.sim_end; s += 3600) {
      var xi = x((s - meta.sim_begin - b0 * meta.bin_seconds) / meta.bin_seconds);
      g.fillText(clock(s), Math.min(Math.max(xi, padL + 14), w - padR - 14), h - padB + 6);
    }
    function line(arr, color, dash, width) {
      g.beginPath(); arr.forEach(function (v, i) { if (i) { g.lineTo(x(i), y(v)); } else { g.moveTo(x(i), y(v)); } });
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.stroke(); g.setLineDash([]);
    }
    line(base, '#6f84a8', [4, 4], 1.5);
    line(cur, 'rgb(45,212,167)', [], 2);
    var pos = (state.t - b0 * meta.bin_seconds) / meta.bin_seconds - 0.5, mx = x(Math.max(0, Math.min(n - 1, pos)));
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(mx, padT); g.lineTo(mx, h - padB); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(mx, y(cur[Math.max(0, Math.min(n - 1, Math.round(pos)))]), 3.5, 0, Math.PI * 2); g.fill();
  }

  /* ---------- controls ---------- */
  var dirty = true;
  function setPlaying(p) {
    state.playing = p; $('play').textContent = p ? '❚❚' : '▶'; $('play').setAttribute('aria-label', p ? 'Pause' : 'Play');
  }
  function wireControls() {
    $('rate').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) { return; }
      Array.prototype.forEach.call($('rate').children, function (c) { c.classList.toggle('on', c === b); c.setAttribute('aria-checked', c === b ? 'true' : 'false'); });
      state.rate = Number(b.getAttribute('data-rate')); setPlaying(true);
    });
    $('play').addEventListener('click', function () { setPlaying(!state.playing); });
    var slider = $('time');
    slider.min = t0; slider.max = t1; slider.step = 30;
    slider.addEventListener('input', function () {
      if (mode === 'live') { setMode('hist'); }      // scrubbing leaves the live clock
      outsideNote = ''; state.t = Number(slider.value); dirty = true;
    });
    // Live / historical controls. Hours are listed 00–23 so the clock is always 24-hour.
    for (var h = 0; h < 24; h++) { var oh = document.createElement('option'); oh.value = oh.textContent = pad(h); $('hHour').appendChild(oh); }
    for (var mi = 0; mi < 60; mi += 5) { var om = document.createElement('option'); om.value = om.textContent = pad(mi); $('hMin').appendChild(om); }
    $('hDate').max = dubaiNow().iso;
    $('mode').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) { return; }
      setMode(b.getAttribute('data-mode'));
      if (mode === 'live') { setPlaying(true); }
    });
    function histChanged() {
      histDate = $('hDate').value || dubaiNow().iso;
      setPlaying(false);
      jumpToTimeOfDay(Number($('hHour').value) * 3600 + Number($('hMin').value) * 60);
      updateModeUI(true);
    }
    $('hDate').addEventListener('change', histChanged);
    $('hHour').addEventListener('change', histChanged);
    $('hMin').addEventListener('change', histChanged);
    $('tilt').addEventListener('click', function () {
      var on = $('tilt').getAttribute('aria-pressed') !== 'true';
      $('tilt').setAttribute('aria-pressed', on ? 'true' : 'false');
      if (map) { map.easeTo({ pitch: on ? 55 : 0, duration: 600 }); }
    });
    // Orbit: the camera circles the centre of the view until the user touches the map or turns it off.
    function setOrbit(on) {
      orbiting = on && !!map;
      $('orbit').setAttribute('aria-pressed', orbiting ? 'true' : 'false');
      if (orbiting && map.getPitch() < 30) {
        map.easeTo({ pitch: 55, duration: 600 });
        $('tilt').setAttribute('aria-pressed', 'true');
      }
    }
    $('orbit').addEventListener('click', function () { setOrbit(!orbiting); });
    if (map) {
      ['mousedown', 'touchstart', 'wheel'].forEach(function (ev) {
        map.getCanvasContainer().addEventListener(ev, function () { if (orbiting) { setOrbit(false); } }, { passive: true });
      });
    }
    // Quick navigation: major-site chips on the map, and the longest major roads in the top bar.
    var go = $('goto'), majorRoads = groups.filter(function (g) { return g.c <= 2 && g.m >= 5000; })
      .sort(function (a, b) { return b.m - a.m; }).slice(0, 30)
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    function leaveOrbit() { orbiting = false; $('orbit').setAttribute('aria-pressed', 'false'); }
    function clearChips() { Array.prototype.forEach.call($('sites').querySelectorAll('.chip'), function (c) { c.classList.remove('on'); }); }
    SITES.forEach(function (st) {
      var b = document.createElement('button'); b.className = 'chip';
      b.type = 'button'; b.textContent = st[0];
      b.addEventListener('click', function () {
        if (!map) { return; }
        leaveOrbit(); clearChips(); b.classList.add('on'); go.value = '';
        if (popup) { popup.remove(); }
        // A site view is a close, tilted 3D view with buildings where they are available.
        map.flyTo({ center: [st[1], st[2]], zoom: st[3], pitch: 55, duration: 1400 });
        $('tilt').setAttribute('aria-pressed', 'true');
        var box = $('showBld');
        if (!vectorBase && !$('bldRow').hidden && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change')); }
      });
      $('sites').appendChild(b);
    });
    majorRoads.forEach(function (g, i) { var o = document.createElement('option'); o.value = 'r' + i; o.textContent = g.name; $('gotoRoads').appendChild(o); });
    go.addEventListener('change', function () {
      var v = go.value;
      if (!v || !map) { return; }
      leaveOrbit(); clearChips();
      if (popup) { popup.remove(); }
      if (v === 'all') {
        map.fitBounds([[meta.bbox[0], meta.bbox[1]], [meta.bbox[2], meta.bbox[3]]], { padding: 10, pitch: 0, bearing: 0, duration: 900 });
        $('tilt').setAttribute('aria-pressed', 'false');
      } else {
        map.fitBounds(majorRoads[Number(v.slice(1))].bounds, { padding: { top: 90, bottom: 120, left: 40, right: 40 }, maxZoom: 14, duration: 900 });
      }
    });
    var sel = $('scenario');
    meta.scenarios.forEach(function (s) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.label; sel.appendChild(o); });
    sel.value = state.scenario;
    sel.addEventListener('change', function () {
      var id = sel.value; sel.disabled = true;
      loadScenario(id).then(function () { state.scenario = id; roadLayer = null; renderFacts(); dirty = true; })
        .catch(function () { sel.value = state.scenario; }).then(function () { sel.disabled = false; });
    });
    // Panel tabs.
    function showTab(id) {
      Array.prototype.forEach.call($('tabs').children, function (b) {
        var on = b.getAttribute('data-tab') === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('.panel section[data-tab]'), function (sec) { sec.hidden = sec.getAttribute('data-tab') !== id; });
      drawChart();
    }
    $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { showTab(b.getAttribute('data-tab')); } });
    Array.prototype.forEach.call(document.querySelectorAll('[data-goto]'), function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-goto')); });
    });
    // Full-view map: the side panel, legend and site chips can each be minimised, or all at once.
    var layoutEl = document.querySelector('.layout');
    function setPanel(open) { layoutEl.classList.toggle('panel-open', open); $('panelOpen').hidden = open; if (open) { drawChart(); } syncFull(); }
    function setMin(id, min) { $(id).classList.toggle('min', min); syncFull(); }
    function syncFull() {
      var allHidden = !layoutEl.classList.contains('panel-open') && $('legend').classList.contains('min') && $('sites').classList.contains('min');
      $('fullView').setAttribute('aria-pressed', allHidden ? 'true' : 'false');
      $('fullView').textContent = allHidden ? 'Show panels' : 'Full view';
    }
    $('panelMin').addEventListener('click', function () { setPanel(false); });
    $('panelOpen').addEventListener('click', function () { setPanel(true); });
    $('legendMin').addEventListener('click', function () { setMin('legend', !$('legend').classList.contains('min')); });
    $('sitesMin').addEventListener('click', function () { setMin('sites', !$('sites').classList.contains('min')); });
    $('fullView').addEventListener('click', function () {
      var hide = $('fullView').getAttribute('aria-pressed') !== 'true';
      $('legend').classList.toggle('min', hide); $('sites').classList.toggle('min', hide); setPanel(!hide);
    });
    // Start with the panel open on wide screens and minimised on phones; the legend starts minimised on phones.
    var narrow = window.matchMedia('(max-width: 860px)').matches;
    if (narrow) { $('legend').classList.add('min'); }
    setPanel(!narrow);

    $('showAcc').addEventListener('change', function (e) { state.acc = e.target.checked; });
    $('showSites').addEventListener('change', function (e) { state.sites = e.target.checked; });
    $('showCars').addEventListener('change', function (e) { state.cars = e.target.checked; });
    $('showBuses').addEventListener('change', function (e) { state.buses = e.target.checked; });
    $('showBld').addEventListener('change', function (e) {
      state.bld = e.target.checked;
      if (state.bld && !buildings) {
        getJSON('data/buildings.json').then(function (rows) {
          buildings = rows.map(function (r) {
            var ring = []; for (var i = 0; i < r[1].length; i += 2) { ring.push([r[1][i], r[1][i + 1]]); }
            return { h: r[0], ring: ring };
          });
          if (map && map.getZoom() < 12 && !map.isMoving()) { map.easeTo({ zoom: 12.5, pitch: 50 }); $('tilt').setAttribute('aria-pressed', 'true'); }
        }).catch(function () { $('bldNote').textContent = '(could not load)'; });
      }
    });
    window.addEventListener('resize', drawChart);
  }

  /* ---------- main loop ---------- */
  var last = performance.now(), lastBin = -1, lastLabel = '';
  var orbiting = false, ORBIT_DEG_PER_S = 6;
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.25); last = now;
    var live = mode === 'live' ? dubaiNow() : null;
    if (live && live.tod >= meta.display_begin && live.tod <= meta.sim_end) {
      state.t = live.tod - meta.sim_begin;                       // inside the modelled hours: follow the clock
    } else if (state.playing) {
      state.t += dt * state.rate; if (state.t >= t1) { state.t = t0; }
    }
    var step = state.t - prevT; prevT = state.t;
    if (step > 0 && step < 120) { simDt += step; }
    var bin = binOf(state.t), label = clock(meta.sim_begin + state.t);
    if (bin !== lastBin || dirty) { lastBin = bin; dirty = false; renderPanels(); }
    if (label !== lastLabel) { lastLabel = label; $('time').value = Math.round(state.t); drawChart(); renderEvents(); }
    updateModeUI(false);
    if (orbiting && map && !map.isEasing()) { map.setBearing(map.getBearing() + ORBIT_DEG_PER_S * dt); }
    buildLayers();
    requestAnimationFrame(frame);
  }

  /* ---------- start ---------- */
  getJSON('data/meta.json').then(function (m) {
    meta = m;
    t0 = meta.display_begin - meta.sim_begin; t1 = meta.sim_end - meta.sim_begin; state.t = t0;
    return getJSON('data/roads.json');
  }).then(function (roads) {
    names = roads.names;
    var byName = {};
    edges = roads.edges.map(function (e, i) {
      var path = [];
      for (var k = 0; k < e.p.length; k += 2) { path.push([e.p[k], e.p[k + 1]]); }
      e.i = i; e.path = path;
      var name = names[e.n];
      if (name && !e.k) {
        var g = byName[name] = byName[name] || { name: name, idx: [], m: 0, c: 9, bounds: [[180, 90], [-180, -90]] };
        g.idx.push(i); g.m += e.m; g.c = Math.min(g.c, e.c);
        path.forEach(function (p) {
          g.bounds[0][0] = Math.min(g.bounds[0][0], p[0]); g.bounds[0][1] = Math.min(g.bounds[0][1], p[1]);
          g.bounds[1][0] = Math.max(g.bounds[1][0], p[0]); g.bounds[1][1] = Math.max(g.bounds[1][1], p[1]);
        });
      }
      return e;
    });
    groups = Object.keys(byName).map(function (k) { return byName[k]; }).filter(function (g) { return g.m >= 2000; });
    state.scenario = scenarioMeta('base') ? 'base' : meta.scenarios[0].id;
    return loadScenario(state.scenario);
  }).then(function () {
    initMap();
    wireControls();
    $('carNote').textContent = '(every simulated vehicle; zoom in for 3D)';
    if (meta.buildings && meta.buildings.available) {
      $('bldRow').hidden = false;
      $('bldNote').textContent = '(' + num(meta.buildings.shown) + ' largest, heights mostly estimated)';
    }
    renderFacts();
    setMode('live');
    requestAnimationFrame(frame);
    if (meta.buses && meta.buses.available) {
      getBuf('data/buses.bin').then(function (buf) {
        buses = parsePaths(buf); $('busRow').hidden = false; $('legendBus').hidden = false;
        $('busNote').textContent = '(' + num(meta.buses.runs) + ' runs)';
      }).catch(function () {});
    }
  }).catch(function (err) {
    if (window.console) { console.warn('IntelliTwin data not loaded:', err && err.message); }
    $('nodata').hidden = false;
  });

  function clickIf(id, want) { if (($(id).getAttribute('aria-pressed') === 'true') !== want) { $(id).click(); } }
  window.IntelliTwin = {
    state: state, getMap: function () { return map; },
    // Used by js/assistant.js to read the simulation and operate the twin.
    api: {
      timeText: function () { return clock(meta.sim_begin + state.t); },
      scenarioLabel: function () { return scenarioMeta(state.scenario).label; },
      kpi: function () { return scenarioMeta(state.scenario).bins[binOf(state.t)]; },
      compare: function () { return meta.scenarios.map(function (sm) { var k = sm.bins[binOf(state.t)]; return { label: sm.label, speed: k.speed, vehicles: k.vehicles, extra: k.extra }; }); },
      slowest: function () {
        var d = scen[state.scenario];
        return d ? slowestRoads(d, binOf(state.t)).map(function (r) { return { name: r.g.name, speed: r.speed, ratio: r.ratio, vehicles: r.vehicles }; }) : [];
      },
      events: function () {
        var e = eventTotals(state.scenario, state.t);
        if (!e) { return null; }
        var last = e.seen[e.seen.length - 1], top = 0;
        e.byType.forEach(function (c, i) { if (c > e.byType[top]) { top = i; } });
        return { accidents: e.seen.length, active: e.active, injury: e.injury, fines: e.fines, value: e.value, topType: E.TYPES[top].label,
          latest: last ? last.road + ' at ' + clock(meta.sim_begin + last.t) + ', ' + last.severity.toLowerCase() : '' };
      },
      sites: function () { return SITES.map(function (st) { return st[0]; }); },
      roads: function () { return groups.map(function (g) { return g.name; }); },
      goSite: function (name) { Array.prototype.forEach.call($('sites').querySelectorAll('.chip'), function (b) { if (b.textContent === name) { b.click(); } }); },
      goRoad: function (name) {
        var g = groups.filter(function (x) { return x.name === name; })[0], d = scen[state.scenario];
        if (!g) { return null; }
        locate(g);
        var bin = binOf(state.t), n = edges.length, occ = 0, free = 0, dist = 0;
        g.idx.forEach(function (i) { var o = d.occ[bin * n + i]; if (o) { var r = ratioOf(d, bin, i); occ += o; free += o * r; dist += o * r * edges[i].s; } });
        return occ ? { speed: dist / occ, ratio: free / occ, vehicles: occ * 10 / meta.bin_seconds } : null;
      },
      goAll: function () { $('goto').value = 'all'; $('goto').dispatchEvent(new Event('change')); },
      setScenario: function (id) {
        $('scenario').value = id; $('scenario').dispatchEvent(new Event('change'));
        return loadScenario(id).then(function () { return new Promise(function (res) { setTimeout(res, 60); }); });
      },
      setTime: function (tod) { setMode('hist'); setPlaying(false); jumpToTimeOfDay(tod); updateModeUI(true); return outsideNote; },
      setTab: function (id) { var b = document.querySelector('#tabs [data-tab="' + id + '"]'); if (b) { b.click(); } },
      orbit: function (on) { clickIf('orbit', on); },
      tilt: function (on) { clickIf('tilt', on); },
      play: function (on) { setPlaying(on); },
      live: function () { setMode('live'); setPlaying(true); }
    }
  };
})();
