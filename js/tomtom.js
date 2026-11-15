/* IntelliTwin TomTom integration: live traffic, live incidents, live speeds, EV and fuel stations, route times.
 *
 * Everything here is REAL, LIVE data from TomTom when a TomTom API key is set; without a key the module
 * stays switched off and the rest of the app runs on its simulated and synthetic data.
 *
 * The key comes from config.js (tomtom.key) or, if one is entered in the app (Reports > TomTom live data, or
 * ?tomtom=YOUR_KEY once), from this browser. A key in config.js is public: keep it restricted to this site's
 * address in the TomTom developer dashboard. See docs/tomtom.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, state = T.state, K = T.kit, esc = K.esc;
  var TT = CFG.tomtom || {}, BASE = 'https://api.tomtom.com', STORE = 'itw-tomtom-key';
  var incidents = [], incidentsAt = 0, stations = { ev: [], fuel: [] }, lastError = '';

  // A key passed once in the address is stored and removed from the address bar.
  (function () {
    var q = new URLSearchParams(location.search), k = q.get('tomtom');
    if (k) { try { localStorage.setItem(STORE, k.trim()); } catch (e) { /* storage unavailable */ } q.delete('tomtom'); var qs = q.toString(); history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); }
  })();
  function key() { var k = ''; try { k = localStorage.getItem(STORE) || ''; } catch (e) { /* storage unavailable */ } return k || TT.key || ''; }
  function has() { return !!key(); }
  function get(path, params) {
    var q = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(BASE + path + '?key=' + encodeURIComponent(key()) + (q ? '&' + q : '')).then(function (r) {
      if (!r.ok) { lastError = r.status === 403 ? 'The key was refused (403). Check the key and the products enabled for it.' : r.status === 429 ? 'The daily request limit of the key is used up (429).' : 'TomTom returned an error (' + r.status + ').'; throw new Error(lastError); }
      lastError = ''; return r.json();
    });
  }
  function bbox() { var b = C.meta().bbox; return b[0] + ',' + b[1] + ',' + b[2] + ',' + b[3]; }

  /* ---------------------------------------------------------------- live traffic flow tiles */
  function flowLayer(on) {
    var map = T.getMap(); if (!map) { return; }
    var apply = function () {
      try {
        if (map.getLayer('tt-flow')) { map.removeLayer('tt-flow'); } if (map.getSource('tt-flow')) { map.removeSource('tt-flow'); }
        if (on && has()) {
          map.addSource('tt-flow', { type: 'raster', tileSize: 256, attribution: '© TomTom', tiles: [BASE + '/traffic/map/4/tile/flow/' + (TT.flowStyle || 'relative0') + '/{z}/{x}/{y}.png?key=' + encodeURIComponent(key()) + '&tileSize=256&thickness=' + (TT.flowThickness || 6)] });
          map.addLayer({ id: 'tt-flow', type: 'raster', source: 'tt-flow', paint: { 'raster-opacity': 0.9 } });
        }
      } catch (e) { /* the style is still loading; the style.load handler applies it again */ }
    };
    apply(); state.liveFlow = !!(on && has()); $('ttCredit').hidden = !(state.liveFlow || incidents.length || stations.ev.length || stations.fuel.length);
    C.redraw();
  }

  /* ---------------------------------------------------------------- live incidents */
  var ICON = { 0: 'Unknown', 1: 'Accident', 2: 'Fog', 3: 'Dangerous conditions', 4: 'Rain', 5: 'Ice', 6: 'Jam', 7: 'Lane closed', 8: 'Road closed', 9: 'Roadworks', 10: 'Wind', 11: 'Flooding', 14: 'Broken-down vehicle' };
  function loadIncidents() {
    if (!has()) { renderIncidents(); return Promise.resolve([]); }
    return get('/traffic/services/5/incidentDetails', { bbox: bbox(), language: 'en-GB', timeValidityFilter: 'present',
      fields: '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},startTime,endTime,from,to,length,delay,roadNumbers}}}' }).then(function (j) {
      incidents = (j.incidents || []).map(function (f) {
        var g = f.geometry || {}, c = g.type === 'Point' ? g.coordinates : (g.coordinates || [])[0], p = f.properties || {};
        return c ? { at: [c[0], c[1]], line: g.type === 'LineString' ? g.coordinates : null, kind: ICON[p.iconCategory] || 'Incident', what: ((p.events || [])[0] || {}).description || '', from: p.from || '', to: p.to || '', delayMin: p.delay ? Math.round(p.delay / 60) : 0, lengthM: p.length || 0, magnitude: p.magnitudeOfDelay || 0, start: p.startTime || '' } : null;
      }).filter(Boolean).sort(function (a, b) { return b.magnitude - a.magnitude || b.delayMin - a.delayMin; });
      incidentsAt = Date.now(); renderIncidents(); C.redraw(); return incidents;
    }).catch(function () { renderIncidents(); return []; });
  }
  function renderIncidents() {
    $('ttIncNote').textContent = !has() ? 'Add a TomTom key in Reports to see live incidents.' : lastError ? lastError : incidentsAt ? incidents.length + ' live incidents · updated ' + new Date(incidentsAt).toLocaleTimeString('en-GB', { hour12: false, timeZone: (CFG.time || {}).timeZone || 'Asia/Dubai' }) : 'Loading…';
    $('ttIncCount').textContent = has() && incidentsAt ? incidents.length : '–';
    $('dLiveInc').textContent = has() && incidentsAt ? incidents.length : '–';
    var ol = $('ttIncList'); ol.innerHTML = '';
    incidents.slice(0, 15).forEach(function (x) {
      ol.appendChild(C.listButton(x.magnitude >= 3 ? 'severe' : x.magnitude === 2 ? 'heavy' : 'moderate', x.kind + (x.from ? ': ' + x.from : ''), (x.what ? x.what + ' · ' : '') + (x.to ? 'to ' + x.to + ' · ' : '') + (x.lengthM ? (x.lengthM / 1000).toFixed(1) + ' km' : ''), x.delayMin ? x.delayMin + '<small>min</small>' : '', function () {
        if (T.getMap()) { T.getMap().easeTo({ center: x.at, zoom: 14.5, duration: 700 }); }
        C.showPopup(x.at, x.kind, [['From', x.from || '–'], ['To', x.to || '–'], ['Detail', x.what || '–'], ['Delay', x.delayMin ? x.delayMin + ' min' : 'none reported'], ['Length', x.lengthM ? (x.lengthM / 1000).toFixed(1) + ' km' : '–']], 'Live incident from TomTom');
      }));
    });
  }

  /* ---------------------------------------------------------------- live speeds at the region's sites */
  function loadSpeeds() {
    if (!has()) { return; }
    var sites = C.sites().slice(0, TT.maxSites || 20), ol = $('ttSpeedList'); ol.innerHTML = '<li class="muted">Loading live speeds…</li>';
    Promise.all(sites.map(function (st) {
      return get('/traffic/services/4/flowSegmentData/absolute/12/json', { point: st[2] + ',' + st[1], unit: 'KMPH' }).then(function (j) { var d = j.flowSegmentData || {}; return { st: st, now: d.currentSpeed, free: d.freeFlowSpeed, closed: !!d.roadClosure, conf: d.confidence }; }).catch(function () { return null; });
    })).then(function (rows) {
      rows = rows.filter(function (r) { return r && r.now && r.free; }).sort(function (a, b) { return a.now / a.free - b.now / b.free; });
      ol.innerHTML = '';
      rows.forEach(function (r) {
        var ratio = r.now / r.free;
        ol.appendChild(C.listButton(r.closed ? 'severe' : C.level(ratio), r.st[0], r.closed ? 'Road closed' : Math.round(100 * ratio) + '% of free flow (' + Math.round(r.free) + ' km/h)', Math.round(r.now) + '<small>km/h</small>', function () { T.api && T.api.goSite ? T.api.goSite(r.st[0]) : null; }));
      });
      if (!rows.length) { ol.innerHTML = '<li class="muted">' + (lastError || 'No live speeds were returned.') + '</li>'; }
      $('ttSpeedNote').textContent = rows.length ? 'Live, slowest first · ' + new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: (CFG.time || {}).timeZone || 'Asia/Dubai' }) : '';
      $('ttCredit').hidden = false;
    });
  }

  /* ---------------------------------------------------------------- EV charging and fuel stations near the map centre */
  function loadStations(kind) {
    if (!has() || !T.getMap()) { return; }
    var c = T.getMap().getCenter(), note = $(kind === 'ev' ? 'ttEvNote' : 'ttFuelNote');
    note.textContent = 'Loading…';
    get('/search/2/categorySearch/' + encodeURIComponent(kind === 'ev' ? 'electric vehicle station' : 'petrol station') + '.json', { lat: c.lat, lon: c.lng, radius: TT.searchRadiusM || 15000, limit: 60, countrySet: 'AE' }).then(function (j) {
      stations[kind] = (j.results || []).map(function (r) {
        var con = ((r.chargingPark || {}).connectors || []), kw = con.reduce(function (m, x) { return Math.max(m, x.ratedPowerKW || 0); }, 0);
        return { kind: kind, name: (r.poi || {}).name || 'Station', brand: (((r.poi || {}).brands || [])[0] || {}).name || '', at: [r.position.lon, r.position.lat], address: (r.address || {}).freeformAddress || '', km: (r.dist || 0) / 1000, connectors: con.length, kw: kw, types: con.map(function (x) { return x.connectorType; }).filter(function (v, i, a) { return a.indexOf(v) === i; }), avail: ((r.dataSources || {}).chargingAvailability || {}).id || '' };
      });
      note.textContent = stations[kind].length + ' found within ' + Math.round((TT.searchRadiusM || 15000) / 1000) + ' km of the map centre · live from TomTom';
      renderStations(kind); $('ttCredit').hidden = false; C.redraw();
    }).catch(function () { note.textContent = lastError || 'The stations could not be loaded.'; });
  }
  function openStation(s) {
    if (T.getMap()) { T.getMap().easeTo({ center: s.at, zoom: 15, duration: 700 }); }
    var rows = [['Address', s.address || '–']];
    if (s.brand) { rows.push(['Brand', s.brand]); }
    if (s.kind === 'ev') { rows.push(['Connectors', s.connectors || '–']); rows.push(['Highest power', s.kw ? s.kw + ' kW' : '–']); if (s.types.length) { rows.push(['Types', s.types.slice(0, 3).join(', ')]); } }
    C.showPopup(s.at, s.name, rows, s.kind === 'ev' && s.avail ? 'Checking live availability…' : 'From TomTom');
    if (s.kind === 'ev' && s.avail) {
      get('/search/2/chargingAvailability.json', { chargingAvailability: s.avail }).then(function (j) {
        var a = 0, o = 0, tot = 0; (j.connectors || []).forEach(function (cn) { var cur = (cn.availability || {}).current || {}; a += cur.available || 0; o += cur.occupied || 0; tot += cn.total || 0; });
        C.showPopup(s.at, s.name, rows.concat([['Free now', a + ' of ' + tot], ['In use', o]]), 'Live availability from TomTom');
      }).catch(function () { /* availability is optional */ });
    }
  }
  function renderStations(kind) {
    var ol = $(kind === 'ev' ? 'ttEvList' : 'ttFuelList'); ol.innerHTML = '';
    stations[kind].slice(0, 12).forEach(function (s) {
      ol.appendChild(C.listButton(kind === 'ev' ? 'free' : 'moderate', s.name, (s.brand && s.brand !== s.name ? s.brand + ' · ' : '') + (kind === 'ev' ? (s.connectors ? s.connectors + ' connectors' + (s.kw ? ', up to ' + s.kw + ' kW' : '') + ' · ' : '') : '') + s.address, s.km.toFixed(1) + '<small>km</small>', function () { openStation(s); }));
    });
  }

  /* ---------------------------------------------------------------- route time with live traffic, for the response route */
  function routeTime(from, to) {
    if (!has()) { return Promise.resolve(null); }
    return get('/routing/1/calculateRoute/' + from[1] + ',' + from[0] + ':' + to[1] + ',' + to[0] + '/json', { traffic: 'true', travelMode: 'car' }).then(function (j) {
      var s = ((j.routes || [])[0] || {}).summary; return s ? { minutes: s.travelTimeInSeconds / 60, delayMin: (s.trafficDelayInSeconds || 0) / 60, km: s.lengthInMeters / 1000 } : null;
    }).catch(function () { return null; });
  }
  var lastRoute = null;
  function watchRoute() {
    var r = T.response && T.response.current(); if (r === lastRoute) { return; } lastRoute = r;
    if (!r || !has()) { $('ttRoute').textContent = ''; return; }
    $('ttRoute').textContent = 'Checking the live route time…';
    routeTime([r.base.lon, r.base.lat], r.target).then(function (x) { if (lastRoute !== r) { return; } $('ttRoute').textContent = x ? 'TomTom, live traffic: ' + Math.max(1, Math.round(x.minutes)) + ' min, ' + x.km.toFixed(1) + ' km' + (x.delayMin >= 1 ? ', including ' + Math.round(x.delayMin) + ' min of delay' : '') + '.' : ''; });
  }

  /* ---------------------------------------------------------------- map layers */
  C.addLayers(function () {
    var out = [];
    if (incidents.length && $('showTtInc').checked) {
      out.push(new deck.PathLayer({ id: 'tt-inc-lines', data: incidents.filter(function (x) { return x.line; }), getPath: function (x) { return x.line; }, getColor: function (x) { return x.magnitude >= 3 ? [208, 59, 59] : x.magnitude === 2 ? [236, 131, 90] : [250, 178, 25]; }, getWidth: 5, widthUnits: 'pixels', capRounded: true, jointRounded: true }));
      out.push(new deck.ScatterplotLayer({ id: 'tt-inc', data: incidents, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (x) { return x.at; }, getRadius: 8, getFillColor: function (x) { return x.magnitude >= 3 ? [208, 59, 59] : x.magnitude === 2 ? [236, 131, 90] : [250, 178, 25]; }, getLineColor: [255, 255, 255], getLineWidth: 2.5,
        onClick: function (info) { if (info.object) { var x = info.object; C.showPopup(x.at, x.kind, [['From', x.from || '–'], ['To', x.to || '–'], ['Detail', x.what || '–'], ['Delay', x.delayMin ? x.delayMin + ' min' : 'none reported']], 'Live incident from TomTom'); } } }));
    }
    ['ev', 'fuel'].forEach(function (kind) {
      if (stations[kind].length && K.tabOpen('bus')) {
        out.push(new deck.ScatterplotLayer({ id: 'tt-' + kind, data: stations[kind], pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getPosition: function (s) { return s.at; }, getRadius: 7, getFillColor: kind === 'ev' ? [12, 163, 12] : [201, 133, 0], getLineColor: [255, 255, 255], getLineWidth: 2.5, onClick: function (info) { if (info.object) { openStation(info.object); } } }));
      }
    });
    return out;
  });

  function status() {
    var on = has();
    var mine = ''; try { mine = localStorage.getItem(STORE) || ''; } catch (e) { /* storage unavailable */ }
    $('ttStatus').textContent = on ? (lastError || (mine ? 'A TomTom key is set in this browser. Live data is on.' : 'A TomTom key is set in the site configuration. Live data is on.')) : 'No TomTom key is set. Live data is off.';
    $('ttKey').value = ''; $('ttKey').placeholder = mine ? 'Key saved in this browser (hidden)' : on ? 'A key is set in the site configuration' : 'Paste the TomTom API key';
    ['showTomTom', 'ttSpeedBtn', 'ttEvBtn', 'ttFuelBtn', 'ttIncBtn'].forEach(function (id) { $(id).disabled = !on; });
    Array.prototype.forEach.call(document.querySelectorAll('.tt-need'), function (el) { el.hidden = on; });
    $('ttKeyRemove').hidden = !mine;
  }

  C.onReady(function () {
    status(); renderIncidents();
    $('ttKeySave').addEventListener('click', function () { var k = $('ttKey').value.trim(); if (!k) { return; } try { localStorage.setItem(STORE, k); } catch (e) { /* storage unavailable */ } status(); loadIncidents(); if (T.audit) { T.audit('TomTom key set in this browser'); } });
    $('ttKeyRemove').addEventListener('click', function () { try { localStorage.removeItem(STORE); } catch (e) { /* storage unavailable */ } $('showTomTom').checked = false; flowLayer(false); incidents = []; incidentsAt = 0; status(); renderIncidents(); C.redraw(); });
    $('showTomTom').addEventListener('change', function (e) { flowLayer(e.target.checked); });
    $('showTtInc').addEventListener('change', function () { C.redraw(); });
    $('ttIncBtn').addEventListener('click', loadIncidents);
    $('ttSpeedBtn').addEventListener('click', loadSpeeds);
    $('ttEvBtn').addEventListener('click', function () { loadStations('ev'); });
    $('ttFuelBtn').addEventListener('click', function () { loadStations('fuel'); });
    var map = T.getMap(); if (map) { map.on('style.load', function () { if ($('showTomTom').checked) { flowLayer(true); } }); }
    if (has()) {
      loadIncidents(); setInterval(function () { if (!document.hidden) { loadIncidents(); } }, (TT.incidentRefreshSec || 120) * 1000);
      if (TT.flowOnStart) { $('showTomTom').checked = true; flowLayer(true); }
    }
    C.onMinute(watchRoute); setInterval(watchRoute, 1500);
  });

  T.tomtom = { has: has, incidents: function () { return incidents; }, loadIncidents: loadIncidents, loadSpeeds: loadSpeeds, loadStations: loadStations, routeTime: routeTime, flow: flowLayer };
})();
