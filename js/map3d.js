/* IntelliTwin: 3D map options shared by every 3D map (the main map and the OSINT page map).
 *
 *   Buildings   the vector tiles' buildings extruded to their height (as on the main map)
 *   Floors      cut every building at a chosen floor and highlight that floor, to look at the city floor by floor.
 *               Floor numbers are estimated from building height (one floor every floorHeightM metres); the map data
 *               holds heights, not real floor plans.
 *   Lighting    where the light comes from and its colour: follow the clock, morning, midday, evening or night.
 *               It shades the buildings and the 3D vehicles, people and columns.
 *
 * The controls are in the Scenario and layers pop-up ("3D map") and repeat on the OSINT page.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, state = T.state;
  var O = CFG.map3d || {}, F = O.floorHeightM || 3.3, maps = [], floor = 0, mode = O.lighting || 'auto';
  var HGT = ['coalesce', ['get', 'render_height'], 6];
  function z0() { return CFG.map.buildingsMinZoom || 14; }
  function light() { return document.body.classList.contains('map-light'); }

  /* ---------------------------------------------------------------- buildings */
  function addBuildings(map) {
    var st = map.getStyle(); if (!st || map.getLayer('itw-buildings')) { return; }
    var src = Object.keys(st.sources || {}).filter(function (k) { return st.sources[k].type === 'vector'; })[0]; if (!src) { return; }
    var pal = (CFG.map.buildingColors || {})[light() ? 'light' : 'dark'] || (light() ? ['#d3d3d3', '#4169e1', '#add8e6'] : ['#33415c', '#3f6fd8', '#8fc3e6']), labelId;
    (st.layers || []).some(function (ly) { if (ly.type === 'symbol' && ly.layout && ly.layout['text-field']) { labelId = ly.id; return true; } return false; });
    try {
      map.addLayer({ id: 'itw-buildings', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: z0(), filter: ['!=', ['get', 'hide_3d'], true],
        paint: { 'fill-extrusion-color': ['interpolate', ['linear'], HGT, 0, pal[0], 200, pal[1], 400, pal[2]], 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], z0(), 0, z0() + 1, HGT],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], z0(), 0, z0() + 1, ['coalesce', ['get', 'render_min_height'], 0]], 'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': true } }, labelId);
    } catch (e) { /* the style has no building layer */ }
  }

  /* ---------------------------------------------------------------- floors */
  function applyFloors(map) {
    if (!map.getLayer('itw-buildings')) { return; }
    var cut = floor ? ['min', HGT, floor * F] : HGT;
    try {
      map.setPaintProperty('itw-buildings', 'fill-extrusion-height', ['interpolate', ['linear'], ['zoom'], z0(), 0, z0() + 1, cut]);
      map.setPaintProperty('itw-buildings', 'fill-extrusion-opacity', floor ? 0.78 : 0.92);
      if (map.getLayer('itw-floor')) { map.removeLayer('itw-floor'); }
      if (floor) {
        var st = map.getStyle(), ref = map.getLayer('itw-buildings'), labelId;
        (st.layers || []).some(function (ly) { if (ly.type === 'symbol' && ly.layout && ly.layout['text-field']) { labelId = ly.id; return true; } return false; });
        // The chosen floor, drawn as a bright slab in every building tall enough to have it.
        map.addLayer({ id: 'itw-floor', type: 'fill-extrusion', source: ref.source, 'source-layer': 'building', minzoom: z0(), filter: ['all', ['!=', ['get', 'hide_3d'], true], ['>', HGT, (floor - 1) * F + 0.5]],
          paint: { 'fill-extrusion-color': O.floorColor || '#f2a900', 'fill-extrusion-base': (floor - 1) * F, 'fill-extrusion-height': ['min', HGT, floor * F], 'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': false } }, labelId);
      }
    } catch (e) { /* style not ready: applied again on the next style event */ }
  }

  /* ---------------------------------------------------------------- lighting */
  // Sun direction for the UAE from the time of day: [azimuth from north, clockwise; altitude above the horizon], degrees.
  function sun(tSec) {
    var lat = 24.5 * Math.PI / 180, d = new Date(state.date + 'T00:00:00Z'), doy = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
    var dec = -23.44 * Math.cos(2 * Math.PI * (doy + 10) / 365) * Math.PI / 180, H = (tSec / 3600 - 12.35) * 15 * Math.PI / 180;
    var alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    var az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
    return [(az * 180 / Math.PI + 360) % 360, alt * 180 / Math.PI];
  }
  var PRESET = { morning: [95, 22, '#ffd7a3', 0.55], noon: [180, 68, '#ffffff', 0.45], evening: [262, 16, '#ffb37d', 0.6], night: [300, 35, '#8ea6ff', 0.2] };
  function lightNow() {
    if (mode !== 'auto') { return { az: PRESET[mode][0], alt: PRESET[mode][1], color: PRESET[mode][2], k: PRESET[mode][3], night: mode === 'night' }; }
    var s = sun(state.t), alt = s[1];
    if (alt <= 0) { return { az: 300, alt: 35, color: '#8ea6ff', k: 0.2, night: true }; }
    var low = Math.max(0, 1 - alt / 30);                                  // warm and strong near the horizon
    return { az: s[0], alt: Math.max(8, alt), color: low > 0.5 ? '#ffc48f' : low > 0.15 ? '#ffe2bd' : '#ffffff', k: 0.42 + 0.2 * low, night: false };
  }
  function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  function applyLight() {
    var L = lightNow();
    maps.forEach(function (m) {
      try { m.map.setLight({ anchor: 'map', position: [1.5, L.az, 90 - L.alt], color: L.color, intensity: L.k }); } catch (e) { /* style not ready */ }
      // The same light for the 3D vehicles, people and columns drawn above the map.
      var ov = m.overlay && m.overlay(); if (!ov || !deck.LightingEffect) { return; }
      var a = L.az * Math.PI / 180, e = L.alt * Math.PI / 180, dir = [-Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), -Math.sin(e)];
      try {
        ov.setProps({ effects: [new deck.LightingEffect({ ambient: new deck.AmbientLight({ color: L.night ? [150, 170, 255] : [255, 255, 255], intensity: L.night ? 0.75 : 1.1 }),
          sun: new deck.DirectionalLight({ color: rgb(L.color), intensity: L.night ? 0.8 : 2.3, direction: dir }), fill: new deck.DirectionalLight({ color: [200, 215, 255], intensity: 0.6, direction: [-dir[0], -dir[1], -0.6] }) })] });
      } catch (e2) { /* keep the previous lighting */ }
    });
    document.body.classList.toggle('light-night', L.night);
    var note = $('m3LightNote'); if (note) { note.textContent = mode === 'auto' ? (L.night ? 'Night at ' + C.clock(state.t) + ': moonlight' : 'Sun ' + Math.round(L.alt) + '° above the horizon at ' + C.clock(state.t)) : ''; }
  }

  /* ---------------------------------------------------------------- maps and controls */
  function attach(map, overlay) {
    var m = { map: map, overlay: overlay }; maps.push(m);
    var again = function () { if (map.getStyle()) { if (m.own) { addBuildings(map); } applyFloors(map); applyLight(); } };
    map.on('styledata', function () { clearTimeout(m.t); m.t = setTimeout(again, 120); });
    again(); return m;
  }
  function setFloor(n) { floor = Math.max(0, Math.min(O.maxFloor || 60, n | 0)); maps.forEach(function (m) { applyFloors(m.map); }); sync(); }
  function setMode(v) { mode = PRESET[v] ? v : 'auto'; applyLight(); sync(); try { localStorage.setItem('itw-light', mode); } catch (e) { /* storage unavailable */ } }
  function sync() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-m3="floor"]'), function (el) { el.value = floor; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-m3="floorLabel"]'), function (el) { el.textContent = floor ? 'Floor ' + floor + ' · about ' + Math.round(floor * F) + ' m up' : 'All floors'; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-m3="light"]'), function (el) { el.value = mode; });
  }
  function controls() {
    return '<label class="field"><span>Lighting</span><select data-m3="light"><option value="auto">Follow the clock (sun position)</option><option value="morning">Morning</option><option value="noon">Midday</option><option value="evening">Evening</option><option value="night">Night</option></select></label>' +
      '<label class="field"><span>Floors <em class="muted" data-m3="floorLabel">All floors</em></span><input type="range" min="0" max="' + (O.maxFloor || 60) + '" step="1" value="0" data-m3="floor" aria-label="Show buildings up to this floor"></label>';
  }
  function wire(root) {
    root.addEventListener('change', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-m3'); if (k === 'light') { setMode(e.target.value); } });
    root.addEventListener('input', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-m3'); if (k === 'floor') { setFloor(Number(e.target.value)); } });
  }
  C.onReady(function () {
    try { mode = localStorage.getItem('itw-light') || mode; } catch (e) { /* storage unavailable */ } if (!PRESET[mode]) { mode = 'auto'; }
    attach(T.getMap(), T.getOverlay);
    var pop = $('lyPop'), tree = pop && pop.querySelector('.ly-tree');
    if (tree) {
      var box = document.createElement('div'); box.className = 'm3-box';
      box.innerHTML = '<h3 class="cc-h">3D map</h3>' + controls() + '<p class="muted" id="m3LightNote"></p><p class="muted">Floors are estimated from building height, one every ' + F + ' m. Zoom in to street level to see them.</p>';
      tree.parentNode.insertBefore(box, tree); wire(box);
    }
    sync(); applyLight();
    C.onMinute(function () { if (mode === 'auto') { applyLight(); } });
  });
  T.map3d = { attach: function (map, overlay) { var m = attach(map, overlay); m.own = true; addBuildings(map); return m; }, controls: controls, wire: wire, sync: sync, setFloor: setFloor, setLighting: setMode, state: function () { return { floor: floor, lighting: mode }; } };
})();
