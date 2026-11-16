/* IntelliTwin: real live data from NASA FIRMS, N2YO and aisstream.io.
 *
 *   Emergency  fire and heat detections from satellites (NASA FIRMS, VIIRS)
 *   Transit    live vessels from AIS (aisstream.io); satellites overhead (N2YO orbits, positions computed here)
 *
 * The "Live data" workflow in GitHub Actions calls the three services with keys kept as repository secrets and
 * publishes small JSON files on the live-data branch. This file only reads those files, so no key reaches the browser.
 * These layers show the real world at the real time, whatever time the twin's own clock shows.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, K = T.kit, esc = K.esc;
  var L = CFG.live || {}; if (L.enabled === false || !L.baseUrl) { return; }
  var fires = null, sats = null, ships = null, air = null, status = {}, satNow = [], loadedAt = 0, err = '';
  var show = { fires: L.fires !== false, vessels: L.vessels !== false, sats: L.satellites !== false, air: L.flights !== false };
  var UAE_AP = { AUH: 'Abu Dhabi', DXB: 'Dubai', DWC: 'Dubai World Central', SHJ: 'Sharjah', RKT: 'Ras Al Khaimah', FJR: 'Fujairah', AAN: 'Al Ain', AZI: 'Al Bateen' };
  var PLANE = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path d="M12 2c.7 0 1.2.9 1.2 2v5.2l7.3 4.3v1.9l-7.3-2.2v4.4l2 1.5V21L12 20l-3.2 1v-1.9l2-1.5v-4.4l-7.3 2.2v-1.9l7.3-4.3V4c0-1.1.5-2 1.2-2z" fill="white"/></svg>');
  var bb = (C.meta() || {}).bbox || [54.2, 24.2, 54.8, 24.7], centre = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
  var kx = 111.32 * Math.cos(centre[1] * Math.PI / 180), ky = 110.57;
  function km(a, b) { return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky); }
  function inRegion(p, pad) { pad = pad || 0; return p[0] >= bb[0] - pad && p[0] <= bb[2] + pad && p[1] >= bb[1] - pad && p[1] <= bb[3] + pad; }
  function ago(iso) { if (!iso) { return 'never'; } var m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 90 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }
  function uae(iso) { var d = new Date(Date.parse(iso) + 4 * 3600000); return C.pad(d.getUTCHours()) + ':' + C.pad(d.getUTCMinutes()); }
  function tile(label, id) { return '<div class="kpi"><span class="k-label">' + label + '</span><span class="k-value" id="' + id + '">–</span></div>'; }
  function set(id, html) { var el = $(id); if (el) { el.innerHTML = html; } }
  function card(tab, id, title, notice, body) {
    var sec = document.createElement('section'); sec.className = 'card'; sec.id = id; sec.setAttribute('data-tab', tab); sec.hidden = true;
    sec.innerHTML = '<p class="notice">' + notice + '</p><div class="card-head"><h2>' + title + '</h2><span class="muted" id="' + id + 'Sub"></span></div>' + body;
    var end = $('osSources');                                   // the live cards sit above the source list of the OSINT section
    if (end) { end.parentNode.insertBefore(sec, end); return; }
    var all = document.querySelectorAll('.panel section[data-tab="' + tab + '"]'), last = all[all.length - 1];
    last.parentNode.insertBefore(sec, last.nextSibling);
  }
  function stateLine(name, data) {
    var s = status[name] || {};
    if (data) { return 'Updated ' + ago(data.updated) + (s.ok === false ? ' · last refresh failed' : ''); }
    return err ? 'The live data could not be loaded.' : s.ok === false ? 'Not available: ' + why(s.error) : loadedAt ? 'No data published yet.' : 'Loading…';
  }

  // A short reason in plain words; the full message is in status.json on the live-data branch.
  function why(e) { e = String(e || ''); return /answered 40[13]/.test(e) ? 'the service refused the key' : /answered 402|credit/i.test(e) ? 'the account has no credits left' : /is not set/.test(e) ? 'the API key is not set in GitHub' : /no vessel position|ConnectionClosed/.test(e) ? 'the AIS stream sent no vessel positions' : /answered:/.test(e) ? 'the service refused the request' : 'the source did not answer'; }

  /* ---------------------------------------------------------------- loading */
  function load() {
    var bust = '?t=' + Math.floor(Date.now() / 120000), get = function (f) { return fetch(L.baseUrl + f + bust, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    return Promise.all([get('status.json'), get('fires.json'), get('satellites.json'), get('vessels.json'), get('flights.json')]).then(function (r) {
      loadedAt = Date.now(); err = r[0] || r[1] || r[2] || r[3] || r[4] ? '' : 'unreachable';
      if (r[4]) { air = r[4]; }
      status = r[0] || status;
      if (r[1]) { fires = r[1]; fires.list = (r[1].rows || []).map(function (x) { return { at: [x[0], x[1]], date: x[2], time: x[3], frp: x[4], conf: x[5], sat: x[6], dn: x[7], iso: x[2] + 'T' + x[3] + ':00Z' }; }); }
      if (r[2]) { sats = r[2]; sats.recs = []; if (window.satellite) { r[2].sats.forEach(function (s) { try { sats.recs.push({ s: s, rec: window.satellite.twoline2satrec(s.l1, s.l2) }); } catch (e) { /* bad elements */ } }); } }
      if (r[3]) { ships = r[3]; }
      // Real vessels replace the synthetic ships on the map.
      if (ships && ships.ships.length >= (L.minVesselsToReplace || 15) && L.replaceSyntheticShips !== false && $('showSea') && $('showSea').checked && !load.hidSea) { load.hidSea = true; $('showSea').checked = false; $('showSea').dispatchEvent(new Event('change')); }
      tick(); render(); C.redraw();
    });
  }

  /* ---------------------------------------------------------------- satellites: positions from the orbital elements */
  function tick() {
    if (!sats || !window.satellite) { satNow = []; return; }
    var S = window.satellite, now = new Date(), gmst = S.gstime(now), obs = { longitude: centre[0] * Math.PI / 180, latitude: centre[1] * Math.PI / 180, height: 0 };
    satNow = [];
    sats.recs.forEach(function (x) {
      try {
        var pv = S.propagate(x.rec, now); if (!pv.position) { return; }
        var geo = S.eciToGeodetic(pv.position, gmst), look = S.ecfToLookAngles(obs, S.eciToEcf(pv.position, gmst)), v = pv.velocity;
        satNow.push({ id: x.s.id, name: x.s.name, at: [S.degreesLong(geo.longitude), S.degreesLat(geo.latitude)], alt: geo.height, el: look.elevation * 180 / Math.PI, az: look.azimuth * 180 / Math.PI,
          range: look.rangeSat, speed: Math.hypot(v.x, v.y, v.z) * 3600, rec: x.rec });
      } catch (e) { /* skip this satellite */ }
    });
    satNow.sort(function (a, b) { return b.el - a.el; });
  }
  function track(s) {
    var S = window.satellite, out = [];
    for (var m = -3; m <= 12; m++) { var d = new Date(Date.now() + m * 60000), pv = S.propagate(s.rec, d); if (pv.position) { var g = S.eciToGeodetic(pv.position, S.gstime(d)); out.push([S.degreesLong(g.longitude), S.degreesLat(g.latitude)]); } }
    return out;
  }
  var DIR = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  /* ---------------------------------------------------------------- vessels */
  function shipType(c) { return c >= 80 && c < 90 ? 'Tanker' : c >= 70 && c < 80 ? 'Cargo' : c >= 60 && c < 70 ? 'Passenger' : c === 30 ? 'Fishing' : c === 52 || c === 31 || c === 32 ? 'Tug' : c === 36 || c === 37 ? 'Pleasure craft' : c >= 40 && c < 50 ? 'High-speed craft' : c === 35 ? 'Military' : c === 51 ? 'Search and rescue' : c === 50 ? 'Pilot' : c ? 'Other' : 'Not reported'; }
  var TCOL = { Tanker: [230, 90, 70], Cargo: [70, 150, 230], Passenger: [60, 190, 120], Fishing: [220, 170, 60], Tug: [170, 120, 220], 'Not reported': [150, 160, 175] };
  function shipCol(s) { return TCOL[shipType(s.type)] || [120, 200, 210]; }
  function showShip(s) {
    C.showPopup([s.lon, s.lat], s.name || 'MMSI ' + s.mmsi, [['Type', shipType(s.type)], ['MMSI', s.mmsi], ['Speed', (s.sog || 0).toFixed(1) + ' knots'], ['Course', Math.round(s.cog || 0) + '°'], ['Destination', s.dest || 'not reported'], ['Length', s.len ? s.len + ' m' : 'not reported'], ['Heard', s.t ? uae(s.t.replace(' ', 'T') + 'Z') + ' UAE time' : '–']], 'Real position from AIS (aisstream.io)');
  }

  /* ---------------------------------------------------------------- flights */
  function arriving(f) { return !!UAE_AP[f.to]; }
  function flightStats() {
    if (!air) { return null; }
    var fl = air.flights, up = fl.filter(function (f) { return f.alt > 100 || f.gs > 60; });
    return { inAir: up.length, arriving: up.filter(arriving).length, departing: up.filter(function (f) { return UAE_AP[f.from] && !arriving(f); }).length, total: fl.length, updated: uae(air.updated), limit: air.limit };
  }
  function showFlight(f) {
    C.showPopup([f.lon, f.lat], (f.flight || f.call || 'Flight') + (f.airline ? ' · ' + f.airline : ''), [['Route', (f.from || '?') + ' → ' + (f.to || '?')], ['Aircraft', (f.type || 'not reported') + (f.reg ? ' · ' + f.reg : '')], ['Height', num(f.alt) + ' ft'], ['Ground speed', num(f.gs) + ' knots'], ['Heading', Math.round(f.track) + '°'], ['Climbing or descending', f.vs > 200 ? 'Climbing' : f.vs < -200 ? 'Descending' : 'Level'], ['Position at', uae(air.updated) + ' UAE time']], 'Real position from Flightradar24 at the time shown; the aircraft has moved since');
  }
  function renderAir() {
    $('lvAirSub').textContent = stateLine('flights', air);
    if (!air) { $('lvAirList').innerHTML = ''; return; }
    var st = flightStats(), fl = air.flights;
    set('lvAirAll', st.inAir); set('lvAirArr', st.arriving); set('lvAirDep', st.departing); set('lvAirAt', st.updated);
    $('lvAirNote').textContent = 'Positions as they were at ' + st.updated + ' UAE time (' + ago(air.updated) + '). Each refresh returns at most ' + st.limit + ' flights to or from UAE airports, to limit Flightradar24 credits.';
    var by = {}; fl.forEach(function (f) { var a = UAE_AP[f.to] ? f.to : UAE_AP[f.from] ? f.from : ''; if (a) { by[a] = (by[a] || 0) + 1; } });
    var mx = Math.max.apply(null, Object.keys(by).map(function (k) { return by[k]; }).concat([1]));
    $('lvAirBars').innerHTML = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).map(function (k) { return C.barRow(esc(UAE_AP[k] + ' (' + k + ')'), 'arriving or departing', by[k], by[k] / mx); }).join('');
    var ol = $('lvAirList'); ol.innerHTML = '';
    fl.slice().sort(function (a, b) { return km([a.lon, a.lat], centre) - km([b.lon, b.lat], centre); }).slice(0, 10).forEach(function (f) {
      ol.appendChild(C.listButton(arriving(f) ? 'free' : 'moderate', (f.flight || f.call || 'Flight') + ' · ' + (f.from || '?') + ' → ' + (f.to || '?'), (f.type || '') + (f.airline ? ' · ' + f.airline : '') + ' · ' + num(f.gs) + ' kn · ' + Math.round(km([f.lon, f.lat], centre)) + ' km away', num(f.alt) + '<small>ft</small>', function () { if (inRegion([f.lon, f.lat], 0.6)) { C.flyTo(f.lon, f.lat, 11); } showFlight(f); }));
    });
  }

  /* ---------------------------------------------------------------- rendering */
  function renderFires() {
    $('lvFireSub').textContent = stateLine('fires', fires);
    if (!fires) { $('lvFireList').innerHTML = ''; return; }
    var here = fires.list.filter(function (f) { return inRegion(f.at, 0.15); }), top = fires.list.reduce(function (m, f) { return Math.max(m, f.frp); }, 0), latest = fires.list[0];
    set('lvFireAll', num(fires.list.length)); set('lvFireHere', num(here.length)); set('lvFireTop', Math.round(top) + '<small>MW</small>'); set('lvFireLast', latest ? uae(latest.iso) : '–');
    var ol = $('lvFireList'); ol.innerHTML = '';
    (here.length ? here : fires.list).slice().sort(function (a, b) { return b.frp - a.frp; }).slice(0, 8).forEach(function (f) {
      ol.appendChild(C.listButton(f.frp >= 30 ? 'severe' : f.frp >= 8 ? 'heavy' : 'moderate', f.at[1].toFixed(3) + '°N, ' + f.at[0].toFixed(3) + '°E', f.date + ' ' + uae(f.iso) + ' UAE · ' + (f.dn === 'N' ? 'night' : 'day') + ' pass · ' + Math.round(km(f.at, centre)) + ' km from the region centre', f.frp.toFixed(1) + '<small>MW</small>', function () {
        C.flyTo(f.at[0], f.at[1], 12.5); C.showPopup(f.at, 'Heat detection', [['Radiative power', f.frp.toFixed(1) + ' MW'], ['Seen', f.date + ' ' + uae(f.iso) + ' UAE time'], ['Satellite', f.sat === 'N' ? 'Suomi NPP' : f.sat === 'N20' ? 'NOAA-20' : f.sat === 'N21' ? 'NOAA-21' : f.sat], ['Confidence', f.conf === 'h' ? 'High' : f.conf === 'l' ? 'Low' : 'Nominal']], 'Real detection, NASA FIRMS (VIIRS 375 m)');
      }));
    });
    $('lvFireNote').textContent = here.length ? '' : 'None inside this region in the last two days; the strongest across the UAE are listed.';
  }
  function renderShips() {
    $('lvShipSub').textContent = stateLine('vessels', ships);
    if (!ships) { $('lvShipList').innerHTML = ''; return; }
    var all = ships.ships, here = all.filter(function (s) { return inRegion([s.lon, s.lat], 0.35); }), moving = all.filter(function (s) { return (s.sog || 0) > 0.5; }), types = {};
    all.forEach(function (s) { var t = shipType(s.type); types[t] = (types[t] || 0) + 1; });
    set('lvShipAll', num(all.length)); set('lvShipHere', num(here.length)); set('lvShipMove', num(moving.length)); set('lvShipTank', num((types.Tanker || 0) + (types.Cargo || 0)));
    var mx = Math.max.apply(null, Object.keys(types).map(function (k) { return types[k]; }).concat([1]));
    $('lvShipBars').innerHTML = Object.keys(types).sort(function (a, b) { return types[b] - types[a]; }).slice(0, 6).map(function (k) { return C.barRow(esc(k), '', types[k], types[k] / mx); }).join('');
    var ol = $('lvShipList'); ol.innerHTML = '';
    (here.length ? here : all).slice().sort(function (a, b) { return km([a.lon, a.lat], centre) - km([b.lon, b.lat], centre); }).slice(0, 8).forEach(function (s) {
      ol.appendChild(C.listButton((s.sog || 0) > 0.5 ? 'free' : 'moderate', s.name || 'MMSI ' + s.mmsi, shipType(s.type) + (s.dest ? ' · to ' + s.dest : '') + ' · ' + Math.round(km([s.lon, s.lat], centre)) + ' km away', (s.sog || 0).toFixed(1) + '<small>kn</small>', function () { C.flyTo(s.lon, s.lat, 13); showShip(s); }));
    });
  }
  function renderSats() {
    $('lvSatSub').textContent = stateLine('satellites', sats) + (sats && !window.satellite ? ' · orbit library missing' : '');
    if (!sats) { $('lvSatList').innerHTML = ''; return; }
    var up = satNow.filter(function (s) { return s.el > 0; }), high = up.filter(function (s) { return s.el >= 30; }), iss = satNow.filter(function (s) { return s.id === 25544; })[0];
    set('lvSatAll', sats.recs.length); set('lvSatUp', up.length); set('lvSatHigh', high.length); set('lvSatIss', iss ? (iss.el > 0 ? Math.round(iss.el) + '<small>° up</small>' : 'below') : '–');
    var ol = $('lvSatList'); ol.innerHTML = '';
    satNow.slice(0, 8).forEach(function (s) {
      ol.appendChild(C.listButton(s.el >= 30 ? 'free' : s.el > 0 ? 'moderate' : 'heavy', s.name, (s.el > 0 ? 'Elevation ' + Math.round(s.el) + '° to the ' + DIR[Math.round(s.az / 45) % 8] : 'Below the horizon') + ' · ' + num(Math.round(s.range)) + ' km away · ' + num(Math.round(s.speed)) + ' km/h', num(Math.round(s.alt)) + '<small>km</small>', function () {
        C.showPopup(inRegion(s.at, 3) ? s.at : centre, s.name, [['NORAD number', s.id], ['Height', num(Math.round(s.alt)) + ' km'], ['Over', s.at[1].toFixed(2) + '°, ' + s.at[0].toFixed(2) + '°'], ['Elevation from here', Math.round(s.el) + '°'], ['Speed', num(Math.round(s.speed)) + ' km/h']], 'Position computed now from N2YO orbital elements');
      }));
    });
  }
  function render() {
    if (K.tabOpen('osint')) { renderFires(); renderAir(); renderShips(); renderSats(); }
    var f = $('lyLvFireN'), v = $('lyLvShipN'), s = $('lyLvSatN'), a = $('lyLvAirN');
    if (a) { a.textContent = air ? '(' + air.flights.length + ' at ' + uae(air.updated) + ')' : '(not available yet)'; }
    if (f) { f.textContent = fires ? '(' + num(fires.list.length) + ' in 2 days)' : '(not available yet)'; }
    if (v) { v.textContent = ships ? '(' + num(ships.ships.length) + ' heard)' : '(not available yet)'; }
    if (s) { s.textContent = sats ? '(' + satNow.filter(function (x) { return x.el > 0; }).length + ' above the horizon)' : '(not available yet)'; }
  }

  /* ---------------------------------------------------------------- map */
  C.addLayers(function () {
    var out = [];
    if (show.fires && fires) {
      out.push(new deck.ScatterplotLayer({ id: 'lv-fires', data: fires.list, pickable: true, radiusUnits: 'meters', radiusMinPixels: 4, radiusMaxPixels: 22, stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1.5, getLineColor: [255, 235, 160],
        getPosition: function (f) { return f.at; }, getRadius: function (f) { return 250 + 60 * Math.sqrt(f.frp); }, getFillColor: function (f) { return f.frp >= 30 ? [235, 60, 40, 220] : f.frp >= 8 ? [245, 130, 40, 210] : [250, 190, 60, 200]; },
        onClick: function (i) { if (i.object) { var f = i.object; C.showPopup(f.at, 'Heat detection', [['Radiative power', f.frp.toFixed(1) + ' MW'], ['Seen', f.date + ' ' + uae(f.iso) + ' UAE time']], 'Real detection, NASA FIRMS'); } } }));
    }
    if (show.vessels && ships) {
      var mv = ships.ships.filter(function (s) { return (s.sog || 0) > 0.5; });
      out.push(new deck.LineLayer({ id: 'lv-ship-course', data: mv, widthUnits: 'pixels', getWidth: 1.5, getColor: function (s) { return shipCol(s).concat(200); }, getSourcePosition: function (s) { return [s.lon, s.lat]; },
        getTargetPosition: function (s) { var d = Math.min(3, 0.2 + s.sog * 0.12) / 111, a = (s.cog || 0) * Math.PI / 180; return [s.lon + d * Math.sin(a) / Math.cos(s.lat * Math.PI / 180), s.lat + d * Math.cos(a)]; } }));
      out.push(new deck.ScatterplotLayer({ id: 'lv-ships', data: ships.ships, pickable: true, radiusUnits: 'pixels', getRadius: function (s) { return s.len >= 150 ? 6 : 4.5; }, stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1, getLineColor: [10, 20, 35],
        getPosition: function (s) { return [s.lon, s.lat]; }, getFillColor: shipCol, onClick: function (i) { if (i.object) { showShip(i.object); } } }));
    }
    if (show.air && air && deck.IconLayer) {
      out.push(new deck.IconLayer({ id: 'lv-flights', data: air.flights, pickable: true, sizeUnits: 'pixels', getSize: 26, getIcon: function () { return { url: PLANE, width: 48, height: 48, mask: true }; },
        getPosition: function (f) { return [f.lon, f.lat]; }, getAngle: function (f) { return -f.track; }, getColor: function (f) { return arriving(f) ? [90, 220, 150] : [255, 200, 90]; }, onClick: function (i) { if (i.object) { showFlight(i.object); } } }));
      if (deck.TextLayer) { out.push(new deck.TextLayer({ id: 'lv-flight-names', data: air.flights, getPosition: function (f) { return [f.lon, f.lat]; }, getText: function (f) { return f.flight || f.call || ''; }, getSize: 11, getColor: [235, 240, 250], getPixelOffset: [0, -18], fontFamily: 'system-ui, sans-serif' })); }
    }
    if (show.sats && satNow.length) {
      var near = satNow.filter(function (s) { return inRegion(s.at, 6); });
      out.push(new deck.PathLayer({ id: 'lv-sat-track', data: near.map(track), getPath: function (p) { return p; }, widthUnits: 'pixels', getWidth: 1.5, getColor: [190, 150, 255, 150] }));
      out.push(new deck.ScatterplotLayer({ id: 'lv-sats', data: near, pickable: true, radiusUnits: 'pixels', getRadius: 6, getPosition: function (s) { return s.at; }, getFillColor: [190, 150, 255], stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1.5, getLineColor: [255, 255, 255],
        updateTriggers: { getPosition: Math.floor(Date.now() / 2000) }, onClick: function (i) { if (i.object) { var s = i.object; C.showPopup(s.at, s.name, [['Height', num(Math.round(s.alt)) + ' km'], ['Speed', num(Math.round(s.speed)) + ' km/h']], 'Position computed now from N2YO orbital elements'); } } }));
      if (deck.TextLayer) { out.push(new deck.TextLayer({ id: 'lv-sat-names', data: near, getPosition: function (s) { return s.at; }, getText: function (s) { return s.name; }, getSize: 11, getColor: [225, 210, 255], getPixelOffset: [0, -14], fontFamily: 'system-ui, sans-serif', updateTriggers: { getPosition: Math.floor(Date.now() / 2000) } })); }
    }
    return out;
  });

  C.onReady(function () {
    var REAL = '<strong>Real data.</strong> ';
    card('osint', 'lvFire', 'Fire and heat detections', REAL + 'Heat seen by satellites in the last two days (NASA FIRMS, VIIRS). In the UAE most detections are gas flares and industrial sites, not wildfires. Shown at real time, not the twin’s clock.',
      '<div class="kpis">' + tile('Detections, UAE', 'lvFireAll') + tile('In this region', 'lvFireHere') + tile('Strongest', 'lvFireTop') + tile('Latest, UAE time', 'lvFireLast') + '</div><p class="muted" id="lvFireNote"></p><ol class="corridors" id="lvFireList"></ol>');
    card('osint', 'lvAir', 'Live flights', REAL + 'Aircraft flying to or from UAE airports, from Flightradar24. This is a snapshot: positions are as they were at the time shown and are refreshed a few times a day, because each returned flight is billed. Synthetic flights are no longer shown.',
      '<div class="kpis">' + tile('Aircraft in the air', 'lvAirAll') + tile('Arriving in the UAE', 'lvAirArr') + tile('Departing', 'lvAirDep') + tile('Snapshot, UAE time', 'lvAirAt') + '</div><p class="muted" id="lvAirNote"></p><div id="lvAirBars"></div><ol class="corridors" id="lvAirList"></ol>');
    card('osint', 'lvShip', 'Live vessels (AIS)', REAL + 'Vessels heard on AIS (aisstream.io) in the last few hours, each at its last reported position. Coverage near the UAE depends on the receivers that feed aisstream.io and is thin, so this is not every ship. Shown at real time, not the twin’s clock.',
      '<div class="kpis">' + tile('Vessels heard, UAE waters', 'lvShipAll') + tile('Near this region', 'lvShipHere') + tile('Under way', 'lvShipMove') + tile('Tankers and cargo', 'lvShipTank') + '</div><div id="lvShipBars"></div><ol class="corridors" id="lvShipList"></ol>');
    card('osint', 'lvSat', 'Satellites overhead', REAL + 'Orbits from N2YO; each position is computed in this browser for the present moment, so the satellites move as you watch. Elevation is measured from the centre of this region.',
      '<div class="kpis">' + tile('Satellites tracked', 'lvSatAll') + tile('Above the horizon now', 'lvSatUp') + tile('Higher than 30°', 'lvSatHigh') + tile('Space Station', 'lvSatIss') + '</div><ol class="corridors" id="lvSatList"></ol>');
    [['lyLvFire', 'fires'], ['lyLvShip', 'vessels'], ['lyLvSat', 'sats'], ['lyLvAir', 'air']].forEach(function (p) { var el = $(p[0]); if (el) { el.checked = show[p[1]]; el.addEventListener('change', function () { show[p[1]] = el.checked; C.redraw(); }); } });
    load();
    setInterval(load, Math.max(2, L.refreshMin || 10) * 60000);
    setInterval(function () { if (sats && (show.sats || K.tabOpen('osint'))) { tick(); if (K.tabOpen('osint')) { renderSats(); } if (show.sats && satNow.some(function (s) { return inRegion(s.at, 6); })) { C.redraw(); } } }, 2000);
  });
  C.onTab(render);
  T.live = { flights: function () { return air; }, flightStats: flightStats, fires: function () { return fires; }, vessels: function () { return ships; }, satellites: function () { return satNow; }, status: function () { return status; }, reload: load };
})();
