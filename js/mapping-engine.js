/* IntelliTwin mapping engine: schema discovery, field mapping, transformations, validation,
 * mapping suggestions and schema-change detection for the Integration Studio.
 *
 * Pure functions with no page or network access, so the same file runs in the browser
 * (window.IntelliTwinMapping) and under Node for the tests in tools/test_mapping_engine.js.
 * See docs/integration-studio.md.
 */
(function (root) {
  'use strict';

  /* ---------- values and paths ---------- */
  var ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;
  var DMY = /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;
  function empty(v) { return v === undefined || v === null || v === ''; }
  // Type of a value. With `infer`, text from CSV or XML is read as a number, boolean or date where it looks like one.
  function typeOf(v, infer) {
    if (empty(v)) { return 'null'; }
    if (Array.isArray(v)) { return 'array'; }
    if (typeof v === 'object') { return 'object'; }
    if (typeof v === 'boolean') { return 'boolean'; }
    if (typeof v === 'number') { return Number.isInteger(v) ? 'integer' : 'number'; }
    var s = String(v).trim();
    if (ISO.test(s) && s.length >= 10 || DMY.test(s)) { return 'datetime'; }
    if (infer) {
      if (/^-?\d+$/.test(s) && s.length < 16 && !/^0\d/.test(s)) { return 'integer'; }
      if (/^-?\d*\.\d+$/.test(s)) { return 'number'; }
      if (/^(true|false)$/i.test(s)) { return 'boolean'; }
    }
    return 'string';
  }
  function tokens(path) {
    var out = []; String(path).replace(/\[(\d+)\]|([^.\[\]]+)/g, function (m, i, k) { out.push(i !== undefined ? Number(i) : k); return m; });
    // Names that would reach into an object's prototype are never followed.
    if (out.some(function (k) { return k === '__proto__' || k === 'constructor' || k === 'prototype'; })) { return ['\u0000blocked']; }
    return out;
  }
  function get(obj, path) {
    if (empty(path)) { return undefined; }
    var t = tokens(path), cur = obj;
    for (var i = 0; i < t.length; i++) { if (cur === null || cur === undefined) { return undefined; } cur = cur[t[i]]; }
    return cur;
  }
  function set(obj, path, value) {
    var t = tokens(path), cur = obj;
    for (var i = 0; i < t.length - 1; i++) {
      if (cur[t[i]] === null || typeof cur[t[i]] !== 'object') { cur[t[i]] = typeof t[i + 1] === 'number' ? [] : {}; }
      cur = cur[t[i]];
    }
    cur[t[t.length - 1]] = value;
  }

  /* ---------- parsing a sample payload ---------- */
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    var first = text.split(/\r?\n/)[0] || '', delim = ',', best = 0;
    [',', ';', '\t', '|'].forEach(function (d) { var n = first.split(d).length; if (n > best) { best = n; delim = d; } });
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { q = false; } } else { cell += c; } }
      else if (c === '"') { q = true; }
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') { i++; } row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') { rows.push(row); } row = []; }
      else { cell += c; }
    }
    row.push(cell); if (row.length > 1 || row[0] !== '') { rows.push(row); }
    if (rows.length < 1) { throw new Error('The file has no rows.'); }
    var head = rows[0].map(function (h, n) { return h.trim() || 'column' + (n + 1); });
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, n) { o[h] = r[n] === undefined ? '' : r[n].trim(); }); return o; });
  }
  // XML to plain objects: attributes become "@name", repeated child elements become a list. Needs a DOMParser (browser).
  function parseXML(text, Parser) {
    Parser = Parser || root.DOMParser; if (!Parser) { throw new Error('XML can only be read in the browser.'); }
    var doc = new Parser().parseFromString(String(text), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) { throw new Error('The XML is not well formed.'); }
    function conv(el) {
      var kids = Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1; }), o = {}, n = 0;
      Array.prototype.forEach.call(el.attributes || [], function (a) { o['@' + a.name] = a.value; n++; });
      if (!kids.length) { var txt = (el.textContent || '').trim(); if (!n) { return txt; } if (txt) { o['#text'] = txt; } return o; }
      kids.forEach(function (k) {
        var name = k.localName || k.nodeName, v = conv(k);
        if (Object.prototype.hasOwnProperty.call(o, name)) { if (!Array.isArray(o[name])) { o[name] = [o[name]]; } o[name].push(v); } else { o[name] = v; }
      });
      return o;
    }
    var top = {}; top[doc.documentElement.localName || doc.documentElement.nodeName] = conv(doc.documentElement); return top;
  }
  // The list of records inside a parsed payload: the payload itself if it is a list, otherwise the shallowest list of objects.
  function findRecords(data, recordPath) {
    if (recordPath && recordPath !== '$') {
      var at = get(data, recordPath); if (empty(at)) { throw new Error('Nothing found at record path "' + recordPath + '".'); }
      return { records: Array.isArray(at) ? at : [at], recordPath: recordPath };
    }
    if (Array.isArray(data)) { return { records: data, recordPath: '$' }; }
    var queue = [{ v: data, p: '' }];
    while (queue.length) {
      var cur = queue.shift();
      if (cur.v && typeof cur.v === 'object' && !Array.isArray(cur.v)) {
        var keys = Object.keys(cur.v);
        for (var i = 0; i < keys.length; i++) {
          var v = cur.v[keys[i]], p = cur.p ? cur.p + '.' + keys[i] : keys[i];
          if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && !Array.isArray(v[0])) { return { records: v, recordPath: p }; }
          if (v && typeof v === 'object' && !Array.isArray(v) && p.split('.').length < 4) { queue.push({ v: v, p: p }); }
        }
      }
    }
    return { records: [data], recordPath: '$' };
  }
  function parsePayload(text, format, recordPath) {
    var data, infer = format !== 'json';
    if (empty(String(text || '').trim())) { throw new Error('Paste or upload a sample payload first.'); }
    if (format === 'csv') { data = parseCSV(text); }
    else if (format === 'xml') { data = parseXML(text); }
    else { try { data = JSON.parse(text); } catch (e) { throw new Error('The sample is not valid JSON: ' + e.message); } }
    var found = findRecords(data, recordPath);
    found.records = found.records.filter(function (r) { return r && typeof r === 'object'; });
    if (!found.records.length) { throw new Error('No records found in the sample.'); }
    found.infer = infer; return found;
  }
  // Guess the format of pasted text.
  function sniff(text) { var s = String(text || '').trim(); return s[0] === '{' || s[0] === '[' ? 'json' : s[0] === '<' ? 'xml' : 'csv'; }

  /* ---------- schema discovery ---------- */
  function flatten(v, prefix, out, infer) {
    if (Array.isArray(v)) {
      out.push({ path: prefix, type: 'array', value: v.length + (v.length === 1 ? ' item' : ' items') });
      if (v.length && v[0] && typeof v[0] === 'object') { flatten(v[0], prefix + '[0]', out, infer); }
      return;
    }
    if (v && typeof v === 'object') { Object.keys(v).forEach(function (k) { flatten(v[k], prefix ? prefix + '.' + k : k, out, infer); }); return; }
    out.push({ path: prefix, type: typeOf(v, infer), value: v });
  }
  function mergeType(a, b) { return a === b ? a : a === 'null' ? b : b === 'null' ? a : (a === 'integer' && b === 'number') || (a === 'number' && b === 'integer') ? 'number' : 'mixed'; }
  // Fields found across the sample records, with type, an example value and whether every record has the field.
  function discover(records, infer) {
    var byPath = {}, order = [], n = Math.min(records.length, 200);
    for (var i = 0; i < n; i++) {
      var flat = []; flatten(records[i], '', flat, infer);
      flat.forEach(function (f) {
        if (!f.path) { return; }
        var e = byPath[f.path]; if (!e) { e = byPath[f.path] = { path: f.path, type: 'null', sample: null, seen: 0 }; order.push(f.path); }
        e.type = mergeType(e.type, f.type); if (f.type !== 'null') { e.seen++; if (e.sample === null) { e.sample = f.value; } }
      });
    }
    return order.map(function (p) { var e = byPath[p]; return { path: p, type: e.type === 'null' ? 'string' : e.type, sample: e.sample, optional: e.seen < n }; });
  }

  /* ---------- dates ---------- */
  function offsetMin(tz) { var m = /^([+-])(\d{2}):?(\d{2})$/.exec(tz || ''); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0; }
  function fromParts(y, mo, d, h, mi, s, ms, tz) {
    var t = Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0, ms || 0) - offsetMin(tz) * 60000, back = new Date(t + offsetMin(tz) * 60000);
    if (isNaN(t) || back.getUTCDate() !== Number(d) || back.getUTCMonth() !== mo - 1) { throw new Error('not a real date'); }
    return new Date(t);
  }
  // Read a date in the given format ("auto", "epoch-s", "epoch-ms" or a pattern such as dd/MM/yyyy HH:mm:ss).
  // Text without a time zone is taken to be in `tz` (for example +04:00).
  function parseDate(v, format, tz) {
    var s = String(v).trim(), m;
    format = format || 'auto';
    if (format === 'epoch-s' || format === 'epoch-ms' || (format === 'auto' && /^\d{9,13}(\.\d+)?$/.test(s))) {
      var n = Number(s); if (isNaN(n)) { throw new Error('"' + s + '" is not a number of seconds'); }
      return new Date(format === 'epoch-ms' || (format === 'auto' && n > 1e11) ? n : n * 1000);
    }
    if (format === 'auto') {
      m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
      if (m) { return fromParts(+m[1], +m[2], +m[3], +m[4] || 0, +m[5] || 0, +m[6] || 0, m[7] ? +(m[7] + '00').slice(0, 3) : 0, m[8] === 'Z' ? '+00:00' : m[8] || tz); }
      m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
      if (m) { return fromParts(+m[3], +m[2], +m[1], +m[4] || 0, +m[5] || 0, +m[6] || 0, 0, tz); }
      m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
      if (m) { return fromParts(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], 0, tz); }
      throw new Error('"' + s + '" is not a date this reader recognises; set the format');
    }
    var names = [], re = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/yyyy|SSS|MM|dd|HH|mm|ss/g, function (k) { names.push(k); return k === 'yyyy' ? '(\\d{4})' : k === 'SSS' ? '(\\d{3})' : '(\\d{1,2})'; });
    m = new RegExp('^' + re + '$').exec(s);
    if (!m) { throw new Error('"' + s + '" does not match the format ' + format); }
    var p = {}; names.forEach(function (k, i) { p[k] = +m[i + 1]; });
    return fromParts(p.yyyy, p.MM || 1, p.dd || 1, p.HH, p.mm, p.ss, p.SSS, tz);
  }

  /* ---------- expressions: a small, safe evaluator (no eval) ---------- */
  var FUNCS = {
    upper: function (s) { return String(s).toUpperCase(); }, lower: function (s) { return String(s).toLowerCase(); }, trim: function (s) { return String(s).trim(); },
    len: function (s) { return empty(s) ? 0 : String(s).length; }, substr: function (s, a, b) { return String(s).substring(a, b === undefined ? undefined : b); },
    round: function (x, n) { var k = Math.pow(10, n || 0); return Math.round(Number(x) * k) / k; }, abs: function (x) { return Math.abs(Number(x)); },
    min: function () { return Math.min.apply(null, arguments); }, max: function () { return Math.max.apply(null, arguments); },
    number: function (x) { var n = Number(x); if (isNaN(n)) { throw new Error('"' + x + '" is not a number'); } return n; }, string: function (x) { return empty(x) ? '' : String(x); },
    coalesce: function () { for (var i = 0; i < arguments.length; i++) { if (!empty(arguments[i])) { return arguments[i]; } } return null; },
    contains: function (s, x) { return String(s).indexOf(String(x)) >= 0; }, replace: function (s, a, b) { return String(s).split(String(a)).join(String(b)); },
    'if': function (c, a, b) { return c ? a : b; }
  };
  function lex(src) {
    var out = [], re = /\s*(?:(\d+\.?\d*|\.\d+)|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-z_@$#][\w@$#]*(?:\.[A-Za-z_@$#][\w@$#]*|\[\d+\])*)|(==|!=|<=|>=|&&|\|\||[-+*\/%<>!?:(),]))/y, m;
    re.lastIndex = 0;
    while (re.lastIndex < src.length) {
      if (/^\s*$/.test(src.slice(re.lastIndex))) { break; }
      var at = re.lastIndex; m = re.exec(src);
      if (!m) { throw new Error('Unexpected character at position ' + (at + 1)); }
      if (m[1] !== undefined) { out.push({ t: 'num', v: Number(m[1]) }); }
      else if (m[2] !== undefined || m[3] !== undefined) { out.push({ t: 'str', v: (m[2] !== undefined ? m[2] : m[3]).replace(/\\(.)/g, '$1') }); }
      else if (m[4] !== undefined) { out.push({ t: 'id', v: m[4] }); }
      else { out.push({ t: 'op', v: m[5] }); }
    }
    return out;
  }
  // Compile an expression to a function of (record, value). `value` is the rule's source value; other names are source paths.
  function compile(src) {
    var tk = lex(String(src || '')), i = 0;
    if (!tk.length) { throw new Error('The expression is empty'); }
    function peek(v) { return tk[i] && tk[i].t === 'op' && tk[i].v === v; }
    function eat(v) { if (!peek(v)) { throw new Error('Expected "' + v + '"'); } i++; }
    function bin(next, ops, f) { return function () { var l = next(); while (tk[i] && tk[i].t === 'op' && ops.indexOf(tk[i].v) >= 0) { l = f(tk[i++].v, l, next()); } return l; }; }
    function mk(op, a, b) { return function (r, v) { var x = a(r, v), y; switch (op) {
      case '||': return x || b(r, v); case '&&': return x && b(r, v);
      case '==': y = b(r, v); return x == y; case '!=': y = b(r, v); return x != y;   // eslint-disable-line eqeqeq
      case '<': return x < b(r, v); case '<=': return x <= b(r, v); case '>': return x > b(r, v); case '>=': return x >= b(r, v);
      case '+': y = b(r, v); return typeof x === 'number' && typeof y === 'number' ? x + y : (empty(x) ? '' : String(x)) + (empty(y) ? '' : String(y));
      case '-': return Number(x) - Number(b(r, v)); case '*': return Number(x) * Number(b(r, v));
      case '/': y = Number(b(r, v)); if (y === 0) { throw new Error('division by zero'); } return Number(x) / y;
      case '%': return Number(x) % Number(b(r, v)); } }; }
    function primary() {
      var t = tk[i++]; if (!t) { throw new Error('The expression ends too early'); }
      if (t.t === 'num' || t.t === 'str') { return function () { return t.v; }; }
      if (t.t === 'op' && t.v === '(') { var e = ternary(); eat(')'); return e; }
      if (t.t === 'op' && t.v === '!') { var n = primary(); return function (r, v) { return !n(r, v); }; }
      if (t.t === 'op' && t.v === '-') { var g = primary(); return function (r, v) { return -Number(g(r, v)); }; }
      if (t.t === 'id') {
        if (peek('(')) {
          var f = FUNCS[t.v], args = []; if (!f) { throw new Error('Unknown function ' + t.v + '()'); }
          i++; if (!peek(')')) { do { args.push(ternary()); } while (peek(',') && ++i); } eat(')');
          return function (r, v) { return f.apply(null, args.map(function (a) { return a(r, v); })); };
        }
        if (t.v === 'true') { return function () { return true; }; } if (t.v === 'false') { return function () { return false; }; } if (t.v === 'null') { return function () { return null; }; }
        if (t.v === 'value') { return function (r, v) { return v; }; }
        return function (r) { return get(r, t.v); };
      }
      throw new Error('Unexpected "' + t.v + '"');
    }
    var mul = bin(primary, ['*', '/', '%'], mk), add = bin(mul, ['+', '-'], mk), cmp = bin(add, ['<', '<=', '>', '>='], mk), eq = bin(cmp, ['==', '!='], mk), and = bin(eq, ['&&'], mk), or = bin(and, ['||'], mk);
    function ternary() { var c = or(); if (!peek('?')) { return c; } i++; var a = ternary(); eat(':'); var b = ternary(); return function (r, v) { return c(r, v) ? a(r, v) : b(r, v); }; }
    var fn = ternary(); if (i < tk.length) { throw new Error('Unexpected "' + tk[i].v + '"'); }
    return fn;
  }

  /* ---------- transformations ---------- */
  function toNumber(v) { var n = typeof v === 'number' ? v : Number(String(v).trim().replace(/,(?=\d{3}\b)/g, '').replace(/%$/, '')); if (empty(v) || isNaN(n)) { throw new Error('"' + v + '" is not a number'); } return n; }
  function lookupTable(text) { var t = {}; String(text || '').split(/\r?\n|;/).forEach(function (l) { var k = l.indexOf('='); if (k > 0) { t[l.slice(0, k).trim().toLowerCase()] = l.slice(k + 1).trim(); } }); return t; }
  var TRANSFORMS = [
    { id: 'direct', label: 'Direct', help: 'Copy the value as it is.', fn: function (v) { return v; } },
    { id: 'uppercase', label: 'Uppercase', help: 'Text in capitals, trimmed.', fn: function (v) { return String(v).trim().toUpperCase(); } },
    { id: 'lowercase', label: 'Lowercase', help: 'Text in small letters, trimmed.', fn: function (v) { return String(v).trim().toLowerCase(); } },
    { id: 'trim', label: 'Trim', help: 'Remove spaces at both ends.', fn: function (v) { return String(v).trim(); } },
    { id: 'toString', label: 'Text', help: 'Convert to text.', fn: function (v) { return String(v); } },
    { id: 'toInteger', label: 'Whole number', help: 'Convert to a whole number (rounded).', fn: function (v) { return Math.round(toNumber(v)); } },
    { id: 'toDecimal', label: 'Decimal', help: 'Convert to a number, rounded to the decimals given.',
      args: [{ key: 'decimals', label: 'Decimals', type: 'number', def: 2 }],
      fn: function (v, a) { var k = Math.pow(10, a.decimals === undefined || a.decimals === '' ? 2 : Number(a.decimals)); return Math.round(toNumber(v) * k) / k; } },
    { id: 'scale', label: 'Scale', help: 'Multiply, then add: for unit changes such as percent to a 0–1 share, or mph to km/h.',
      args: [{ key: 'factor', label: 'Multiply by', type: 'number', def: 1 }, { key: 'offset', label: 'Then add', type: 'number', def: 0 }, { key: 'decimals', label: 'Decimals', type: 'number', def: 3 }],
      fn: function (v, a) { var k = Math.pow(10, empty(a.decimals) ? 3 : Number(a.decimals)); return Math.round((toNumber(v) * (empty(a.factor) ? 1 : Number(a.factor)) + (empty(a.offset) ? 0 : Number(a.offset))) * k) / k; } },
    { id: 'toBoolean', label: 'Yes / no', help: 'true, yes, y, 1 and on become true; false, no, n, 0 and off become false.',
      fn: function (v) { var s = String(v).trim().toLowerCase(); if (['true', 'yes', 'y', '1', 'on'].indexOf(s) >= 0) { return true; } if (['false', 'no', 'n', '0', 'off'].indexOf(s) >= 0) { return false; } throw new Error('"' + v + '" is not yes or no'); } },
    { id: 'dateFormat', label: 'Date format', help: 'Read a date and write it as ISO 8601 in UTC.',
      args: [{ key: 'format', label: 'Source format', type: 'text', def: 'auto', hint: 'auto, epoch-s, epoch-ms, or a pattern such as dd/MM/yyyy HH:mm:ss' }, { key: 'tz', label: 'Source time zone', type: 'text', def: '+04:00', hint: 'Used when the value has no time zone' }],
      fn: function (v, a) { return parseDate(v, a.format || 'auto', a.tz === undefined ? '+04:00' : a.tz).toISOString(); } },
    { id: 'lookup', label: 'Lookup', help: 'Replace a code with a value from a table. One "source=target" pair per line.',
      args: [{ key: 'table', label: 'Lookup table', type: 'area', def: '' }, { key: 'fallback', label: 'If not in the table', type: 'text', def: '', hint: 'Leave empty to report an error' }],
      fn: function (v, a) { var t = lookupTable(a.table), k = String(v).trim().toLowerCase(); if (Object.prototype.hasOwnProperty.call(t, k)) { return t[k]; } if (!empty(a.fallback)) { return a.fallback; } throw new Error('"' + v + '" is not in the lookup table'); } },
    { id: 'replace', label: 'Replace text', help: 'Replace every match of a pattern (regular expression).',
      args: [{ key: 'pattern', label: 'Find (pattern)', type: 'text', def: '\\s+' }, { key: 'withText', label: 'Replace with', type: 'text', def: '' }],
      fn: function (v, a) { var re; try { re = new RegExp(a.pattern || '', 'g'); } catch (e) { throw new Error('The pattern is not valid'); } return String(v).replace(re, a.withText || ''); } },
    { id: 'concat', label: 'Join fields', help: 'Join this field with others (many to one).', multi: true,
      args: [{ key: 'separator', label: 'Separator', type: 'text', def: ' ' }],
      fn: function (v, a, ctx) { return ctx.values.filter(function (x) { return !empty(x); }).join(a.separator === undefined ? ' ' : a.separator); } },
    { id: 'constant', label: 'Constant', help: 'Always write the same value; no source field is needed.', noSource: true,
      args: [{ key: 'value', label: 'Value', type: 'text', def: '' }],
      fn: function (v, a) { return a.value; } },
    { id: 'expression', label: 'Expression', help: 'A formula. "value" is the source value; any source path can be used by name. Example: value > 100 ? 100 : round(value, 1)', noSource: true,
      args: [{ key: 'expr', label: 'Expression', type: 'area', def: 'value' }],
      fn: function (v, a, ctx) { return compile(a.expr)(ctx.record, v); } }
  ];
  var T_BY_ID = {}; TRANSFORMS.forEach(function (t) { T_BY_ID[t.id] = t; });
  function transform(id) { return T_BY_ID[id] || T_BY_ID.direct; }
  function defaultArgs(id) { var a = {}; (transform(id).args || []).forEach(function (x) { a[x.key] = x.def; }); return a; }

  /* ---------- applying a mapping ---------- */
  // rule: { sourcePath, sources (extra paths for "Join fields"), targetPath, transform, args, required, defaultValue }
  function applyRule(rule, record) {
    var t = transform(rule.transform), v = get(record, rule.sourcePath), values = [v].concat((rule.sources || []).map(function (p) { return get(record, p); }));
    if (empty(v) && !t.noSource && !(t.multi && values.some(function (x) { return !empty(x); }))) { return empty(rule.defaultValue) ? undefined : rule.defaultValue; }
    var out = t.fn(v, rule.args || {}, { record: record, values: values });
    return empty(out) && !empty(rule.defaultValue) ? rule.defaultValue : out;
  }
  function apply(rules, record) {
    var out = {}, errors = [];
    (rules || []).forEach(function (r) {
      if (!r.targetPath) { return; }
      try { var v = applyRule(r, record); if (v !== undefined) { set(out, r.targetPath, v); } }
      catch (e) { errors.push({ code: 'TRANSFORM', field: r.targetPath, source: r.sourcePath, message: transform(r.transform).label + ': ' + e.message }); }
    });
    return { out: out, errors: errors };
  }

  /* ---------- validation against the target entity ---------- */
  // entity: { name, key: [field names], fields: [{ name, type, required, min, max, pattern, enum, maxLength }] }
  function checkType(v, type) {
    switch (type) {
      case 'string': return typeof v === 'string';
      case 'integer': return typeof v === 'number' && Number.isInteger(v);
      case 'number': return typeof v === 'number' && !isNaN(v);
      case 'boolean': return typeof v === 'boolean';
      case 'datetime': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !isNaN(Date.parse(v));
      default: return true;
    }
  }
  var TYPE_NAME = { string: 'text', integer: 'a whole number', number: 'a number', boolean: 'true or false', datetime: 'an ISO 8601 date and time' };
  function validate(out, entity, rules) {
    var errors = [], req = {};
    (rules || []).forEach(function (r) { if (r.required) { req[r.targetPath] = true; } });
    (entity.fields || []).forEach(function (f) {
      var v = get(out, f.name);
      if (empty(v)) { if (f.required || req[f.name]) { errors.push({ code: 'REQUIRED', field: f.name, message: 'Required field is empty' }); } return; }
      if (!checkType(v, f.type)) { errors.push({ code: 'TYPE', field: f.name, message: 'Must be ' + (TYPE_NAME[f.type] || f.type) + ', got ' + JSON.stringify(v) }); return; }
      if (f.min !== undefined && v < f.min) { errors.push({ code: 'RANGE', field: f.name, message: v + ' is below the minimum ' + f.min }); }
      if (f.max !== undefined && v > f.max) { errors.push({ code: 'RANGE', field: f.name, message: v + ' is above the maximum ' + f.max }); }
      if (f.maxLength && String(v).length > f.maxLength) { errors.push({ code: 'LENGTH', field: f.name, message: 'Longer than ' + f.maxLength + ' characters' }); }
      if (f.pattern && !new RegExp('^(?:' + f.pattern + ')$').test(String(v))) { errors.push({ code: 'PATTERN', field: f.name, message: JSON.stringify(v) + ' does not match the required pattern' }); }
      if (f['enum'] && f['enum'].indexOf(v) < 0) { errors.push({ code: 'ENUM', field: f.name, message: JSON.stringify(v) + ' is not one of: ' + f['enum'].join(', ') }); }
    });
    return errors;
  }
  // Run the mapping over every sample record: transformed output, errors per record, duplicates by the entity key.
  function test(rules, records, entity) {
    var seen = {}, byCode = {}, valid = 0;
    var rows = records.map(function (rec, i) {
      var r = apply(rules, rec), errors = r.errors.concat(validate(r.out, entity, rules));
      if (entity.key && entity.key.length) {
        var parts = entity.key.map(function (k) { return get(r.out, k); });
        if (!parts.some(empty)) { var key = JSON.stringify(parts); if (seen[key] !== undefined) { errors.push({ code: 'DUPLICATE', field: entity.key.join(' + '), message: 'Same key as record ' + (seen[key] + 1) }); } else { seen[key] = i; } }
      }
      errors.forEach(function (e) { byCode[e.code] = (byCode[e.code] || 0) + 1; });
      if (!errors.length) { valid++; }
      return { index: i, source: rec, out: r.out, errors: errors };
    });
    return { rows: rows, records: rows.length, valid: valid, invalid: rows.length - valid, byCode: byCode, ok: rows.length > 0 && valid === rows.length };
  }
  // Design-time check of the mapping itself, before any data is run through it.
  function checkMapping(rules, schema, entity) {
    var issues = [], src = {}, tgt = {}, used = {};
    (schema || []).forEach(function (f) { src[f.path] = f; }); (entity.fields || []).forEach(function (f) { tgt[f.name] = f; });
    (rules || []).forEach(function (r) {
      var t = transform(r.transform);
      if (!r.targetPath) { issues.push({ level: 'error', message: 'A rule from ' + (r.sourcePath || 'no source') + ' has no target field.' }); return; }
      if (!tgt[r.targetPath]) { issues.push({ level: 'error', message: 'Target field ' + r.targetPath + ' is not in ' + entity.name + '.' }); }
      if (used[r.targetPath]) { issues.push({ level: 'error', message: 'Target field ' + r.targetPath + ' is written by more than one rule.' }); } used[r.targetPath] = true;
      if (!t.noSource && !r.sourcePath) { issues.push({ level: 'error', message: 'The rule for ' + r.targetPath + ' has no source field.' }); }
      [r.sourcePath].concat(r.sources || []).forEach(function (p) { if (p && !src[p]) { issues.push({ level: 'error', message: 'Source field ' + p + ' (for ' + r.targetPath + ') is not in the discovered schema.' }); } });
      if (r.transform === 'expression') { try { compile((r.args || {}).expr); } catch (e) { issues.push({ level: 'error', message: 'Expression for ' + r.targetPath + ': ' + e.message }); } }
    });
    (entity.fields || []).forEach(function (f) { if (f.required && !used[f.name]) { issues.push({ level: 'error', message: 'Required target field ' + f.name + ' is not mapped.' }); } });
    return issues;
  }

  /* ---------- mapping suggestions (name, type and sample value matching; no model involved) ---------- */
  var SYN = [['time', 'timestamp', 'ts', 'datetime', 'date', 'at', 'when'], ['id', 'code', 'ref', 'identifier', 'uid', 'key'], ['number', 'no', 'num', 'nr'],
    ['device', 'camera', 'cam', 'sensor', 'detector', 'unit', 'source'], ['confidence', 'conf', 'score', 'probability', 'certainty'], ['class', 'type', 'category', 'kind', 'cls'],
    ['latitude', 'lat', 'y'], ['longitude', 'lon', 'lng', 'long', 'x'], ['speed', 'velocity', 'spd', 'kmh', 'kph'], ['plate', 'licence', 'license', 'lpr', 'anpr', 'registration', 'reg'],
    ['flow', 'volume', 'count', 'vehicles'], ['occupancy', 'occ', 'load'], ['description', 'desc', 'details', 'text', 'remarks', 'note'], ['status', 'state'], ['severity', 'priority', 'level'],
    ['direction', 'heading', 'bearing', 'dir'], ['delay', 'lateness', 'late'], ['temperature', 'temp'], ['humidity', 'rh'], ['noise', 'sound', 'db', 'laeq'], ['route', 'line', 'service'], ['junction', 'intersection', 'node']];
  var NOISE = { capture: 1, captured: 1, event: 1, detected: 1, detection: 1, read: 1, reading: 1, measured: 1, value: 1, vehicle: 1, veh: 1, the: 1, of: 1, location: 1, position: 1, pos: 1, geo: 1, gps: 1, data: 1, info: 1, 0: 1 };
  var CANON = {}; SYN.forEach(function (g) { g.forEach(function (w) { CANON[w] = g[0]; }); });
  function words(name) { return String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(function (w) { return CANON[w] || w; }); }
  function nameScore(src, tgt) {
    var leaf = String(src).split('.').pop(), a = words(leaf), b = words(tgt), parents = words(String(src).split('.').slice(0, -1).join(' '));
    var a2 = a.filter(function (w) { return !NOISE[w]; }), b2 = b.filter(function (w) { return !NOISE[w]; }); if (a2.length) { a = a2; } if (b2.length) { b = b2; }
    var inter = a.filter(function (w) { return b.indexOf(w) >= 0; }).length, union = a.length + b.length - inter, s = union ? inter / union : 0;
    if (parents.some(function (w) { return b.indexOf(w) >= 0; })) { s += 0.15; }
    if (a.join('') === b.join('')) { s = 1; }
    return Math.min(1, s);
  }
  var NUMERIC = { integer: 1, number: 1 };
  function typeFit(st, tt) { return st === tt ? 0.12 : NUMERIC[st] && NUMERIC[tt] ? 0.1 : tt === 'string' ? 0.03 : (tt === 'datetime' && (st === 'string' || st === 'integer')) || (NUMERIC[tt] && st === 'string') ? 0 : -0.2; }
  // The transformation most likely needed to turn this source field into this target field.
  function suggestTransform(sf, tf, samples) {
    var args;
    if (tf.type === 'datetime') { return { transform: 'dateFormat', args: defaultArgs('dateFormat') }; }
    if (tf['enum']) {
      var lines = []; (samples || []).forEach(function (v) {
        if (empty(v)) { return; } var hit = tf['enum'].filter(function (e) { return e.toLowerCase() === String(v).toLowerCase() || e.toLowerCase().indexOf(String(v).toLowerCase()) === 0; })[0];
        var line = v + '=' + (hit || ''); if (lines.indexOf(line) < 0 && lines.length < 12) { lines.push(line); }
      });
      return { transform: 'lookup', args: { table: lines.join('\n'), fallback: tf['enum'].indexOf('Unknown') >= 0 ? 'Unknown' : '' } };
    }
    if (NUMERIC[tf.type]) {
      var nums = (samples || []).map(Number).filter(function (n) { return !isNaN(n); }), top = nums.length ? Math.max.apply(null, nums) : 0;
      if (tf.max === 1 && top > 1 && top <= 100) { args = defaultArgs('scale'); args.factor = 0.01; return { transform: 'scale', args: args }; }
      if (tf.type === 'integer') { return sf.type === 'integer' ? { transform: 'direct', args: {} } : { transform: 'toInteger', args: {} }; }
      return sf.type === 'number' || sf.type === 'integer' ? { transform: 'direct', args: {} } : { transform: 'toDecimal', args: defaultArgs('toDecimal') };
    }
    if (tf.type === 'boolean') { return sf.type === 'boolean' ? { transform: 'direct', args: {} } : { transform: 'toBoolean', args: {} }; }
    if (tf.type === 'string') { return tf.format === 'upper' ? { transform: 'uppercase', args: {} } : sf.type === 'string' ? { transform: 'direct', args: {} } : { transform: 'toString', args: {} }; }
    return { transform: 'direct', args: {} };
  }
  // Suggested rules for unmapped target fields. Every suggestion needs a person to accept it.
  function suggest(schema, entity, rules, records) {
    var taken = {}, pairs = [], out = [], usedSrc = {};
    (rules || []).forEach(function (r) { taken[r.targetPath] = true; });
    (schema || []).forEach(function (sf) {
      if (sf.type === 'object' || sf.type === 'array') { return; }
      (entity.fields || []).forEach(function (tf) {
        if (taken[tf.name]) { return; }
        var s = nameScore(sf.path, tf.name); if (s < 0.34) { return; }
        pairs.push({ sf: sf, tf: tf, score: Math.max(0, Math.min(1, s * 0.88 + typeFit(sf.type, tf.type))) });
      });
    });
    pairs.sort(function (a, b) { return b.score - a.score; });
    pairs.forEach(function (p) {
      if (p.score < 0.45 || taken[p.tf.name] || usedSrc[p.sf.path]) { return; }
      taken[p.tf.name] = true; usedSrc[p.sf.path] = true;
      var samples = (records || []).slice(0, 50).map(function (r) { return get(r, p.sf.path); }), st = suggestTransform(p.sf, p.tf, samples);
      out.push({ sourcePath: p.sf.path, targetPath: p.tf.name, transform: st.transform, args: st.args, required: !!p.tf.required, score: Math.round(p.score * 100) / 100,
        reason: (p.score >= 0.85 ? 'Names match' : 'Names are similar') + (p.sf.type === p.tf.type ? ', same type' : '') });
    });
    return out;
  }

  /* ---------- schema change (drift) detection ---------- */
  function drift(before, after) {
    var a = {}, b = {}, added = [], removed = [], changed = [], renamed = [];
    (before || []).forEach(function (f) { a[f.path] = f; }); (after || []).forEach(function (f) { b[f.path] = f; });
    Object.keys(b).forEach(function (p) { if (!a[p]) { added.push(b[p]); } else if (a[p].type !== b[p].type) { changed.push({ path: p, from: a[p].type, to: b[p].type }); } });
    Object.keys(a).forEach(function (p) { if (!b[p]) { removed.push(a[p]); } });
    // A removed field and an added field of the same type with a similar name are reported as a likely rename.
    removed.slice().forEach(function (r) {
      var best = null, bs = 0;
      added.forEach(function (ad) { var s = nameScore(r.path, ad.path.split('.').pop()) + (String(r.sample) === String(ad.sample) && !empty(r.sample) ? 0.5 : 0); if (ad.type === r.type && s > bs) { bs = s; best = ad; } });
      if (best && bs >= 0.5) { renamed.push({ from: r.path, to: best.path }); removed.splice(removed.indexOf(r), 1); added.splice(added.indexOf(best), 1); }
    });
    return { added: added, removed: removed, changed: changed, renamed: renamed, any: !!(added.length || removed.length || changed.length || renamed.length) };
  }
  // Rules whose source fields no longer exist in the schema.
  function brokenRules(rules, schema) {
    var have = {}; (schema || []).forEach(function (f) { have[f.path] = true; });
    return (rules || []).filter(function (r) { return [r.sourcePath].concat(r.sources || []).some(function (p) { return p && !have[p]; }); });
  }

  // The mapping in the shape of the backend contract (MappingRuleInput): sourcePath, targetPath, transform, required.
  function toContract(rules) {
    return (rules || []).map(function (r) {
      var o = { sourcePath: r.sourcePath || null, targetPath: r.targetPath, transform: r.transform || 'direct', required: !!r.required };
      if (r.sources && r.sources.length) { o.additionalSourcePaths = r.sources.slice(); }
      if (r.args && Object.keys(r.args).length) { o.transformArgs = r.args; }
      if (!empty(r.defaultValue)) { o.defaultValue = r.defaultValue; }
      return o;
    });
  }

  var api = { typeOf: typeOf, get: get, set: set, empty: empty, parseCSV: parseCSV, parseXML: parseXML, findRecords: findRecords, parsePayload: parsePayload, sniff: sniff, discover: discover,
    parseDate: parseDate, compile: compile, TRANSFORMS: TRANSFORMS, transform: transform, defaultArgs: defaultArgs, applyRule: applyRule, apply: apply, validate: validate, test: test,
    checkMapping: checkMapping, suggest: suggest, suggestTransform: suggestTransform, nameScore: nameScore, drift: drift, brokenRules: brokenRules, toContract: toContract };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; } else { root.IntelliTwinMapping = api; }
})(typeof window !== 'undefined' ? window : this);
