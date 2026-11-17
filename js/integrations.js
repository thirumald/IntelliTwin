/* IntelliTwin Integration Studio: onboard a data source, discover its fields, map them to the platform's
 * data model, test the transformations and publish a versioned mapping. No code is written by the user.
 *
 * The screens are generated from metadata in config.js (integrations.connectors and integrations.entities),
 * not coded per integration type. Mapping, testing, suggestions and schema-change detection are real and run
 * in the browser (js/mapping-engine.js). There is no server: connections are checked for completeness only,
 * everything is kept in this browser, and the Monitor figures are SYNTHETIC. See docs/integration-studio.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, K = T.kit, esc = K.esc, M = window.IntelliTwinMapping;
  var IG = CFG.integrations, page = $('integPage'), body = $('igBody');
  if (!IG || !M || !page || !body) { return; }
  var KEY = 'intellitwin.integrations.v2', ST = IG.storage || {}, isOpen = false, timer = 0, cache = {};
  var ui = { tab: 'list', openId: null, step: 0, sel: -1, pick: null, rec: 0, sug: null, msg: null, adding: false, entity: IG.entities[0].name, cat: '', kind: '', uc: -1, ddl: '' };
  var STEPS = ['Device and type', 'Connect and discover', 'Target entity', 'Field mapping', 'Test and validate', 'Publish and monitor'];
  var MODE = { polling: 'Polling', streaming: 'Streaming', file: 'File' };

  /* ---------- state (kept in this browser) ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function normRule(r) { return { sourcePath: r.sourcePath || '', sources: r.sources || [], targetPath: r.targetPath || '', transform: r.transform || 'direct', args: Object.assign(M.defaultArgs(r.transform || 'direct'), r.args || {}), required: !!r.required, defaultValue: r.defaultValue === undefined ? '' : r.defaultValue }; }
  function fromSeed(s, i) {
    var it = { id: s.id, name: s.name, device: s.device || '', connector: s.connector, config: clone(s.config || {}), auth: clone(s.auth || { type: 'None', ref: '' }), every: s.every || '1 minute', format: s.format || 'json', sample: s.sample || '',
      recordPath: '', schema: [], entity: s.entity, rules: (s.rules || []).map(normRule), status: 'draft', versions: [], active: 0, paused: false, drift: null, test: null, ratePerSec: s.ratePerSec || 20, platformFeed: s.platformFeed || '', connOk: s.status === 'published' };
    try { var p = M.parsePayload(it.sample, it.format); it.schema = M.discover(p.records, p.infer); it.recordPath = p.recordPath; } catch (e) { /* the example is shown without a schema */ }
    if (s.status === 'published') {
      it.status = 'published'; it.active = 1;
      it.versions = [{ v: 1, time: new Date(Date.UTC(2026, 9, 5 + i * 4, 5, 20)).toISOString(), user: 'Administrator', note: 'First release', entity: it.entity, entityVersion: 1, rules: clone(it.rules), schema: clone(it.schema), every: it.every }];
    }
    return it;
  }
  function fresh() { return { list: (IG.seed || []).map(fromSeed), custom: {}, store: {}, templates: clone(IG.templates || []) }; }
  var S; try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e0) { S = null; }
  if (!S || !Array.isArray(S.list)) { S = fresh(); }
  S.store = S.store || {};
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: the session still works */ } }
  function can() { return !T.ops || T.ops.can('integrations'); }
  function who() { var u = T.ops && T.ops.user ? T.ops.user() : null; return u ? (u.name || (CFG.auth.roles[u.role] || {}).label || 'User') : 'User'; }
  function audit(text) { if (T.audit) { T.audit(text); } }
  function cur() { return S.list.filter(function (x) { return x.id === ui.openId; })[0] || null; }
  function device(id) { return (IG.devices || []).filter(function (d) { return d.id === id; })[0] || null; }
  function connector(id) { return IG.connectors.filter(function (c) { return c.id === id; })[0] || IG.connectors[0]; }
  // The entity with any custom fields added in the schema registry, and its version.
  function entity(name) {
    var base = IG.entities.filter(function (e) { return e.name === name; })[0] || IG.entities[0], cu = S.custom[base.name] || { fields: [], history: [] };
    return { name: base.name, label: base.label, note: base.note, key: base.key, version: 1 + cu.history.length, history: cu.history,
      fields: base.fields.concat(cu.fields.map(function (f) { return Object.assign({ custom: true }, f); })) };
  }
  function records(it) {
    var k = it.id + '|' + it.format + '|' + it.recordPath + '|' + K.hashStr(it.sample || '');
    if (!cache[k]) { try { cache[k] = M.parsePayload(it.sample, it.format, it.recordPath).records; } catch (e) { cache[k] = []; } }
    return cache[k];
  }
  function sig(it, rules) { return K.hashStr(JSON.stringify([rules || it.rules, it.entity, entity(it.entity).version, it.sample, it.recordPath])); }
  function liveVersion(it) { return it.versions.filter(function (v) { return v.v === it.active; })[0] || null; }
  function dirty(it) { var v = liveVersion(it); return !!v && JSON.stringify(v.rules) !== JSON.stringify(it.rules); }
  function leaves(it) { return it.schema.filter(function (f) { return f.type !== 'array' && f.type !== 'object'; }); }
  function mappedCount(it) { var e = entity(it.entity), m = {}; it.rules.forEach(function (r) { m[r.targetPath] = 1; }); return e.fields.filter(function (f) { return m[f.name]; }).length; }
  function done(it, step) {
    var e = entity(it.entity);
    return step === 0 ? !!it.connector : step === 1 ? it.schema.length > 0 : step === 2 ? !!it.entity : step === 3 ? it.rules.length > 0 && !M.checkMapping(it.rules, it.schema, e).length :
      step === 4 ? !!(it.test && it.test.ok && it.test.sig === sig(it)) : it.status === 'published' && !dirty(it);
  }
  /* ---------- time-series storage and analytics (design only: no database or model runs here) ---------- */
  function snake(n) { return String(n).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(); }
  function col(n) { return n === 'timestamp' ? 'time' : snake(n); }
  function days(t) { var m = /^(\d+)\s*(minute|hour|day|year)/.exec(t || ''); return m ? Number(m[1]) * { minute: 1 / 1440, hour: 1 / 24, day: 1, year: 365 }[m[2]] : 0; }
  // How an entity is kept: tags identify the series, measures are the values, the rest are attributes.
  function storeOf(name) {
    var e = entity(name), o = (ST.entity || {})[e.name] || {}, u = S.store[e.name] || {}, rest = e.fields.filter(function (f) { return f.name !== 'timestamp'; });
    // Tags: allowed-value fields and device-style identifiers. Personal data and one-per-record identifiers (tag: false) are attributes, to keep the number of series small.
    var tags = rest.filter(function (f) { return f.type === 'string' && f.tag !== false && !f.pii && (f.tag === true || ((f['enum'] || /Id$/.test(f.name)) && !(e.key.length === 1 && e.key[0] === f.name))); });
    var measures = rest.filter(function (f) { return tags.indexOf(f) < 0 && f.type !== 'string' && f.type !== 'datetime'; });
    return { entity: e, table: snake(e.name), tags: tags, measures: measures, attrs: rest.filter(function (f) { return tags.indexOf(f) < 0 && measures.indexOf(f) < 0; }),
      retention: u.retention || o.retention || ST.retention || '90 days', rollups: u.rollups || o.rollups || ST.rollups || [] };
  }
  function sources(name) { return S.list.filter(function (it) { return it.status === 'published' && !it.paused && it.entity === name; }); }
  function rowsPerDay(name) { return sources(name).reduce(function (s, it) { return s + (it.ratePerSec || 0) * 86400; }, 0); }
  function gbPerMonth(name) { return rowsPerDay(name) * (24 + 10 * entity(name).fields.length) * 30 / (ST.compression || 10) / 1e9; }
  var SQLTYPE = { string: 'TEXT', integer: 'INTEGER', number: 'DOUBLE PRECISION', 'boolean': 'BOOLEAN', datetime: 'TIMESTAMPTZ' };
  function aggs(fields) {
    return fields.map(function (f) { var c = col(f.name); return f.type === 'boolean' ? 'avg(' + c + '::int) AS ' + c + '_share' : f.type === 'string' || f.type === 'datetime' ? 'count(DISTINCT ' + c + ') AS ' + c + '_distinct' : 'avg(' + c + ') AS ' + c + '_avg, max(' + c + ') AS ' + c + '_max'; });
  }
  function ddl(name) {
    var st = storeOf(name), e = st.entity, t = st.table, by = st.tags.slice(0, 2).map(function (f) { return col(f.name); }), keep = days(st.retention), comp = days(ST.compressAfter || '7 days') < keep ? ST.compressAfter || '7 days' : '1 day';
    var out = ['-- ' + e.label + ': time-series table. Written for ' + (ST.engine || 'TimescaleDB') + '; review before use.', 'CREATE TABLE ' + t + ' (', '  time TIMESTAMPTZ NOT NULL,'];
    e.fields.forEach(function (f) { if (f.name !== 'timestamp') { out.push('  ' + col(f.name) + ' ' + (SQLTYPE[f.type] || 'TEXT') + (f.required ? ' NOT NULL' : '') + ',' + (f.pii ? '  -- personal data' : '')); } });
    out.push('  integration_id TEXT NOT NULL,', '  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()', ');', "SELECT create_hypertable('" + t + "', 'time');");
    if (by.length) { out.push('CREATE INDEX ON ' + t + ' (' + by[0] + ', time DESC);', 'ALTER TABLE ' + t + " SET (timescaledb.compress, timescaledb.compress_segmentby = '" + by[0] + "');"); } else { out.push('ALTER TABLE ' + t + ' SET (timescaledb.compress);'); }
    out.push("SELECT add_compression_policy('" + t + "', INTERVAL '" + comp + "');", "SELECT add_retention_policy('" + t + "', INTERVAL '" + st.retention + "');");
    st.rollups.forEach(function (r) {
      out.push('', '-- Rollup every ' + r + ': kept after the raw records expire, for reports and model features', 'CREATE MATERIALIZED VIEW ' + t + '_' + r.replace(/\s+/g, '').replace(/s$/, '') + ' WITH (timescaledb.continuous) AS',
        "SELECT time_bucket(INTERVAL '" + r + "', time) AS bucket" + by.map(function (b) { return ', ' + b; }).join('') + ', count(*) AS records' + aggs(st.measures.slice(0, 6)).map(function (a) { return ',\n       ' + a; }).join(''),
        'FROM ' + t + ' GROUP BY bucket' + by.map(function (b) { return ', ' + b; }).join('') + ';');
    });
    return out.join('\n');
  }
  // Which published mappings supply the fields a report or model needs.
  function cover(n) {
    var src = sources(n.entity), have = {}; src.forEach(function (it) { var v = liveVersion(it); (v ? v.rules : []).forEach(function (r) { have[r.targetPath] = 1; }); });
    var missing = src.length ? n.fields.filter(function (f) { return !have[f]; }) : n.fields.slice();
    return { need: n, src: src, missing: missing, ok: src.length > 0 && !missing.length };
  }
  function readiness(u) {
    var c = u.needs.map(cover), req = c.filter(function (x) { return !x.need.optional; });
    return { cover: c, state: req.every(function (x) { return x.ok; }) ? 'ready' : c.some(function (x) { return x.src.length; }) ? 'partial' : 'none' };
  }
  var READY = { ready: ['Data ready', 'st-live'], partial: ['Partly covered', 'st-warn'], none: ['No data source', ''] };
  function featureQuery(u) {
    var grain = /^\d+ (minute|hour|day)/.test(u.grain) ? u.grain : '15 minutes';
    return '-- ' + u.name + ': features every ' + grain + '. Example for ' + (ST.engine || 'TimescaleDB') + '; review before use.\n' + u.needs.map(function (n) {
      var st = storeOf(n.entity), fs = n.fields.map(function (f) { return st.entity.fields.filter(function (x) { return x.name === f; })[0]; }).filter(Boolean);
      var by = fs.filter(function (f) { return st.tags.indexOf(f) >= 0; }).map(function (f) { return col(f.name); }), vals = fs.filter(function (f) { return st.tags.indexOf(f) < 0; });
      return '-- ' + st.entity.label + (n.optional ? ' (optional)' : '') + '\nSELECT time_bucket(INTERVAL \'' + grain + '\', time) AS bucket' + by.map(function (b) { return ', ' + b; }).join('') + ', count(*) AS records' + aggs(vals).map(function (a) { return ',\n       ' + a; }).join('') +
        '\nFROM ' + st.table + "\nWHERE time > now() - INTERVAL '28 days'\nGROUP BY bucket" + by.map(function (b) { return ', ' + b; }).join('') + '\nORDER BY bucket;';
    }).join('\n\n');
  }
  function copyText(text, label) {
    var ok = function () { say(label + ' copied.'); render(); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, function () { say('Copying was blocked by the browser. Select the text and copy it by hand.', 'warn'); render(); }); } else { say('Copying is not available here. Select the text and copy it by hand.', 'warn'); }
  }
  // Presets from the chosen device type: usual connector, target entity and, if there is no sample yet, an example payload.
  function setDevice(it, id) {
    var d = device(id); it.device = d ? d.id : ''; if (!d) { return; }
    var did = [];
    if (d.connectors.indexOf(it.connector) < 0) { it.connector = d.connectors[0]; it.connOk = false; did.push('connector ' + connector(it.connector).name); }
    if (!it.rules.length && it.entity !== d.entity) { it.entity = d.entity; did.push('target ' + entity(d.entity).label); }
    if (!String(it.sample || '').trim()) { loadSample(it, d); did.push('an example payload with ' + it.schema.length + ' fields'); }
    say(d.name + (did.length ? ': set ' + did.join(', ') + '. Change any of them in the next steps.' : ' selected.'));
  }
  function loadSample(it, d) {
    var text = d.sample; if (d.format === 'json') { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* shown as it is */ } }
    it.sample = text; it.format = d.format; it.recordPath = ''; it.schema = []; it.drift = null; cache = {};
    try { var p = M.parsePayload(it.sample, it.format); it.schema = M.discover(p.records, p.infer); it.recordPath = p.recordPath; } catch (e2) { /* discovered by hand in the next step */ }
  }
  function deviceOptions(value) {
    var cats = []; (IG.devices || []).forEach(function (d) { if (cats.indexOf(d.cat) < 0) { cats.push(d.cat); } });
    return '<option value="">Choose a device type…</option>' + cats.map(function (c) { return '<optgroup label="' + esc(c) + '">' + IG.devices.filter(function (d) { return d.cat === c; }).map(function (d) { return '<option value="' + d.id + '"' + (d.id === value ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</optgroup>'; }).join('');
  }
  function say(text, kind) { ui.msg = { text: text, kind: kind || 'ok' }; }

  /* ---------- small builders ---------- */
  function chip(text, cls) { return '<span class="ig-chip ' + (cls || '') + '">' + esc(text) + '</span>'; }
  function status(it) { return it.status !== 'published' ? chip('Draft', 'st-draft') : it.paused ? chip('Paused', 'st-warn') : dirty(it) ? chip('Published v' + it.active, 'st-live') + chip('Unpublished changes', 'st-warn') : chip('Published v' + it.active, 'st-live'); }
  function opts(list, value, blank) { return (blank !== undefined ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (o) { var v = typeof o === 'string' ? o : o[0], l = typeof o === 'string' ? o : o[1]; return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join(''); }
  function field(label, inner, hint) { return '<label class="field"><span>' + esc(label) + '</span>' + inner + (hint ? '<small class="muted">' + esc(hint) + '</small>' : '') + '</label>'; }
  function show(v) { return v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v); }
  function short(v, n) { var s = show(v); return s.length > (n || 28) ? s.slice(0, (n || 28) - 1) + '…' : s; }
  function pathHtml(p) { var k = p.lastIndexOf('.'); return k < 0 ? esc(p) : '<i>' + esc(p.slice(0, k + 1)) + '</i>' + esc(p.slice(k + 1)); }
  function when(iso) { return new Date(iso).toLocaleString('en-GB', { timeZone: (CFG.time || {}).timeZone || 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); }
  function tile(label, value, sub) { return '<div class="kpi"><span class="k-label">' + esc(label) + '</span><span class="k-value">' + value + '</span>' + (sub ? '<span class="muted">' + esc(sub) + '</span>' : '') + '</div>'; }

  /* ---------- view: all integrations ---------- */
  function viewList() {
    var cats = []; (IG.devices || []).forEach(function (d) { if (cats.indexOf(d.cat) < 0) { cats.push(d.cat); } });
    var shown = S.list.filter(function (x) { return !ui.cat || (device(x.device) || {}).cat === ui.cat; });
    var pub = S.list.filter(function (x) { return x.status === 'published'; }).length, rules = S.list.reduce(function (s, x) { return s + x.rules.length; }, 0);
    var h = '<p class="notice"><strong>Prototype studio.</strong> Schema discovery, mapping, transformations, tests and versions are real and run in this browser. Nothing connects to a source system or a server: connection settings are checked for completeness only, and everything is kept in this browser.</p>' +
      '<div class="ig-kpis">' + tile('Integrations', S.list.length, pub + ' published, ' + (S.list.length - pub) + ' draft') + tile('Device types', (IG.devices || []).length, 'cameras, radar, LiDAR, IoT, field equipment') + tile('Connectors', IG.connectors.length) + tile('Mapping rules', rules) + '</div>' + (ui.msg ? '<p class="ig-msg ' + ui.msg.kind + '" role="status">' + esc(ui.msg.text) + '</p>' : '') +
      '<div class="ig-bar"><h3>Integrations</h3><label class="pick">Show <select data-ui="cat">' + opts(cats, ui.cat, 'All device types') + '</select></label><span><button type="button" class="btn small" data-act="reset" data-edit>Restore examples</button> <button type="button" class="btn ig-primary" data-act="new" data-edit>New integration</button></span></div>';
    if (ui.adding) {
      h += '<div class="card ig-new"><div class="card-head"><h2>New integration</h2></div><div class="ig-form">' + field('Name', '<input type="text" id="igNewName" maxlength="60" placeholder="For example: Speed camera vendor">') +
        field('Device type', '<select id="igNewDev">' + deviceOptions('') + '</select>') + field('Start from a template (optional)', '<select id="igNewTpl">' + opts(S.templates.map(function (t, i) { return [String(i), t.name + ' → ' + entity(t.entity).label]; }), '', 'No template') + '</select>') +
        '</div><div class="ig-actions"><button type="button" class="btn ig-primary" data-act="create">Create</button><button type="button" class="btn" data-act="cancelnew">Cancel</button></div></div>';
    }
    h += '<div class="ig-cards">' + shown.map(function (it) {
      var e = entity(it.entity), c = connector(it.connector), d = device(it.device), broken = M.brokenRules(it.rules, it.schema).length;
      return '<button type="button" class="ig-card" data-act="open" data-id="' + esc(it.id) + '"><span class="ig-card-top"><strong>' + esc(it.name) + ' → ' + esc(e.label) + '</strong><span>' + status(it) + '</span></span>' +
        '<span class="muted">' + (d ? esc(d.name) + ' · ' : '') + esc(c.name) + ' · ' + MODE[c.mode] + ' · ' + esc((it.format || '').toUpperCase()) + '</span>' +
        '<span class="ig-card-nums"><b>' + it.schema.length + '</b> source fields<b>' + it.rules.length + '</b> mapping rules<b>' + mappedCount(it) + ' of ' + e.fields.length + '</b> target fields mapped</span>' +
        (broken ? '<span class="ig-warn">Source schema changed: ' + broken + (broken === 1 ? ' rule needs' : ' rules need') + ' attention</span>' : '') + '</button>';
    }).join('') + '</div>';
    if (!shown.length) { h += '<p class="muted">' + (S.list.length ? 'No integrations for this device type yet.' : 'No integrations yet.') + ' Choose “New integration” to onboard a data source.</p>'; }
    h += '<div class="ig-bar"><h3>Templates</h3><span class="muted">Reusable mappings for vendors with similar payloads</span></div><table class="facts ig-table">' + (S.templates.length ? S.templates.map(function (t, i) {
      return '<tr><td>' + esc(t.name) + '<span class="sub">' + esc(entity(t.entity).label) + ' · ' + t.rules.length + ' rules</span></td><td><button type="button" class="btn small" data-act="deltpl" data-i="' + i + '" data-edit>Remove</button></td></tr>';
    }).join('') : '<tr><td class="muted">No templates. Save one from the Publish step of an integration.</td><td></td></tr>') + '</table>';
    return h;
  }

  /* ---------- view: one integration (six steps) ---------- */
  function viewStudio(it) {
    var e = entity(it.entity);
    var h = '<div class="ig-head2"><button type="button" class="btn small" data-act="back">← All integrations</button><input class="ig-name" type="text" data-bind="name" maxlength="60" aria-label="Integration name" value="' + esc(it.name) + '"><span class="ig-arrow">→ ' + esc(e.label) + '</span><span>' + status(it) + '</span></div>' +
      '<ol class="ig-steps">' + STEPS.map(function (s, i) { return '<li><button type="button" data-act="step" data-i="' + i + '" class="' + (i === ui.step ? 'on ' : '') + (done(it, i) ? 'done' : '') + '"' + (i === ui.step ? ' aria-current="step"' : '') + '><b>' + (done(it, i) ? '✓' : i + 1) + '</b><span>' + s + '</span></button></li>'; }).join('') + '</ol>';
    if (ui.msg) { h += '<p class="ig-msg ' + ui.msg.kind + '" role="status">' + esc(ui.msg.text) + '</p>'; }
    if (!can()) { h += '<p class="notice">Your role can view integrations but not change them. Sign in as an administrator to edit, test and publish.</p>'; }
    h += '<div class="ig-step">' + [stepType, stepConnect, stepEntity, stepMap, stepTest, stepPublish][ui.step](it, e) + '</div>' +
      '<div class="ig-nav">' + (ui.step > 0 ? '<button type="button" class="btn" data-act="step" data-i="' + (ui.step - 1) + '">← ' + STEPS[ui.step - 1] + '</button>' : '<span></span>') +
      (ui.step < 5 ? '<button type="button" class="btn ig-primary" data-act="step" data-i="' + (ui.step + 1) + '">' + STEPS[ui.step + 1] + ' →</button>' : '') + '</div>';
    return h;
  }
  function stepType(it) {
    var d = device(it.device), usual = d ? d.connectors : [], list = IG.connectors.slice().sort(function (a, b) { return (usual.indexOf(a.id) < 0 ? 99 : usual.indexOf(a.id)) - (usual.indexOf(b.id) < 0 ? 99 : usual.indexOf(b.id)); });
    return '<h3>1. Device and integration type</h3><div class="card"><div class="ig-form">' + field('What is being connected', '<select data-bind="device">' + deviceOptions(it.device) + '</select>', d ? 'Usually delivered by ' + usual.map(function (c) { return connector(c).name; }).join(', ') + '. Writes to ' + entity(d.entity).label + '.' : 'Cameras, radar, LiDAR, traffic equipment, IoT sensors, vehicles, device health and control systems. The list comes from integrations.devices in config.js.') + '</div></div>' +
      '<p class="muted">How the source delivers its data. The list comes from <code>integrations.connectors</code> in config.js.</p><div class="ig-tiles">' + list.map(function (c) {
      return '<button type="button" class="ig-tile' + (c.id === it.connector ? ' on' : '') + '" data-act="connector" data-id="' + c.id + '" data-edit aria-pressed="' + (c.id === it.connector) + '"><strong>' + esc(c.name) + '</strong><span>' + chip(MODE[c.mode]) + (usual.indexOf(c.id) >= 0 ? chip('Usual for this device', 'st-live') : '') + '</span><em>' + esc(c.note) + '</em></button>';
    }).join('') + '</div>';
  }
  function stepConnect(it) {
    var c = connector(it.connector), h = '<h3>2. Connect and discover</h3><div class="ig-two"><div class="card"><div class="card-head"><h2>Connection: ' + esc(c.name) + '</h2><span class="muted">' + MODE[c.mode] + '</span></div><div class="ig-form">';
    c.fields.forEach(function (f) {
      var v = it.config[f.key] === undefined ? '' : it.config[f.key], a = ' data-cfg="' + f.key + '"';
      h += field(f.label + (f.required ? ' *' : ''), f.type === 'select' ? '<select' + a + '>' + opts(f.options, v || f.options[0]) + '</select>' : f.type === 'area' ? '<textarea rows="3"' + a + ' placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>' : '<input type="text"' + a + ' placeholder="' + esc(f.placeholder || '') + '" value="' + esc(v) + '">');
    });
    if (!c.fields.length) { h += '<p class="muted">Nothing to configure: the file is loaded below.</p>'; }
    if (!c.noAuth) {
      h += field('Sign-in method', '<select data-auth="type">' + opts(IG.authTypes, it.auth.type) + '</select>');
      if (it.auth.type !== 'None') { h += field('Secret reference', '<input type="text" data-auth="ref" placeholder="vault://intellitwin/vendor/secret" value="' + esc(it.auth.ref || '') + '">', 'A reference to the secret in the secret store. The secret itself is never entered or kept here.'); }
    }
    if (c.mode !== 'streaming') { h += field(c.mode === 'file' ? 'Check for new files every' : 'Poll every', '<select data-bind="every">' + opts(IG.pollEvery, it.every) + '</select>'); }
    else { h += '<p class="muted">Streaming: records are read as messages arrive.</p>'; }
    h += '</div><div class="ig-actions"><button type="button" class="btn" data-act="conn" data-edit>Check connection settings</button>' + (it.connOk ? chip('Settings complete', 'st-live') : '') + '</div></div>';
    h += '<div class="card"><div class="card-head"><h2>Sample payload</h2><span class="muted">' + (records(it).length ? records(it).length + ' records' : 'none yet') + '</span></div><div class="ig-form">' +
      '<div class="ig-row">' + field('Format', '<select data-bind="format">' + opts(c.formats.concat(c.formats.indexOf(it.format) < 0 ? [it.format] : []).map(function (f) { return [f, f.toUpperCase()]; }), it.format) + '</select>') + field('Record path', '<input type="text" data-bind="recordPath" placeholder="auto" value="' + esc(it.recordPath === '$' ? '' : it.recordPath || '') + '">') + '</div>' +
      field('Paste a response, a message or file contents', '<textarea class="ig-code" rows="9" data-bind="sample" spellcheck="false">' + esc(it.sample || '') + '</textarea>') +
      '</div><div class="ig-actions"><button type="button" class="btn ig-primary" data-act="discover" data-edit>Discover fields</button><label class="btn ig-file">Upload a file<input type="file" id="igFile" accept=".json,.csv,.xml,.txt,.tsv" data-edit></label>' + (device(it.device) ? '<button type="button" class="btn" data-act="loadsample" data-edit>Load the example for this device</button>' : '') + '</div></div></div>';
    if (it.drift) { h += driftBox(it); }
    h += '<div class="card"><div class="card-head"><h2>Discovered schema</h2><span class="muted">' + it.schema.length + ' fields' + (it.recordPath && it.recordPath !== '$' ? ' · records at ' + esc(it.recordPath) : '') + '</span></div>';
    h += it.schema.length ? '<div class="ig-scroll"><table class="ig-grid"><thead><tr><th>Field</th><th>Type</th><th>Example</th><th>In every record</th></tr></thead><tbody>' + it.schema.map(function (f) {
      return '<tr><td style="padding-left:' + (8 + 14 * (f.path.split('.').length - 1)) + 'px">' + pathHtml(f.path) + '</td><td>' + chip(f.type, 'ty') + '</td><td class="ig-mono">' + esc(short(f.sample, 40)) + '</td><td>' + (f.optional ? 'No' : 'Yes') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="muted">No fields yet. Paste or upload a sample and choose “Discover fields”.</p>';
    return h + '</div>';
  }
  function driftBox(it) {
    var d = it.drift, broken = M.brokenRules(it.rules, it.schema), li = [];
    d.renamed.forEach(function (r) { li.push('<li><b>Renamed</b> ' + esc(r.from) + ' → ' + esc(r.to) + '</li>'); });
    d.removed.forEach(function (f) { li.push('<li><b>Removed</b> ' + esc(f.path) + '</li>'); });
    d.added.forEach(function (f) { li.push('<li><b>Added</b> ' + esc(f.path) + ' (' + f.type + ')</li>'); });
    d.changed.forEach(function (c) { li.push('<li><b>Type changed</b> ' + esc(c.path) + ': ' + c.from + ' → ' + c.to + '</li>'); });
    return '<div class="ig-drift" role="alert"><strong>The source schema has changed since the last discovery.</strong><ul>' + li.join('') + '</ul>' +
      (broken.length ? '<p>' + broken.length + (broken.length === 1 ? ' mapping rule uses a field' : ' mapping rules use fields') + ' that no longer exist.</p>' : '<p>No mapping rule is affected.</p>') +
      '<div class="ig-actions">' + (d.renamed.length && broken.length ? '<button type="button" class="btn ig-primary" data-act="applyrename" data-edit>Update the rules to the new names</button>' : '') + '<button type="button" class="btn" data-act="ackdrift" data-edit>Dismiss</button></div></div>';
  }
  function fieldRules(f) {
    var r = [f.type]; if (f.min !== undefined || f.max !== undefined) { r.push((f.min !== undefined ? f.min : '…') + ' to ' + (f.max !== undefined ? f.max : '…')); }
    if (f['enum']) { r.push('one of ' + f['enum'].length); } if (f.pattern) { r.push('pattern'); } if (f.maxLength) { r.push('≤ ' + f.maxLength + ' chars'); } return r.join(' · ');
  }
  function entityTable(e, registry) {
    return '<div class="ig-scroll"><table class="ig-grid"><thead><tr><th>Field</th><th>Type and rules</th><th>Required</th><th>Notes</th>' + (registry ? '<th></th>' : '') + '</tr></thead><tbody>' + e.fields.map(function (f) {
      return '<tr><td>' + esc(f.name) + (e.key.indexOf(f.name) >= 0 ? ' ' + chip('key') : '') + (f.pii ? ' ' + chip('PII', 'st-warn') : '') + (f.custom ? ' ' + chip('custom') : '') + '</td><td>' + esc(fieldRules(f)) + (f['enum'] ? '<span class="sub">' + esc(f['enum'].join(', ')) + '</span>' : '') + '</td><td>' + (f.required ? 'Yes' : '') + '</td><td>' + esc(f.note || '') + '</td>' +
        (registry ? '<td>' + (f.custom ? '<button type="button" class="btn small" data-act="delfield" data-name="' + esc(f.name) + '" data-edit>Remove</button>' : '') + '</td>' : '') + '</tr>';
    }).join('') + '</tbody></table></div>';
  }
  function stepEntity(it, e) {
    return '<h3>3. Choose the target entity</h3><p class="muted">The platform’s own data model. Extra fields are added under “Schema registry”, with a version.</p><div class="ig-tiles">' + IG.entities.map(function (x) {
      var en = entity(x.name);
      return '<button type="button" class="ig-tile' + (x.name === it.entity ? ' on' : '') + '" data-act="entity" data-name="' + x.name + '" data-edit aria-pressed="' + (x.name === it.entity) + '"><strong>' + esc(x.label) + '</strong><span>' + chip(en.fields.length + ' fields') + chip('v' + en.version) + '</span><em>' + esc(x.note) + '</em></button>';
    }).join('') + '</div><div class="card"><div class="card-head"><h2>' + esc(e.label) + '</h2><span class="muted">' + esc(e.name) + ' · schema version ' + e.version + '</span></div>' + entityTable(e) + '</div>';
  }
  function stepMap(it, e) {
    var src = leaves(it), used = {}, tused = {}, sel = it.rules[ui.sel];
    it.rules.forEach(function (r) { [r.sourcePath].concat(r.sources).forEach(function (p) { if (p) { used[p] = 1; } }); tused[r.targetPath] = 1; });
    var need = e.fields.filter(function (f) { return f.required && !tused[f.name]; }), sug = ui.sug || [];
    if (!src.length) { return '<h3>4. Field mapping</h3><p class="ig-msg warn">No source fields yet. Go back to “Connect and discover” and discover the fields first.</p>'; }
    var h = '<h3>4. Field mapping</h3><div class="ig-bar"><span class="muted"><b>' + mappedCount(it) + ' of ' + e.fields.length + '</b> target fields mapped · ' + it.rules.length + ' rules' + (need.length ? ' · <span class="ig-warn">' + need.length + ' required not mapped</span>' : '') + '</span>' +
      '<span><button type="button" class="btn small" data-act="suggest" data-edit>Suggest mappings</button> <button type="button" class="btn small" data-act="addrule" data-edit>Add a rule without a source</button></span></div>' +
      '<p class="muted ig-hint">' + (ui.pick ? 'Now choose the target field for <b>' + esc(ui.pick) + '</b>.' : 'Choose a source field, then a target field, to connect them. On a computer you can also drag a source onto a target.') + '</p>';
    if (sug.length) {
      h += '<div class="card ig-sug"><div class="card-head"><h2>Suggested mappings</h2><span><button type="button" class="btn small ig-primary" data-act="acceptall" data-edit>Accept all ' + sug.length + '</button> <button type="button" class="btn small" data-act="nosug">Dismiss</button></span></div><p class="muted">Matched on field names, types and sample values. Nothing is applied until you accept it.</p>' + sug.map(function (s, i) {
        return '<div class="ig-sugrow"><span class="ig-mono">' + pathHtml(s.sourcePath) + '</span><span>→ ' + chip(M.transform(s.transform).label, 'tf') + ' →</span><span class="ig-mono">' + esc(s.targetPath) + '</span><span class="muted">' + Math.round(s.score * 100) + '% · ' + esc(s.reason) + '</span><button type="button" class="btn small" data-act="accept" data-i="' + i + '" data-edit>Accept</button></div>';
      }).join('') + '</div>';
    }
    h += '<div class="ig-mapper" id="igMapper"><div class="ig-col"><h4>Source fields <small>' + src.length + '</small></h4>' + src.map(function (f) {
      return '<button type="button" class="ig-f' + (used[f.path] ? ' on' : '') + (ui.pick === f.path ? ' pick' : '') + (sel && [sel.sourcePath].concat(sel.sources).indexOf(f.path) >= 0 ? ' sel' : '') + '" draggable="true" data-src="' + esc(f.path) + '" data-edit><span class="ig-fn">' + pathHtml(f.path) + '</span><span class="ig-ty">' + f.type + '</span><em>' + esc(short(f.sample, 26)) + '</em></button>';
    }).join('') + '</div><div class="ig-mid"><h4>Mapping</h4></div><div class="ig-col"><h4>Target fields <small>' + e.fields.length + '</small></h4>' + e.fields.map(function (f) {
      return '<button type="button" class="ig-f' + (tused[f.name] ? ' on' : '') + (sel && sel.targetPath === f.name ? ' sel' : '') + (f.required && !tused[f.name] ? ' need' : '') + '" data-tgt="' + esc(f.name) + '" data-edit><span class="ig-fn">' + esc(f.name) + (f.required ? '<b title="Required"> *</b>' : '') + '</span><span class="ig-ty">' + f.type + '</span><em>' + (f.pii ? 'Personal data · ' : '') + esc(f['enum'] ? 'one of ' + f['enum'].length + ' values' : f.note || (f.min !== undefined && f.max !== undefined ? f.min + ' to ' + f.max : '')) + '</em></button>';
    }).join('') + '</div><svg id="igLines" aria-hidden="true"></svg><div id="igChips"></div></div>';
    h += '<div class="ig-two"><div class="card"><div class="card-head"><h2>Mapping rules</h2><span class="muted">' + mappedCount(it) + ' / ' + e.fields.length + ' mapped</span></div>' + (it.rules.length ? '<div class="ig-rules">' + it.rules.map(function (r, i) {
      return '<button type="button" class="ig-rule' + (i === ui.sel ? ' sel' : '') + '" data-act="sel" data-i="' + i + '"><span><small>Source</small>' + (r.sourcePath ? pathHtml(r.sourcePath) + (r.sources.length ? ' <i>+' + r.sources.length + '</i>' : '') : '<i>none</i>') + '</span><span>' + chip(M.transform(r.transform).label, 'tf') + '</span><span><small>Target</small>' + (r.targetPath ? esc(r.targetPath) + (r.required ? ' *' : '') : '<i class="ig-warn">choose</i>') + '</span></button>';
    }).join('') + '</div>' : '<p class="muted">No rules yet.</p>') + '</div>';
    h += '<div class="card" id="igProps"><div class="card-head"><h2>Mapping properties</h2>' + (sel ? '<button type="button" class="btn small" data-act="delrule" data-edit>Remove rule</button>' : '') + '</div>';
    if (sel) {
      var t = M.transform(sel.transform);
      h += '<div class="ig-form">' + field('Source field', '<select data-rb="sourcePath">' + opts(src.map(function (f) { return f.path; }), sel.sourcePath, t.noSource ? 'None' : 'Choose…') + '</select>');
      if (t.multi) { h += '<div class="field"><span>Also join these fields</span><div class="ig-pills">' + src.filter(function (f) { return f.path !== sel.sourcePath; }).map(function (f) { return '<button type="button" class="ig-pill' + (sel.sources.indexOf(f.path) >= 0 ? ' on' : '') + '" data-act="togsrc" data-p="' + esc(f.path) + '" data-edit>' + esc(f.path) + '</button>'; }).join('') + '</div></div>'; }
      h += field('Transformation', '<select data-rb="transform">' + opts(M.TRANSFORMS.map(function (x) { return [x.id, x.label]; }), sel.transform) + '</select>', t.help);
      (t.args || []).forEach(function (a) {
        var v = sel.args[a.key] === undefined ? '' : sel.args[a.key];
        h += field(a.label, a.type === 'area' ? '<textarea class="ig-code" rows="' + (a.key === 'table' ? 5 : 3) + '" data-ra="' + a.key + '" spellcheck="false">' + esc(v) + '</textarea>' : '<input type="' + (a.type === 'number' ? 'number' : 'text') + '" step="any" data-ra="' + a.key + '" value="' + esc(v) + '">', a.hint);
      });
      h += field('Target field', '<select data-rb="targetPath">' + opts(e.fields.map(function (f) { return [f.name, f.name + (f.required ? ' *' : '') + ' (' + f.type + ')']; }), sel.targetPath, 'Choose…') + '</select>') +
        '<div class="ig-row"><label class="ig-check"><input type="checkbox" data-rb="required"' + (sel.required ? ' checked' : '') + '> Required: reject the record if empty</label>' + field('Default if the source is empty', '<input type="text" data-rb="defaultValue" value="' + esc(sel.defaultValue) + '">') + '</div></div><div class="ig-prev" id="igPrev">' + preview(it, sel) + '</div>';
    } else { h += '<p class="muted">Select a rule, a connection line or a mapped field to edit its transformation.</p>'; }
    return h + '</div></div>';
  }
  function preview(it, r) {
    var recs = records(it).slice(0, 3); if (!recs.length) { return '<span class="muted">No sample records to preview.</span>'; }
    return '<small>Preview on the sample</small>' + recs.map(function (rec) {
      var src = r.sourcePath ? show(M.get(rec, r.sourcePath)) : '—', out, bad = false;
      try { out = show(M.applyRule(r, rec)); } catch (e) { out = e.message; bad = true; }
      return '<div class="ig-prevrow"><code>' + esc(short(src, 34)) + '</code><span>→</span><code class="' + (bad ? 'bad' : 'good') + '">' + esc(short(out, 60)) + '</code></div>';
    }).join('');
  }
  function runTest(it, e, stamp) {
    var res = M.test(it.rules, records(it), e), issues = M.checkMapping(it.rules, it.schema, e), s = sig(it);
    if (stamp || !it.test || it.test.sig !== s) { it.test = { time: new Date().toISOString(), ok: res.ok && !issues.length, records: res.records, valid: res.valid, sig: s }; save(); }
    return { res: res, issues: issues };
  }
  function stepTest(it, e) {
    var r = runTest(it, e), res = r.res, h = '<h3>5. Test and validate</h3>';
    if (r.issues.length) { h += '<div class="ig-drift"><strong>The mapping is not complete.</strong><ul>' + r.issues.map(function (i) { return '<li>' + esc(i.message) + '</li>'; }).join('') + '</ul></div>'; }
    if (!res.records) { return h + '<p class="ig-msg warn">No sample records. Add a sample in “Connect and discover”.</p>'; }
    ui.rec = Math.max(0, Math.min(ui.rec, res.records - 1));
    var row = res.rows[ui.rec], codes = Object.keys(res.byCode), NAME = { TRANSFORM: 'Transformation failed', REQUIRED: 'Required field empty', TYPE: 'Wrong type', RANGE: 'Out of range', PATTERN: 'Pattern not matched', ENUM: 'Value not allowed', LENGTH: 'Too long', DUPLICATE: 'Duplicate record' };
    h += '<div class="ig-kpis">' + tile('Sample records', res.records) + tile('Valid', res.valid, Math.round(res.valid / res.records * 100) + '%') + tile('With errors', res.invalid) + tile('Duplicates', res.byCode.DUPLICATE || 0, 'by ' + e.key.join(' + ')) + '</div>' +
      '<p class="ig-msg ' + (it.test.ok ? 'ok' : 'warn') + '">' + (it.test.ok ? 'All ' + res.records + ' sample records pass. The mapping can be published.' : res.invalid + ' of ' + res.records + ' sample records have errors' + (codes.length ? ': ' + codes.map(function (c) { return (NAME[c] || c).toLowerCase() + ' (' + res.byCode[c] + ')'; }).join(', ') : '') + '. Fix the mapping or the sample before publishing.') + ' <span class="muted">Tested ' + when(it.test.time) + '.</span></p>' +
      '<div class="ig-bar"><span class="ig-recnav"><button type="button" class="btn small" data-act="rec" data-d="-1" aria-label="Previous record">◀</button><b>Record ' + (ui.rec + 1) + ' of ' + res.records + '</b><button type="button" class="btn small" data-act="rec" data-d="1" aria-label="Next record">▶</button> ' + (row.errors.length ? chip(row.errors.length + (row.errors.length === 1 ? ' error' : ' errors'), 'st-bad') : chip('Valid', 'st-live')) + '</span>' +
      '<span><button type="button" class="btn small" data-act="retest" data-edit>Run the test again</button> <button type="button" class="btn small" data-act="csv">Download results (CSV)</button></span></div>' +
      '<div class="ig-two"><div class="card"><div class="card-head"><h2>Source record</h2></div><pre class="ig-pre">' + esc(JSON.stringify(row.source, null, 2)) + '</pre></div><div class="card"><div class="card-head"><h2>Transformed: ' + esc(e.name) + '</h2></div><pre class="ig-pre">' + esc(JSON.stringify(row.out, null, 2)) + '</pre>' +
      (row.errors.length ? '<ul class="ig-errs">' + row.errors.map(function (x) { return '<li><b>' + esc(x.field) + '</b> ' + esc(x.message) + '</li>'; }).join('') + '</ul>' : '') + '</div></div>' +
      '<div class="card"><div class="card-head"><h2>All sample records</h2></div><div class="ig-scroll"><table class="ig-grid"><thead><tr><th>#</th>' + e.key.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '<th>Result</th></tr></thead><tbody>' + res.rows.map(function (x) {
        return '<tr class="ig-click' + (x.index === ui.rec ? ' sel' : '') + '" data-act="recgo" data-i="' + x.index + '"><td>' + (x.index + 1) + '</td>' + e.key.map(function (k) { return '<td class="ig-mono">' + esc(short(M.get(x.out, k), 30)) + '</td>'; }).join('') + '<td>' + (x.errors.length ? '<span class="ig-warn">' + esc(x.errors.map(function (er) { return er.field + ': ' + er.message; }).join('; ')) + '</span>' : 'Valid') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return h;
  }
  function contract(it) {
    return { integration: { id: it.id, name: it.name, connectorType: it.connector, status: it.status, schemaVersion: entity(it.entity).version, targetEntity: it.entity, recordPath: it.recordPath || '$', format: it.format,
      connection: Object.assign({}, it.config, { authType: it.auth.type, credentialRef: it.auth.type === 'None' ? null : it.auth.ref || null }), schedule: connector(it.connector).mode === 'streaming' ? 'streaming' : it.every, deviceType: it.device || null },
      storage: (function (st) { return { table: st.table, timeColumn: 'time', tags: st.tags.map(function (f) { return col(f.name); }), measures: st.measures.map(function (f) { return col(f.name); }), rawRetention: st.retention, rollups: st.rollups }; })(storeOf(it.entity)), mappings: M.toContract(it.rules) };
  }
  function stepPublish(it, e) {
    var r = runTest(it, e), live = liveVersion(it), next = it.versions.reduce(function (m, v) { return Math.max(m, v.v); }, 0) + 1, c = connector(it.connector);
    var checks = [['Connection settings complete', it.connOk || c.id === 'upload'], ['Source fields discovered', it.schema.length > 0], ['Mapping complete: every required field mapped', it.rules.length > 0 && !r.issues.length], ['Test passed on every sample record', it.test.ok]], ready = checks.every(function (x) { return x[1]; });
    var h = '<h3>6. Publish and monitor</h3><div class="ig-two"><div class="card"><div class="card-head"><h2>Ready to publish?</h2><span>' + status(it) + '</span></div><ul class="ig-checks">' + checks.map(function (x) { return '<li class="' + (x[1] ? 'yes' : 'no') + '"><b>' + (x[1] ? '✓' : '✕') + '</b>' + x[0] + '</li>'; }).join('') + '</ul>' +
      '<div class="ig-form">' + field('Note for this version', '<input type="text" id="igNote" maxlength="120" placeholder="What changed">') + '</div>' +
      '<div class="ig-actions"><button type="button" class="btn ig-primary" data-act="publish" data-edit' + (ready && (!live || dirty(it)) ? '' : ' disabled') + '>Publish version ' + next + '</button>' +
      (it.status === 'published' ? '<button type="button" class="btn" data-act="pause" data-edit>' + (it.paused ? 'Resume ingestion' : 'Pause ingestion') + '</button>' : '') + '</div>' +
      '<p class="muted">' + (live ? 'Version ' + live.v + ' is live' + (dirty(it) ? '; the editor has changes that are not published.' : ' and matches the editor.') : 'Not published yet.') + ' Ingestion: ' + (c.mode === 'streaming' ? 'as messages arrive' : 'every ' + esc(it.every)) + '. Publishing here records a version in this browser; a deployed studio would call <code>publishMapping</code>.</p></div>';
    h += '<div class="card"><div class="card-head"><h2>Versions</h2><span class="muted">' + it.versions.length + '</span></div>' + (it.versions.length ? '<table class="facts ig-table">' + it.versions.slice().reverse().map(function (v) {
      return '<tr><td>Version ' + v.v + (v.v === it.active ? ' ' + chip('Live', 'st-live') : '') + '<span class="sub">' + esc(when(v.time)) + ' · ' + esc(v.user) + ' · ' + v.rules.length + ' rules' + (v.note ? ' · ' + esc(v.note) : '') + '</span></td><td>' + (v.v === it.active && !dirty(it) ? '' : '<button type="button" class="btn small" data-act="rollback" data-v="' + v.v + '" data-edit>' + (v.v === it.active ? 'Discard changes' : 'Roll back') + '</button>') + '</td></tr>';
    }).join('') + '</table>' : '<p class="muted">No versions yet.</p>') + '</div></div>';
    var st = storeOf(it.entity), feeds = (IG.analytics || []).filter(function (u) { return u.needs.some(function (n) { return n.entity === it.entity; }); });
    h += '<div class="card"><div class="card-head"><h2>Storage and analytics</h2><button type="button" class="btn small" data-act="data">Open data and analytics</button></div><table class="facts ig-table">' +
      '<tr><td>Time-series table</td><td><code>' + st.table + '</code> · time column <code>time</code></td></tr><tr><td>Series identified by</td><td>' + esc(st.tags.map(function (f) { return f.name; }).join(', ') || 'none') + '</td></tr>' +
      '<tr><td>Measures</td><td>' + esc(st.measures.map(function (f) { return f.name; }).join(', ') || 'none') + '</td></tr><tr><td>Raw records kept</td><td>' + esc(st.retention) + ', then rollups every ' + esc(st.rollups.join(', ')) + '</td></tr>' +
      '<tr><td>Feeds</td><td>' + (feeds.length ? feeds.map(function (u) { return esc(u.name) + ' <span class="muted">(' + u.kind.toLowerCase() + ')</span>'; }).join(' · ') : 'No report or model uses this entity yet') + '</td></tr></table>' +
      '<p class="muted">Design only: no database or model runs in this demonstrator.</p></div>';
    h += '<div class="card"><div class="card-head"><h2>Mapping definition</h2><span><button type="button" class="btn small" data-act="copy">Copy mapping JSON</button> <button type="button" class="btn small" data-act="download">Download</button></span></div><p class="muted">In the shape of the backend contract (<code>saveMapping</code>: <code>MappingRuleInput</code>). Credentials appear only as a reference.</p><pre class="ig-pre">' + esc(JSON.stringify(contract(it), null, 2)) + '</pre></div>' +
      '<div class="ig-actions"><button type="button" class="btn" data-act="savetpl" data-edit>Save as a template</button><button type="button" class="btn" data-act="monitor">Open monitoring</button><button type="button" class="btn ig-danger" data-act="delete" data-edit>Delete this integration</button></div>';
    return h;
  }

  /* ---------- view: schema registry ---------- */
  function viewRegistry() {
    var e = entity(ui.entity), users = S.list.filter(function (x) { return x.entity === e.name; });
    return '<div class="ig-bar"><h3>Schema registry</h3><label class="pick">Entity <select data-ui="entity">' + opts(IG.entities.map(function (x) { return [x.name, x.label]; }), ui.entity) + '</select></label></div>' +
      (ui.msg ? '<p class="ig-msg ' + ui.msg.kind + '" role="status">' + esc(ui.msg.text) + '</p>' : '') +
      '<div class="card"><div class="card-head"><h2>' + esc(e.label) + '</h2><span class="muted">' + esc(e.name) + ' · schema version ' + e.version + ' · key: ' + esc(e.key.join(' + ')) + '</span></div><p class="muted">' + esc(e.note) + ' Built-in fields come from <code>integrations.entities</code> in config.js; custom fields are controlled extensions kept in this browser.</p>' + entityTable(e, true) + '</div>' +
      '<div class="ig-two"><div class="card"><div class="card-head"><h2>Add a custom field</h2></div><div class="ig-form"><div class="ig-row">' + field('Field name', '<input type="text" id="igFName" maxlength="40" placeholder="for example vehicleColour">') + field('Type', '<select id="igFType">' + opts(['string', 'integer', 'number', 'boolean', 'datetime'], 'string') + '</select>') + '</div>' +
      '<div class="ig-row"><label class="ig-check"><input type="checkbox" id="igFReq"> Required</label><label class="ig-check"><input type="checkbox" id="igFPii"> Personal data (PII)</label></div>' + field('Note', '<input type="text" id="igFNote" maxlength="80">') + '</div><div class="ig-actions"><button type="button" class="btn ig-primary" data-act="addfield" data-edit>Add field</button></div></div>' +
      '<div class="card"><div class="card-head"><h2>Version history</h2></div><table class="facts ig-table"><tr><td>Version 1<span class="sub">Built-in definition</span></td><td></td></tr>' + e.history.map(function (x) { return '<tr><td>Version ' + x.v + '<span class="sub">' + esc(when(x.time)) + ' · ' + esc(x.user) + '</span></td><td>' + esc(x.change) + '</td></tr>'; }).join('') + '</table>' +
      '<div class="card-head sub-head"><h2>Used by</h2></div><p class="muted">' + (users.length ? users.map(function (x) { return esc(x.name); }).join(', ') : 'No integration maps to this entity yet.') + '</p></div></div>';
  }
  /* ---------- view: data and analytics ---------- */
  function viewData() {
    var names = IG.entities.map(function (e) { return e.name; }), fed = names.filter(function (n) { return sources(n).length; }), rows = names.reduce(function (s, n) { return s + rowsPerDay(n); }, 0), gb = names.reduce(function (s, n) { return s + gbPerMonth(n); }, 0);
    var ucs = IG.analytics || [], ready = ucs.map(readiness), kinds = []; ucs.forEach(function (u) { if (kinds.indexOf(u.kind) < 0) { kinds.push(u.kind); } });
    if (!ui.ddl) { ui.ddl = fed[0] || names[0]; }
    var st = storeOf(ui.ddl);
    var h = '<p class="notice"><strong>Design view.</strong> No database is running and no model is trained or run here. The table definitions are generated from the entities and can be copied; volumes are estimates from the example rates. Which reports and models the data can feed is worked out from the published mappings, and is real.</p>' +
      (ui.msg ? '<p class="ig-msg ' + ui.msg.kind + '" role="status">' + esc(ui.msg.text) + '</p>' : '') +
      '<div class="ig-kpis">' + tile('Time-series tables', fed.length + ' of ' + names.length, 'with a published source') + tile('Records a day', num(Math.round(rows)), 'estimate') + tile('Storage a month', (gb >= 10 ? Math.round(gb) : gb.toFixed(1)) + '<small> GB</small>', 'after about ' + (ST.compression || 10) + '× compression') + tile('Use cases with data', ready.filter(function (r) { return r.state === 'ready'; }).length + ' of ' + ucs.length) + '</div>' +
      '<div class="card"><div class="card-head"><h2>Time-series database</h2><span class="muted">' + esc(ST.engine || '') + '</span></div><p class="muted">Every entity is time-stamped, so each is kept as a time-series table: <b>tags</b> identify the series (device, lane, class), <b>measures</b> are the values. Raw records are kept for the retention period; rollups stay for trends, reports and model training. ' + esc(ST.alternatives || '') + '.</p>' +
      '<div class="ig-scroll"><table class="ig-grid"><thead><tr><th>Entity</th><th>Tags</th><th>Measures</th><th>Published sources</th><th>Records a day</th><th>Raw records kept</th><th>Rollups</th></tr></thead><tbody>' + names.map(function (n) {
        var x = storeOf(n), src = sources(n);
        return '<tr class="ig-click' + (n === ui.ddl ? ' sel' : '') + '" data-act="ddl" data-name="' + n + '"><td>' + esc(x.entity.label) + '<span class="sub ig-mono">' + x.table + '</span></td><td>' + esc(x.tags.map(function (f) { return f.name; }).join(', ') || '—') + '</td><td>' + x.measures.length + '<span class="sub">' + esc(short(x.measures.map(function (f) { return f.name; }).join(', '), 44)) + '</span></td><td>' + (src.length ? esc(src.map(function (i) { return i.name; }).join(', ')) : '<span class="muted">none</span>') + '</td><td>' + (src.length ? num(Math.round(rowsPerDay(n))) : '—') + '</td><td>' + esc(x.retention) + '</td><td>' + esc(x.rollups.join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      '<div class="card"><div class="card-head"><h2>' + esc(st.entity.label) + ': table definition</h2><button type="button" class="btn small" data-act="copyddl">Copy SQL</button></div><div class="ig-form"><div class="ig-row">' + field('Keep raw records for', '<select data-st="retention">' + opts(ST.retentionChoices || [st.retention], st.retention) + '</select>') +
      '<div class="field"><span>Rollups</span><div class="ig-pills">' + (ST.rollupChoices || st.rollups).map(function (r) { return '<button type="button" class="ig-pill' + (st.rollups.indexOf(r) >= 0 ? ' on' : '') + '" data-act="roll" data-r="' + esc(r) + '" data-edit>' + esc(r) + '</button>'; }).join('') + '</div></div></div></div><pre class="ig-pre">' + esc(ddl(ui.ddl)) + '</pre></div>' +
      '<div class="ig-bar"><h3>Reports, analytics and machine-learning use cases</h3><label class="pick">Show <select data-ui="kind">' + opts(kinds, ui.kind, 'All kinds') + '</select></label></div><div class="ig-ucs">';
    ucs.forEach(function (u, i) {
      if (ui.kind && u.kind !== ui.kind) { return; }
      var r = ready[i], open = ui.uc === i;
      h += '<div class="ig-uc' + (open ? ' open' : '') + '"><button type="button" class="ig-uc-head" data-act="uc" data-i="' + i + '" aria-expanded="' + open + '"><strong>' + esc(u.name) + '</strong><span>' + chip(u.kind, 'tf') + chip(READY[r.state][0], READY[r.state][1]) + '</span>' +
        '<em>Needs ' + u.needs.map(function (n) { return esc(entity(n.entity).label) + (n.optional ? ' (optional)' : ''); }).join(', ') + ' · ' + (/^\d/.test(u.grain) ? 'every ' : '') + esc(u.grain) + '</em></button>';
      if (open) {
        h += '<div class="ig-uc-body"><table class="facts ig-table"><tr><td>Method</td><td>' + esc(u.method) + '</td></tr><tr><td>Result</td><td>' + esc(u.output) + '</td></tr><tr><td>Used in</td><td>' + esc(u.section) + '</td></tr></table><ul class="ig-checks">' + r.cover.map(function (c) {
          return '<li class="' + (c.ok ? 'yes' : 'no') + '"><b>' + (c.ok ? '✓' : c.need.optional ? '–' : '✕') + '</b><span>' + esc(entity(c.need.entity).label) + (c.need.optional ? ' (optional)' : '') + ': ' + (c.src.length ? 'from ' + esc(c.src.map(function (x) { return x.name; }).join(', ')) + (c.missing.length ? '; not mapped: ' + esc(c.missing.join(', ')) : '; all ' + c.need.fields.length + ' fields mapped') : 'no published integration. Needs ' + esc(c.need.fields.join(', '))) + '</span></li>';
        }).join('') + '</ul><div class="ig-actions"><button type="button" class="btn small" data-act="copyq" data-i="' + i + '">Copy feature query</button></div><pre class="ig-pre">' + esc(featureQuery(u)) + '</pre></div>';
      }
      h += '</div>';
    });
    return h + '</div>';
  }
  /* ---------- view: monitoring (synthetic) ---------- */
  function metric(it, now) {
    var seed = K.hashStr(it.id), r = K.rnd(seed, Math.floor(now / 300)), live = liveVersion(it), broken = live ? M.brokenRules(live.rules, it.schema) : [];
    var st = it.status !== 'published' ? 'off' : it.paused ? 'paused' : broken.length ? 'drift' : r < 0.05 ? 'delayed' : 'ok', wave = 1 + 0.12 * Math.sin(now / (17 + seed % 23) + seed % 7);
    var rate = st === 'off' || st === 'paused' ? 0 : (it.ratePerSec || 20) * wave * (st === 'delayed' ? 0.5 : 1), hard = broken.some(function (b) { return b.required; });
    return { it: it, status: st, rate: rate, lag: (400 + seed % 900) * wave * (st === 'delayed' ? 8 : 1), err: st === 'drift' ? (hard ? 100 : 12 + 20 * r) : 0.04 + 0.5 * K.rnd(seed, Math.floor(now / 300) + 5), broken: broken.length };
  }
  function viewMonitor() {
    var now = Date.now() / 1000, rows = S.list.map(function (it) { return metric(it, now); }), on = rows.filter(function (m) { return m.status !== 'off'; }), total = on.reduce(function (s, m) { return s + m.rate; }, 0);
    var LAB = { ok: ['free', 'Receiving'], delayed: ['heavy', 'Delayed'], drift: ['severe', 'Schema changed'], paused: ['moderate', 'Paused'], off: ['moderate', 'Not published'] };
    var h = '<p class="notice"><strong>Synthetic figures.</strong> No data is being ingested: this demonstrator has no server. The rows show what monitoring of published integrations would contain. A schema change found in “Connect and discover” is real and is flagged here.</p>' +
      '<div class="ig-kpis">' + tile('Published', on.length + ' of ' + S.list.length) + tile('Records ingested', num(Math.round(total)) + '<small>/s</small>') + tile('Mapping errors', (on.length ? on.reduce(function (s, m) { return s + m.err * m.rate; }, 0) / (total || 1) : 0).toFixed(2) + '<small>%</small>') + tile('Schema changes', rows.filter(function (m) { return m.broken; }).length, 'needing attention') + '</div><div class="card"><div class="card-head"><h2>Ingestion by integration</h2><span class="muted">Updated every 2 s</span></div><ol class="corridors">';
    rows.forEach(function (m) {
      var L = LAB[m.status], it = m.it;
      h += '<li><button type="button" data-act="open" data-id="' + esc(it.id) + '"><span class="dot ' + L[0] + '"></span><span><span class="c-name">' + esc(it.name) + ' → ' + esc(entity(it.entity).label) + '</span><br><span class="c-sub">' + L[1] + (m.status === 'off' ? ' · draft' : ' · version ' + it.active + ' · ' + esc(connector(it.connector).name) + (m.rate ? ' · lag ' + (m.lag >= 1000 ? (m.lag / 1000).toFixed(1) + ' s' : Math.round(m.lag) + ' ms') + ' · mapping errors ' + m.err.toFixed(2) + '%' : '') + (m.broken ? ' · ' + m.broken + ' rules broken' : '')) + '</span></span><span class="c-speed">' + (m.rate >= 10 ? num(Math.round(m.rate)) : m.rate.toFixed(1)) + '<small>/s</small></span></button></li>';
    });
    return h + '</ol></div>';
  }

  /* ---------- drawing the connections between source and target fields ---------- */
  function drawLines() {
    var box = $('igMapper'), it = cur(); if (!box || !it) { return; }
    var svg = $('igLines'), chips = $('igChips'), br = box.getBoundingClientRect(), s = {}, t = {}, paths = '', ch = '';
    Array.prototype.forEach.call(box.querySelectorAll('[data-src]'), function (el) { s[el.getAttribute('data-src')] = el.getBoundingClientRect(); });
    Array.prototype.forEach.call(box.querySelectorAll('[data-tgt]'), function (el) { t[el.getAttribute('data-tgt')] = el.getBoundingClientRect(); });
    svg.setAttribute('width', br.width); svg.setAttribute('height', br.height);
    it.rules.forEach(function (r, i) {
      var tr = t[r.targetPath]; if (!tr) { return; }
      var x2 = tr.left - br.left, y2 = tr.top + tr.height / 2 - br.top, cls = i === ui.sel ? ' sel' : '';
      [r.sourcePath].concat(r.sources).forEach(function (p, k) {
        var sr = s[p]; if (!sr) { return; }
        var x1 = sr.right - br.left, y1 = sr.top + sr.height / 2 - br.top, mx = (x1 + x2) / 2;
        paths += '<path class="ig-ln' + cls + (k ? ' extra' : '') + '" data-act="sel" data-i="' + i + '" d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' C' + mx.toFixed(1) + ' ' + y1.toFixed(1) + ',' + mx.toFixed(1) + ' ' + y2.toFixed(1) + ',' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '"/>';
      });
      ch += '<button type="button" class="ig-tchip' + cls + '" data-act="sel" data-i="' + i + '" style="right:' + (br.right - tr.left + 6).toFixed(0) + 'px;top:' + y2.toFixed(0) + 'px">' + esc(M.transform(r.transform).label) + '</button>';
    });
    svg.innerHTML = paths; chips.innerHTML = ch;
  }

  /* ---------- render ---------- */
  function render(keepScroll) {
    var it = cur(), top = body.scrollTop;
    Array.prototype.forEach.call($('igTabs').children, function (b) { var on = b.getAttribute('data-t') === ui.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    body.innerHTML = ui.tab === 'registry' ? viewRegistry() : ui.tab === 'monitor' ? viewMonitor() : ui.tab === 'data' ? viewData() : it ? viewStudio(it) : viewList();
    if (!can()) { Array.prototype.forEach.call(body.querySelectorAll('[data-edit], input, select:not([data-ui]), textarea'), function (el) { el.disabled = true; }); }
    body.scrollTop = keepScroll === false ? 0 : top;
    drawLines(); ui.msg = null;
    clearInterval(timer); timer = 0;
    if (ui.tab === 'monitor' && isOpen) { timer = setInterval(function () { if (ui.tab === 'monitor' && isOpen) { render(); } }, 2000); }
  }

  /* ---------- actions ---------- */
  function connect(it, src, tgt) {
    var e = entity(it.entity), sf = it.schema.filter(function (f) { return f.path === src; })[0], tf = e.fields.filter(function (f) { return f.name === tgt; })[0], i = -1;
    it.rules.forEach(function (r, k) { if (r.targetPath === tgt) { i = k; } });
    if (i >= 0) { it.rules[i].sourcePath = src; it.rules[i].sources = it.rules[i].sources.filter(function (p) { return p !== src; }); }
    else {
      // The transformation is pre-set from the two field types and the sample values; it can be changed under "Mapping properties".
      var st = sf && tf ? M.suggestTransform(sf, tf, records(it).slice(0, 50).map(function (r) { return M.get(r, src); })) : { transform: 'direct', args: {} };
      it.rules.push(normRule({ sourcePath: src, targetPath: tgt, transform: st.transform, args: st.args, required: !!(tf && tf.required) })); i = it.rules.length - 1;
    }
    ui.sel = i; ui.pick = null; if (ui.sug) { ui.sug = ui.sug.filter(function (x) { return x.targetPath !== tgt; }); }
    save();
  }
  function discover(it) {
    var p = M.parsePayload(it.sample, it.format, it.recordPath === '$' ? '' : it.recordPath), schema = M.discover(p.records, p.infer), before = it.schema;
    it.schema = schema; it.recordPath = p.recordPath; cache = {};
    var d = before.length ? M.drift(before, schema) : null; it.drift = d && d.any ? d : it.drift && M.brokenRules(it.rules, schema).length ? it.drift : null;
    ui.sug = null; save();
    say(schema.length + ' fields found in ' + p.records.length + (p.records.length === 1 ? ' record' : ' records') + (p.recordPath !== '$' ? ' at ' + p.recordPath : '') + (d && d.any ? '. The schema differs from the previous one: see below.' : '.'), d && d.any ? 'warn' : 'ok');
    audit('Integration ' + it.name + ': schema discovered, ' + schema.length + ' fields');
  }
  function checkConn(it) {
    var c = connector(it.connector), miss = c.fields.filter(function (f) { return f.required && !String(it.config[f.key] || '').trim(); }).map(function (f) { return f.label; }), bad = [];
    c.fields.forEach(function (f) { var v = String(it.config[f.key] || '').trim(); if (f.type === 'url' && v && !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(v)) { bad.push(f.label + ' must be a full http(s) address'); } });
    if (!c.noAuth && it.auth.type !== 'None' && !/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(String(it.auth.ref || '').trim())) { bad.push('the secret reference must look like vault://path/to/secret'); }
    it.connOk = !miss.length && !bad.length; save();
    if (it.connOk) { say('The connection settings are complete. This demonstrator has no server, so the connection itself is not opened; a deployed studio would test it here.', 'ok'); }
    else { say((miss.length ? 'Missing: ' + miss.join(', ') + '. ' : '') + (bad.length ? 'Check: ' + bad.join('; ') + '.' : ''), 'warn'); }
  }
  function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'integration'; }
  var ACT = {
    back: function () { ui.openId = null; ui.sug = null; ui.tab = 'list'; },
    open: function (el) { ui.openId = el.getAttribute('data-id'); ui.tab = 'list'; var it = cur(); ui.step = !it ? 0 : it.status === 'published' ? 5 : it.rules.length ? 3 : it.schema.length ? 2 : 0; ui.sel = -1; ui.pick = null; ui.sug = null; ui.rec = 0; return false; },
    'new': function () { ui.adding = true; }, cancelnew: function () { ui.adding = false; },
    create: function () {
      var name = ($('igNewName').value || '').trim() || 'New integration', ti = $('igNewTpl').value, tpl = ti === '' ? null : S.templates[Number(ti)];
      var it = fromSeed({ id: slug(name) + '-' + Date.now().toString(36), name: name, connector: 'rest', entity: tpl ? tpl.entity : IG.entities[0].name, rules: tpl ? clone(tpl.rules) : [], format: 'json' }, 0);
      var nd = device($('igNewDev').value); if (nd) { it.connector = nd.connectors[0]; if (!tpl) { it.entity = nd.entity; } setDevice(it, nd.id); }
      S.list.push(it); ui.adding = false; ui.openId = it.id; ui.step = 0; ui.sel = -1; save(); audit('Integration created: ' + name);
      if (tpl) { say('Template “' + tpl.name + '” applied. Discover the source fields, then check each rule’s source.', 'ok'); } return false;
    },
    reset: function () { S = fresh(); cache = {}; ui.openId = null; save(); say('Examples restored.'); audit('Integration examples restored'); },
    deltpl: function (el) { S.templates.splice(Number(el.getAttribute('data-i')), 1); save(); },
    step: function (el) { ui.step = Number(el.getAttribute('data-i')); ui.pick = null; return false; },
    connector: function (el, it) { var c = connector(el.getAttribute('data-id')); it.connector = c.id; it.connOk = false; if (c.formats.indexOf(it.format) < 0) { it.format = c.formats[0]; } save(); },
    conn: function (el, it) { checkConn(it); },
    discover: function (el, it) { try { discover(it); } catch (e) { say(e.message, 'warn'); } },
    ackdrift: function (el, it) { it.drift = null; save(); },
    applyrename: function (el, it) {
      var map = {}, n = 0; it.drift.renamed.forEach(function (r) { map[r.from] = r.to; });
      it.rules.forEach(function (r) { if (map[r.sourcePath]) { r.sourcePath = map[r.sourcePath]; n++; } r.sources = r.sources.map(function (p) { return map[p] || p; }); });
      if (!M.brokenRules(it.rules, it.schema).length) { it.drift = null; } save(); say(n + (n === 1 ? ' rule' : ' rules') + ' updated to the new field names. Test and publish to make the change live.'); audit('Integration ' + it.name + ': rules updated after a schema change');
    },
    entity: function (el, it) {
      var name = el.getAttribute('data-name'); if (name === it.entity) { return; }
      var e = entity(name), keep = it.rules.filter(function (r) { return e.fields.some(function (f) { return f.name === r.targetPath; }); }), lost = it.rules.length - keep.length;
      it.entity = name; it.rules = keep; ui.sel = -1; ui.sug = null; save(); say('Target entity: ' + e.label + '.' + (lost ? ' ' + lost + ' rules for fields that are not in this entity were removed.' : ''), lost ? 'warn' : 'ok');
    },
    suggest: function (el, it) { ui.sug = M.suggest(leaves(it), entity(it.entity), it.rules, records(it)); if (!ui.sug.length) { say('No further matches found. Connect the remaining fields by hand.', 'warn'); } },
    nosug: function () { ui.sug = null; },
    accept: function (el, it) { var s = ui.sug.splice(Number(el.getAttribute('data-i')), 1)[0]; it.rules.push(normRule(s)); ui.sel = it.rules.length - 1; save(); },
    acceptall: function (el, it) { ui.sug.forEach(function (s) { it.rules.push(normRule(s)); }); audit('Integration ' + it.name + ': ' + ui.sug.length + ' suggested mappings accepted'); ui.sug = null; save(); },
    addrule: function (el, it) { it.rules.push(normRule({ transform: 'constant' })); ui.sel = it.rules.length - 1; save(); say('Rule added. Choose its target field and value under “Mapping properties”.'); },
    sel: function (el) { var i = Number(el.getAttribute('data-i')); ui.sel = ui.sel === i ? -1 : i; ui.pick = null; },
    delrule: function (el, it) { it.rules.splice(ui.sel, 1); ui.sel = -1; save(); },
    togsrc: function (el, it) { var r = it.rules[ui.sel], p = el.getAttribute('data-p'), k = r.sources.indexOf(p); if (k >= 0) { r.sources.splice(k, 1); } else { r.sources.push(p); } save(); },
    rec: function (el) { ui.rec += Number(el.getAttribute('data-d')); }, recgo: function (el) { ui.rec = Number(el.getAttribute('data-i')); },
    retest: function (el, it) { runTest(it, entity(it.entity), true); audit('Integration ' + it.name + ': mapping tested, ' + it.test.valid + ' of ' + it.test.records + ' records valid'); },
    csv: function (el, it) {
      var e = entity(it.entity), res = M.test(it.rules, records(it), e), names = e.fields.map(function (f) { return f.name; });
      K.csv(slug(it.name) + '-test.csv', [['record'].concat(names, ['result', 'errors'])].concat(res.rows.map(function (x) { return [x.index + 1].concat(names.map(function (n) { return M.get(x.out, n); }), [x.errors.length ? 'error' : 'valid', x.errors.map(function (er) { return er.field + ': ' + er.message; }).join('; ')]); })));
      return true;
    },
    publish: function (el, it) {
      var v = it.versions.reduce(function (m, x) { return Math.max(m, x.v); }, 0) + 1, e = entity(it.entity);
      it.versions.push({ v: v, time: new Date().toISOString(), user: who(), note: ($('igNote').value || '').trim(), entity: it.entity, entityVersion: e.version, rules: clone(it.rules), schema: clone(it.schema), every: it.every });
      it.active = v; it.status = 'published'; it.paused = false; it.drift = null; save(); say('Version ' + v + ' is published. It now appears under Monitor' + (it.platformFeed ? '.' : ' and in Platform, data ingestion.')); audit('Integration ' + it.name + ': version ' + v + ' published');
    },
    pause: function (el, it) { it.paused = !it.paused; save(); audit('Integration ' + it.name + ': ingestion ' + (it.paused ? 'paused' : 'resumed')); },
    rollback: function (el, it) {
      var v = it.versions.filter(function (x) { return x.v === Number(el.getAttribute('data-v')); })[0]; if (!v) { return; }
      var same = v.v === it.active; it.rules = clone(v.rules).map(normRule); it.entity = v.entity; it.active = v.v; ui.sel = -1; save();
      say(same ? 'Changes discarded: the editor matches version ' + v.v + ' again.' : 'Rolled back: version ' + v.v + ' is live and loaded in the editor.'); audit('Integration ' + it.name + ': ' + (same ? 'changes discarded' : 'rolled back to version ' + v.v));
    },
    copy: function (el, it) {
      var text = JSON.stringify(contract(it), null, 2), ok = function () { say('Mapping JSON copied.'); render(); };
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, function () { say('Copying was blocked by the browser. Use Download instead.', 'warn'); render(); }); } else { say('Copying is not available here. Use Download instead.', 'warn'); }
    },
    download: function (el, it) { download(slug(it.name) + '-mapping.json', JSON.stringify(contract(it), null, 2)); return true; },
    savetpl: function (el, it) { S.templates.push({ name: it.name + ' mapping', entity: it.entity, rules: clone(it.rules) }); save(); say('Saved as the template “' + it.name + ' mapping”. Choose it when creating a new integration.'); },
    monitor: function () { ui.tab = 'monitor'; return false; },
    data: function (el, it) { ui.tab = 'data'; if (it) { ui.ddl = it.entity; } return false; },
    loadsample: function (el, it) { var d = device(it.device); if (!d) { return; } var before = it.schema; loadSample(it, d); var df = before.length ? M.drift(before, it.schema) : null; it.drift = df && df.any ? df : null; save(); say('Example payload for ' + d.name + ' loaded: ' + it.schema.length + ' fields.' + (it.drift ? ' It differs from the previous schema: see below.' : ''), it.drift ? 'warn' : 'ok'); },
    ddl: function (el) { ui.ddl = el.getAttribute('data-name'); },
    copyddl: function () { copyText(ddl(ui.ddl), 'Table definition'); },
    copyq: function (el) { copyText(featureQuery(IG.analytics[Number(el.getAttribute('data-i'))]), 'Feature query'); },
    uc: function (el) { var i = Number(el.getAttribute('data-i')); ui.uc = ui.uc === i ? -1 : i; },
    roll: function (el) {
      var st = storeOf(ui.ddl), r = el.getAttribute('data-r'), list = st.rollups.slice(), k = list.indexOf(r); if (k >= 0) { list.splice(k, 1); } else { list.push(r); }
      list.sort(function (a, b) { return days(a) - days(b); }); S.store[ui.ddl] = Object.assign({}, S.store[ui.ddl], { rollups: list }); save(); audit('Storage: ' + ui.ddl + ' rollups set to ' + (list.join(', ') || 'none'));
    },
    'delete': function (el, it) { if (el.getAttribute('data-sure') !== '1') { el.setAttribute('data-sure', '1'); el.textContent = 'Delete: choose again to confirm'; return true; } S.list = S.list.filter(function (x) { return x !== it; }); ui.openId = null; save(); say('“' + it.name + '” deleted.'); audit('Integration deleted: ' + it.name); return false; },
    addfield: function () {
      var name = ($('igFName').value || '').trim(), e = entity(ui.entity);
      if (!/^[a-z][A-Za-z0-9]{1,39}$/.test(name)) { say('Use a camelCase name: a small letter first, then letters and digits (for example vehicleColour).', 'warn'); return; }
      if (e.fields.some(function (f) { return f.name.toLowerCase() === name.toLowerCase(); })) { say('“' + name + '” already exists in ' + e.label + '.', 'warn'); return; }
      var cu = S.custom[e.name] = S.custom[e.name] || { fields: [], history: [] }, f = { name: name, type: $('igFType').value, required: $('igFReq').checked, pii: $('igFPii').checked, note: ($('igFNote').value || '').trim() };
      cu.fields.push(f); cu.history.push({ v: e.version + 1, time: new Date().toISOString(), user: who(), change: 'Added ' + name + ' (' + f.type + (f.required ? ', required' : '') + ')' }); save();
      say('Field ' + name + ' added. ' + e.label + ' is now schema version ' + (e.version + 1) + '.' + (f.required ? ' Integrations mapping to it must map the new required field before they can be published again.' : '')); audit('Schema registry: ' + e.name + ' field ' + name + ' added');
    },
    delfield: function (el) {
      var e = entity(ui.entity), name = el.getAttribute('data-name'), cu = S.custom[e.name]; if (!cu) { return; }
      cu.fields = cu.fields.filter(function (f) { return f.name !== name; }); cu.history.push({ v: e.version + 1, time: new Date().toISOString(), user: who(), change: 'Removed ' + name }); save();
      say('Field ' + name + ' removed. ' + e.label + ' is now schema version ' + (e.version + 1) + '.'); audit('Schema registry: ' + e.name + ' field ' + name + ' removed');
    }
  };
  var VIEW_ONLY = { back: 1, open: 1, step: 1, sel: 1, rec: 1, recgo: 1, csv: 1, copy: 1, download: 1, monitor: 1, nosug: 1, data: 1, ddl: 1, copyddl: 1, copyq: 1, uc: 1 };
  body.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]'), it = cur();
    if (el) {
      var name = el.getAttribute('data-act'); if (!ACT[name] || el.disabled || (!VIEW_ONLY[name] && !can())) { return; }
      var r = ACT[name](el, it); if (r !== true) { render(r === false ? false : undefined); } return;
    }
    if (!it || ui.step !== 3 || !can()) { return; }
    var s = ev.target.closest('[data-src]'), t = ev.target.closest('[data-tgt]');
    if (s) { var p = s.getAttribute('data-src'); ui.pick = ui.pick === p ? null : p; render(); }
    else if (t) {
      var tn = t.getAttribute('data-tgt'), idx = -1; it.rules.forEach(function (x, k) { if (x.targetPath === tn) { idx = k; } });
      if (ui.pick) { connect(it, ui.pick, tn); } else if (idx >= 0) { ui.sel = ui.sel === idx ? -1 : idx; } else { say('Choose a source field first, then this target. For a fixed value, use “Add a rule without a source”.', 'warn'); }
      render();
    }
  });
  // Text is saved as it is typed, without redrawing (so a following button press is not lost); lists and tick boxes redraw.
  function edit(ev) {
    var el = ev.target, it = cur(), redraw = ev.type === 'change' && (el.tagName === 'SELECT' || el.type === 'checkbox'), v = el.type === 'checkbox' ? el.checked : el.value, k;
    if (el.getAttribute('data-ui')) { ui[el.getAttribute('data-ui')] = v; render(); return; }
    if (el.id === 'igFile') { var f = el.files && el.files[0]; if (f && it) { var rd = new FileReader(); rd.onload = function () { it.sample = String(rd.result); it.format = M.sniff(it.sample); var c = connector(it.connector); if (c.formats.indexOf(it.format) < 0) { say('This connector expects ' + c.formats.join(' or ').toUpperCase() + '; the file looks like ' + it.format.toUpperCase() + '.', 'warn'); it.format = c.formats[0]; } else { try { discover(it); } catch (e) { say(e.message, 'warn'); } } save(); render(); }; rd.readAsText(f); } return; }
    if ((k = el.getAttribute('data-st'))) { if (can()) { S.store[ui.ddl] = Object.assign({}, S.store[ui.ddl]); S.store[ui.ddl][k] = v; save(); audit('Storage: ' + ui.ddl + ' raw records kept for ' + v); } render(); return; }
    if (!it || !can()) { return; }
    if (el.getAttribute('data-bind') === 'device') { setDevice(it, v); save(); render(); return; }
    if ((k = el.getAttribute('data-bind'))) { it[k] = v; if (k === 'sample' || k === 'format' || k === 'recordPath') { cache = {}; } }
    else if ((k = el.getAttribute('data-cfg'))) { it.config[k] = v; it.connOk = false; }
    else if ((k = el.getAttribute('data-auth'))) { it.auth[k] = v; it.connOk = false; }
    else if ((k = el.getAttribute('data-rb')) && it.rules[ui.sel]) {
      var r = it.rules[ui.sel];
      if (k === 'transform') { r.transform = v; r.args = M.defaultArgs(v); if (!M.transform(v).multi) { r.sources = []; } }
      else if (k === 'targetPath') { if (v && it.rules.some(function (x) { return x !== r && x.targetPath === v; })) { say(v + ' is already written by another rule.', 'warn'); } else { r.targetPath = v; } }
      else { r[k] = v; }
    }
    else if ((k = el.getAttribute('data-ra')) && it.rules[ui.sel]) { it.rules[ui.sel].args[k] = el.type === 'number' && v !== '' ? Number(v) : v; }
    else { return; }
    save();
    if (redraw) { render(); } else if ($('igPrev') && it.rules[ui.sel]) { $('igPrev').innerHTML = preview(it, it.rules[ui.sel]); }
  }
  body.addEventListener('input', edit); body.addEventListener('change', edit);
  // Drag a source field onto a target field (pointer devices).
  body.addEventListener('dragstart', function (ev) { var s = ev.target.closest && ev.target.closest('[data-src]'); if (s && can()) { ev.dataTransfer.setData('text/plain', s.getAttribute('data-src')); ev.dataTransfer.effectAllowed = 'link'; } });
  body.addEventListener('dragover', function (ev) { var t = ev.target.closest && ev.target.closest('[data-tgt]'); if (t) { ev.preventDefault(); t.classList.add('drop'); } });
  body.addEventListener('dragleave', function (ev) { var t = ev.target.closest && ev.target.closest('[data-tgt]'); if (t) { t.classList.remove('drop'); } });
  body.addEventListener('drop', function (ev) { var t = ev.target.closest && ev.target.closest('[data-tgt]'), it = cur(), p = ev.dataTransfer.getData('text/plain'); if (t && it && p && can()) { ev.preventDefault(); connect(it, p, t.getAttribute('data-tgt')); render(); } });
  window.addEventListener('resize', function () { if (isOpen) { drawLines(); } });

  /* ---------- opening and closing the page ---------- */
  function open() {
    if (isOpen) { return; }
    if (T.analytics && !$('analytics').hidden) { T.analytics.close(); }
    if (T.osintPage && T.osintPage.isOpen()) { T.osintPage.close(); }
    isOpen = true; page.hidden = false; document.body.classList.add('ig-open'); [$('integBtn'), $('integTopBtn')].forEach(function (b) { if (b) { b.classList.add('active'); b.setAttribute('aria-pressed', 'true'); } });
    render(false); audit('Opened the Integration Studio');
  }
  function close() {
    if (!isOpen) { return; }
    isOpen = false; page.hidden = true; document.body.classList.remove('ig-open'); [$('integBtn'), $('integTopBtn')].forEach(function (b) { if (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); } }); clearInterval(timer); timer = 0;
  }
  C.onReady(function () {
    [$('integBtn'), $('integTopBtn')].forEach(function (b) { if (b) { b.addEventListener('click', function () { if (isOpen) { close(); } else { open(); } }); } });
    $('igClose').addEventListener('click', close);
    $('igTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (b) { var t = b.getAttribute('data-t'); if (t === 'list' && ui.tab === 'list') { ui.openId = null; } ui.tab = t; render(false); } });
    ['osintBtn', 'analyticsBtn'].forEach(function (id) { var b = $(id); if (b) { b.addEventListener('click', close); } });
    document.getElementById('tabs').addEventListener('click', function (e) { if (e.target.closest('[data-tab]')) { close(); } });
  });
  T.integrations = {
    open: open, close: close, isOpen: function () { return isOpen; }, list: function () { return S.list; },
    // Published integrations that are not already among the platform's own example feeds, for Platform > Data ingestion.
    feeds: function () {
      return S.list.filter(function (it) { return it.status === 'published' && !it.paused && !it.platformFeed; }).map(function (it) {
        return { name: it.name, source: connector(it.connector).name + ' integration, version ' + it.active, perSec: it.ratePerSec || 20, lagMs: 600, followsTraffic: false };
      });
    }
  };
})();
