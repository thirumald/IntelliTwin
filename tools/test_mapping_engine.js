/* Tests for js/mapping-engine.js. Run from the repository root:  node tools/test_mapping_engine.js */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
var M = require(path.join(__dirname, '..', 'js', 'mapping-engine.js'));
var box = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8'), box);
var IG = box.window.INTELLITWIN_CONFIG.integrations, passed = 0;
function entity(name) { return IG.entities.filter(function (e) { return e.name === name; })[0]; }
function seed(id) { return IG.seed.filter(function (s) { return s.id === id; })[0]; }
function t(name, fn) { fn(); passed++; console.log('ok  ' + name); }

t('paths: get and set, nested and indexed', function () {
  var o = {}; M.set(o, 'a.b[0].c', 5); M.set(o, 'x', 1);
  assert.strictEqual(M.get(o, 'a.b[0].c'), 5); assert.strictEqual(M.get(o, 'a.z.q'), undefined); assert.deepStrictEqual(o.a.b, [{ c: 5 }]);
});
t('JSON discovery finds the record list and nested fields', function () {
  var s = seed('anpr-vendor'), p = M.parsePayload(s.sample, 'json'), f = M.discover(p.records, p.infer);
  assert.strictEqual(p.recordPath, 'events'); assert.strictEqual(p.records.length, 6);
  var by = {}; f.forEach(function (x) { by[x.path] = x; });
  assert.strictEqual(by['location.lat'].type, 'number'); assert.strictEqual(by.plate_no.type, 'string'); assert.strictEqual(by.capture_time.type, 'datetime'); assert.strictEqual(by.lane.type, 'integer');
});
t('CSV discovery: delimiter, quotes and inferred types', function () {
  var rows = M.parseCSV('a;b;c\n1;"x;y";2.5\n2;"he said ""hi""";3\n');
  assert.deepStrictEqual(rows[0], { a: '1', b: 'x;y', c: '2.5' }); assert.strictEqual(rows[1].b, 'he said "hi"');
  var f = M.discover(rows, true); assert.deepStrictEqual(f.map(function (x) { return x.type; }), ['integer', 'string', 'number']);
  assert.strictEqual(M.sniff('a,b\n1,2'), 'csv'); assert.strictEqual(M.sniff(' [1]'), 'json'); assert.strictEqual(M.sniff('<a/>'), 'xml');
});
t('dates: patterns, epochs, time zones, bad dates', function () {
  assert.strictEqual(M.parseDate('17/11/2026 06:10:22', 'dd/MM/yyyy HH:mm:ss', '+04:00').toISOString(), '2026-11-17T02:10:22.000Z');
  assert.strictEqual(M.parseDate(1794881400, 'epoch-s').toISOString(), '2026-11-17T02:10:00.000Z');
  assert.strictEqual(M.parseDate('1794881400000', 'auto').toISOString(), '2026-11-17T02:10:00.000Z');
  assert.strictEqual(M.parseDate('2026-11-17T06:10:00', 'auto', '+04:00').toISOString(), '2026-11-17T02:10:00.000Z');
  assert.strictEqual(M.parseDate('2026-11-17T06:10:00Z', 'auto', '+04:00').toISOString(), '2026-11-17T06:10:00.000Z');
  assert.throws(function () { M.parseDate('31/02/2026 10:00:00', 'dd/MM/yyyy HH:mm:ss', '+04:00'); });
  assert.throws(function () { M.parseDate('yesterday', 'auto'); });
});
t('expressions: arithmetic, conditions, functions, paths; no code execution', function () {
  var r = { speed: 120, plate: 'ad 1', loc: { lat: 24.5 }, a: null };
  assert.strictEqual(M.compile('value > 100 ? 100 : round(value, 1)')(r, 120), 100);
  assert.strictEqual(M.compile("upper(plate) + '-' + loc.lat")(r), 'AD 1-24.5');
  assert.strictEqual(M.compile('coalesce(a, speed * 2 + 1)')(r), 241);
  assert.strictEqual(M.compile('speed >= 100 && !contains(plate, "x") ? "fast" : "ok"')(r), 'fast');
  assert.strictEqual(M.compile('-(2 + 3) * 2 % 4')(r), -2);
  assert.throws(function () { M.compile('alert(1)'); }, /Unknown function/);
  assert.throws(function () { M.compile('constructor.constructor("return 1")()'); });
  assert.throws(function () { M.compile('1 +'); }); assert.throws(function () { M.compile('speed ; 1'); });
});
t('transformations', function () {
  function run(id, v, args, rec) { return M.applyRule({ sourcePath: 'v', targetPath: 'o', transform: id, args: args || {}, sources: rec && rec.sources }, Object.assign({ v: v }, rec || {})); }
  assert.strictEqual(run('uppercase', ' ad 12 '), 'AD 12'); assert.strictEqual(run('toInteger', '41.6'), 42); assert.strictEqual(run('toDecimal', '88.756', { decimals: 1 }), 88.8);
  assert.strictEqual(run('scale', 96.4, { factor: 0.01, offset: 0, decimals: 3 }), 0.964); assert.strictEqual(run('toBoolean', 'Yes'), true);
  assert.strictEqual(run('lookup', 'TRUCK', { table: 'car=Car\ntruck=Heavy vehicle' }), 'Heavy vehicle'); assert.strictEqual(run('lookup', 'zzz', { table: 'car=Car', fallback: 'Unknown' }), 'Unknown');
  assert.throws(function () { run('lookup', 'zzz', { table: 'car=Car' }); }); assert.throws(function () { run('toDecimal', 'abc'); });
  assert.strictEqual(run('replace', 'A D 1', { pattern: '\\s+', withText: '' }), 'AD1'); assert.strictEqual(run('constant', undefined, { value: 'UAE' }), 'UAE');
  assert.strictEqual(run('concat', 'A', { separator: '-' }, { w: 'B', sources: ['w'] }), 'A-B');
  assert.strictEqual(run('direct', ''), undefined);
  assert.strictEqual(M.applyRule({ sourcePath: 'v', targetPath: 'o', transform: 'direct', defaultValue: 'n/a' }, {}), 'n/a');
});
t('the ANPR example: five rules, then suggestions complete the mapping', function () {
  var s = seed('anpr-vendor'), e = entity('VehicleDetection'), p = M.parsePayload(s.sample, 'json'), schema = M.discover(p.records, p.infer);
  assert.deepStrictEqual(M.checkMapping(s.rules, schema, e), []);
  var out = M.apply(s.rules, p.records[0]);
  assert.deepStrictEqual(out.out, { plateNumber: 'AD 12345', timestamp: '2026-11-17T02:10:22.000Z', cameraId: 'CAM-0012', confidence: 96.4, vehicleClass: 'Car' });
  var res = M.test(s.rules, p.records, e);
  assert.strictEqual(res.records, 6); assert.strictEqual(res.valid, 4); assert.strictEqual(res.byCode.TRANSFORM, 1); assert.strictEqual(res.byCode.DUPLICATE, 1);
  var sug = M.suggest(schema, e, s.rules, p.records), by = {}; sug.forEach(function (x) { by[x.targetPath] = x.sourcePath; });
  assert.strictEqual(by.latitude, 'location.lat'); assert.strictEqual(by.longitude, 'location.lon'); assert.strictEqual(by.speedKmh, 'speed'); assert.strictEqual(by.lane, 'lane');
  var all = M.suggest(schema, e, [], p.records), m = {}; all.forEach(function (x) { m[x.targetPath] = x; });
  assert.strictEqual(m.plateNumber.sourcePath, 'plate_no'); assert.strictEqual(m.plateNumber.transform, 'uppercase');
  assert.strictEqual(m.timestamp.sourcePath, 'capture_time'); assert.strictEqual(m.timestamp.transform, 'dateFormat');
  assert.strictEqual(m.cameraId.sourcePath, 'device_code'); assert.strictEqual(m.confidence.sourcePath, 'confidence_score');
  assert.strictEqual(m.vehicleClass.sourcePath, 'vehicle_type'); assert.strictEqual(m.vehicleClass.transform, 'lookup');
});
t('the published examples pass their own tests', function () {
  ['roadside-detectors', 'control-room-incidents'].forEach(function (id) {
    var s = seed(id), e = entity(s.entity), p = M.parsePayload(s.sample, s.format), schema = M.discover(p.records, p.infer);
    assert.deepStrictEqual(M.checkMapping(s.rules, schema, e), [], id); var res = M.test(s.rules, p.records, e);
    assert.ok(res.ok, id + ': ' + JSON.stringify(res.rows.filter(function (r) { return r.errors.length; }).map(function (r) { return r.errors; })));
  });
  var inc = seed('control-room-incidents'), p = M.parsePayload(inc.sample, 'csv');
  assert.deepStrictEqual(M.apply(inc.rules, p.records[0]).out, { incidentId: 'INC-2026-118204', timestamp: '2026-11-17T01:42:00.000Z', type: 'Accident', severity: 'Critical', latitude: 24.4667, longitude: 54.3667, description: 'Two vehicles, lane 2 blocked', status: 'Open' });
});
t('validation: required, type, range, pattern, enum', function () {
  var e = entity('VehicleDetection');
  var codes = M.validate({ plateNumber: 'ad 1', timestamp: 'today', confidence: 140, vehicleClass: 'Tank', lane: 2.5 }, e, []).map(function (x) { return x.field + ':' + x.code; }).sort();
  assert.deepStrictEqual(codes, ['cameraId:REQUIRED', 'confidence:RANGE', 'lane:TYPE', 'plateNumber:PATTERN', 'timestamp:TYPE', 'vehicleClass:ENUM']);
});
t('design check: unmapped required field, unknown source, double target', function () {
  var e = entity('TrafficReading'), schema = [{ path: 'det', type: 'string' }];
  var msg = M.checkMapping([{ sourcePath: 'det', targetPath: 'detectorId', transform: 'direct' }, { sourcePath: 'gone', targetPath: 'detectorId', transform: 'direct' }], schema, e).map(function (i) { return i.message; }).join(' | ');
  assert.ok(/timestamp is not mapped/.test(msg)); assert.ok(/Source field gone/.test(msg)); assert.ok(/more than one rule/.test(msg));
});
t('schema change detection: added, removed, renamed, type change', function () {
  var before = [{ path: 'plate_no', type: 'string', sample: 'A' }, { path: 'speed', type: 'integer', sample: 60 }, { path: 'lane', type: 'integer', sample: 1 }, { path: 'old', type: 'string', sample: 'q' }];
  var after = [{ path: 'plate_number', type: 'string', sample: 'A' }, { path: 'speed', type: 'string', sample: '60' }, { path: 'lane', type: 'integer', sample: 1 }, { path: 'colour', type: 'string', sample: 'red' }];
  var d = M.drift(before, after);
  assert.deepStrictEqual(d.renamed, [{ from: 'plate_no', to: 'plate_number' }]); assert.deepStrictEqual(d.changed, [{ path: 'speed', from: 'integer', to: 'string' }]);
  assert.deepStrictEqual(d.added.map(function (f) { return f.path; }), ['colour']); assert.deepStrictEqual(d.removed.map(function (f) { return f.path; }), ['old']);
  assert.strictEqual(M.drift(before, before).any, false);
  assert.strictEqual(M.brokenRules([{ sourcePath: 'plate_no', targetPath: 'p' }, { sourcePath: 'lane', targetPath: 'l' }], after).length, 1);
});
t('contract export matches MappingRuleInput', function () {
  var c = M.toContract(seed('anpr-vendor').rules);
  assert.deepStrictEqual(Object.keys(c[0]), ['sourcePath', 'targetPath', 'transform', 'required']); assert.strictEqual(c[1].transformArgs.format, 'dd/MM/yyyy HH:mm:ss');
});
console.log('\n' + passed + ' tests passed');
