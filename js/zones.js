/* IntelliTwin critical zones.
 *
 * Watches the traffic around sensitive sites: defence sites, embassies, government buildings,
 * hospitals, schools and others. Site positions come from OpenStreetMap (data/zones.json, written
 * by the data build) plus any listed in config.js. A site's status is worked out from the
 * synthetic traffic and the illustrative accidents within its radius, so it shows how the
 * monitoring works; it is not a real security or safety assessment.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, state = T.state;
  var Z = CFG.zones, sites = [], show = true, filter = '', kx = 111320 * Math.cos(24.4 * Math.PI / 180), ky = 110570;
  var COLOR = { ok: [12, 163, 12], watch: [250, 178, 25], alert: [208, 59, 59] }, WORD = { ok: 'Normal', watch: 'Watch', alert: 'Alert' };

  function label(type) { return (Z.types[type] || {}).label || type.charAt(0).toUpperCase() + type.slice(1); }
  function priority(type) { return (Z.types[type] || {}).priority || 1; }

  function setup(rows) {
    var edges = C.edges(), cell = 0.006, grid = {};
    edges.forEach(function (e, i) { var p = e.path[e.path.length >> 1], k = Math.floor(p[0] / cell) + ':' + Math.floor(p[1] / cell); (grid[k] = grid[k] || []).push(i); });
    var all = rows.map(function (r) { return { type: r[0], name: r[1], lon: r[2], lat: r[3] }; })
      .concat((Z.custom || []).map(function (c) { return { type: c.type, name: c.name, lon: c.lon, lat: c.lat, custom: true }; }));
    sites = all.map(function (s, n) {
      var gx = Math.floor(s.lon / cell), gy = Math.floor(s.lat / cell), near = [];
      for (var dx = -1; dx <= 1; dx++) { for (var dy = -1; dy <= 1; dy++) { (grid[(gx + dx) + ':' + (gy + dy)] || []).forEach(function (i) {
        var p = edges[i].path[edges[i].path.length >> 1]; if (Math.hypot((p[0] - s.lon) * kx, (p[1] - s.lat) * ky) <= Z.radiusM) { near.push(i); }
      }); } }
      s.id = n; s.edges = near; s.name = s.name || label(s.type) + ' (unnamed)'; s.status = 'ok'; s.ratio = 1; s.vehicles = 0; s.reason = '';
      return s;
    });
    var types = {}; sites.forEach(function (s) { types[s.type] = (types[s.type] || 0) + 1; });
    var sel = $('zoneType'); sel.innerHTML = '<option value="">All types (' + sites.length + ')</option>';
    Object.keys(types).sort(function (a, b) { return priority(b) - priority(a) || a.localeCompare(b); }).forEach(function (t) {
      var o = document.createElement('option'); o.value = t; o.textContent = label(t) + ' (' + types[t] + ')'; sel.appendChild(o);
    });
    $('zoneEmpty').hidden = sites.length > 0;
    evaluate(); render();
  }

  function evaluate() {
    var ev = C.eventTotals(state.scenario, state.t), active = ev ? ev.active : [], ops = T.ops && T.ops.events ? T.ops.events() : [];
    sites.forEach(function (s) {
      var occ = 0, free = 0;
      s.edges.forEach(function (i) { var o = C.occ(i); if (o) { occ += o; free += o * C.ratio(i); } });
      s.vehicles = occ; s.ratio = occ ? free / occ : 1;
      var acc = active.filter(function (a) { return Math.hypot((a.lon - s.lon) * kx, (a.lat - s.lat) * ky) <= Z.radiusM; })[0];
      var op = ops.filter(function (o) { return o.type.sev >= 2 && Math.hypot((o.cam.lon - s.lon) * kx, (o.cam.lat - s.lat) * ky) <= Z.radiusM; })[0];
      var busy = occ >= Z.minVehicles;
      if (acc) { s.status = 'alert'; s.reason = 'Accident within ' + Z.radiusM + ' m on ' + acc.road + ' (illustrative)'; }
      else if (op) { s.status = 'alert'; s.reason = op.type.text + ' within ' + Z.radiusM + ' m (synthetic)'; }
      else if (busy && s.ratio < Z.alertRatioBelow) { s.status = 'alert'; s.reason = 'Traffic at ' + Math.round(s.ratio * 100) + '% of the limit, ' + num(occ) + ' vehicles nearby'; }
      else if (busy && s.ratio < Z.watchRatioBelow) { s.status = 'watch'; s.reason = 'Traffic at ' + Math.round(s.ratio * 100) + '% of the limit, ' + num(occ) + ' vehicles nearby'; }
      else { s.status = 'ok'; s.reason = busy ? 'Traffic at ' + Math.round(s.ratio * 100) + '% of the limit' : 'Light traffic nearby'; }
    });
  }

  function openSite(s) {
    C.flyTo(s.lon, s.lat, 15.5);
    C.showPopup([s.lon, s.lat], s.name, [['Type', label(s.type)], ['Status', WORD[s.status]], ['Traffic nearby', Math.round(s.ratio * 100) + '% of limit'], ['Vehicles within ' + Z.radiusM + ' m', num(s.vehicles)]],
      s.reason + ' · ' + (s.custom ? 'site from config.js' : 'site from OpenStreetMap') + ' · synthetic traffic');
  }

  function render() {
    var list = sites.filter(function (s) { return !filter || s.type === filter; });
    var rank = { alert: 0, watch: 1, ok: 2 };
    $('zTotal').textContent = num(list.length);
    $('zWatch').textContent = num(list.filter(function (s) { return s.status === 'watch'; }).length);
    $('zAlert').textContent = num(list.filter(function (s) { return s.status === 'alert'; }).length);
    $('zoneNote').textContent = sites.length ? 'Radius ' + Z.radiusM + ' m' : '';
    var ol = $('zoneList'); ol.innerHTML = '';
    list.slice().sort(function (a, b) { return rank[a.status] - rank[b.status] || priority(b.type) - priority(a.type) || a.ratio - b.ratio; }).slice(0, 14).forEach(function (s) {
      ol.appendChild(C.listButton('zone-' + s.status, s.name, label(s.type) + ' · ' + s.reason, WORD[s.status], function () { openSite(s); }));
    });
    if (!list.length) { ol.innerHTML = '<li class="muted">No sites of this type.</li>'; }
  }

  C.addLayers(function (ctx) {
    if (!show || !sites.length) { return []; }
    var data = sites.filter(function (s) { return (!filter || s.type === filter) && (ctx.zoom >= 12.5 || s.status !== 'ok' || priority(s.type) >= 3); });
    var stamp = Math.floor(state.t / 60) + ':' + state.scenario + ':' + filter;
    return [new deck.ScatterplotLayer({
      id: 'zones', data: data, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
      getPosition: function (s) { return [s.lon, s.lat]; },
      getRadius: function (s) { return s.status === 'alert' ? 9 : s.status === 'watch' ? 7 : 5; },
      getFillColor: function (s) { return s.status === 'ok' ? [255, 210, 74, 235] : COLOR[s.status].concat([255]); },
      getLineColor: function (s) { return s.status === 'ok' ? [40, 30, 0] : [255, 255, 255]; }, getLineWidth: function (s) { return s.status === 'ok' ? 1 : 2; },
      updateTriggers: { getRadius: stamp, getFillColor: stamp, getLineColor: stamp, getLineWidth: stamp },
      onClick: function (info) { if (info.object) { openSite(info.object); } }
    })];
  });

  C.onReady(function () {
    $('zoneType').addEventListener('change', function (e) { filter = e.target.value; render(); C.redraw(); });
    $('showZones').addEventListener('change', function (e) { show = e.target.checked; C.redraw(); });
    C.onZones(setup);
    C.onMinute(function () { if (sites.length) { evaluate(); render(); } });
  });

  T.zones = {
    all: function () { return sites; },
    // Sites currently in ALERT, most important first; used by the alert list.
    alerts: function () { return sites.filter(function (s) { return s.status === 'alert'; }).sort(function (a, b) { return priority(b.type) - priority(a.type); }); },
    summary: function () { return { total: sites.length, watch: sites.filter(function (s) { return s.status === 'watch'; }).length, alert: sites.filter(function (s) { return s.status === 'alert'; }).length }; },
    open: openSite, label: label
  };
})();
