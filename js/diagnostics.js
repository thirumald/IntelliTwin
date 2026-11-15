/* IntelliTwin: connection check for the live map and traffic services.
 *
 * Calls Google Maps and TomTom from this browser exactly as the application does, and shows for each
 * call whether it worked and, when it did not, the provider's own reason and what to change.
 * The status bar shows the result at a glance; the full list is under Reports, Connection check.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$;
  var G = (CFG.map || {}).google || {}, TT = CFG.tomtom || {};
  function saved(name) { try { return localStorage.getItem(name) || ''; } catch (e) { return ''; } }
  function gKey() { return saved('itw-google-key') || G.key || ''; }
  function tKey() { return saved('itw-tomtom-key') || TT.key || ''; }
  function src(name, cfg) { return saved(name) && saved(name) !== cfg ? 'key saved in this browser' : cfg ? 'key from the site configuration' : 'no key'; }

  // What to do about a failure, from the provider's status and message.
  function hintGoogle(status, msg) {
    var m = String(msg || '');
    if (/referer|referrer/i.test(m)) { return 'The key does not allow this site. In Google Cloud, Credentials, open the key and add ' + location.origin + '/* under Website restrictions.'; }
    if (/not been used|disabled|not enabled|SERVICE_DISABLED|not authorized to use this (service|API)/i.test(m)) { return 'The Map Tiles API is not enabled for this key. In Google Cloud, APIs and services, Library, enable "Map Tiles API"; if the key has API restrictions, add Map Tiles API to them.'; }
    if (/billing/i.test(m)) { return 'Billing is not active on the Google Cloud project of this key. Link a billing account to the project.'; }
    if (/API key not valid|invalid/i.test(m)) { return 'Google does not recognise the key. Check that it was copied in full.'; }
    if (status === 429 || /quota|exceeded/i.test(m)) { return 'The request quota of the key is used up. Raise the quota or wait for it to reset.'; }
    if (status === 0) { return 'Google could not be reached from this browser. A content blocker, VPN or network filter may be stopping tile.googleapis.com.'; }
    return 'Check the key in Google Cloud: Map Tiles API enabled, billing active, this site allowed.';
  }
  function hintTomTom(status, msg) {
    if (status === 403) { return 'TomTom refused the key. In the TomTom developer portal check the key, that Traffic, Search and Routing are enabled for it, and that ' + location.hostname + ' is in its allowed domains (or that it has none).'; }
    if (status === 429) { return 'The request limit of the key is used up. It resets daily; a paid plan raises it.'; }
    if (status === 400) { return 'TomTom rejected the request: ' + String(msg || '').slice(0, 140); }
    if (status === 0) { return 'TomTom could not be reached from this browser. A content blocker, VPN or network filter may be stopping api.tomtom.com.'; }
    return 'TomTom returned an error. Try again in a minute.';
  }

  // One call: resolves to { ok, status, msg } and never rejects.
  function call(url, opts) {
    return fetch(url, opts || {}).then(function (r) {
      if (r.ok) { return r.clone().json().catch(function () { return {}; }).then(function (j) { return { ok: true, status: r.status, body: j }; }); }
      return r.text().then(function (t) {
        var msg = t; try { var j = JSON.parse(t); msg = (j.error && (j.error.message || j.error.description)) || (j.detailedError && j.detailedError.message) || j.errorText || j.message || t; } catch (e) { /* plain text */ }
        return { ok: false, status: r.status, msg: String(msg || '').replace(/\s+/g, ' ').slice(0, 260) };
      });
    }).catch(function (e) { return { ok: false, status: 0, msg: String(e && e.message || 'network error') }; });
  }

  var results = [], running = false;
  function run() {
    if (running) { return Promise.resolve(results); }
    running = true; results = []; render();
    var c = T.getMap() ? T.getMap().getCenter() : { lng: 54.37, lat: 24.47 };
    var z = 12, n = Math.pow(2, z), x = Math.floor((c.lng + 180) / 360 * n), s = Math.sin(c.lat * Math.PI / 180), y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
    var tk = encodeURIComponent(tKey()), gk = encodeURIComponent(gKey());
    var add = function (group, name, r, hint) { results.push({ group: group, name: name, ok: r.ok, status: r.status, msg: r.msg || '', hint: r.ok ? '' : hint(r.status, r.msg) }); render(); };
    var google = !gKey() ? Promise.resolve(add('Google Maps', 'API key', { ok: false, status: -1, msg: 'No Google Maps key is set.' }, function () { return 'Set map.google.key in config.js or paste a key under Reports, Base map.'; })) :
      call('https://tile.googleapis.com/v1/createSession?key=' + gk, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapType: 'roadmap', language: 'en-US', region: 'AE' }) }).then(function (r) {
        add('Google Maps', 'Map session (Map Tiles API)', r, hintGoogle);
        if (!r.ok) { return null; }
        return call('https://tile.googleapis.com/v1/2dtiles/' + z + '/' + x + '/' + y + '?session=' + encodeURIComponent(r.body.session) + '&key=' + gk).then(function (t) { add('Google Maps', 'Map tile', t, hintGoogle); });
      }).then(function () {
        return call('https://tile.googleapis.com/v1/3dtiles/root.json?key=' + gk).then(function (r) { add('Google Maps', '3D tiles for City view', r, hintGoogle); });
      });
    var d = 0.05, box = [c.lng - d, c.lat - d, c.lng + d, c.lat + d].map(function (v) { return v.toFixed(4); }).join(',');
    var tomtom = !tKey() ? Promise.resolve(add('TomTom', 'API key', { ok: false, status: -1, msg: 'No TomTom key is set.' }, function () { return 'Set tomtom.key in config.js or paste a key under Reports, TomTom live data.'; })) :
      call('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/' + z + '/' + x + '/' + y + '.png?key=' + tk).then(function (r) { add('TomTom', 'Live traffic tiles', r, hintTomTom); })
        .then(function () { return call('https://api.tomtom.com/traffic/services/5/incidentDetails?key=' + tk + '&bbox=' + box + '&language=en-GB&timeValidityFilter=present&fields=' + encodeURIComponent('{incidents{type,properties{iconCategory}}}')); }).then(function (r) { add('TomTom', 'Live incidents', r, hintTomTom); })
        .then(function () { return call('https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/12/json?key=' + tk + '&point=' + c.lat.toFixed(5) + ',' + c.lng.toFixed(5) + '&unit=KMPH'); }).then(function (r) { add('TomTom', 'Live speed at a point', r, hintTomTom); })
        .then(function () { return call('https://api.tomtom.com/search/2/categorySearch/' + encodeURIComponent('petrol station') + '.json?key=' + tk + '&lat=' + c.lat.toFixed(5) + '&lon=' + c.lng.toFixed(5) + '&radius=5000&limit=1'); }).then(function (r) { add('TomTom', 'Station search', r, hintTomTom); })
        .then(function () { return call('https://api.tomtom.com/routing/1/calculateRoute/' + c.lat.toFixed(5) + ',' + c.lng.toFixed(5) + ':' + (c.lat + 0.02).toFixed(5) + ',' + (c.lng + 0.02).toFixed(5) + '/json?key=' + tk + '&traffic=true&travelMode=car'); }).then(function (r) { add('TomTom', 'Route with live traffic', r, hintTomTom); });
    return Promise.all([google, tomtom]).then(function () { running = false; render(); return results; }, function () { running = false; render(); return results; });
  }

  function groupState(g) {
    var rows = results.filter(function (r) { return r.group === g; });
    if (!rows.length) { return running ? 'wait' : 'none'; }
    // Google 3D tiles are optional: the base map works without them.
    var need = rows.filter(function (r) { return r.name !== '3D tiles for City view'; });
    return need.every(function (r) { return r.ok; }) ? (rows.every(function (r) { return r.ok; }) ? 'ok' : 'part') : need.some(function (r) { return r.ok; }) ? 'part' : 'fail';
  }
  var WORD = { ok: 'connected', part: 'partly working', fail: 'not working', wait: 'checking…', none: 'not checked' };
  function report() {
    var lines = ['IntelliTwin connection check · ' + location.origin + location.pathname + ' · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      'Google Maps: ' + src('itw-google-key', G.key), 'TomTom: ' + src('itw-tomtom-key', TT.key)];
    results.slice().sort(function (a, b) { return a.group < b.group ? -1 : a.group > b.group ? 1 : 0; }).forEach(function (r) { lines.push((r.ok ? 'OK   ' : 'FAIL ') + r.group + ' · ' + r.name + (r.ok ? '' : ' · ' + (r.status > 0 ? r.status + ' ' : '') + r.msg)); });
    return lines.join('\n');
  }
  function render() {
    ['Google Maps', 'TomTom'].forEach(function (g) {
      var st = groupState(g), el = $(g === 'TomTom' ? 'svcTt' : 'svcG');
      el.className = 'svc svc-' + st; el.textContent = g + ': ' + WORD[st]; el.title = g + ' is ' + WORD[st] + '. Open the connection check.';
    });
    var box = $('svcList'); box.innerHTML = '';
    ['Google Maps', 'TomTom'].forEach(function (g) {
      var rows = results.filter(function (r) { return r.group === g; }); if (!rows.length) { return; }
      var h = document.createElement('h3'); h.className = 'svc-h'; h.textContent = g + ' · ' + src(g === 'TomTom' ? 'itw-tomtom-key' : 'itw-google-key', g === 'TomTom' ? TT.key : G.key); box.appendChild(h);
      rows.forEach(function (r) {
        var d = document.createElement('div'); d.className = 'svc-row ' + (r.ok ? 'is-ok' : 'is-fail');
        var a = document.createElement('strong'); a.textContent = (r.ok ? '✓ ' : '✗ ') + r.name; d.appendChild(a);
        if (!r.ok) {
          var m = document.createElement('span'); m.textContent = (r.status > 0 ? 'Error ' + r.status + '. ' : '') + r.msg; d.appendChild(m);
          var f = document.createElement('em'); f.textContent = r.hint; d.appendChild(f);
        }
        box.appendChild(d);
      });
    });
    $('svcNote').textContent = running ? 'Checking…' : results.length ? (results.every(function (r) { return r.ok; }) ? 'Every call worked from this browser.' : 'Some calls failed. The reason and the fix are shown under each one.') : 'Not checked yet.';
    $('svcCopy').hidden = !results.length || running;
  }

  C.onReady(function () {
    $('svcRun').addEventListener('click', function () { run(); });
    $('svcCopy').addEventListener('click', function () {
      var text = report(), done = function () { $('svcNote').textContent = 'Result copied. Paste it into a message.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () { $('svcText').hidden = false; $('svcText').value = text; $('svcText').select(); }); }
      else { $('svcText').hidden = false; $('svcText').value = text; $('svcText').select(); }
    });
    ['svcG', 'svcTt'].forEach(function (id) {
      $(id).addEventListener('click', function () { C.showTab('rep'); setTimeout(function () { $('svcNote').scrollIntoView({ block: 'center' }); }, 250); if (!results.length) { run(); } });
    });
    render();
    // Check once shortly after start, so the status bar tells straight away whether the live services answer.
    if ((CFG.diagnostics || {}).checkOnStart !== false && (gKey() || tKey())) { setTimeout(run, 4000); }
  });
  T.diagnostics = { run: run, report: report, results: function () { return results; } };
})();
