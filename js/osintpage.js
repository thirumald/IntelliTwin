/* IntelliTwin: the OSINT page.
 *
 * OSINT opens as a page of its own, like Analytics: a 3D map of the open-source feeds on top (UAE, world or the
 * open region), a symbol legend beside it, and the feed cards in a grid below. The cards are the ones built by
 * js/osint.js and js/livefeeds.js; this file lays them out as a page and gives the page its own map.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, K = T.kit;
  if (!T.osint || !T.osintMap) { return; }
  var M = CFG.osintMap || {}, isOpen = false, map = null, overlay = null, view = M.defaultView || 'region', popup = null, timer = 0;
  var orbiting = M.orbit !== false, handsOn = false, wheelUntil = 0, lastT = 0;
  var tabOpen = K.tabOpen; K.tabOpen = function (id) { return id === 'osint' ? isOpen : tabOpen(id); };   // the feed cards draw while the page is open

  function pop(lngLat, title, rows, note) {
    if (!map) { return; } if (popup) { popup.remove(); }
    var box = document.createElement('div'); box.className = 'pop';
    box.innerHTML = '<h3></h3><table>' + rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</table>' + (note ? '<div class="muted">' + note + '</div>' : '');
    box.querySelector('h3').textContent = title;
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '300px', offset: 16 }).setLngLat(lngLat).setDOMContent(box).addTo(map);
  }
  function draw() { if (overlay && map) { overlay.setProps({ layers: T.osintMap.layersFor(map, { view: view, pop: pop }) }); } legend(); }
  function legend() {
    $('opLegend').innerHTML = T.osintMap.legend(view).map(function (r) {
      return '<div class="os-leg"><svg viewBox="0 0 24 24" width="22" height="22" fill="rgb(' + r.color.join(',') + ')" aria-hidden="true">' + r.pic + '</svg><span><strong>' + r.name + '</strong>' + (r.note ? '<em>' + r.note + '</em>' : '') + '</span><b>' + num(r.count) + '</b></div>';
    }).join('');
  }
  // The camera for each view. "region" is street level over the open region, where the 3D buildings show.
  function camFor(v, at) {
    var bb = (C.meta() || {}).bbox || [54.2, 24.2, 54.8, 24.7];
    return v === 'world' ? { center: at || [45, 22], zoom: at ? 4.2 : 1.7, pitch: at ? 35 : 0, bearing: 0 } : v === 'region' ? { center: (C.sites()[0] ? [C.sites()[0][1], C.sites()[0][2]] : [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]), zoom: 14.6, pitch: 60, bearing: -20 } :
      { center: M.centre || [54.6, 24.9], zoom: M.zoom || 6.4, pitch: M.pitch || 52, bearing: M.bearing || -12 };
  }
  function setView(v, at) {
    view = v; var cam = camFor(v, at);
    if (map) { map.flyTo(Object.assign({ duration: 1500 }, cam)); }
    Array.prototype.forEach.call($('opViews').children, function (b) { var on = b.getAttribute('data-v') === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    draw();
  }
  function makeMap() {
    if (map) { return; }
    var light = document.body.classList.contains('map-light');
    map = new maplibregl.Map({ container: 'opMap', style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': light ? '#dfeae2' : '#0a101c' } }] },
      center: camFor(view).center, zoom: camFor(view).zoom, pitch: camFor(view).pitch, bearing: camFor(view).bearing, minZoom: 1, maxZoom: 18, maxPitch: 70, attributionControl: false, antialias: true });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] }); map.addControl(overlay);
    // The vector base map, if it can be reached; otherwise the symbols are drawn on the plain background.
    var url = light ? CFG.map.styleUrlLight : CFG.map.styleUrl;
    if (url) { fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (st) { if (st && map) { map.setStyle(st, { diff: false }); } }).catch(function () { /* plain background */ }); }
    map.on('zoomend', draw); map.on('load', draw);
    // 3D buildings, floors and lighting, shared with the main map.
    if (T.map3d) { T.map3d.attach(map, function () { return overlay; }); }
    // Orbit pauses while the map is dragged or zoomed by hand, as on the main map.
    var cc = map.getCanvasContainer();
    ['mousedown', 'touchstart'].forEach(function (n) { cc.addEventListener(n, function () { handsOn = true; }, { passive: true }); });
    ['mouseup', 'touchend', 'touchcancel', 'mouseleave'].forEach(function (n) { window.addEventListener(n, function () { handsOn = false; }, { passive: true }); });
    cc.addEventListener('wheel', function () { wheelUntil = performance.now() + 1200; }, { passive: true });
  }
  // Slowly circle the camera while the page is open and Orbit is on.
  function spin(now) {
    if (!isOpen) { lastT = 0; return; }
    var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
    if (orbiting && map && !map.isEasing() && !handsOn && now > wheelUntil) { map.setBearing(map.getBearing() + (M.orbitDegPerSec || 4) * dt); }
    requestAnimationFrame(spin);
  }
  function setOrbit(on) {
    orbiting = on; var b = $('opOrbit'); if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('active', on); }
    if (on && map && map.getPitch() < 30) { map.easeTo({ pitch: 55, duration: 600 }); }
  }
  function open() {
    if (isOpen) { return; }
    if (T.analytics && !$('analytics').hidden) { T.analytics.close(); }
    isOpen = true; $('osintPage').hidden = false; document.body.classList.add('os-open'); $('osintBtn').classList.add('active'); $('osintBtn').setAttribute('aria-pressed', 'true');
    makeMap(); setTimeout(function () { map.resize(); setView(view); }, 60);
    T.osint.render(); if (T.live && T.live.render) { T.live.render(); }
    timer = setInterval(function () { draw(); }, 2000);            // satellites move; data refreshes arrive
    setOrbit(orbiting); lastT = 0; requestAnimationFrame(spin);
    if (T.audit) { T.audit('Opened the OSINT page'); }
  }
  function close() {
    if (!isOpen) { return; }
    isOpen = false; $('osintPage').hidden = true; document.body.classList.remove('os-open'); $('osintBtn').classList.remove('active'); $('osintBtn').setAttribute('aria-pressed', 'false');
    clearInterval(timer); if (popup) { popup.remove(); }
  }
  C.onReady(function () {
    // The feed cards move from the side panel into the page grid.
    var grid = $('opGrid');
    Array.prototype.forEach.call(document.querySelectorAll('.panel section[data-tab="osint"]'), function (sec) { sec.removeAttribute('data-tab'); sec.hidden = false; grid.appendChild(sec); });
    var src = $('osSources'); if (src) { grid.appendChild(src); }
    if (T.map3d) { var m3 = $('opM3'); m3.innerHTML = T.map3d.controls(); T.map3d.wire(m3); T.map3d.sync(); }
    $('osintBtn').addEventListener('click', function () { if (isOpen) { close(); } else { open(); } });
    $('opClose').addEventListener('click', close);
    $('opOrbit').addEventListener('click', function () { setOrbit(!orbiting); });
    $('opViews').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b) { setView(b.getAttribute('data-v')); } });
    $('analyticsBtn').addEventListener('click', close);
    document.getElementById('tabs').addEventListener('click', function (e) { if (e.target.closest('[data-tab]')) { close(); } });
    document.addEventListener('change', function (e) { if (isOpen && e.target && e.target.type === 'checkbox') { setTimeout(draw, 50); } });
  });
  T.osintPage = { map: function () { return map; }, open: open, close: close, isOpen: function () { return isOpen; }, world: function (at) { open(); setView('world', at); $('opMap').scrollIntoView({ block: 'start' }); } };
})();
