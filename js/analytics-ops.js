/* IntelliTwin analytics: charts for the operational sections and a comparison of the regions.
 *
 *   Operations today  crowd, transit, parking, assets, incidents, EV charging, air quality, sea and air
 *   Regions           road network, signals and data source of every region in config.js
 *
 * Uses the chart helpers of js/analytics.js. Figures are the same synthetic, illustrative and estimated
 * values the sections show; every chart title says which.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, state = T.state;
  function ch() { return T.analytics.charts; }
  function vis(id) { var el = $(id); return el && !el.closest('[data-an-sec]').hidden; }
  // One hue for normal values; amber and red only where a limit is passed.
  function tone(v, warn, bad) { var S = ch().STATUS; return v >= bad ? S.critical : v >= warn ? S.warning : ch().COL[0]; }

  function renderOps() {
    if (!vis('anOpsTiles')) { return; }
    var A = ch(), S = A.STATUS, COL = A.COL, cs = T.cityCases ? T.cityCases.stats() : {}, tiles = '';
    var v = T.cityCases ? T.cityCases.venues() : [];
    tiles += A.tile('People in watched venues', num(v.reduce(function (s, x) { return s + x.people; }, 0)), v.length + ' venues, synthetic');
    A.hbar('anOpsCrowd', { unit: '%', rows: v.slice().sort(function (a, b) { return b.load - a.load; }).map(function (x) { return { label: x.name, value: Math.round(x.load * 100), color: tone(x.load, 0.8, 1), sub: num(x.people) + ' of ' + num(x.cap) + ' people' }; }) });

    var routes = T.buses ? T.buses.routes().map(function (r) { var on = T.buses.busesOn(r, state.t); return { r: r, n: on.length, late: on.length ? on[0].late : 0 }; }).filter(function (x) { return x.n; }) : [];
    var buses = routes.reduce(function (s, x) { return s + x.n; }, 0), lim = (CFG.buses || {}).onTimeWithinMin || 3, ok = routes.filter(function (x) { return x.late < lim; }).reduce(function (s, x) { return s + x.n; }, 0);
    tiles += A.tile('Buses on time', buses ? Math.round(100 * ok / buses) + '%' : '–', buses + ' buses in service, synthetic', buses && ok / buses >= 0.85 ? 'good' : '');
    A.hbar('anOpsBus', { unit: 'min', rows: routes.sort(function (a, b) { return b.late - a.late; }).slice(0, 10).map(function (x) { return { label: x.r.id + ' ' + x.r.name, value: Math.round(x.late * 10) / 10, color: tone(x.late, lim, lim * 2), sub: x.n + ' buses in service' }; }) });

    var pk = T.parking ? T.parking.now() : [];
    A.hbar('anOpsPark', { unit: '%', rows: pk.map(function (p) { return { label: p.name, value: Math.round(p.now.occ * 100), color: tone(p.now.occ, 0.85, 0.97), sub: num(p.now.free) + ' spaces free' }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10) });
    if (pk.length) { tiles += A.tile('Car parks nearly full', pk.filter(function (p) { return p.now.occ >= 0.85; }).length + ' of ' + pk.length, 'synthetic occupancy'); }

    var groups = T.assets ? T.assets.groups() : [];
    A.hbar('anOpsAsset', { unit: '%', rows: groups.map(function (g) { return { label: g.name, value: Math.round(g.avail * 10) / 10, color: tone(100 - g.avail, 2, 3.5), sub: g.count + ' assets · ' + g.offline + ' offline' }; }) });
    if (cs.assetHealth != null) { tiles += A.tile('Asset health score', Math.round(cs.assetHealth) + '/100', cs.assetsAtRisk + ' likely to fail in 30 days, synthetic', cs.assetHealth >= 85 ? 'good' : ''); }

    var inc = T.incidents ? T.incidents.list() : [], st = [0, 0, 0, 0, 0]; inc.forEach(function (x) { st[x.stage]++; });
    A.pie('anOpsInc', { unit: 'incidents', rows: [['Reported', S.critical], ['Acknowledged', S.serious], ['Unit dispatched', S.warning], ['Unit on scene', COL[0]], ['Cleared', S.good]].map(function (r, i) { return { label: r[0], color: r[1], value: st[i] }; }) });
    tiles += A.tile('Incidents open now', inc.length - st[4], inc.length + ' today, illustrative', inc.length - st[4] ? '' : 'good');

    var ev = T.energy ? T.energy.ev() : [], sockets = 0, used = 0, h = state.t / 3600, share = 0.18 + 0.45 * Math.exp(-Math.pow((h - 19) / 3.5, 2)) + 0.2 * Math.exp(-Math.pow((h - 12.5) / 2.5, 2));
    ev.forEach(function (s) { var n = s.sockets || 2; sockets += n; used += n * share; });
    A.pie('anOpsEv', { unit: 'sockets', rows: [{ label: 'In use', color: COL[1], value: Math.round(used) }, { label: 'Free', color: S.good, value: Math.max(0, sockets - Math.round(used)) }] });
    if (ev.length) { tiles += A.tile('EV charging stations', num(ev.length), num(sockets) + ' sockets, usage synthetic'); }

    if (T.environment && T.environment.sensors().length) {
      var lim2 = (CFG.environment || {}).alertAqiAbove || 100, labels = [], avg = [], worst = [];
      for (var k = 0; k < 24; k++) { var a = T.environment.averageAt(k * 3600 + 1800), mx = 0; T.environment.sensors().forEach(function (s) { mx = Math.max(mx, T.environment.readingAt(s, k * 3600 + 1800).aqi); }); labels.push(C.pad(k)); avg.push(Math.round(a.aqi)); worst.push(Math.round(mx)); }
      A.line('anOpsAqi', { labels: labels, unit: 'index', yMin: 0, series: [{ name: 'Average of sensors', color: COL[0], values: avg }, { name: 'Worst sensor', color: COL[1], values: worst }, { name: 'Alert limit', color: S.critical, values: labels.map(function () { return lim2; }), dash: [5, 4] }] });
    }
    if (T.sea && T.air) {
      var se = T.sea.stats(), ai = T.air.stats();
      if (ai.live) {
        A.bar('anOpsSeaAir', { labels: ['Aircraft in the air', 'Arriving', 'Departing', 'Vessels moving', 'Berths in use'], unit: '', series: [{ name: 'Now', color: COL[0], values: [ai.inAir || 0, ai.arriving || 0, ai.departing || 0, se.moving, se.berthsUsed] }] });
        tiles += A.tile('Aircraft to or from UAE airports', ai.inAir === null ? '–' : ai.inAir, ai.updated ? 'real, Flightradar24 at ' + ai.updated : 'no flight data yet');
      } else {
        A.bar('anOpsSeaAir', { labels: ['Aircraft in the air', 'Flights this hour', 'Vessels moving', 'Berths in use'], unit: '', series: [{ name: 'Now', color: COL[0], values: [ai.inAir, ai.movementsHour, se.moving, se.berthsUsed] }] });
        tiles += A.tile('Flights on time', ai.onTimePct === null ? '–' : Math.round(ai.onTimePct) + '%', num(ai.movementsToday) + ' movements today, synthetic');
      }
    }
    $('anOpsTiles').innerHTML = tiles;
  }

  /* ---------------------------------------------------------------- regions */
  var regs = null, loading = false;
  function loadRegions() {
    if (regs || loading) { return; } loading = true;
    Promise.all((CFG.regions || []).map(function (r) {
      var dir = r.id === (CFG.defaultRegion || 'abudhabi') ? 'data/' : 'data/' + r.id + '/';
      return fetch(dir + 'meta.json').then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; }).then(function (m) { return { r: r, m: m }; });
    })).then(function (rows) { regs = rows; loading = false; renderRegions(); });
  }
  function renderRegions() {
    if (!vis('anRegTiles')) { return; }
    if (!regs) { loadRegions(); $('anRegTiles').innerHTML = ch().tile('Regions', '…', 'loading'); return; }
    var A = ch(), COL = A.COL, built = regs.filter(function (x) { return x.m; }), nw = function (x) { return (x.m || {}).network || {}; };
    var km = built.reduce(function (s, x) { return s + (nw(x).km || 0); }, 0), sig = built.reduce(function (s, x) { return s + (nw(x).signals || 0); }, 0), sim = built.filter(function (x) { return x.m.traffic !== 'synthetic'; }).length;
    $('anRegTiles').innerHTML = A.tile('Regions built', built.length + ' of ' + regs.length, 'real OpenStreetMap roads') + A.tile('Road network', num(Math.round(km)) + ' km', 'main and connecting roads') + A.tile('Traffic signals', num(sig), 'mapped positions') + A.tile('Simulated regions', sim + ' of ' + built.length, 'Eclipse SUMO; the rest synthetic', sim === built.length ? 'good' : '');
    var cur = C.region.id, col = function (x) { return x.r.id === cur ? COL[1] : COL[0]; };
    A.hbar('anRegKm', { unit: 'km', rows: built.map(function (x) { return { label: x.r.name, value: Math.round(nw(x).km || 0), color: col(x), sub: num(nw(x).edges || 0) + ' road links' }; }).sort(function (a, b) { return b.value - a.value; }) });
    A.hbar('anRegSig', { unit: 'signals', rows: built.map(function (x) { return { label: x.r.name, value: nw(x).signals || 0, color: col(x), sub: num(nw(x).junctions || 0) + ' junctions' }; }).sort(function (a, b) { return b.value - a.value; }) });
    var cls = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
    A.bar('anRegClass', { labels: built.map(function (x) { return x.r.name.length > 9 ? x.r.name.slice(0, 8) + '…' : x.r.name; }), unit: 'km', series: cls.map(function (c, i) { return { name: c.charAt(0).toUpperCase() + c.slice(1), color: COL[i % COL.length], values: built.map(function (x) { return (nw(x).km_by_class || {})[c] || 0; }) }; }) });
    $('anRegTable').innerHTML = '<tr><th>Region</th><th>Road links</th><th>Road km</th><th>Signals</th><th>Traffic</th><th>3D buildings</th><th>Sites</th></tr>' + regs.map(function (x) {
      var b = (x.m || {}).buildings || {};
      return '<tr' + (x.r.id === cur ? ' class="is-current"' : '') + '><td>' + x.r.name + (x.r.id === cur ? ' (open)' : '') + '</td>' + (x.m ? '<td>' + num(nw(x).edges || 0) + '</td><td>' + num(Math.round(nw(x).km || 0)) + '</td><td>' + num(nw(x).signals || 0) + '</td><td>' + (x.m.traffic === 'synthetic' ? 'Synthetic pattern' : 'SUMO simulation') + '</td><td>' + (b.available ? num(b.shown) : '–') + '</td>' : '<td colspan="5">Not built yet</td>') + '<td>' + (x.r.sites || []).length + '</td></tr>';
    }).join('');
  }

  T.analyticsOps = { render: function () { renderOps(); renderRegions(); } };
})();
