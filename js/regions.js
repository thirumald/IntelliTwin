/* IntelliTwin regions.
 *
 * Runs before the application. It reads the region from the address (?region=dubai), defaults to
 * config.defaultRegion (Abu Dhabi), and for any region other than the default it replaces the Abu Dhabi
 * example data in the configuration with data derived from that region's site list: patrol bases, bus
 * routes, taxi ranks, shuttle zones, car parks, freight zone, assembly points, disaster exercise areas,
 * events, sea lanes and flight paths. All of it is SYNTHETIC example data placed at approximate sites.
 */
(function () {
  'use strict';
  var CFG = window.INTELLITWIN_CONFIG; if (!CFG || !CFG.regions) { return; }
  var want = (new URLSearchParams(location.search).get('region') || CFG.defaultRegion || 'abudhabi').toLowerCase();
  var R = CFG.regions.filter(function (r) { return r.id === want; })[0] || CFG.regions[0];
  CFG.region = R;
  R.isDefault = R.id === (CFG.defaultRegion || 'abudhabi');
  R.dataDir = 'data/' + (R.dir ? R.dir + '/' : '');
  if (R.isDefault) { return; }

  var S = R.sites.map(function (s) { return { name: s[0], at: [s[1], s[2]], kind: s[4] || 'centre', coastal: !!s[5] }; });
  var kx = 111320 * Math.cos(R.centre[1] * Math.PI / 180), ky = 110570;
  function h(n, k) { var x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }
  function of(kinds) { return S.filter(function (s) { return kinds.indexOf(s.kind) >= 0; }); }
  function far(a, b) { return Math.hypot((a.at[0] - b.at[0]) * kx, (a.at[1] - b.at[1]) * ky); }
  // A point `km` away from `at` on a compass bearing.
  function move(at, bearing, km) { var b = bearing * Math.PI / 180; return [at[0] + Math.sin(b) * km * 1000 / kx, at[1] + Math.cos(b) * km * 1000 / ky]; }
  var centre = S[0], ex = ' (example)';

  CFG.response.bases = S.slice(0, 7).map(function (s) { return { name: 'Patrol unit, ' + s.name, lon: s.at[0], lat: s.at[1] }; });

  // Bus routes: from the centre to the other sites, then a few cross-town routes; only pairs far enough apart.
  var routes = [], no = 1;
  function addRoute(a, b, head) { if (a !== b && far(a, b) > 2500 && routes.length < 10) { routes.push({ id: String(no++), name: a.name + ' – ' + b.name, from: a.at, to: b.at, headwayMin: head }); } }
  S.slice(1).forEach(function (s, i) { addRoute(centre, s, 10 + (i % 3) * 5); });
  for (var i = 1; i + 3 < S.length && routes.length < 10; i += 2) { addRoute(S[i], S[i + 3], 15 + (i % 2) * 5); }
  CFG.buses.routes = routes;

  CFG.taxis.ranks = S.slice(0, 11).map(function (s, i) { return { name: s.name, at: s.at, bays: s.kind === 'airport' ? 20 : s.kind === 'mall' || s.kind === 'business' ? 12 : 8 }; });
  CFG.taxis.count = Math.max(60, Math.min(320, S.length * 22));
  CFG.shuttles.zones = of(['residential', 'leisure', 'university']).slice(0, 4).map(function (s, i) { return { name: s.name, at: s.at, radiusM: 2000, vehicles: 4 + (i % 3), waitMin: 6 + i * 2 }; });

  var pk = { centre: 'business', business: 'business', mall: 'leisure', leisure: 'leisure', open: 'leisure', residential: 'residential', university: 'business', airport: 'mixed', port: 'mixed', industrial: 'business' };
  CFG.parking.sites = S.slice(0, 12).map(function (s, i) {
    var street = i % 5 === 4;
    return { name: s.name + (street ? ' on-street zone' : ' car park'), at: [s.at[0] + 0.0012, s.at[1] + 0.0010], spaces: street ? 300 + Math.round(h(i, 1) * 5) * 60 : 600 + Math.round(h(i, 2) * 12) * 200, kind: pk[s.kind] || 'mixed', street: street };
  });

  var heavy = of(['industrial', 'port', 'airport']);
  CFG.freight.zone = { at: R.centre, radiusM: 4500 };
  CFG.freight.weighStations = (heavy.length ? heavy : S.slice(-2)).slice(0, 3).map(function (s, i) { return { name: s.name + ' weigh station' + ex, at: [s.at[0] - 0.002, s.at[1] + 0.002], perHour: 90 + i * 40 }; });
  var hz = heavy[0] || S[S.length - 1], hzTo = S.slice().sort(function (a, b) { return far(b, hz) - far(a, hz); })[0];
  CFG.freight.hazmatFrom = hz.at; CFG.freight.hazmatTo = hzTo.at;

  var open = of(['open', 'leisure', 'mall', 'university']);
  CFG.emergency.assemblyPoints = (open.length >= 3 ? open : S).slice(0, 7).map(function (s) { return { name: s.name + ' open area' + ex, at: s.at }; });
  var coastal = S.filter(function (s) { return s.coastal; }), air = of(['airport', 'industrial']);
  var areas = {
    flood: [centre].concat(of(['industrial', 'residential']).slice(0, 2)).map(function (s, i) { return { name: s.name + ' low roads', at: s.at, radiusM: 1500 + i * 300 }; }),
    surge: coastal.slice(0, 3).map(function (s) { return { name: s.name + ' seafront', at: s.at, radiusM: 1800 }; }),
    sand: (air.length ? air : S.slice(-2)).slice(0, 2).map(function (s) { return { name: s.name + ' area', at: s.at, radiusM: 5000 }; }),
    quake: [{ name: R.name + ' centre', at: R.centre, radiusM: 7000 }],
    heat: [{ name: 'Whole city', at: R.centre, radiusM: 15000 }]
  };
  CFG.emergency.disasters = (CFG.emergency.disasters || []).map(function (d) { return Object.assign({}, d, { areas: areas[d.id] || [] }); }).filter(function (d) { return d.areas.length; });

  var venues = of(['mall', 'leisure', 'open', 'business']), ev = 0;
  CFG.planned.items = (CFG.planned.items || []).filter(function (it) { return it.type === 'roadworks' || venues[ev]; }).map(function (it) {
    if (it.type === 'roadworks') { return it; }
    var v = venues[ev % venues.length]; ev++;
    return Object.assign({}, it, { title: ['Exhibition', 'Evening concert', 'Fun run', 'Football match'][(ev - 1) % 4] + ' at ' + v.name + ex, at: v.at });
  });

  // Sea lanes: two example lanes fanning out from the port on its sea bearing.
  if (R.port) {
    var p = R.port, lane = function (off, name) { return { name: name, path: [move(p.at, p.seaBearing, 0.8), move(p.at, p.seaBearing + off * 0.4, 5), move(p.at, p.seaBearing + off * 0.8, 13), move(p.at, p.seaBearing + off, 26)] }; };
    CFG.sea = Object.assign({}, CFG.sea, { portName: p.name, port: p.at, view: move(p.at, p.seaBearing, 9), lanes: [lane(-12, 'Main approach lane'), lane(28, 'Coastal lane')] });
  } else { CFG.sea = Object.assign({}, CFG.sea, { lanes: [], port: null, portName: '' }); }

  // Flight paths: straight in and straight out on the runway bearing, both directions.
  if (R.airport) {
    var a = R.airport, rb = a.runwayBearing, card = function (b) { return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((b % 360) + 360) % 360 / 45) % 8]; };
    CFG.air = Object.assign({}, CFG.air, { airport: a.at, airportName: a.name, movementsPerHour: a.movementsPerHour || (R.id === 'dubai' ? 24 : 8), routes: [
      { name: 'Approach from the ' + card(rb + 180), arrival: true, path: [move(a.at, rb + 180, 32), move(a.at, rb + 180, 14), a.at] },
      { name: 'Approach from the ' + card(rb), arrival: true, path: [move(a.at, rb, 32), move(a.at, rb, 14), a.at] },
      { name: 'Departure to the ' + card(rb), arrival: false, path: [a.at, move(a.at, rb, 14), move(a.at, rb, 32)] },
      { name: 'Departure to the ' + card(rb + 180), arrival: false, path: [a.at, move(a.at, rb + 180, 14), move(a.at, rb + 180, 32)] }] });
  } else { CFG.air = Object.assign({}, CFG.air, { routes: [], airport: null }); }

  // Figures that are specific to Abu Dhabi are switched off for other regions.
  if (CFG.analytics) { CFG.analytics.population = null; }
  if (CFG.devices) { CFG.devices.cameras = []; }
  if (CFG.zones) { CFG.zones.custom = []; }
  if (CFG.environment) { CFG.environment.sensors = []; }
})();
