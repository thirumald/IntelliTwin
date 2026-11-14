/* IntelliTwin — replays the SUMO pipeline output in data/ with MapLibre and deck.gl. */
(function () {
  'use strict';

  var RGB = { free: [45, 212, 167], moderate: [245, 197, 66], heavy: [245, 138, 66], severe: [239, 75, 90] };
  var LEVEL_LABEL = { free: 'Free flow', moderate: 'Moderate', heavy: 'Heavy', severe: 'Severe' };
  var CLASS_NAME = ['Motorway', 'Trunk road', 'Primary road', 'Secondary road', 'Tertiary road'];
  var CLASS_WIDTH = [16, 14, 11, 9, 7];           // metres
  var $ = function (id) { return document.getElementById(id); };

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
  var map = null, overlay = null, popup = null;
  var state = { t: 0, playing: true, rate: 120, scenario: 'base', cars: true, buses: true, bld: false };
  var t0 = 0, t1 = 0;      // display window, seconds since the simulation began

  function scenarioMeta(id) { return meta.scenarios.filter(function (s) { return s.id === id; })[0]; }
  function binOf(t) { return Math.max(0, Math.min(meta.bins - 1, Math.floor(t / meta.bin_seconds))); }
  function ratioOf(d, bin, i) { var v = d.speed[bin * edges.length + i]; return v === 255 ? 1 : v / 100; }

  function loadScenario(id) {
    if (scen[id]) { return Promise.resolve(scen[id]); }
    return Promise.all([getBuf('data/' + id + '_speed.bin'), getBuf('data/' + id + '_occ.bin'), getBuf('data/' + id + '_trips.bin')])
      .then(function (r) {
        scen[id] = { speed: new Uint8Array(r[0]), occ: new Uint16Array(r[1]), trips: parsePaths(r[2]) };
        return scen[id];
      });
  }

  /* ---------- map ---------- */
  function initMap() {
    var b = meta.bbox;
    try {
      map = new maplibregl.Map({
        container: 'map',
        style: {
          version: 8,
          sources: {
            base: {
              type: 'raster', tileSize: 256,
              tiles: ['a', 'b', 'c', 'd'].map(function (s) { return 'https://' + s + '.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'; }),
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
            }
          },
          layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#0a101c' } },
            { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': 0.7 } }
          ]
        },
        bounds: [[b[0], b[1]], [b[2], b[3]]],
        fitBoundsOptions: { padding: 10 },
        minZoom: 8, maxZoom: 17, maxPitch: 65,
        attributionControl: { compact: true }
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
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

  var roadLayer = null, roadKey = '', drawnSig = '';
  function buildLayers() {
    if (!overlay) { return; }
    var d = scen[state.scenario];
    if (!d) { return; }
    var bin = binOf(state.t), key = state.scenario + ':' + bin;
    // Skip the redraw when nothing visible has changed (for example while paused).
    var sig = [key, state.t, state.rate, state.cars, state.buses && !!buses, state.bld && !!buildings, map.getZoom() >= 11.5].join('|');
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
    if (state.cars) {
      layers.push(new deck.TripsLayer({
        id: 'cars', data: d.trips, getPath: function (v) { return v.path; }, getTimestamps: function (v) { return v.ts; },
        getColor: [255, 255, 255], widthMinPixels: 3, capRounded: true, jointRounded: true,
        trailLength: trail, currentTime: state.t, fadeTrail: true
      }));
    }
    if (state.buses && buses) {
      layers.push(new deck.TripsLayer({
        id: 'buses', data: buses, getPath: function (v) { return v.path; }, getTimestamps: function (v) { return v.ts; },
        getColor: [88, 166, 255], widthMinPixels: 5, capRounded: true, jointRounded: true,
        trailLength: trail * 1.5, currentTime: state.t, fadeTrail: true
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
    drawChart();
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
    slider.addEventListener('input', function () { state.t = Number(slider.value); dirty = true; });
    $('tilt').addEventListener('click', function () {
      var on = $('tilt').getAttribute('aria-pressed') !== 'true';
      $('tilt').setAttribute('aria-pressed', on ? 'true' : 'false');
      if (map) { map.easeTo({ pitch: on ? 55 : 0, duration: 600 }); }
    });
    var sel = $('scenario');
    meta.scenarios.forEach(function (s) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.label; sel.appendChild(o); });
    sel.value = state.scenario;
    sel.addEventListener('change', function () {
      var id = sel.value; sel.disabled = true;
      loadScenario(id).then(function () { state.scenario = id; roadLayer = null; renderFacts(); dirty = true; })
        .catch(function () { sel.value = state.scenario; }).then(function () { sel.disabled = false; });
    });
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
          if (map && map.getZoom() < 12) { map.easeTo({ zoom: 12.5, pitch: 50 }); $('tilt').setAttribute('aria-pressed', 'true'); }
        }).catch(function () { $('bldNote').textContent = '(could not load)'; });
      }
    });
    window.addEventListener('resize', drawChart);
  }

  /* ---------- main loop ---------- */
  var last = performance.now(), lastBin = -1, lastLabel = '';
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.25); last = now;
    if (state.playing) { state.t += dt * state.rate; if (state.t >= t1) { state.t = t0; } }
    var bin = binOf(state.t), label = clock(meta.sim_begin + state.t);
    if (bin !== lastBin || dirty) { lastBin = bin; dirty = false; renderPanels(); }
    if (label !== lastLabel) { lastLabel = label; $('clock').textContent = label; $('time').value = Math.round(state.t); drawChart(); }
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
        var g = byName[name] = byName[name] || { name: name, idx: [], m: 0, bounds: [[180, 90], [-180, -90]] };
        g.idx.push(i); g.m += e.m;
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
    $('carNote').textContent = '(1 dot ≈ ' + Math.round(1 / meta.trip_sample) + ' vehicles)';
    if (meta.buildings && meta.buildings.available) {
      $('bldRow').hidden = false;
      $('bldNote').textContent = '(' + num(meta.buildings.shown) + ' largest, heights mostly estimated)';
    }
    renderFacts();
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

  window.IntelliTwin = { state: state, getMap: function () { return map; } };
})();
