/* IntelliTwin fuel and EV charging stations.
 *
 * Station locations are REAL, from OpenStreetMap (data/energy.json, written by the data build).
 * Usage figures (sockets in use, vehicles at the pumps) are SYNTHETIC. Live stations and live charger
 * availability come from TomTom when a key is set (js/tomtom.js).
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, $ = C.$, num = C.num, state = T.state, K = T.kit, rnd = K.rnd, hashStr = K.hashStr, esc = K.esc;
  var ev = [], fuel = [], show = { ev: true, fuel: true }, loaded = false;
  function busy(i, t) { var h = t / 3600, wave = 0.25 + 0.5 * Math.exp(-Math.pow((h - 19) / 4, 2)) + 0.25 * Math.exp(-Math.pow((h - 9) / 2.5, 2)); return Math.min(0.97, wave * (0.6 + 0.8 * rnd(hashStr(state.date), i + Math.floor(t / 1800) * 7))); }
  function render() {
    if (!K.tabOpen('bus')) { return; }
    var t = state.t, sockets = 0, used = 0;
    ev.forEach(function (s, i) { var n = s.sockets || 2; sockets += n; used += Math.round(n * busy(i, t)); });
    $('evCount').textContent = loaded ? num(ev.length) : '–'; $('evSockets').textContent = loaded ? num(sockets) : '–';
    $('evBusy').innerHTML = sockets ? Math.round(100 * used / sockets) + '<small>%</small>' : '–'; $('evFree').textContent = sockets ? num(sockets - used) : '–';
    $('evNote').textContent = loaded ? (ev.length ? 'Locations from OpenStreetMap' : 'None mapped in this region') : 'Not in this data build yet';
    var c = T.getMap() ? T.getMap().getCenter() : null, near = function (list) { return c ? list.slice().sort(function (a, b) { return K.dist(a.at, [c.lng, c.lat]) - K.dist(b.at, [c.lng, c.lat]); }) : list; };
    var el = $('evList'); el.innerHTML = '';
    near(ev).slice(0, 8).forEach(function (s) { var n = s.sockets || 2, u = Math.round(n * busy(ev.indexOf(s), t)); el.appendChild(C.listButton(u >= n ? 'heavy' : 'free', s.name, (s.brand && s.brand !== s.name ? s.brand + ' · ' : '') + (s.sockets ? s.sockets + ' sockets mapped' : 'sockets not mapped') + ' · ' + (n - u) + ' free (synthetic)', (n - u) + '<small>free</small>', function () { open(s); })); });
    var brands = {}; fuel.forEach(function (s) { var b = s.brand || 'Other'; brands[b] = (brands[b] || 0) + 1; });
    var top = Object.keys(brands).sort(function (a, b) { return brands[b] - brands[a]; });
    $('fuCount').textContent = loaded ? num(fuel.length) : '–'; $('fuBrands').textContent = loaded ? top.length : '–';
    $('fuTop').textContent = top.length ? top[0] : '–'; $('fuNote').textContent = loaded ? (fuel.length ? 'Locations from OpenStreetMap' : 'None mapped in this region') : 'Not in this data build yet';
    $('fuBars').innerHTML = top.slice(0, 5).map(function (b) { return C.barRow(esc(b), num(brands[b]), 'stations', brands[b] / brands[top[0]]); }).join('');
    var fl = $('fuList'); fl.innerHTML = '';
    near(fuel).slice(0, 8).forEach(function (s) { var q = Math.round(6 * busy(fuel.indexOf(s) + 500, t)); fl.appendChild(C.listButton(q >= 5 ? 'heavy' : 'free', s.name, (s.brand && s.brand !== s.name ? s.brand + ' · ' : '') + q + ' vehicles at the pumps (synthetic)', q + '<small>veh</small>', function () { open(s); })); });
  }
  function open(s) {
    if (T.getMap()) { T.getMap().easeTo({ center: s.at, zoom: 15, duration: 700 }); }
    C.showPopup(s.at, s.name, [['Type', s.kind === 'ev' ? 'EV charging station' : 'Fuel station'], ['Brand or operator', s.brand || '–'], s.kind === 'ev' ? ['Sockets mapped', s.sockets || 'not mapped'] : ['Source', 'OpenStreetMap']], 'Location from OpenStreetMap');
  }
  C.addLayers(function (ctx) {
    if (!K.tabOpen('bus')) { return []; }
    var out = [];
    if (show.fuel && fuel.length) { out.push(new deck.ScatterplotLayer({ id: 'fuel', data: fuel, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (s) { return s.at; }, getRadius: ctx.zoom < 12 ? 3 : 5.5, getFillColor: [250, 178, 25], getLineColor: [40, 30, 0], getLineWidth: 1.5, onClick: function (i) { if (i.object) { open(i.object); } } })); }
    if (show.ev && ev.length) { out.push(new deck.ScatterplotLayer({ id: 'ev', data: ev, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (s) { return s.at; }, getRadius: ctx.zoom < 12 ? 4 : 6.5, getFillColor: [25, 190, 120], getLineColor: [255, 255, 255], getLineWidth: 2, onClick: function (i) { if (i.object) { open(i.object); } } })); }
    return out;
  });
  C.onReady(function () {
    C.getJSON('data/energy.json').then(function (rows) {
      loaded = true;
      rows.forEach(function (r) { var s = { kind: r[0], name: r[1] || (r[4] ? r[4] : r[0] === 'ev' ? 'EV charging station' : 'Fuel station'), at: [r[2], r[3]], brand: r[4] || '', sockets: r[5] || 0 }; (s.kind === 'ev' ? ev : fuel).push(s); });
      render(); C.redraw();
    }).catch(function () { render(); });
    $('showEv').addEventListener('change', function (e) { show.ev = e.target.checked; C.redraw(); });
    $('showFuel').addEventListener('change', function (e) { show.fuel = e.target.checked; C.redraw(); });
    C.onTab(render); C.onMinute(render);
  });
  T.energy = { ev: function () { return ev; }, fuel: function () { return fuel; } };
})();
