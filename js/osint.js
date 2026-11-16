/* IntelliTwin: OSINT — open-source intelligence from public feeds, in its own menu section.
 *
 *   Weather now, rain forecast, sand and dust forecast   Open-Meteo (no key)
 *   Earthquakes within 1,500 km                          USGS
 *   Natural events around the Gulf                       NASA EONET
 *   Space weather                                        NOAA SWPC
 *   Fire detections, flights, vessels, satellites        added by js/livefeeds.js
 *
 * Everything here is real and is read from the files the "Live data" workflow publishes; nothing is simulated.
 * The feed list follows the open-source OSIRIS project (MIT), whose own dashboard can be linked from osint.osirisUrl.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, K = T.kit, esc = K.esc;
  var L = CFG.live || {}, O = CFG.osint || {}; if (L.enabled === false || !L.baseUrl) { return; }
  var wx = null, quakes = null, events = null, space = null, status = {}, loaded = false;
  var bb = (C.meta() || {}).bbox || [54.2, 24.2, 54.8, 24.7], centre = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
  function km(lon, lat) { var kx = 111.32 * Math.cos(centre[1] * Math.PI / 180); return Math.hypot((lon - centre[0]) * kx, (lat - centre[1]) * 110.57); }
  function ago(iso) { if (!iso) { return 'never'; } var m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 90 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }
  function set(id, html) { var el = $(id); if (el) { el.innerHTML = html; } }
  function place() { return wx && (wx.places[C.region.id] || wx.places.abudhabi); }
  var WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail' };
  var DIR = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], RISK = ['Low', 'Moderate', 'High', 'Severe'], RCOL = ['#2e9e6b', '#d99a00', '#e0662b', '#c7362f'];
  function hourLabel(from, k) { var h = (Number(from.slice(11, 13)) + k) % 24; return C.pad(h) + ':00'; }
  function dayWord(from, k) { var d = Math.floor((Number(from.slice(11, 13)) + k) / 24); return d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in 2 days'; }

  // Forty-eight hourly bars as inline SVG; colour per bar optional.
  function bars(values, o) {
    var w = 320, h = 96, pad = 18, n = values.length, max = Math.max(o.min || 0, Math.max.apply(null, values.map(function (v) { return v || 0; }))) || 1, bw = (w - 4) / n, out = '';
    for (var g = 0; g <= 2; g++) { var y = pad + (h - pad - 16) * g / 2; out += '<line x1="0" x2="' + w + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/>' + '<text x="' + w + '" y="' + (y - 2) + '" text-anchor="end" font-size="9" fill="var(--muted)">' + (Math.round(max * (1 - g / 2) * 10) / 10) + (g === 0 ? ' ' + o.unit : '') + '</text>'; }
    values.forEach(function (v, k) {
      var bh = Math.max(v ? 1.5 : 0, (h - pad - 16) * (v || 0) / max);
      out += '<rect x="' + (2 + k * bw).toFixed(1) + '" y="' + (h - 16 - bh).toFixed(1) + '" width="' + Math.max(1.5, bw - 1.5).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="1" fill="' + (o.color ? o.color(k) : 'var(--chart-1, #2a78d6)') + '"><title>' + esc(o.tip(k)) + '</title></rect>';
      if (k % 12 === 0) { out += '<text x="' + (2 + k * bw).toFixed(1) + '" y="' + (h - 4) + '" font-size="9" fill="var(--muted)">' + hourLabel(o.from, k) + '</text>'; }
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img" aria-label="' + esc(o.label) + '">' + out + '</svg>';
  }

  function renderWx() {
    var p = place(); $('osWxSub').textContent = wx ? p.name + ' · updated ' + ago(wx.updated) : loaded ? 'Not available yet' : 'Loading…';
    if (!p) { return; }
    var n = p.now;
    set('osWxTemp', Math.round(n.temp) + '<small>°C</small>'); set('osWxSky', WMO[n.code] || 'Code ' + n.code);
    set('osWxWind', Math.round(n.wind) + '<small>km/h ' + DIR[Math.round((n.dir || 0) / 45) % 8] + '</small>'); set('osWxVis', n.vis == null ? '–' : (n.vis / 1000).toFixed(n.vis < 10000 ? 1 : 0) + '<small>km</small>');
    $('osWxFacts').innerHTML = C.fact('Feels like', '', Math.round(n.feels) + ' °C') + C.fact('Humidity', '', Math.round(n.humidity) + '%') + C.fact('Wind gusts', '', Math.round(n.gust) + ' km/h') + C.fact('Rain now', '', (n.rain || 0).toFixed(1) + ' mm') +
      C.fact('Dust in the air', 'forecast model', n.dust == null ? '–' : Math.round(n.dust) + ' µg/m³') + C.fact('Fine particles PM10', 'forecast model', n.pm10 == null ? '–' : Math.round(n.pm10) + ' µg/m³');
    // Rain
    var tot = p.rain.reduce(function (s, v) { return s + (v || 0); }, 0), tot12 = p.rain.slice(0, 12).reduce(function (s, v) { return s + (v || 0); }, 0), pk = p.rain.indexOf(Math.max.apply(null, p.rain.map(function (v) { return v || 0; }))), maxProb = Math.max.apply(null, p.rainProb.map(function (v) { return v || 0; }));
    set('osRain48', tot.toFixed(1) + '<small>mm</small>'); set('osRain12', tot12.toFixed(1) + '<small>mm</small>'); set('osRainProb', Math.round(maxProb) + '<small>%</small>');
    set('osRainPeak', tot > 0 ? hourLabel(p.from, pk) : '–');
    $('osRainNote').textContent = tot <= 0.05 ? 'No rain is forecast in the next 48 hours.' : 'Heaviest hour: ' + (p.rain[pk] || 0).toFixed(1) + ' mm at ' + hourLabel(p.from, pk) + ' ' + dayWord(p.from, pk) + '.';
    $('osRainChart').innerHTML = bars(p.rain, { unit: 'mm', min: 1, from: p.from, label: 'Rain forecast by hour', tip: function (k) { return hourLabel(p.from, k) + ' ' + dayWord(p.from, k) + ': ' + (p.rain[k] || 0).toFixed(1) + ' mm, ' + Math.round(p.rainProb[k] || 0) + '% chance'; } });
    // Sand and dust
    var worst = Math.max.apply(null, p.dustRisk), first = p.dustRisk.findIndex(function (r) { return r >= 2; }), dmax = Math.max.apply(null, p.dust.map(function (v) { return v || 0; })), gmax = Math.max.apply(null, p.gust.map(function (v) { return v || 0; })), vmin = Math.min.apply(null, p.vis.filter(function (v) { return v != null; }));
    set('osDustRisk', '<span style="color:' + RCOL[worst] + '">' + RISK[worst] + '</span>'); set('osDustMax', Math.round(dmax) + '<small>µg/m³</small>'); set('osDustGust', Math.round(gmax) + '<small>km/h</small>'); set('osDustVis', isFinite(vmin) ? (vmin / 1000).toFixed(1) + '<small>km</small>' : '–');
    $('osDustNote').textContent = worst < 2 ? 'No high sand or dust risk in the next 48 hours.' : 'High risk from ' + hourLabel(p.from, first) + ' ' + dayWord(p.from, first) + '. Expect reduced visibility; lower speed limits and warn drivers on message signs.';
    $('osDustChart').innerHTML = bars(p.dust, { unit: 'µg/m³', min: 150, from: p.from, label: 'Dust forecast by hour', color: function (k) { return RCOL[p.dustRisk[k]]; }, tip: function (k) { return hourLabel(p.from, k) + ' ' + dayWord(p.from, k) + ': ' + Math.round(p.dust[k] || 0) + ' µg/m³, gusts ' + Math.round(p.gust[k] || 0) + ' km/h, risk ' + RISK[p.dustRisk[k]]; } });
    $('osDustKey').innerHTML = RISK.map(function (r, i) { return '<span><i style="background:' + RCOL[i] + '"></i>' + r + '</span>'; }).join('');
  }
  function renderQuakes() {
    $('osQkSub').textContent = quakes ? 'Updated ' + ago(quakes.updated) : loaded ? 'Not available yet' : 'Loading…'; if (!quakes) { return; }
    var q = quakes.quakes.map(function (x) { return Object.assign({ km: km(x.lon, x.lat) }, x); }), top = q.reduce(function (m, x) { return Math.max(m, x.mag || 0); }, 0), near = q.slice().sort(function (a, b) { return a.km - b.km; })[0];
    set('osQkN', q.length); set('osQkTop', q.length ? 'M' + top.toFixed(1) : '–'); set('osQkNear', near ? num(Math.round(near.km)) + '<small>km</small>' : '–'); set('osQk5', q.filter(function (x) { return x.mag >= 5; }).length);
    var ol = $('osQkList'); ol.innerHTML = '';
    q.slice().sort(function (a, b) { return (b.mag || 0) - (a.mag || 0); }).slice(0, 6).forEach(function (x) { ol.appendChild(C.listButton(x.mag >= 5 ? 'severe' : x.mag >= 4 ? 'heavy' : 'moderate', x.place || 'Earthquake', ago(x.time) + ' · ' + num(Math.round(x.km)) + ' km from here · ' + x.depth + ' km deep', 'M' + (x.mag || 0).toFixed(1), function () { if (x.url) { window.open(x.url, '_blank', 'noopener'); } })); });
    if (!q.length) { ol.innerHTML = '<li class="muted">No earthquake of magnitude 4 or more within 2,000 km in the last 30 days.</li>'; }
  }
  function renderEvents() {
    $('osEvSub').textContent = events ? 'Updated ' + ago(events.updated) : loaded ? 'Not available yet' : 'Loading…'; if (!events) { return; }
    var ol = $('osEvList'); ol.innerHTML = '';
    events.events.map(function (x) { return Object.assign({ km: km(x.lon, x.lat) }, x); }).sort(function (a, b) { return a.km - b.km; }).slice(0, 6).forEach(function (x) { ol.appendChild(C.listButton(x.km < 300 ? 'severe' : x.km < 800 ? 'heavy' : 'moderate', x.title, x.kind + ' · ' + ago(x.date) + ' · ' + num(Math.round(x.km)) + ' km from here', '', function () { if (x.url) { window.open(x.url, '_blank', 'noopener'); } })); });
    if (!events.events.length) { ol.innerHTML = '<li class="muted">No natural event recorded between the Red Sea and India in the last 60 days.</li>'; }
  }
  function renderSpace() {
    $('osSpSub').textContent = space ? 'Updated ' + ago(space.updated) : loaded ? 'Not available yet' : 'Loading…'; if (!space) { return; }
    var kp = space.kp, now = kp[kp.length - 1][1], mx = Math.max.apply(null, kp.map(function (r) { return r[1]; })), lvl = now >= 7 ? 3 : now >= 5 ? 2 : now >= 4 ? 1 : 0;
    set('osSpKp', now.toFixed(1)); set('osSpMax', mx.toFixed(1)); set('osSpState', '<span style="color:' + RCOL[lvl] + '">' + ['Quiet', 'Unsettled', 'Storm', 'Severe storm'][lvl] + '</span>');
    $('osSpNote').textContent = lvl >= 2 ? 'A geomagnetic storm is in progress: satellite positioning and HF radio can be degraded.' : 'No geomagnetic storm. Satellite positioning and radio are unaffected.';
  }
  function renderSources() {
    var names = { weather: 'Open-Meteo weather and dust', quakes: 'USGS earthquakes', events: 'NASA EONET natural events', space: 'NOAA space weather', fires: 'NASA FIRMS fire detections', flights: 'Flightradar24 flights', vessels: 'aisstream.io vessels', satellites: 'N2YO satellites' };
    $('osSrcTable').innerHTML = Object.keys(names).map(function (k) { var s = status[k] || {}; return C.fact(names[k], s.ok === false ? 'last attempt failed' : s.note ? String(s.note).slice(0, 70) : '', s.ok ? 'Updated ' + ago(s.updated) : s.updated ? 'Stale: ' + ago(s.updated) : 'No data'); }).join('');
    var u = O.osirisUrl, a = $('osOsiris'); a.hidden = !u; if (u) { a.href = u; }
  }
  function render() { if (!K.tabOpen('osint')) { return; } renderWx(); renderQuakes(); renderEvents(); renderSpace(); renderSources(); }

  function load() {
    var bust = '?t=' + Math.floor(Date.now() / 120000), get = function (f) { return fetch(L.baseUrl + f + bust, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    return Promise.all([get('weather.json'), get('quakes.json'), get('events.json'), get('space.json'), get('status.json')]).then(function (r) {
      loaded = true; wx = r[0] || wx; quakes = r[1] || quakes; events = r[2] || events; space = r[3] || space; status = r[4] || status; render(); C.redraw();
    });
  }
  // Warnings for the alert feed (js/ops.js), from the forecast for the open region.
  function warnings() {
    var out = [], p = place();
    if (p) {
      var first = p.dustRisk.slice(0, 24).findIndex(function (r) { return r >= 2; }), rain12 = p.rain.slice(0, 12).reduce(function (s, v) { return s + (v || 0); }, 0);
      if (first >= 0) { out.push({ key: 'dust:' + p.from.slice(0, 10) + first, sev: p.dustRisk[first] >= 3 ? 3 : 2, title: 'Sand and dust risk ' + RISK[p.dustRisk[first]].toLowerCase() + ' from ' + hourLabel(p.from, first) + ' ' + dayWord(p.from, first), sub: p.name + ' · forecast, Open-Meteo · not an official warning' }); }
      if (rain12 >= (O.rainAlertMm || 5)) { out.push({ key: 'rain:' + p.from.slice(0, 13), sev: rain12 >= 20 ? 3 : 2, title: 'Rain forecast: ' + rain12.toFixed(1) + ' mm in the next 12 hours', sub: p.name + ' · forecast, Open-Meteo · watch underpasses and low roads' }); }
      if (p.now.vis != null && p.now.vis < 1000) { out.push({ key: 'vis:' + p.now.time, sev: 2, title: 'Low visibility: ' + Math.round(p.now.vis) + ' m', sub: p.name + ' · Open-Meteo' }); }
    }
    return out;
  }
  function quakeWarnings() {
    return !quakes ? [] : quakes.quakes.filter(function (x) { return x.mag >= (O.quakeAlertMag || 5) && km(x.lon, x.lat) <= (O.quakeAlertKm || 800) && Date.now() - Date.parse(x.time) < 86400000; })
      .map(function (x) { return { key: 'quake:' + x.time, sev: x.mag >= 6 ? 3 : 2, title: 'Earthquake M' + x.mag.toFixed(1) + ': ' + x.place, sub: num(Math.round(km(x.lon, x.lat))) + ' km away · ' + ago(x.time) + ' · USGS' }; });
  }

  C.onReady(function () { load(); setInterval(load, Math.max(2, L.refreshMin || 10) * 60000); });
  C.onTab(render);
  var CEN = { abudhabi: [54.37, 24.47], dubai: [55.27, 25.20], sharjah: [55.40, 25.34], ajman: [55.45, 25.40], ummalquwain: [55.57, 25.56], rasalkhaimah: [55.96, 25.79], fujairah: [56.33, 25.13], alain: [55.74, 24.21] };
  function places() { return !wx ? null : Object.keys(wx.places).filter(function (k) { return CEN[k]; }).map(function (k) { return Object.assign({ id: k, lon: CEN[k][0], lat: CEN[k][1] }, wx.places[k]); }); }
  T.osint = { weather: place, places: places, quakes: function () { return quakes ? quakes.quakes : null; }, events: function () { return events ? events.events : null; }, warnings: warnings, quakeWarnings: quakeWarnings, reload: load };
})();
