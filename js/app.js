/* IntelliTwin UI — map, playback, forecast and what-if controls. */
(function () {
  'use strict';

  var M = window.TwinModel;
  var COLORS = { free: '#2dd4a7', moderate: '#f5c542', heavy: '#f58a42', severe: '#ef4b5a' };
  var LEVEL_LABEL = { free: 'Free flow', moderate: 'Moderate', heavy: 'Heavy', severe: 'Severe' };
  var VEHICLES_PER_DOT = 45;   // one dot stands for this many vehicles
  var MAX_DOTS = 70;           // per corridor direction
  var VISUAL_WARP = 90;        // dots move this many times faster than real speed

  var $ = function (id) { return document.getElementById(id); };

  function wallClockMinutes() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  var state = {
    minutes: 450,            // simulated time of day, minutes since midnight
    playing: true,
    rate: 600,               // simulated seconds per real second
    horizon: 0,              // forecast offset, minutes
    scenario: { demand: 1, incident: null, rain: false }
  };

  function scenarioActive() {
    var s = state.scenario;
    return s.demand !== 1 || !!s.incident || s.rain;
  }
  function shownMinutes() { return (state.minutes + state.horizon) % 1440; }
  function fmt(mins) {
    mins = ((Math.floor(mins) % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }

  /* ---------- Map ---------- */
  var mapReady = false, popup = null, popupCorridor = null, map = null;

  function initMap() {
    if (!window.maplibregl) { return; }
    try {
      map = new maplibregl.Map({
        container: 'map',
        style: {
          version: 8,
          sources: {
            base: {
              type: 'raster',
              tiles: ['a', 'b', 'c', 'd'].map(function (s) {
                return 'https://' + s + '.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
              }),
              tileSize: 256,
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
            }
          },
          layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#0a101c' } },
            { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': 0.85 } }
          ]
        },
        center: [54.45, 24.44],
        zoom: window.innerWidth < 860 ? 9.5 : 10.6,
        minZoom: 8.5,
        maxZoom: 16,
        attributionControl: { compact: true }
      });
    } catch (e) {
      $('map').innerHTML = '<p style="padding:16px;color:#8fa0bd">The map needs WebGL, which is unavailable in this browser. The panels below still work.</p>';
      map = null;
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', function () {
      var colorExpr = ['match', ['get', 'level'],
        'free', COLORS.free, 'moderate', COLORS.moderate, 'heavy', COLORS.heavy, 'severe', COLORS.severe, '#888'];
      map.addSource('links', { type: 'geojson', data: linksGeoJSON() });
      map.addSource('vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'links-casing', type: 'line', source: 'links',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#05080f', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 5, 14, 12], 'line-offset': ['get', 'offset'], 'line-opacity': 0.7 }
      });
      map.addLayer({
        id: 'links', type: 'line', source: 'links',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colorExpr, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 14, 7], 'line-offset': ['get', 'offset'] }
      });
      map.addLayer({
        id: 'vehicles', type: 'circle', source: 'vehicles',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 14, 4],
          'circle-color': '#ffffff', 'circle-opacity': 0.9,
          'circle-stroke-color': colorExpr, 'circle-stroke-width': 1
        }
      });
      map.on('click', 'links', function (e) {
        var f = e.features && e.features[0];
        if (f) { openPopup(f.properties.id, e.lngLat); }
      });
      map.on('mouseenter', 'links', function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'links', function () { map.getCanvas().style.cursor = ''; });
      mapReady = true;
    });
  }

  function linksGeoJSON() {
    var t = shownMinutes() / 60, feats = [];
    M.CORRIDORS.forEach(function (c) {
      var s = M.corridorState(c, t, state.scenario);
      [[1, s.inbound], [-1, s.outbound]].forEach(function (pair) {
        feats.push({
          type: 'Feature',
          properties: { id: c.id, dir: pair[0], level: M.level(pair[1].ratio), offset: pair[0] * 3 },
          geometry: { type: 'LineString', coordinates: c.path }
        });
      });
    });
    return { type: 'FeatureCollection', features: feats };
  }

  function popupHTML(c) {
    var s = M.corridorState(c, shownMinutes() / 60, state.scenario);
    function row(label, l) {
      return '<tr><td>' + label + '</td><td>' + Math.round(l.speed) + ' km/h · ' + l.minutes.toFixed(1) + ' min</td></tr>';
    }
    return '<div class="pop"><h3>' + c.name + '</h3><table>' +
      row('Towards city', s.inbound) + row('Out of city', s.outbound) +
      '<tr><td>Length</td><td>' + c.km.toFixed(1) + ' km</td></tr>' +
      '<tr><td>Free-flow speed</td><td>' + c.ff + ' km/h</td></tr></table>' +
      '<div class="muted">' + c.ar + ' · modelled at ' + fmt(shownMinutes()) + '</div></div>';
  }

  function openPopup(id, lngLat) {
    var c = M.CORRIDORS.filter(function (x) { return x.id === id; })[0];
    if (!c || !map) { return; }
    if (popup) { popup.remove(); }
    popupCorridor = c;
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
      .setLngLat(lngLat || M.pointAt(c, 0.5))
      .setHTML(popupHTML(c))
      .addTo(map);
    popup.on('close', function () { popupCorridor = null; });
  }

  /* ---------- Moving vehicles ---------- */
  var fleets = [];
  M.CORRIDORS.forEach(function (c, ci) {
    [1, -1].forEach(function (dir) {
      var phases = [];
      for (var i = 0; i < MAX_DOTS; i++) {
        // Deterministic low-discrepancy spacing so dots stay evenly spread.
        phases.push(((i * 0.6180339887) + ci * 0.137 + (dir > 0 ? 0 : 0.5)) % 1);
      }
      fleets.push({ c: c, dir: dir, phases: phases, travelled: 0 });
    });
  });

  function vehiclesGeoJSON(dtSeconds) {
    var t = shownMinutes() / 60, feats = [];
    fleets.forEach(function (f) {
      var l = M.linkState(f.c, f.dir, t, state.scenario);
      f.travelled = (f.travelled + (l.speed * VISUAL_WARP * dtSeconds / 3600) / f.c.km) % 1;
      var n = Math.min(MAX_DOTS, Math.round(l.density * f.c.km / VEHICLES_PER_DOT));
      var lvl = M.level(l.ratio);
      for (var i = 0; i < n; i++) {
        var frac = (f.phases[i] + f.travelled) % 1;
        feats.push({
          type: 'Feature',
          properties: { level: lvl },
          geometry: { type: 'Point', coordinates: M.pointAt(f.c, f.dir > 0 ? frac : 1 - frac) }
        });
      }
    });
    return { type: 'FeatureCollection', features: feats };
  }

  /* ---------- Panels ---------- */
  function setDelta(el, diff, unit, higherIsBad, digits) {
    if (!scenarioActive() || Math.abs(diff) < Math.pow(10, -(digits || 0)) / 2) { el.textContent = ''; el.className = 'k-delta'; return; }
    var bad = higherIsBad ? diff > 0 : diff < 0;
    el.textContent = (diff > 0 ? '▲ +' : '▼ −') + Math.abs(diff).toFixed(digits || 0) + unit + ' vs typical';
    el.className = 'k-delta ' + (bad ? 'bad' : 'good');
  }

  function renderPanels() {
    var t = shownMinutes() / 60;
    var net = M.networkState(t, state.scenario);
    var base = M.networkState(t, M.DEFAULT_SCENARIO);

    $('clock').textContent = fmt(state.minutes);
    $('viewLabel').textContent = state.horizon
      ? 'Forecast for ' + fmt(shownMinutes()) + ' (+' + state.horizon + ' min)'
      : 'Showing ' + fmt(shownMinutes());

    $('kSpeed').innerHTML = net.avgSpeed.toFixed(0) + '<small>km/h</small>';
    $('kCong').innerHTML = '+' + net.congestion.toFixed(0) + '<small>%</small>';
    $('kVeh').textContent = num(net.vehicles);
    $('kDelay').innerHTML = num(net.delayHours) + '<small>veh-h</small>';
    setDelta($('dSpeed'), net.avgSpeed - base.avgSpeed, ' km/h', false, 0);
    setDelta($('dCong'), net.congestion - base.congestion, ' pts', true, 0);
    setDelta($('dVeh'), net.vehicles - base.vehicles, '', true, 0);
    setDelta($('dDelay'), net.delayHours - base.delayHours, ' veh-h', true, 0);

    var rows = net.rows.slice().sort(function (a, b) { return a.state.worst.ratio - b.state.worst.ratio; });
    var worst = rows[0];
    var later = M.networkState(((state.minutes + 30) % 1440) / 60, state.scenario);
    var trend = later.avgSpeed - M.networkState(state.minutes / 60, state.scenario).avgSpeed;
    var trendText = Math.abs(trend) < 1.5 ? 'holding steady over the next 30 minutes'
      : (trend < 0 ? 'slowing by about ' + Math.abs(trend).toFixed(0) + ' km/h in the next 30 minutes'
        : 'recovering by about ' + trend.toFixed(0) + ' km/h in the next 30 minutes');
    $('insight').textContent = 'Slowest corridor: ' + worst.corridor.name + ' at ' +
      Math.round(worst.state.worst.speed) + ' km/h ' + (worst.state.worstDir > 0 ? 'towards the city' : 'out of the city') +
      '. Network speed is ' + trendText + '.';

    var list = $('corridors');
    list.innerHTML = '';
    rows.forEach(function (r) {
      var w = r.state.worst, lvl = M.level(w.ratio);
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="dot ' + lvl + '"></span>' +
        '<span><span class="c-name">' + r.corridor.name + '</span><br><span class="c-sub">' + LEVEL_LABEL[lvl] +
        ' · ' + (r.state.worstDir > 0 ? 'towards city' : 'out of city') +
        (w.delay >= 0.5 ? ' · +' + w.delay.toFixed(0) + ' min delay' : '') +
        (state.scenario.incident === r.corridor.id ? ' · incident' : '') + '</span></span>' +
        '<span class="c-speed">' + Math.round(w.speed) + '<small>km/h</small></span>';
      b.addEventListener('click', function () { locate(r.corridor); });
      li.appendChild(b);
      list.appendChild(li);
    });

    if (popup && popupCorridor) { popup.setHTML(popupHTML(popupCorridor)); }
    drawChart();
  }

  function locate(c) {
    if (!map) { return; }
    var lng = c.path.map(function (p) { return p[0]; }), lat = c.path.map(function (p) { return p[1]; });
    map.fitBounds([[Math.min.apply(null, lng), Math.min.apply(null, lat)], [Math.max.apply(null, lng), Math.max.apply(null, lat)]],
      { padding: { top: 70, bottom: 110, left: 50, right: 50 }, maxZoom: 13.5, duration: 800 });
    openPopup(c.id);
    if (window.matchMedia('(max-width: 860px)').matches) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  /* ---------- 24-hour chart ---------- */
  var series = { base: [], scen: [] };
  function rebuildSeries() {
    series.base = []; series.scen = [];
    for (var i = 0; i <= 96; i++) {
      var t = i / 4;
      series.base.push(M.networkState(t, M.DEFAULT_SCENARIO).avgSpeed);
      series.scen.push(M.networkState(t, state.scenario).avgSpeed);
    }
  }

  function drawChart() {
    var cv = $('chart'), dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w) { return; }
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var padL = 30, padR = 8, padT = 8, padB = 20;
    var all = series.base.concat(series.scen);
    var top = Math.ceil(Math.max.apply(null, all) / 20) * 20;
    var bottom = Math.max(0, Math.floor(Math.min.apply(null, all) / 20) * 20);
    if (top === bottom) { top += 20; }
    function x(i) { return padL + (w - padL - padR) * (i / 96); }
    function y(v) { return padT + (h - padT - padB) * (1 - (v - bottom) / (top - bottom)); }

    g.font = '10.5px system-ui, sans-serif';
    g.fillStyle = '#8fa0bd'; g.strokeStyle = '#22314d'; g.lineWidth = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (var v = bottom; v <= top; v += (top - bottom) / 2) {
      g.beginPath(); g.moveTo(padL, y(v)); g.lineTo(w - padR, y(v)); g.stroke();
      g.fillText(Math.round(v), padL - 6, y(v));
    }
    g.textAlign = 'center'; g.textBaseline = 'top';
    [0, 6, 12, 18, 24].forEach(function (hr) { g.fillText((hr < 10 ? '0' : '') + hr + ':00', Math.min(Math.max(x(hr * 4), padL + 14), w - padR - 14), h - padB + 6); });

    function line(arr, color, dash, width) {
      g.beginPath();
      arr.forEach(function (v, i) { if (i) { g.lineTo(x(i), y(v)); } else { g.moveTo(x(i), y(v)); } });
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.stroke(); g.setLineDash([]);
    }
    line(series.base, '#6f84a8', [4, 4], 1.5);
    line(series.scen, COLORS.free, [], 2);

    var nowX = x(state.minutes / 15), shownX = x(shownMinutes() / 15);
    if (state.horizon && shownX > nowX) {
      g.fillStyle = 'rgba(45, 212, 167, 0.12)';
      g.fillRect(nowX, padT, shownX - nowX, h - padT - padB);
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(shownX, padT); g.lineTo(shownX, h - padB); g.stroke();
    var cur = M.networkState(shownMinutes() / 60, state.scenario).avgSpeed;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(shownX, y(cur), 3.5, 0, Math.PI * 2); g.fill();
  }

  /* ---------- Controls ---------- */
  function segmented(id, attr, onPick) {
    var box = $(id);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) { return; }
      Array.prototype.forEach.call(box.children, function (c) {
        c.classList.toggle('on', c === b);
        c.setAttribute('aria-checked', c === b ? 'true' : 'false');
      });
      onPick(Number(b.getAttribute(attr)));
    });
    return function select(value) {
      Array.prototype.forEach.call(box.children, function (c) {
        var on = Number(c.getAttribute(attr)) === value;
        c.classList.toggle('on', on);
        c.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    };
  }

  function setPlaying(p) {
    state.playing = p;
    $('play').textContent = p ? '❚❚' : '▶';
    $('play').setAttribute('aria-label', p ? 'Pause' : 'Play');
  }

  var dirty = true;
  function refresh(rebuild) { if (rebuild) { rebuildSeries(); } dirty = true; }

  var selectRate = segmented('rate', 'data-rate', function (r) {
    state.rate = r;
    if (r === 1) { state.minutes = wallClockMinutes(); }
    setPlaying(true);
    refresh();
  });
  segmented('horizon', 'data-h', function (hz) { state.horizon = hz; refresh(); });

  $('play').addEventListener('click', function () { setPlaying(!state.playing); });
  $('time').addEventListener('input', function (e) {
    state.minutes = Number(e.target.value);
    if (state.rate === 1) { state.rate = 600; selectRate(600); setPlaying(false); }
    refresh();
  });
  $('now').addEventListener('click', function () {
    state.minutes = wallClockMinutes(); state.rate = 1; selectRate(1); setPlaying(true); refresh();
  });

  var incidentSel = $('incident');
  M.CORRIDORS.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    incidentSel.appendChild(o);
  });
  incidentSel.addEventListener('change', function () { state.scenario.incident = incidentSel.value || null; refresh(true); });
  $('demand').addEventListener('input', function (e) {
    state.scenario.demand = Number(e.target.value) / 100;
    $('demandVal').textContent = e.target.value + '%';
    refresh(true);
  });
  $('rain').addEventListener('change', function (e) { state.scenario.rain = e.target.checked; refresh(true); });
  $('reset').addEventListener('click', function () {
    state.scenario = { demand: 1, incident: null, rain: false };
    $('demand').value = 100; $('demandVal').textContent = '100%'; incidentSel.value = ''; $('rain').checked = false;
    refresh(true);
  });
  window.addEventListener('resize', drawChart);

  /* ---------- Main loop ---------- */
  var last = performance.now(), lastMinuteShown = -1;
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (state.playing) {
      state.minutes = state.rate === 1 ? wallClockMinutes() : (state.minutes + dt * state.rate / 60) % 1440;
    }
    var minute = Math.floor(state.minutes);
    if (minute !== lastMinuteShown || dirty) {
      lastMinuteShown = minute; dirty = false;
      $('time').value = minute;
      renderPanels();
      if (mapReady) { map.getSource('links').setData(linksGeoJSON()); }
    }
    if (mapReady) { map.getSource('vehicles').setData(vehiclesGeoJSON(dt)); }
    requestAnimationFrame(frame);
  }

  // Start in the morning peak so the first view is informative.
  rebuildSeries();
  initMap();
  renderPanels();
  requestAnimationFrame(frame);

  window.IntelliTwin = { state: state };
})();
