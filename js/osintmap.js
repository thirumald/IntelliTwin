/* IntelliTwin: the OSINT feeds drawn on the 3D map, one pictogram per kind of data.
 *
 *   Fire or heat detection   flame on a column whose height follows the radiative power
 *   Flight                   aircraft at its (exaggerated) height, pointing along its track, on a stem to the ground
 *   Vessel                   hull pointing along its course, coloured by ship type
 *   Satellite                satellite above its ground point, on a stem, with its path for the next minutes
 *   Earthquake               rings on a column whose height follows the magnitude
 *   Weather                  sun, cloud, rain or dust symbol with the temperature, at each region
 *   Natural event            warning triangle
 *
 * "UAE-wide 3D view" lets the map zoom out far enough to see all of it at once; "Back to the region" returns.
 * All of it is real data from the published live files (js/livefeeds.js, js/osint.js).
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, K = T.kit;
  if (!T.live || !T.osint) { return; }
  var M = CFG.osintMap || {}, EX = M.heightExaggeration || 6;
  function svg(body) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="white">' + body + '</svg>'); }
  // Pictograms (white, tinted per data point).
  var PIC = {
    fire: '<path d="M12.6 1.8c.9 3.9 5.4 5.6 5.4 10.9a6 6 0 0 1-12 0c0-2.3 1.1-3.9 2.3-5 .3 2.2 1.2 3.4 2.4 3.6-.4-3.400.2-6.200 1.900-9.500z"/>',
    plane: '<path d="M12 2c.7 0 1.2.9 1.2 2v5.2l7.300 4.300v1.900l-7.300-2.200v4.400l2 1.500V21L12 20l-3.200 1v-1.900l2-1.500v-4.400l-7.300 2.200v-1.900l7.300-4.300V4c0-1.100.5-2 1.200-2z"/>',
    ship: '<path d="M12 1.500l4.200 5.500v12.200L12 22.500l-4.200-3.300V7z"/>',
    sat: '<path d="M9 9h6v6H9zM1.500 10.200h6v3.600h-6zM16.500 10.200h6v3.600h-6zM11.200 3.500h1.600V8h-1.600zM11.200 16h1.600v4.500h-1.600z"/>',
    quake: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.600a7.400 7.400 0 1 1 0 14.800 7.400 7.400 0 0 1 0-14.800zm0 2.900a4.500 4.500 0 1 0 0 9 4.500 4.500 0 0 0 0-9zm0 2.500a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
    event: '<path fill-rule="evenodd" d="M12 2.500L22.500 21h-21zm-1 6.500v6h2V9zm0 7.500v2h2v-2z"/>',
    sun: '<circle cx="12" cy="12" r="4.600"/><path d="M11 1.500h2v3.500h-2zM11 19h2v3.500h-2zM1.500 11H5v2H1.500zM19 11h3.500v2H19zM4 5.400L5.400 4l2.500 2.500-1.400 1.400zM16.100 17.500l1.400-1.400L20 18.600 18.600 20zM4 18.600l2.500-2.500 1.400 1.400L5.400 20zM16.100 6.500L18.600 4 20 5.400l-2.500 2.500z"/>',
    cloud: '<path d="M7 19a5 5 0 0 1-.6-9.960A6.500 6.500 0 0 1 19 10.500a4.300 4.300 0 0 1-.5 8.500z"/>',
    rain: '<path d="M7 15a5 5 0 0 1-.6-9.960A6.500 6.500 0 0 1 19 6.500a4.300 4.300 0 0 1-.5 8.500zM7.500 17h2l-1.500 5h-2zM11.500 17h2L12 22h-2zM15.500 17h2L16 22h-2z"/>',
    dust: '<path d="M3 6.500c3-2.500 6 2.500 9 0s6-2.500 9 0v2.400c-3-2.500-6 2.500-9 0s-6-2.500-9 0zM3 11.500c3-2.500 6 2.500 9 0s6-2.500 9 0v2.400c-3-2.500-6 2.500-9 0s-6-2.500-9 0zM3 16.500c3-2.500 6 2.500 9 0s6-2.500 9 0v2.400c-3-2.500-6 2.500-9 0s-6-2.500-9 0z"/>'
  };
  Object.keys(PIC).forEach(function (k) { PIC[k] = PIC[k].replace(/(\d)\.(\d)00\b/g, '$1.$2'); });
  var URLS = {}; Object.keys(PIC).forEach(function (k) { URLS[k] = { url: svg(PIC[k]), width: 64, height: 64, mask: true }; });
  var COLR = { fire: [226, 88, 34], fireHot: [200, 40, 30], plane: [36, 110, 214], planeIn: [20, 140, 90], sat: [124, 92, 214], quake: [176, 60, 150], event: [200, 120, 0], wx: [30, 110, 190], dust: [200, 130, 30], ship: [40, 130, 200] };
  var SHIP = { Tanker: [200, 70, 50], Cargo: [40, 120, 200], Passenger: [30, 150, 100], Fishing: [190, 140, 20] };
  function on(id) { var el = $(id); return !el || el.checked; }
  function shipType(c) { return c >= 80 && c < 90 ? 'Tanker' : c >= 70 && c < 80 ? 'Cargo' : c >= 60 && c < 70 ? 'Passenger' : c === 30 ? 'Fishing' : c ? 'Other' : 'Not reported'; }
  function wxPic(p) { var r = Math.max.apply(null, p.dustRisk.slice(0, 6)), c = p.now.code; return r >= 2 ? 'dust' : c >= 51 ? 'rain' : c >= 2 ? 'cloud' : 'sun'; }

  function data(view) {
    var f = T.live.fires(), a = T.live.flights(), v = T.live.vessels(), s = T.live.satellites() || [], q = T.osint.quakes(), e = T.osint.events(), w = T.osint.places();
    var g = T.osint.world();
    return { world: on('lyOsQk') && g && view === 'world' ? g : [], fires: on('lyLvFire') && f ? f.list : [], flights: on('lyLvAir') && a ? a.flights : [], ships: on('lyLvShip') && v ? v.ships : [], sats: on('lyLvSat') ? s : [],
      quakes: on('lyOsQk') && q ? q : [], events: on('lyOsQk') && e ? e : [], wx: on('lyOsWx') && w ? w : [], air: a };
  }
  function near(map, p, d) { var c = map.getCenter(); return Math.abs(p[0] - c.lng) < d && Math.abs(p[1] - c.lat) < d; }

  // The layers for one map. o.view: 'region', 'uae' or 'world'; o.pop(lngLat, title, rows, note) shows a pop-up on that map.
  function layersFor(map, o) {
    var D = data(o.view), out = [], z = map.getZoom(), big = z < 9.5, wide = o.view !== 'region', POP = o.pop, isz = function (b) { return big ? b : b + 6; };
    if (D.fires.length) {
      out.push(new deck.ColumnLayer({ id: 'os-fire-col', data: D.fires, diskResolution: 12, radius: big ? 1400 : 220, extruded: true, pickable: true, getPosition: function (f) { return f.at; },
        getElevation: function (f) { return (big ? 900 : 120) * Math.sqrt(Math.max(1, f.frp)); }, getFillColor: function (f) { return (f.frp >= 30 ? COLR.fireHot : COLR.fire).concat(190); }, onClick: function (i) { pickFire(i, POP); } }));
      out.push(new deck.IconLayer({ id: 'os-fire', data: D.fires, pickable: true, sizeUnits: 'pixels', getSize: function (f) { return isz(f.frp >= 30 ? 26 : 20); }, getIcon: function () { return URLS.fire; },
        getPosition: function (f) { return [f.at[0], f.at[1], (big ? 900 : 120) * Math.sqrt(Math.max(1, f.frp))]; }, getColor: function (f) { return f.frp >= 30 ? COLR.fireHot : COLR.fire; }, getPixelOffset: [0, -10], onClick: function (i) { pickFire(i, POP); } }));
    }
    if (D.ships.length) {
      out.push(new deck.IconLayer({ id: 'os-ship', data: D.ships, pickable: true, billboard: false, sizeUnits: 'pixels', getSize: function (s) { return isz(s.len >= 150 ? 26 : 20); }, getIcon: function () { return URLS.ship; },
        getPosition: function (s) { return [s.lon, s.lat]; }, getAngle: function (s) { return -(s.cog || 0); }, getColor: function (s) { return SHIP[shipType(s.type)] || COLR.ship; }, onClick: function (i) { pickShip(i, POP); } }));
    }
    if (D.flights.length) {
      var h = function (f) { return Math.max(300, f.alt * 0.3048 * EX); };
      out.push(new deck.LineLayer({ id: 'os-plane-stem', data: D.flights, widthUnits: 'pixels', getWidth: 1, getColor: [90, 110, 140, 120], getSourcePosition: function (f) { return [f.lon, f.lat, 0]; }, getTargetPosition: function (f) { return [f.lon, f.lat, h(f)]; } }));
      out.push(new deck.IconLayer({ id: 'os-plane', data: D.flights, pickable: true, billboard: false, sizeUnits: 'pixels', getSize: isz(28), getIcon: function () { return URLS.plane; },
        getPosition: function (f) { return [f.lon, f.lat, h(f)]; }, getAngle: function (f) { return -f.track; }, getColor: function (f) { return /^(AUH|DXB|DWC|SHJ|RKT|FJR|AAN|AZI)$/.test(f.to) ? COLR.planeIn : COLR.plane; }, onClick: function (i) { pickFlight(i, POP); } }));
      out.push(new deck.TextLayer({ id: 'os-plane-name', data: D.flights, getPosition: function (f) { return [f.lon, f.lat, h(f)]; }, getText: function (f) { return f.flight || f.call || ''; }, getSize: 11, getColor: [30, 45, 70], getPixelOffset: [0, -20],
        fontFamily: 'system-ui, sans-serif', fontWeight: 600, outlineWidth: 3, outlineColor: [255, 255, 255, 230], fontSettings: { sdf: true } }));
    }
    var sats = D.sats.filter(function (s) { return near(map, s.at, big ? 25 : 6); });
    if (sats.length) {
      var sh = function (s) { return Math.min(s.alt, 2000) * 1000 * (M.satelliteHeightScale || 0.2); }, tick = Math.floor(Date.now() / 2000);
      out.push(new deck.LineLayer({ id: 'os-sat-stem', data: sats, widthUnits: 'pixels', getWidth: 1, getColor: [124, 92, 214, 110], getSourcePosition: function (s) { return [s.at[0], s.at[1], 0]; }, getTargetPosition: function (s) { return [s.at[0], s.at[1], sh(s)]; }, updateTriggers: { getSourcePosition: tick, getTargetPosition: tick } }));
      out.push(new deck.IconLayer({ id: 'os-sat', data: sats, pickable: true, sizeUnits: 'pixels', getSize: isz(24), getIcon: function () { return URLS.sat; }, getPosition: function (s) { return [s.at[0], s.at[1], sh(s)]; }, getColor: COLR.sat, updateTriggers: { getPosition: tick }, onClick: function (i) { pickSat(i, POP); } }));
      out.push(new deck.TextLayer({ id: 'os-sat-name', data: sats, getPosition: function (s) { return [s.at[0], s.at[1], sh(s)]; }, getText: function (s) { return s.name; }, getSize: 10.5, getColor: [80, 55, 160], getPixelOffset: [0, -18], fontFamily: 'system-ui, sans-serif',
        outlineWidth: 3, outlineColor: [255, 255, 255, 230], fontSettings: { sdf: true }, updateTriggers: { getPosition: tick } }));
    }
    if (D.quakes.length) {
      var qh = function (q) { return Math.max(0.3, (q.mag || 4) - 3.5) * 60000; };
      out.push(new deck.ColumnLayer({ id: 'os-quake-col', data: D.quakes, diskResolution: 16, radius: 9000, extruded: true, pickable: true, getPosition: function (q) { return [q.lon, q.lat]; }, getElevation: qh, getFillColor: COLR.quake.concat(150), onClick: function (i) { pickQuake(i, POP); } }));
      out.push(new deck.IconLayer({ id: 'os-quake', data: D.quakes, pickable: true, sizeUnits: 'pixels', getSize: function (q) { return 16 + 5 * Math.max(0, (q.mag || 4) - 4); }, getIcon: function () { return URLS.quake; }, getPosition: function (q) { return [q.lon, q.lat, qh(q)]; }, getColor: COLR.quake, onClick: function (i) { pickQuake(i, POP); } }));
    }
    if (D.events.length) { out.push(new deck.IconLayer({ id: 'os-event', data: D.events, pickable: true, sizeUnits: 'pixels', getSize: 24, getIcon: function () { return URLS.event; }, getPosition: function (e) { return [e.lon, e.lat]; }, getColor: COLR.event, onClick: function (i) { if (i.object) { POP([i.object.lon, i.object.lat], i.object.title, [['Kind', i.object.kind], ['Date', i.object.date.slice(0, 10)]], 'NASA EONET'); } } })); }
    if (D.world.length) {
      var LV = [[200, 150, 0], [200, 150, 0], [224, 102, 43], [199, 54, 47]];
      out.push(new deck.ScatterplotLayer({ id: 'os-world-ring', data: D.world, radiusUnits: 'pixels', getRadius: function (x) { return 9 + 4 * x.level; }, stroked: true, filled: true, lineWidthUnits: 'pixels', getLineWidth: 1.5,
        getPosition: function (x) { return [x.lon, x.lat]; }, getFillColor: function (x) { return LV[x.level].concat(60); }, getLineColor: function (x) { return LV[x.level]; } }));
      out.push(new deck.IconLayer({ id: 'os-world', data: D.world, pickable: true, sizeUnits: 'pixels', getSize: function (x) { return 16 + 3 * x.level; }, getIcon: function (x) { return URLS[x.kind === 'Earthquake' ? 'quake' : /fire/i.test(x.kind) ? 'fire' : /storm|cyclone|flood/i.test(x.kind) ? 'rain' : /dust/i.test(x.kind) ? 'dust' : 'event']; },
        getPosition: function (x) { return [x.lon, x.lat]; }, getColor: function (x) { return LV[x.level]; },
        onClick: function (i) { var x = i.object; if (x) { POP([x.lon, x.lat], x.title || x.kind, [['Kind', x.kind], ['When', x.time.slice(0, 16).replace('T', ' ') + ' UTC'], ['Alert level', ['', 'Advisory', 'Orange', 'Red'][x.level]], ['Source', x.src]], 'Real data'); } } }));
    }
    if (D.wx.length && (big || wide)) {
      out.push(new deck.IconLayer({ id: 'os-wx', data: D.wx, pickable: true, sizeUnits: 'pixels', getSize: 30, getIcon: function (p) { return URLS[wxPic(p)]; }, getPosition: function (p) { return [p.lon, p.lat, 4000]; },
        getColor: function (p) { return wxPic(p) === 'dust' ? COLR.dust : wxPic(p) === 'sun' ? [230, 150, 0] : COLR.wx; }, onClick: function (i) { pickWx(i, POP); } }));
      out.push(new deck.TextLayer({ id: 'os-wx-temp', data: D.wx, getPosition: function (p) { return [p.lon, p.lat, 4000]; }, getText: function (p) { return Math.round(p.now.temp) + '°'; }, getSize: 13, getColor: [25, 40, 60], getPixelOffset: [22, 0], fontFamily: 'system-ui, sans-serif', fontWeight: 700,
        outlineWidth: 3, outlineColor: [255, 255, 255, 235], fontSettings: { sdf: true }, characterSet: '0123456789°-' }));
    }
    return out;
  }
  function uae(iso) { var d = new Date(Date.parse(iso) + 4 * 3600000); return C.pad(d.getUTCHours()) + ':' + C.pad(d.getUTCMinutes()); }
  function pickFire(i, POP) { var f = i.object; if (f) { POP(f.at, 'Heat detection', [['Radiative power', f.frp.toFixed(1) + ' MW'], ['Seen', f.date + ' ' + uae(f.iso) + ' UAE time'], ['Confidence', f.conf === 'h' ? 'High' : f.conf === 'l' ? 'Low' : 'Nominal']], 'Real detection, NASA FIRMS. Column height follows the power.'); } }
  function pickShip(i, POP) { var s = i.object; if (s) { POP([s.lon, s.lat], s.name || 'MMSI ' + s.mmsi, [['Type', shipType(s.type)], ['Speed', (s.sog || 0).toFixed(1) + ' knots'], ['Course', Math.round(s.cog || 0) + '°'], ['Destination', s.dest || 'not reported']], 'Real position from AIS'); } }
  function pickFlight(i, POP) { var f = i.object, a = T.live.flights(); if (f) { POP([f.lon, f.lat], (f.flight || f.call || 'Flight') + (f.airline ? ' · ' + f.airline : ''), [['Route', (f.from || '?') + ' → ' + (f.to || '?')], ['Aircraft', f.type || 'not reported'], ['Height', num(f.alt) + ' ft'], ['Ground speed', num(f.gs) + ' knots'], ['Position at', uae(a.updated) + ' UAE time']], 'Flightradar24 snapshot. Height on the map is exaggerated ' + EX + ' times.'); } }
  function pickSat(i, POP) { var s = i.object; if (s) { POP(s.at, s.name, [['Height', num(Math.round(s.alt)) + ' km'], ['Speed', num(Math.round(s.speed)) + ' km/h'], ['Elevation from here', Math.round(s.el) + '°']], 'Position computed now from N2YO orbits. Height on the map is scaled down.'); } }
  function pickQuake(i, POP) { var q = i.object; if (q) { POP([q.lon, q.lat], 'Earthquake M' + (q.mag || 0).toFixed(1), [['Place', q.place], ['Time', q.time.slice(0, 16).replace('T', ' ') + ' UTC'], ['Depth', q.depth + ' km']], 'USGS. Column height follows the magnitude.'); } }
  function pickWx(i, POP) { var p = i.object; if (p) { POP([p.lon, p.lat], p.name, [['Temperature', Math.round(p.now.temp) + ' °C'], ['Wind', Math.round(p.now.wind) + ' km/h, gusts ' + Math.round(p.now.gust)], ['Rain, next 48 h', p.rain.reduce(function (s, v) { return s + (v || 0); }, 0).toFixed(1) + ' mm'], ['Dust risk, next 6 h', ['Low', 'Moderate', 'High', 'Severe'][Math.max.apply(null, p.dustRisk.slice(0, 6))]]], 'Open-Meteo'); } }

  // On the main map the OSINT symbols are drawn at the scale of the open region.
  C.addLayers(function () { return layersFor(T.getMap(), { view: 'region', pop: C.showPopup }); });
  function legendRows(view) {
    var D = data(view || 'world');
    return [['fire', COLR.fire, 'Fire or heat detection', D.fires.length, 'column height = power'], ['plane', COLR.plane, 'Flight', D.flights.length, 'green = arriving in the UAE'], ['ship', COLR.ship, 'Vessel', D.ships.length, 'colour = ship type'],
      ['sat', COLR.sat, 'Satellite', D.sats.length, 'moves in real time'], ['quake', COLR.quake, 'Earthquake', D.quakes.length, 'column height = magnitude'], ['sun', [230, 150, 0], 'Weather', D.wx.length, 'sun, cloud, rain or dust'],
      ['event', [199, 54, 47], 'Global incident', (T.osint.world() || []).length, 'world view; colour = alert level']].map(function (r) { return { pic: PIC[r[0]], color: r[1], name: r[2], count: r[3], note: r[4] }; });
  }
  T.osintMap = { layersFor: layersFor, legend: legendRows };
})();
