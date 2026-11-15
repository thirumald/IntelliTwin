/* IntelliTwin core: data loading, the synthetic day, the map, vehicles, panels and time controls.
 * Operations features (alerts, forecast, what-if, exports, sign-in) are in js/ops.js, field devices
 * and camera views in js/devices.js, translations in js/i18n.js and the assistant in js/assistant.js.
 */
(function () {
  'use strict';

  /* ---------- configuration ---------- */
  function merge(a, b) {
    var out = {}, k;
    for (k in a) { out[k] = a[k]; }
    for (k in (b || {})) {
      out[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) ? merge(a[k], b[k]) : b[k];
    }
    return out;
  }
  var CFG = merge({
    map: { styleUrl: 'https://tiles.openfreemap.org/styles/dark', rasterTiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      rasterAttribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', buildings3d: true },
    time: { timeZone: 'Asia/Dubai', weekendDays: [6, 0], shortDay: 5 },
    feeds: { traffic: 'synthetic', accidentsUrl: null },
    devices: { cameras: [], syntheticCameras: 40, syntheticDetectors: 80, syntheticSigns: 15, hlsScript: null, signalCycleSeconds: 90 },
    alerts: { networkSpeedBelowKmh: 40, roadRatioBelow: 0.3, roadMinVehicles: 150, seriousAccident: true, maxShown: 12 },
    forecast: { horizonsMin: [15, 30, 60] },
    closure: { radiusM: 1500, speedLoss: 0.4, extraVehicles: 0.3 },
    auth: { enabled: false, roles: { admin: { label: 'Administrator', can: ['whatif', 'export', 'audit', 'settings', 'video'] } } },
    api: { assistantUrl: null, auditUrl: null },
    language: { default: 'en', available: ['en', 'ar'] }
  }, window.INTELLITWIN_CONFIG);

  var RGB = { free: [45, 212, 167], moderate: [245, 197, 66], heavy: [245, 138, 66], severe: [239, 75, 90] };
  var LEVEL_LABEL = { free: 'Free flow', moderate: 'Moderate', heavy: 'Heavy', severe: 'Severe' };
  var CLASS_NAME = ['Motorway', 'Trunk road', 'Primary road', 'Secondary road', 'Tertiary road'];
  var CLASS_WIDTH = [16, 14, 11, 9, 7];           // metres
  var DAY = 86400, SLOT = window.TwinDay.SLOT, SLOTS = window.TwinDay.SLOTS;
  var E = window.TwinEvents;
  var $ = function (id) { return document.getElementById(id); };

  // Major sites for quick navigation: [name, lon, lat, zoom]. Locations are approximate.
  var SITES = [
    ['Downtown', 54.3570, 24.4870, 14], ['Corniche', 54.3400, 24.4750, 14], ['Qasr Al Hosn', 54.3545, 24.4823, 15],
    ['Emirates Palace', 54.3170, 24.4615, 14.5], ['Qasr Al Watan', 54.3050, 24.4625, 14.5], ['Etihad Towers', 54.3215, 24.4585, 15],
    ['Al Maryah Island', 54.3900, 24.5020, 14.5], ['Al Reem Island', 54.4050, 24.4980, 14], ['Mina Zayed', 54.3780, 24.5220, 14],
    ['Saadiyat Island', 54.3983, 24.5338, 13.5], ['ADNEC', 54.4370, 24.4180, 14.5], ['Sheikh Zayed Grand Mosque', 54.4750, 24.4128, 14.5],
    ['Sheikh Zayed Bridge', 54.4970, 24.4190, 14.5], ['Mussafah', 54.5000, 24.3550, 13], ['Mohamed Bin Zayed City', 54.5450, 24.3400, 13.5],
    ['Khalifa City', 54.5770, 24.4200, 13], ['Masdar City', 54.6170, 24.4290, 14], ['Yas Island', 54.6031, 24.4672, 13.5],
    ['Zayed International Airport', 54.6511, 24.4330, 13]
  ];

  function level(r) { return r >= 0.8 ? 'free' : r >= 0.6 ? 'moderate' : r >= 0.4 ? 'heavy' : 'severe'; }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(sec) { sec = ((Math.floor(sec) % DAY) + DAY) % DAY; return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor(sec % 3600 / 60)); }
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(url); } return r.json(); }); }
  function getBuf(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(url); } return r.arrayBuffer(); }); }

  // Binary trajectories: uint32 count, uint32 offsets[count + 1], float32 (lon, lat, t)[points]. t is seconds since sim_begin.
  function parsePaths(buf, shift) {
    var n = new DataView(buf).getUint32(0, true), off = new Uint32Array(buf.slice(4, 4 + 4 * (n + 1))), f = new Float32Array(buf.slice(4 + 4 * (n + 1))), out = [];
    for (var i = 0; i < n; i++) {
      var path = [], ts = [];
      for (var k = off[i]; k < off[i + 1]; k++) { path.push([f[3 * k], f[3 * k + 1]]); ts.push(f[3 * k + 2] + shift); }
      out.push({ path: path, ts: ts });
    }
    return out;
  }

  /* ---------- state ---------- */
  var meta, edges = [], names = [], groups = [], scen = {}, buses = null, buildings = null, signals = null;
  var rail = null, cycle = null, zones = null, extraShow = { rail: true, cycle: true };
  var map = null, overlay = null, popup = null, vectorBase = false;
  var state = { t: 8 * 3600, playing: true, rate: 1, scenario: 'base', mode: 'live', date: '', cars: true, buses: true, bld: false, acc: true, sites: true, people: true };
  var day = null, baseDay = null, ev = null, evCache = {}, calib = {}, fx = null;      // fx: what-if closure effect
  var startFocus = '', zoneHooks = [], peopleInView = 0, theme = 'dark', setTheme = function () {};
  var dirty = true, orbiting = false, layerProviders = [], minuteHooks = [], readyHooks = [];
  var carProgress = null, simDt = 0, prevT = 0, visibleEdges = [], visibleKey = '';

  // Theme colours for canvas drawing, read from the stylesheet so charts follow the dark and light themes.
  function cssVar(name, fallback) { var v = getComputedStyle(document.body).getPropertyValue(name).trim(); return v || fallback; }
  function scenarioMeta(id) { return meta.scenarios.filter(function (s) { return s.id === id; })[0]; }
  function slotOf(t) { return Math.max(0, Math.min(SLOTS - 1, Math.floor((((t % DAY) + DAY) % DAY) / SLOT))); }
  function binOf(t) { return day.map[slotOf(t)]; }
  function rawRatio(d, bin, i) { var v = d.speed[bin * edges.length + i]; return v === 255 ? 1 : v / 100; }
  // Effective values for the shown scenario, including any what-if closure.
  function ratioAt(bin, i) {
    var r = rawRatio(scen[state.scenario], bin, i);
    return fx ? (fx.flag[i] === 1 ? 0.02 : fx.flag[i] === 2 ? r * fx.f[i] : r) : r;
  }
  function occAt(bin, i) {
    var o = scen[state.scenario].occ[bin * edges.length + i];
    return fx ? (fx.flag[i] === 1 ? 0 : fx.flag[i] === 2 ? o * (1 + CFG.closure.extraVehicles * (1 - fx.f[i]) / CFG.closure.speedLoss) : o) : o;
  }
  function kpiFromLinks(bin) {
    var n = edges.length, vkt = 0, tot = 0, free = 0;
    for (var i = 0; i < n; i++) {
      var o = occAt(bin, i) * 10; if (!o) { continue; }
      var r = ratioAt(bin, i); vkt += o * edges[i].s / 3.6 * r; tot += o; free += o * r;
    }
    return { speed: tot ? 3.6 * vkt / tot : null, vehicles: Math.round(tot / SLOT), extra: free ? 100 * (tot / free - 1) : 0, delay_h: Math.round((tot - free) / 3600 * (3600 / SLOT)) };
  }
  function kpiAt(id, t, dayModel) {
    if (id === state.scenario && fx) { return kpiFromLinks((dayModel || day).map[slotOf(t)]); }
    return scenarioMeta(id).bins[(dayModel || day).map[slotOf(t)]];
  }

  /* ---------- time: live and historical ---------- */
  function nowLocal() {
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: CFG.time.timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    var iso = new Intl.DateTimeFormat('en-CA', { timeZone: CFG.time.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return { tod: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second), hm: p.hour + ':' + p.minute, iso: iso };
  }
  function prettyDate(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    return isNaN(d) ? iso : new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(d).replace(',', '');
  }

  // Rebuild everything that depends on the scenario or the date.
  function rebuildDay() {
    day = window.TwinDay.build(scenarioMeta(state.scenario).bins, state.date, CFG.time);
    baseDay = window.TwinDay.build((scenarioMeta('base') || scenarioMeta(state.scenario)).bins, state.date, CFG.time);
    var key = state.scenario + '|' + state.date;
    if (!evCache[key]) { evCache[key] = E.generate(meta, edges, names, scen[state.scenario], key, calib, day.map); }
    ev = evCache[key];
    roadLayer = null; dirty = true;
    if (fx) { setClosure(fx.name); }
    drawChart();
  }
  function eventsFor(id) {
    var key = id + '|' + state.date;
    if (!evCache[key] && scen[id]) { evCache[key] = E.generate(meta, edges, names, scen[id], key, calib, window.TwinDay.build(scenarioMeta(id).bins, state.date, CFG.time).map); }
    return evCache[key] || null;
  }

  function setMode(m) {
    // Live starts at the Abu Dhabi clock and plays at the configured speed (30× by default); at 1× it stays locked to the clock.
    state.mode = m;
    if (m === 'live') { setRate((CFG.start && CFG.start.rate) || 30); }
    Array.prototype.forEach.call($('mode').children, function (b) {
      var on = b.getAttribute('data-mode') === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('histControls').hidden = m !== 'hist';
    if (m === 'live') {
      var now = nowLocal();
      if (state.date !== now.iso) { state.date = now.iso; rebuildDay(); }
      state.t = now.tod; setPlaying(true);
    }
    $('hDate').value = state.date;
    updateModeUI(true); dirty = true;
  }
  function setDate(iso) { if (iso && iso !== state.date) { state.date = iso; rebuildDay(); } }
  function jumpTo(tod) { state.t = Math.max(0, Math.min(DAY - 1, tod)); dirty = true; }

  var lastModeKey = '';
  function updateModeUI(force) {
    var now = nowLocal(), shown = clock(state.t), key = state.mode + now.hm + shown + state.date + state.scenario;
    if (!force && key === lastModeKey) { return; }
    lastModeKey = key;
    $('simClock').textContent = shown;
    $('dateLabel').textContent = prettyDate(state.date);
    $('clock').textContent = shown;
    if (state.mode === 'live') {
      $('modeNote').textContent = (state.rate === 1 ? 'Live: following the Abu Dhabi clock.' : 'Live: started at the Abu Dhabi clock, playing at ' + state.rate + '× so it runs ahead of the clock.') + ' Synthetic feed for a ' + day.typeLabel + ', not measured traffic.';
    } else {
      if (document.activeElement !== $('hHour') && document.activeElement !== $('hMin')) {
        $('hHour').value = pad(Math.floor(state.t / 3600) % 24); $('hMin').value = pad(Math.floor(state.t % 3600 / 300) * 5);
      }
      $('modeNote').textContent = 'Historical: synthetic record for ' + prettyDate(state.date) + ' (' + day.typeLabel + '). No measured history is stored yet.';
    }
  }

  function loadScenario(id) {
    if (scen[id]) { return Promise.resolve(scen[id]); }
    return Promise.all([getBuf('data/' + id + '_speed.bin'), getBuf('data/' + id + '_occ.bin')])
      .then(function (r) { scen[id] = { speed: new Uint8Array(r[0]), occ: new Uint16Array(r[1]) }; return scen[id]; });
  }

  /* ---------- map ---------- */
  function initMap() {
    var b = meta.bbox;
    try {
      // Base map in a dark or a light theme (both configurable). Each theme has a vector style and a raster
      // fallback for when the vector style cannot be loaded.
      var rasterStyle = function (th) {
        var light = th === 'light';
        return {
          version: 8,
          sources: { base: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: CFG.map.rasterTiles, attribution: CFG.map.rasterAttribution } },
          layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': light ? '#e3f1e4' : '#0a101c' } },
            { id: 'base', type: 'raster', source: 'base', paint: light ? { 'raster-opacity': 0.85, 'raster-saturation': -0.25 } :
              { 'raster-opacity': 0.9, 'raster-brightness-max': 0.42, 'raster-saturation': -0.55, 'raster-contrast': 0.1 } }
          ]
        };
      };
      var styleUrl = function (th) { return th === 'light' ? CFG.map.styleUrlLight : CFG.map.styleUrl; };
      // After a vector style loads: tint the light theme pale green and extrude the buildings.
      var dress = function () {
        var st = map.getStyle(); if (!st || !st.sources) { return; }
        var light = theme === 'light', src = Object.keys(st.sources).filter(function (k) { return st.sources[k].type === 'vector'; })[0];
        if (!src) { return; }
        vectorBase = true;
        if (light) { (st.layers || []).forEach(function (ly) { if (ly.type === 'background') { try { map.setPaintProperty(ly.id, 'background-color', CFG.map.lightTint || '#e3f1e4'); } catch (e1) { /* keep the style's own colour */ } } }); }
        if (CFG.map.buildings3d && !map.getLayer('itw-buildings')) {
          try {
            map.addLayer({
              id: 'itw-buildings', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 13,
              paint: {
                'fill-extrusion-color': light ? ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#dfe7dd', 60, '#c3d3c6', 200, '#a9c0b0'] :
                  ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#2b3850', 60, '#42557a', 200, '#5f77a6'],
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': true
              }
            });
          } catch (err) { /* the style has no building layer: keep the flat map */ }
        }
      };
      var loadSeq = 0;
      setTheme = function (th) {
        theme = th === 'light' ? 'light' : 'dark';
        document.body.classList.toggle('map-light', theme === 'light');
        setTimeout(function () { try { drawChart(); } catch (eChart) { /* chart not ready yet */ } }, 0);
        $('themeBtn').textContent = theme === 'light' ? 'Dark map' : 'Light map';
        var seq = ++loadSeq, url = styleUrl(theme), done = false;
        vectorBase = false;
        var fallback = function () { if (!done && seq === loadSeq) { done = true; map.setStyle(rasterStyle(theme)); } };
        if (!url) { fallback(); return; }
        map.setStyle(url);
        var onStyle = function () {
          if (seq !== loadSeq || done) { map.off('style.load', onStyle); return; }
          var st = map.getStyle(), hasVector = st && Object.keys(st.sources || {}).some(function (k) { return st.sources[k].type === 'vector'; });
          if (hasVector) { done = true; map.off('style.load', onStyle); dress(); }       // ignore the raster placeholder's own load event
        };
        map.on('style.load', onStyle);
        setTimeout(fallback, 8000);
        dirty = true; roadLayer = null;
      };
      theme = CFG.map.theme === 'light' ? 'light' : 'dark';
      map = new maplibregl.Map({
        container: 'map', style: rasterStyle(theme),
        bounds: [[b[0], b[1]], [b[2], b[3]]], fitBoundsOptions: { padding: 10 },
        minZoom: 8, maxZoom: 19, maxPitch: 70, attributionControl: false
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
      map.on('error', function () { /* tile or style errors are handled by the fallback timer */ });
      setTheme(theme);
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');
      // Sun-like lighting so 3D vehicles, people and buildings have lit and shaded faces.
      var effects = [];
      try {
        effects = [new deck.LightingEffect({ ambient: new deck.AmbientLight({ color: [255, 255, 255], intensity: 1.15 }),
          sun: new deck.DirectionalLight({ color: [255, 244, 228], intensity: 2.4, direction: [-1.2, -2, -3] }),
          fill: new deck.DirectionalLight({ color: [200, 215, 255], intensity: 0.7, direction: [2, 1.5, -1] }) })];
      } catch (errLight) { effects = []; }
      overlay = new deck.MapboxOverlay({ interleaved: false, layers: [], effects: effects });
      map.addControl(overlay);
    } catch (e) {
      $('map').innerHTML = '<p style="padding:16px;color:#8fa0bd">The map needs WebGL, which is unavailable in this browser. The panels still work.</p>';
      map = null; overlay = null;
    }
  }

  function showPopup(lngLat, title, rows, note) {
    if (!map) { return; }
    if (popup) { popup.remove(); }
    var box = document.createElement('div');
    box.className = 'pop';
    box.innerHTML = '<h3></h3><table>' + rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') +
      '</table>' + (note ? '<div class="muted">' + note + '</div>' : '');
    box.querySelector('h3').textContent = title;
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '290px' }).setLngLat(lngLat).setDOMContent(box).addTo(map);
    return box;
  }
  function roadPopup(i, coordinate) {
    var e = edges[i], bin = binOf(state.t), r = ratioAt(bin, i), occ = occAt(bin, i) * 10 / SLOT;
    showPopup(coordinate, names[e.n] || 'Unnamed road', [
      ['Speed', Math.round(e.s * r) + ' km/h'], ['Speed limit in model', e.s + ' km/h'],
      ['Vehicles on this link', occ.toFixed(occ < 10 ? 1 : 0)], ['Lanes · length', e.l + ' · ' + num(e.m) + ' m']
    ], CLASS_NAME[e.c] + (e.k ? ' ramp' : '') + ' · ' + (fx && fx.flag[i] === 1 ? 'Closed (what-if)' : LEVEL_LABEL[level(r)]) + ' · ' + clock(state.t));
  }
  function accidentPopup(a) {
    var active = state.t >= a.t && state.t < a.t + a.dur;
    showPopup([a.lon, a.lat], a.road, [
      ['Reported', clock(a.t)], ['Severity', a.severity],
      ['Status', state.t < a.t ? 'Not yet occurred' : active ? 'Active' : 'Cleared ' + clock(a.t + a.dur)]
    ], 'Illustrative accident, not a real record');
  }
  function sitePopup(st) {
    var rows = [['Violations today', num(E.at(st.cum, state.t))]];
    E.TYPES.forEach(function (ty, i) { if (st.byType[i]) { rows.push([ty.label + ' (whole day)', num(st.byType[i])]); } });
    showPopup([st.lon, st.lat], st.road, rows, 'Synthetic enforcement camera, not a real site');
  }
  function flyToPoint(lon, lat, zoom) {
    if (!map) { return; }
    setOrbit(false);
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), zoom || 14), duration: 1000 });
  }
  function locate(g) {
    if (!map) { return; }
    setOrbit(false);
    map.fitBounds(g.bounds, { padding: { top: 90, bottom: 120, left: 40, right: 40 }, maxZoom: 14, duration: 800 });
  }
  function setOrbit(on) {
    orbiting = on && !!map;
    $('orbit').setAttribute('aria-pressed', orbiting ? 'true' : 'false');
    if (orbiting && map.getPitch() < 30) { map.easeTo({ pitch: 55, duration: 600 }); $('tilt').setAttribute('aria-pressed', 'true'); }
  }

  /* ---------- deck.gl layers ---------- */
  var roadLayer = null, roadKey = '', drawnSig = '';
  function buildLayers() {
    if (!overlay || !scen[state.scenario] || !day) { return; }
    var bin = binOf(state.t), key = state.scenario + ':' + bin + ':' + (fx ? fx.name : ''), ctr = map.getCenter(), zoom = map.getZoom();
    key += ':' + (zoom >= window.TwinCars.MIN_ZOOM) + ':' + theme;
    var sig = [key, state.t, state.rate, state.cars, state.buses && !!buses, state.bld && !!buildings, state.acc, state.sites, zoom.toFixed(2), ctr.lng.toFixed(4), ctr.lat.toFixed(4), layerStamp].join('|');
    if (sig === drawnSig && roadLayer) { return; }
    drawnSig = sig;
    if (key !== roadKey || !roadLayer) {
      roadKey = key;
      roadLayer = new deck.PathLayer({
        id: 'roads', data: edges, pickable: true,
        getPath: function (e) { return e.path; },
        getColor: function (e) {
          if (fx && fx.flag[e.i] === 1) { return [120, 130, 150, 255]; }
          var lv = level(ratioAt(bin, e.i)), c = RGB[lv];
          return [c[0], c[1], c[2], lv === 'free' ? 110 : 235];
        },
        getWidth: function (e) { return CLASS_WIDTH[e.c] * (e.k ? 0.6 : 1); },
        widthScale: map.getZoom() >= window.TwinCars.MIN_ZOOM ? 0.16 : 1,
        widthUnits: 'meters', widthMinPixels: 1.2, capRounded: true, jointRounded: true,
        updateTriggers: { getColor: key },
        onClick: function (info) { if (info.object) { roadPopup(info.object.i, info.coordinate); } }
      });
    }
    var layers = [], minute = Math.floor(state.t / 60);
    if (state.bld && buildings) {
      layers.push(new deck.PolygonLayer({
        id: 'buildings', data: buildings, extruded: true, wireframe: false,
        getPolygon: function (b) { return b.ring; }, getElevation: function (b) { return b.h; },
        getFillColor: [72, 92, 128, 210], material: { ambient: 0.5, diffuse: 0.6, shininess: 8 }, visible: zoom >= 11.5
      }));
    }
    layers.push(roadLayer);
    // Railways and cycle tracks from OpenStreetMap, drawn under the traffic.
    if (rail && extraShow.rail) {
      layers.push(new deck.PathLayer({ id: 'rail', data: rail, getPath: function (p) { return p; }, getColor: [226, 226, 235, 235], getWidth: 6, widthUnits: 'meters', widthMinPixels: 2,
        getDashArray: [5, 3], dashJustified: true, extensions: deck.PathStyleExtension ? [new deck.PathStyleExtension({ dash: true })] : [] }));
    }
    if (cycle && extraShow.cycle && zoom >= 11.5) {
      layers.push(new deck.PathLayer({ id: 'cycle', data: cycle, getPath: function (p) { return p; }, getColor: [213, 81, 129, 235], getWidth: 3, widthUnits: 'meters', widthMinPixels: 1.4 }));
    }

    // Vehicles: one per vehicle on every link, moving at the link's speed. Dots zoomed out, 3D cars at street level.
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
        occ: function (e) { return occAt(bin, e) * 10 / SLOT; }, ratio: function (e) { return ratioAt(bin, e); }
      });
      simDt = 0;
      if (street) {
        var carScale = zoom >= 17 ? 1.3 : zoom >= 16 ? 2 : zoom >= 15 ? 3 : 4.5;
        var carProps = { data: cars, getPosition: function (c) { return c.p; }, getOrientation: function (c) { return [0, c.yaw, 0]; }, getScale: function (c) { return c.s; }, sizeScale: carScale };
        // Asphalt under the traffic so vehicles sit on a road surface; the congestion colour stays as the thin line on top.
        layers.splice(layers.indexOf(roadLayer), 0, new deck.PathLayer({
          id: 'asphalt', data: visibleEdges, getPath: function (i) { return edges[i].path; }, getColor: theme === 'light' ? [92, 100, 110, 255] : [34, 40, 54, 255],
          getWidth: function (i) { return edges[i].l * 3.5 + 1; }, widthUnits: 'meters', capRounded: true, jointRounded: true, updateTriggers: { getPath: visibleKey } }));
        layers.push(new deck.SimpleMeshLayer(Object.assign({ id: 'cars3d', mesh: window.TwinCars.MESH, getColor: function (c) { return c.c; },
          material: { ambient: 0.42, diffuse: 0.7, shininess: 60, specularColor: [150, 150, 150] } }, carProps)));
        layers.push(new deck.SimpleMeshLayer(Object.assign({ id: 'cars3d-dark', mesh: window.TwinCars.MESH_DARK, getColor: [26, 30, 40],
          material: { ambient: 0.35, diffuse: 0.5, shininess: 90, specularColor: [190, 200, 220] } }, carProps)));
        // People on foot (synthetic) at close zoom.
        if (state.people && zoom >= 15.2) {
          var walkers = window.TwinCars.buildPeople({ edges: edges, visible: visibleEdges, t: state.t, lat: ctr.lat, max: 2500, perKm: (CFG.people || {}).perKmByClass || [0, 0, 6, 12, 16] });
          peopleInView = walkers.length;
          layers.push(new deck.SimpleMeshLayer({ id: 'people', data: walkers, mesh: window.TwinCars.MESH_PERSON, getPosition: function (w) { return w.p; },
            getOrientation: function (w) { return [0, w.yaw, 0]; }, getColor: function (w) { return w.c; }, sizeScale: zoom >= 17 ? 1.6 : zoom >= 16 ? 2.4 : 3.4,
            material: { ambient: 0.5, diffuse: 0.6, shininess: 12 } }));
        } else { peopleInView = 0; }
      } else {
        layers.push(new deck.ScatterplotLayer({
          id: 'cars', data: cars, radiusUnits: 'pixels', getPosition: function (c) { return c.p; },
          getFillColor: (theme === 'light' ? [20, 40, 60] : [255, 255, 255]).concat([zoom < 11.5 ? 110 : zoom < 13 ? 170 : 230]), getRadius: zoom < 11.5 ? 0.6 : zoom < 13 ? 1 : 1.8,
          updateTriggers: { getFillColor: (zoom < 11.5 ? 0 : zoom < 13 ? 1 : 2) + theme }
        }));
      }
    }
    if (state.buses && buses) {
      layers.push(new deck.TripsLayer({
        id: 'buses', data: buses, getPath: function (v) { return v.path; }, getTimestamps: function (v) { return v.ts; },
        getColor: [88, 166, 255], widthMinPixels: 5, capRounded: true, jointRounded: true,
        trailLength: Math.max(18, state.rate * 0.3), currentTime: state.t, fadeTrail: true
      }));
    }
    if (state.sites && ev) {
      layers.push(new deck.ScatterplotLayer({
        id: 'sites', data: ev.sites, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (st) { return [st.lon, st.lat]; },
        getRadius: function (st) { return Math.min(13, 3.5 + Math.sqrt(E.at(st.cum, state.t)) / 4); },
        getFillColor: [181, 140, 255, 210], getLineColor: [20, 12, 40], getLineWidth: 1,
        updateTriggers: { getRadius: state.scenario + state.date + minute },
        onClick: function (info) { if (info.object) { sitePopup(info.object); } }
      }));
    }
    layerProviders.forEach(function (fn) { var extra = fn({ zoom: zoom, minute: minute, bin: bin }); if (extra) { layers = layers.concat(extra); } });
    if (state.acc && ev) {
      var seen = ev.accidents.filter(function (a) { return a.t <= state.t; });
      layers.push(new deck.ScatterplotLayer({
        id: 'accidents', data: seen, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (a) { return [a.lon, a.lat]; },
        getRadius: function (a) { return state.t < a.t + a.dur ? 8 : 3.5; },
        getFillColor: function (a) { return state.t < a.t + a.dur ? [239, 75, 90, 255] : [239, 75, 90, 90]; },
        getLineColor: [255, 255, 255], getLineWidth: function (a) { return state.t < a.t + a.dur ? 2 : 0; },
        updateTriggers: { getRadius: minute, getFillColor: minute, getLineWidth: minute },
        onClick: function (info) { if (info.object) { accidentPopup(info.object); } }
      }));
    }
    overlay.setProps({ layers: layers });
  }
  var layerStamp = 0;
  function redraw() { layerStamp++; dirty = true; }

  /* ---------- what-if road closure (an estimate, not a re-simulation) ---------- */
  function setClosure(name) {
    var g = name ? groups.filter(function (x) { return x.name === name; })[0] : null;
    if (!g) { fx = null; roadLayer = null; redraw(); return null; }
    var n = edges.length, flag = new Uint8Array(n), f = new Float32Array(n), R = CFG.closure.radiusM, pts = [];
    g.idx.forEach(function (i) { flag[i] = 1; pts.push(edges[i].path[edges[i].path.length >> 1]); });
    var kx = 111320 * Math.cos(24.45 * Math.PI / 180), ky = 110570;
    for (var i = 0; i < n; i++) {
      if (flag[i]) { continue; }
      var m = edges[i].path[edges[i].path.length >> 1], best = Infinity;
      for (var k = 0; k < pts.length; k++) { var dd = Math.hypot((m[0] - pts[k][0]) * kx, (m[1] - pts[k][1]) * ky); if (dd < best) { best = dd; } }
      if (best < R) { flag[i] = 2; f[i] = 1 - CFG.closure.speedLoss * (1 - best / R); }      // nearer links lose more speed
    }
    fx = { name: name, flag: flag, f: f, group: g };
    roadLayer = null; redraw();
    return fx;
  }

  /* ---------- panels ---------- */
  function setDelta(el, diff, unit, higherIsBad) {
    if ((state.scenario === 'base' && !fx) || Math.abs(diff) < 0.5) { el.textContent = ''; el.className = 'k-delta'; return; }
    var bad = higherIsBad ? diff > 0 : diff < 0;
    el.textContent = (diff > 0 ? '▲ +' : '▼ −') + num(Math.abs(diff)) + unit + ' vs typical';
    el.className = 'k-delta ' + (bad ? 'bad' : 'good');
  }
  function roadStats(bin, minVehicles) {
    var rows = [];
    groups.forEach(function (g) {
      var occ = 0, free = 0, dist = 0;
      for (var k = 0; k < g.idx.length; k++) {
        var i = g.idx[k], o = occAt(bin, i); if (!o) { continue; }
        var r = ratioAt(bin, i); occ += o; free += o * r; dist += o * r * edges[i].s;
      }
      var veh = occ * 10 / SLOT;
      if (veh >= minVehicles) { rows.push({ g: g, name: g.name, ratio: free / occ, speed: dist / occ, vehicles: veh }); }
    });
    rows.sort(function (a, b) { return a.ratio - b.ratio; });
    return rows;
  }
  function barRow(label, sub, value, share) {
    return '<div class="bar-row"><span>' + label + (sub ? ' <span class="sub">' + sub + '</span>' : '') + '</span><span class="val">' + value +
      '</span><div class="track"><div class="fill" style="width:' + Math.max(0, Math.min(100, share * 100)).toFixed(1) + '%"></div></div></div>';
  }
  function listButton(dotClass, title, sub, right, onClick) {
    var li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<span class="dot ' + dotClass + '"></span><span><span class="c-name"></span><br><span class="c-sub"></span></span><span class="c-speed">' + right + '</span>';
    b.querySelector('.c-name').textContent = title; b.querySelector('.c-sub').textContent = sub;
    b.addEventListener('click', onClick);
    li.appendChild(b);
    return li;
  }
  function eventTotals(id, t) {
    var e = id === state.scenario ? ev : eventsFor(id);
    if (!e) { return null; }
    var fines = 0, value = 0, byType = E.TYPES.map(function (ty, i) { var c = E.at(e.cumByType[i], t); fines += c; value += c * ty.aed; return c; });
    var seen = e.accidents.filter(function (a) { return a.t <= t; });
    return { ev: e, fines: fines, value: value, byType: byType, seen: seen,
      active: seen.filter(function (a) { return t < a.t + a.dur; }), injury: seen.filter(function (a) { return a.severity !== 'Damage only'; }).length };
  }

  function renderPanels() {
    var bin = binOf(state.t), k = kpiAt(state.scenario, state.t), kb = kpiAt('base', state.t, baseDay), sm = scenarioMeta(state.scenario);
    if (fx) { kb = scenarioMeta(state.scenario).bins[bin]; }        // with a closure, compare against the same case without it
    $('viewLabel').textContent = sm.label + (fx ? ' · ' + fx.name + ' closed' : '');
    $('kSpeed').innerHTML = (k.speed == null ? '–' : Math.round(k.speed)) + '<small>km/h</small>';
    $('kCong').innerHTML = '+' + Math.round(k.extra) + '<small>%</small>';
    $('kVeh').textContent = num(k.vehicles);
    $('kDelay').innerHTML = num(k.delay_h) + '<small>veh-h</small>';
    setDelta($('dSpeed'), (k.speed || 0) - (kb.speed || 0), ' km/h', false);
    setDelta($('dCong'), k.extra - kb.extra, ' pts', true);
    setDelta($('dVeh'), k.vehicles - kb.vehicles, '', true);
    setDelta($('dDelay'), k.delay_h - kb.delay_h, ' veh-h', true);

    var rows = roadStats(bin, 15).slice(0, 8);
    var later = kpiAt(state.scenario, state.t + 1800), trend = (later.speed || 0) - (k.speed || 0);
    var trendText = Math.abs(trend) < 1.5 ? 'holds steady' : (trend < 0 ? 'drops about ' + Math.abs(trend).toFixed(0) + ' km/h' : 'rises about ' + trend.toFixed(0) + ' km/h');
    $('insight').textContent = (rows.length ? 'Slowest named road: ' + rows[0].name + ' at ' + Math.round(rows[0].speed) + ' km/h. ' : '') +
      'Over the next 30 minutes network speed ' + trendText + '.';
    var list = $('corridors'); list.innerHTML = '';
    rows.forEach(function (r) {
      var lv = level(r.ratio);
      list.appendChild(listButton(lv, r.name, LEVEL_LABEL[lv] + ' · ' + Math.round(r.ratio * 100) + '% of limit · ' + num(r.vehicles) + ' vehicles',
        Math.round(r.speed) + '<small>km/h</small>', function () { locate(r.g); }));
    });
    if (!rows.length) { list.innerHTML = '<li class="muted">No named road has enough traffic at this time.</li>'; }

    var n = edges.length, tot = [0, 0, 0, 0, 0], slow = [0, 0, 0, 0, 0];
    for (var i = 0; i < n; i++) { var o = occAt(bin, i); if (o) { tot[edges[i].c] += o; if (ratioAt(bin, i) < 0.6) { slow[edges[i].c] += o; } } }
    $('classBars').innerHTML = CLASS_NAME.map(function (name, c) {
      var share = tot[c] ? slow[c] / tot[c] : 0;
      return barRow(name + 's', num(tot[c] * 10 / SLOT) + ' vehicles', Math.round(share * 100) + '%', share);
    }).join('');
    renderEvents();
    drawChart();
    minuteHooks.forEach(function (fn) { fn(); });
  }

  // Accidents, fines and their dashboard tiles. Runs once per shown minute.
  function renderEvents() {
    var cur = eventTotals(state.scenario, state.t), base = state.scenario !== 'base' ? eventTotals('base', state.t) : null;
    if (!cur) { return; }
    $('kAcc').textContent = num(cur.seen.length);
    $('kFines').textContent = num(cur.fines);
    if (base) { setDelta($('dAcc'), cur.seen.length - base.seen.length, '', true); setDelta($('dFines'), cur.fines - base.fines, '', true); }
    else { $('dAcc').textContent = ''; $('dFines').textContent = ''; }
    $('aTotal').textContent = num(cur.seen.length);
    $('aActive').textContent = num(cur.active.length);
    $('aInjury').textContent = num(cur.injury);
    var list = $('accList'); list.innerHTML = '';
    cur.seen.slice().reverse().slice(0, 12).forEach(function (a) {
      var active = state.t < a.t + a.dur;
      list.appendChild(listButton(active ? 'acc-active' : 'acc-past', a.road, a.severity + ' · ' + (active ? 'active' : 'cleared ' + clock(a.t + a.dur)), clock(a.t),
        function () { flyToPoint(a.lon, a.lat); accidentPopup(a); }));
    });
    if (!cur.seen.length) { list.innerHTML = '<li class="muted">No accidents yet today.</li>'; }
    $('fTotal').textContent = num(cur.fines);
    $('fValue').innerHTML = num(cur.value) + '<small>AED</small>';
    var maxType = Math.max.apply(null, cur.byType.concat([1]));
    $('typeBars').innerHTML = E.TYPES.map(function (ty, i) { return barRow(ty.label, 'AED ' + num(ty.aed) + ' each', num(cur.byType[i]), cur.byType[i] / maxType); }).join('');
    var sl = $('siteList'); sl.innerHTML = '';
    cur.ev.sites.map(function (st) { return { st: st, n: E.at(st.cum, state.t) }; }).sort(function (a, z) { return z.n - a.n; }).slice(0, 8).forEach(function (row) {
      sl.appendChild(listButton('site', row.st.road, CLASS_NAME[edges[row.st.edge].c], num(row.n) + '<small>fines</small>', function () { flyToPoint(row.st.lon, row.st.lat); sitePopup(row.st); }));
    });
  }

  function fact(label, sub, value) { return '<tr><td>' + label + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</td><td>' + value + '</td></tr>'; }
  function renderFacts() {
    var sm = scenarioMeta(state.scenario), s = sm.stats || {}, nw = meta.network, kc = nw.km_by_class || {}, bs = meta.buses || {}, bl = meta.buildings || {};
    $('winLabel').textContent = clock(meta.sim_begin) + '–' + clock(meta.sim_end);
    $('tripFacts').innerHTML =
      fact('Vehicle trips simulated', 'assumed total, not counted', num(sm.trips)) + fact('Trips completed in the window', '', num(s.completed || 0)) +
      fact('Average trip', 'inside the study area', (s.km || '–') + ' km · ' + (s.min || '–') + ' min') + fact('Average trip speed', '', (s.kmh || '–') + ' km/h') +
      fact('Average time lost', 'against free-flowing roads', (s.min_lost || '–') + ' min') + fact('Trip ends placed by', '', meta.demand.trip_ends) +
      fact('Rest of the day', 'synthetic: simulated states re-used on an assumed daily curve', '24 h');
    $('builtLabel').textContent = 'Built ' + meta.built;
    $('netFacts').innerHTML =
      fact('Roads in the model', 'motorway to tertiary, by direction', num(nw.km) + ' km') + fact('Motorway · trunk', '', num(kc.motorway || 0) + ' · ' + num(kc.trunk || 0) + ' km') +
      fact('Primary · secondary · tertiary', '', num(kc.primary || 0) + ' · ' + num(kc.secondary || 0) + ' · ' + num(kc.tertiary || 0) + ' km') +
      fact('Road links · junctions', '', num(nw.edges) + ' · ' + num(nw.junctions)) + fact('Traffic signals', 'positions from OpenStreetMap; timings generic', num(nw.signals)) +
      fact('Bus runs in the window', bs.available ? num(bs.lines) + ' lines, from the timetable' : 'timetable not loaded in this build', bs.available ? num(bs.runs) : '–') +
      fact('Building footprints', bl.available ? num(bl.shown) + ' largest available as a layer' : 'not loaded in this build', bl.available ? num(bl.count) : '–') +
      fact('Road data date', 'OpenStreetMap via Geofabrik', String(meta.osm_timestamp).slice(0, 10));
  }

  /* ---------- day profile chart ---------- */
  function daySeries(id, dayModel) { var bins = scenarioMeta(id).bins, out = []; for (var s = 0; s < SLOTS; s += 3) { out.push(bins[dayModel.map[s]].speed || 0); } return out; }
  function drawChart() {
    var cv = $('chart'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !meta || !day) { return; }
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    var base = daySeries(scenarioMeta('base') ? 'base' : state.scenario, baseDay), cur = daySeries(state.scenario, day), all = base.concat(cur);
    var top = Math.ceil(Math.max.apply(null, all) / 10) * 10, bottom = Math.max(0, Math.floor(Math.min.apply(null, all) / 10) * 10 - 10);
    if (top <= bottom) { top = bottom + 10; }
    var padL = 30, padR = 8, padT = 8, padB = 20, n = cur.length;
    function x(f) { return padL + (w - padL - padR) * f; }
    function y(v) { return padT + (h - padT - padB) * (1 - (v - bottom) / (top - bottom)); }
    g.font = '10.5px system-ui, sans-serif'; g.fillStyle = cssVar('--muted', '#8fa0bd'); g.strokeStyle = cssVar('--line', '#22314d'); g.lineWidth = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    [bottom, (top + bottom) / 2, top].forEach(function (v) { g.beginPath(); g.moveTo(padL, y(v)); g.lineTo(w - padR, y(v)); g.stroke(); g.fillText(Math.round(v), padL - 6, y(v)); });
    g.textAlign = 'center'; g.textBaseline = 'top';
    [0, 6, 12, 18, 24].forEach(function (hr) { g.fillText(pad(hr) + ':00', Math.min(Math.max(x(hr / 24), padL + 14), w - padR - 14), h - padB + 6); });
    function line(arr, color, dash, width) {
      g.beginPath(); arr.forEach(function (v, i) { var px = x(i / (n - 1)); if (i) { g.lineTo(px, y(v)); } else { g.moveTo(px, y(v)); } });
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.stroke(); g.setLineDash([]);
    }
    line(base, cssVar('--muted', '#6f84a8'), [4, 4], 1.5);
    line(cur, 'rgb(45,212,167)', [], 2);
    var mx = x(state.t / DAY), k = kpiAt(state.scenario, state.t);
    g.strokeStyle = cssVar('--text', '#fff'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(mx, padT); g.lineTo(mx, h - padB); g.stroke();
    g.fillStyle = cssVar('--text', '#fff'); g.beginPath(); g.arc(mx, y(Math.max(bottom, Math.min(top, k.speed || 0))), 3.5, 0, Math.PI * 2); g.fill();
  }

  /* ---------- controls ---------- */
  function setPlaying(p) { state.playing = p; $('play').textContent = p ? '❚❚' : '▶'; $('play').setAttribute('aria-label', p ? 'Pause' : 'Play'); }
  function setRate(r) {
    state.rate = r;
    Array.prototype.forEach.call($('rate').children, function (c) { var on = Number(c.getAttribute('data-rate')) === r; c.classList.toggle('on', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
  }
  function showTab(id) {
    Array.prototype.forEach.call($('tabs').querySelectorAll('[data-tab]'), function (b) {
      var on = b.getAttribute('data-tab') === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.panel section[data-tab]'), function (sec) {
      sec.hidden = sec.getAttribute('data-tab') !== id || sec.getAttribute('data-locked') === '1';
    });
    setPanel(true); drawChart();
  }
  function setPanel(open) {
    document.querySelector('.layout').classList.toggle('panel-open', open); $('panelOpen').hidden = open;
    if (open) { drawChart(); }
    syncFull();
  }
  function syncFull() {
    var allHidden = !document.querySelector('.layout').classList.contains('panel-open') && $('legend').classList.contains('min') && $('sites').classList.contains('min');
    $('fullView').setAttribute('aria-pressed', allHidden ? 'true' : 'false');
  }
  function goSite(st) {
    if (!map) { return; }
    setOrbit(false);
    Array.prototype.forEach.call($('sites').querySelectorAll('.chip'), function (c) { c.classList.toggle('on', c.textContent === st[0]); });
    $('goto').value = '';
    if (popup) { popup.remove(); }
    map.flyTo({ center: [st[1], st[2]], zoom: st[3], pitch: 55, duration: 1400 });
    $('tilt').setAttribute('aria-pressed', 'true');
    var box = $('showBld');
    if (!vectorBase && !$('bldRow').hidden && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change')); }
  }
  function setScenario(id) {
    $('scenario').disabled = true;
    return loadScenario(id).then(function () { state.scenario = id; $('scenario').value = id; rebuildDay(); renderFacts(); audit('Demand case: ' + scenarioMeta(id).label); })
      .catch(function () { $('scenario').value = state.scenario; }).then(function () { $('scenario').disabled = false; });
  }

  var majorRoads = [];
  function wireControls() {
    $('rate').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) { return; }
      var r = Number(b.getAttribute('data-rate'));
      if (state.mode === 'live' && r === 1) { state.t = nowLocal().tod; }   // 1× in Live locks back onto the clock
      updateModeUI(true);
      setRate(r); setPlaying(true);
    });
    $('play').addEventListener('click', function () { if (state.mode === 'live') { setMode('hist'); setPlaying(false); } else { setPlaying(!state.playing); } });
    $('time').addEventListener('input', function () { if (state.mode === 'live') { setMode('hist'); } jumpTo(Number($('time').value)); updateModeUI(true); });
    $('tilt').addEventListener('click', function () {
      var on = $('tilt').getAttribute('aria-pressed') !== 'true';
      $('tilt').setAttribute('aria-pressed', on ? 'true' : 'false');
      if (map) { map.easeTo({ pitch: on ? 55 : 0, duration: 600 }); }
    });
    $('orbit').addEventListener('click', function () { setOrbit(!orbiting); });
    if (map) {
      ['mousedown', 'touchstart', 'wheel'].forEach(function (evn) { map.getCanvasContainer().addEventListener(evn, function () { if (orbiting) { setOrbit(false); } }, { passive: true }); });
    }

    // Live / historical. Hours are listed 00–23 so the clock is always 24-hour.
    for (var h = 0; h < 24; h++) { var oh = document.createElement('option'); oh.value = oh.textContent = pad(h); $('hHour').appendChild(oh); }
    for (var mi = 0; mi < 60; mi += 5) { var om = document.createElement('option'); om.value = om.textContent = pad(mi); $('hMin').appendChild(om); }
    $('mode').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { setMode(b.getAttribute('data-mode')); audit('Mode: ' + b.getAttribute('data-mode')); } });
    function histChanged() { setDate($('hDate').value || nowLocal().iso); setPlaying(false); jumpTo(Number($('hHour').value) * 3600 + Number($('hMin').value) * 60); updateModeUI(true); }
    $('hDate').addEventListener('change', histChanged); $('hHour').addEventListener('change', histChanged); $('hMin').addEventListener('change', histChanged);

    // Quick navigation: major-site chips on the map, and the longest major roads in the top bar.
    majorRoads = groups.filter(function (g) { return g.c <= 2 && g.m >= 5000; }).sort(function (a, b) { return b.m - a.m; }).slice(0, 30).sort(function (a, b) { return a.name.localeCompare(b.name); });
    SITES.forEach(function (st) { var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = st[0]; b.addEventListener('click', function () { goSite(st); }); $('sites').appendChild(b); });
    majorRoads.forEach(function (g, i) { var o = document.createElement('option'); o.value = 'r' + i; o.textContent = g.name; $('gotoRoads').appendChild(o); });
    $('goto').addEventListener('change', function () {
      var v = $('goto').value; if (!v || !map) { return; }
      setOrbit(false);
      Array.prototype.forEach.call($('sites').querySelectorAll('.chip'), function (c) { c.classList.remove('on'); });
      if (popup) { popup.remove(); }
      if (v === 'all') { map.fitBounds([[meta.bbox[0], meta.bbox[1]], [meta.bbox[2], meta.bbox[3]]], { padding: 10, pitch: 0, bearing: 0, duration: 900 }); $('tilt').setAttribute('aria-pressed', 'false'); }
      else { locate(majorRoads[Number(v.slice(1))]); }
    });

    var sel = $('scenario');
    meta.scenarios.forEach(function (s) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.label; sel.appendChild(o); });
    sel.value = state.scenario;
    sel.addEventListener('change', function () { setScenario(sel.value); });

    $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) { showTab(b.getAttribute('data-tab')); } });
    Array.prototype.forEach.call(document.querySelectorAll('[data-goto]'), function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-goto')); }); });

    // Full-view map: the panel, legend and site chips can each be minimised, or all at once.
    $('panelMin').addEventListener('click', function () { setPanel(false); });
    $('panelOpen').addEventListener('click', function () { setPanel(true); });
    $('legendMin').addEventListener('click', function () { $('legend').classList.toggle('min'); syncFull(); });
    $('sitesMin').addEventListener('click', function () { $('sites').classList.toggle('min'); syncFull(); });
    $('fullView').addEventListener('click', function () {
      var hide = $('fullView').getAttribute('aria-pressed') !== 'true';
      $('legend').classList.toggle('min', hide); $('sites').classList.toggle('min', hide); setPanel(!hide);
    });
    var narrow = window.matchMedia('(max-width: 860px)').matches;
    $('legend').classList.add('min');
    setPanel(!narrow);

    $('showAcc').addEventListener('change', function (e) { state.acc = e.target.checked; });
    $('showSites').addEventListener('change', function (e) { state.sites = e.target.checked; });
    $('showPeople').addEventListener('change', function (e) { state.people = e.target.checked; redraw(); });
    $('themeBtn').addEventListener('click', function () { setTheme(theme === 'light' ? 'dark' : 'light'); });
    $('showCars').addEventListener('change', function (e) { state.cars = e.target.checked; });
    $('showBuses').addEventListener('change', function (e) { state.buses = e.target.checked; });
    $('showBld').addEventListener('change', function (e) {
      state.bld = e.target.checked;
      if (state.bld && !buildings) {
        getJSON('data/buildings.json').then(function (rows) {
          buildings = rows.map(function (r) { var ring = []; for (var i = 0; i < r[1].length; i += 2) { ring.push([r[1][i], r[1][i + 1]]); } return { h: r[0], ring: ring }; });
          redraw();
        }).catch(function () { $('bldNote').textContent = '(could not load)'; });
      }
    });
    window.addEventListener('resize', drawChart);
  }

  /* ---------- main loop ---------- */
  var last = performance.now(), lastKey = '', lastLabel = '';
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.25); last = now;
    if (state.mode === 'live' && state.rate === 1) {
      var n = nowLocal();
      if (n.iso !== state.date) { state.date = n.iso; rebuildDay(); }
      state.t = n.tod;
    } else if (state.playing) {
      state.t += dt * state.rate; if (state.t >= DAY) { state.t -= DAY; }
    }
    var step = state.t - prevT; prevT = state.t;
    if (step > 0 && step < 120) { simDt += step; }
    if (orbiting && map && !map.isEasing()) { map.setBearing(map.getBearing() + 6 * dt); }
    var key = binOf(state.t) + '|' + slotOf(state.t), label = clock(state.t);
    if (key !== lastKey || dirty) { lastKey = key; dirty = false; lastLabel = label; $('time').value = Math.round(state.t); renderPanels(); }
    else if (label !== lastLabel) { lastLabel = label; $('time').value = Math.round(state.t); drawChart(); renderEvents(); minuteHooks.forEach(function (fn) { fn(); }); }
    updateModeUI(false);
    buildLayers();
    requestAnimationFrame(frame);
  }

  /* ---------- audit hook (implemented in js/ops.js) ---------- */
  function audit(action) { if (window.IntelliTwin && window.IntelliTwin.audit) { window.IntelliTwin.audit(action); } }

  /* ---------- public interface for the other modules ---------- */
  function clickIf(id, want) { if (($(id).getAttribute('aria-pressed') === 'true') !== want) { $(id).click(); } }
  window.IntelliTwin = {
    state: state, getMap: function () { return map; },
    core: {
      CFG: CFG, $: $, num: num, pad: pad, clock: clock, level: level, LEVEL_LABEL: LEVEL_LABEL, CLASS_NAME: CLASS_NAME, SLOT: SLOT, SLOTS: SLOTS, DAY: DAY,
      meta: function () { return meta; }, edges: function () { return edges; }, names: function () { return names; }, groups: function () { return groups; },
      majorRoads: function () { return majorRoads; }, signals: function () { return signals; }, day: function () { return day; }, events: function () { return ev; },
      scenarioMeta: scenarioMeta, binNow: function () { return binOf(state.t); }, binAt: binOf, ratio: function (i) { return ratioAt(binOf(state.t), i); },
      occ: function (i) { return occAt(binOf(state.t), i) * 10 / SLOT; }, ratioAt: ratioAt, occAt: function (bin, i) { return occAt(bin, i) * 10 / SLOT; },
      kpiAt: kpiAt, roadStats: roadStats, eventTotals: eventTotals, showPopup: showPopup, flyTo: flyToPoint, locate: locate, listButton: listButton,
      fact: fact, barRow: barRow, addLayers: function (fn) { layerProviders.push(fn); }, onMinute: function (fn) { minuteHooks.push(fn); },
      startFocus: function () { return startFocus; }, theme: function () { return theme; }, setTheme: function (th) { setTheme(th); }, peopleInView: function () { return peopleInView; }, zones: function () { return zones; }, onZones: function (fn) { if (zones) { fn(zones); } else { zoneHooks.push(fn); } },
      railKm: function () { return (meta.extra || {}).rail_km || 0; }, cycleKm: function () { return (meta.extra || {}).cycle_km || 0; }, setPlaying: setPlaying,
      onReady: function (fn) { if (meta && day) { fn(); } else { readyHooks.push(fn); } }, redraw: redraw, setClosure: setClosure,
      closure: function () { return fx; }, showTab: showTab, prettyDate: prettyDate, daySeriesKpi: function (id) { var d = id === state.scenario ? day : baseDay, bins = scenarioMeta(id).bins, out = []; for (var s = 0; s < SLOTS; s++) { out.push(bins[d.map[s]]); } return out; }
    },
    // Used by js/assistant.js to read the data and operate the twin.
    api: {
      timeText: function () { return clock(state.t); },
      scenarioLabel: function () { return scenarioMeta(state.scenario).label; },
      kpi: function () { return kpiAt(state.scenario, state.t); },
      kpiIn: function (minutes) { return kpiAt(state.scenario, state.t + minutes * 60); },
      compare: function () { return meta.scenarios.map(function (sm) { var d = window.TwinDay.build(sm.bins, state.date, CFG.time), k = sm.bins[d.map[slotOf(state.t)]]; return { label: sm.label, speed: k.speed, vehicles: k.vehicles, extra: k.extra }; }); },
      slowest: function () { return roadStats(binOf(state.t), 15).slice(0, 8); },
      events: function () {
        var e = eventTotals(state.scenario, state.t);
        if (!e) { return null; }
        var lastA = e.seen[e.seen.length - 1], top = 0;
        e.byType.forEach(function (c, i) { if (c > e.byType[top]) { top = i; } });
        return { accidents: e.seen.length, active: e.active.length, injury: e.injury, fines: e.fines, value: e.value, topType: E.TYPES[top].label,
          latest: lastA ? lastA.road + ' at ' + clock(lastA.t) + ', ' + lastA.severity.toLowerCase() : '' };
      },
      sites: function () { return SITES.map(function (st) { return st[0]; }); },
      roads: function () { return groups.map(function (g) { return g.name; }); },
      goSite: function (name) { var st = SITES.filter(function (x) { return x[0] === name; })[0]; if (st) { goSite(st); } },
      goRoad: function (name) {
        var g = groups.filter(function (x) { return x.name === name; })[0];
        if (!g) { return null; }
        locate(g);
        return roadStats(binOf(state.t), 0).filter(function (r) { return r.name === name; })[0] || null;
      },
      goAll: function () { $('goto').value = 'all'; $('goto').dispatchEvent(new Event('change')); },
      setScenario: function (id) { return setScenario(id).then(function () { return new Promise(function (res) { setTimeout(res, 30); }); }); },
      setTime: function (tod) { if (state.mode === 'live') { setMode('hist'); } setPlaying(false); jumpTo(tod); updateModeUI(true); return ''; },
      setTab: showTab,
      orbit: function (on) { setOrbit(on); },
      tilt: function (on) { clickIf('tilt', on); },
      play: function (on) { if (state.mode === 'live' && !on) { setMode('hist'); } setPlaying(on); },
      live: function () { setMode('live'); },
      closeRoad: function (name) { var c = window.IntelliTwin.ops; return c ? c.closeRoad(name) : null; },
      alerts: function () { var c = window.IntelliTwin.ops; return c ? c.alerts() : []; }
    }
  };

  /* ---------- start ---------- */
  getJSON('data/meta.json').then(function (m) { meta = m; return getJSON('data/roads.json'); }).then(function (roads) {
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
    var now = nowLocal();
    state.date = now.iso; state.t = now.tod;
    $('hDate').max = now.iso;
    // Fix the illustrative accident rate and enforcement sites on a reference working day, so every date is comparable.
    E.generate(meta, edges, names, scen[state.scenario], 'reference', calib, window.TwinDay.build(scenarioMeta(state.scenario).bins, '2026-01-06', CFG.time).map);
    rebuildDay();
    initMap();
    wireControls();
    $('carNote').textContent = '(every vehicle; zoom in for 3D)';
    if (meta.buildings && meta.buildings.available) { $('bldRow').hidden = false; $('bldNote').textContent = '(' + num(meta.buildings.shown) + ' largest, heights estimated)'; }
    renderFacts();
    setMode('live');
    // Start-up view from config.js: replay speed, full view, and the camera on the most congested road.
    var st = CFG.start || {};
    if (st.mode === 'replay') { setMode('hist'); setRate(st.rate || 30); setPlaying(true); }
    // Full view at start minimises the panel and legend; the site chips stay so the selected site is visible.
    if (st.fullView) { $('legend').classList.add('min'); setPanel(false); }
    if (typeof syncFull === 'function') { syncFull(); }
    if (st.focus === 'most-congested-site' && map) {
      // Pick the major site (one of the chips) with the slowest traffic around it, and select it.
      var sb = binOf(state.t), kxs = 111320 * Math.cos(24.4 * Math.PI / 180), worst = null;
      SITES.forEach(function (site) {
        var occ = 0, free = 0;
        for (var ei = 0; ei < edges.length; ei++) {
          var mp = edges[ei].path[edges[ei].path.length >> 1];
          if (Math.hypot((mp[0] - site[1]) * kxs, (mp[1] - site[2]) * 110570) > 1500) { continue; }
          var o = occAt(sb, ei); if (o) { occ += o; free += o * ratioAt(sb, ei); }
        }
        var veh = occ * 10 / SLOT, ratio = occ ? free / occ : 1;
        if (veh >= 30 && (!worst || ratio < worst.ratio)) { worst = { site: site, ratio: ratio }; }
      });
      var pick = worst ? worst.site : SITES[0];
      goSite(pick);
      map.jumpTo({ center: [pick[1], pick[2]], zoom: pick[3], pitch: 55 });      // no fly-in on first load
      startFocus = pick[0];
    }
    if (st.focus === 'most-congested' && map) {
      var busy = roadStats(binOf(state.t), 60).filter(function (r) { return r.g.c <= 3; })[0] ||
        roadStats(binOf(state.t), 0).sort(function (a, b) { return b.vehicles - a.vehicles; })[0];
      if (busy) {
        var gb = busy.g.bounds;
        map.jumpTo({ center: [(gb[0][0] + gb[1][0]) / 2, (gb[0][1] + gb[1][1]) / 2], zoom: 14.6, pitch: 58 });
        $('tilt').setAttribute('aria-pressed', 'true');
        startFocus = busy.name;
      }
    }
    if (st.orbit && map) { setOrbit(true); }
    readyHooks.forEach(function (fn) { fn(); });
    requestAnimationFrame(frame);
    if (meta.buses && meta.buses.available) {
      getBuf('data/buses.bin').then(function (buf) {
        buses = parsePaths(buf, meta.sim_begin); $('busRow').hidden = false; $('legendBus').hidden = false;
        $('busNote').textContent = '(' + num(meta.buses.runs) + ' runs, ' + clock(meta.sim_begin) + '–' + clock(meta.sim_end) + ')';
      }).catch(function () {});
    }
    // Railways, cycle tracks and critical sites from OpenStreetMap (present after a data build that exports them).
    function lines(rows) { return rows.map(function (r) { var p = []; for (var i = 0; i < r.length; i += 2) { p.push([r[i], r[i + 1]]); } return p; }); }
    getJSON('data/rail.json').then(function (rows) { if (rows.length) { rail = lines(rows); $('railRow').hidden = false; $('legendRail').hidden = false; $('railNote').textContent = '(' + num((meta.extra || {}).rail_km || 0) + ' km)'; redraw(); } }).catch(function () {});
    getJSON('data/cycle.json').then(function (rows) { if (rows.length) { cycle = lines(rows); $('cycleRow').hidden = false; $('legendCycle').hidden = false; $('cycleNote').textContent = '(' + num((meta.extra || {}).cycle_km || 0) + ' km)'; redraw(); } }).catch(function () {});
    getJSON('data/zones.json').then(function (rows) { zones = rows; zoneHooks.forEach(function (fn) { fn(rows); }); redraw(); }).catch(function () { zoneHooks.forEach(function (fn) { fn([]); }); });
    $('showRail').addEventListener('change', function (e) { extraShow.rail = e.target.checked; redraw(); });
    $('showCycle').addEventListener('change', function (e) { extraShow.cycle = e.target.checked; redraw(); });
    getJSON('data/signals.json').then(function (rows) { signals = rows; $('sigRow').hidden = false; redraw(); }).catch(function () {});
  }).catch(function (err) {
    if (window.console) { console.warn('IntelliTwin data not loaded:', err && err.message); }
    $('nodata').hidden = false;
  });
})();
