/* IntelliTwin platform monitoring: data ingestion and infrastructure.
 *
 * This static demonstrator has no servers or live feeds behind it, so every figure here is SYNTHETIC:
 * an example of the monitoring view a deployed platform would have. Rates follow the synthetic traffic
 * so the picture stays consistent with the map. See docs/platform-monitoring.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, state = T.state, K = T.kit, rnd = K.rnd, hashStr = K.hashStr, esc = K.esc;
  var P = CFG.platform || {}, hist = {}, timer = null, N = 60;
  function wob(key, t, amp) { var s = hashStr(key); return 1 + amp * (0.6 * Math.sin(t / (17 + s % 23) + s % 7) + 0.4 * (rnd(s, Math.floor(t / 4)) - 0.5) * 2); }
  function push(key, v) { var h = hist[key] = hist[key] || []; h.push(v); if (h.length > N) { h.shift(); } return h; }

  // One sample of the whole platform at wall-clock second `now`.
  function sample(now) {
    var k = C.kpiAt(state.scenario, state.t) || {}, veh = k.vehicles || 20000, load = Math.min(1.6, 0.35 + veh / 45000);
    // Integrations published in the Integration Studio join the platform's own example feeds.
    var feeds = (P.feeds || []).concat(T.integrations ? T.integrations.feeds() : []).map(function (f, i) {
      var bucket = Math.floor(now / 300), r = rnd(hashStr(f.name), bucket), st = r < (f.faultRate || 0.03) ? 'down' : r < (f.faultRate || 0.03) + 0.07 ? 'delayed' : 'ok';
      var rate = st === 'down' ? 0 : f.perSec * (f.followsTraffic ? load : 1) * wob(f.name, now, 0.12) * (st === 'delayed' ? 0.55 : 1);
      var lag = st === 'down' ? null : (f.lagMs || 400) * wob(f.name + 'lag', now, 0.25) * (st === 'delayed' ? 9 : 1);
      return { f: f, status: st, rate: rate, lag: lag, errors: st === 'ok' ? 0.02 + 0.1 * rnd(hashStr(f.name), bucket + 9) : st === 'delayed' ? 1.5 + 3 * rnd(hashStr(f.name), bucket + 9) : 100, last: st === 'down' ? Math.round(30 + (now % 300)) : Math.round(lag / 1000) };
    });
    var total = feeds.reduce(function (s, f) { return s + f.rate; }, 0), okFeeds = feeds.filter(function (f) { return f.status === 'ok'; }).length;
    var nodes = (P.nodes || []).map(function (n) {
      var cpu = Math.min(98, n.cpu * (n.followsLoad ? 0.55 + 0.6 * load : 1) * wob(n.name + 'c', now, 0.15)), mem = Math.min(97, n.mem * wob(n.name + 'm', now, 0.04));
      var gpu = n.gpu ? Math.min(99, n.gpu * (0.6 + 0.5 * load) * wob(n.name + 'g', now, 0.1)) : null, disk = Math.min(96, n.disk + (now % 86400) / 86400 * 0.4);
      return { n: n, cpu: cpu, mem: mem, gpu: gpu, disk: disk, status: cpu > 90 || mem > 92 || disk > 90 ? 'warn' : 'ok' };
    });
    var services = (P.services || []).map(function (sv) {
      var r = rnd(hashStr(sv.name), Math.floor(now / 600)), st = r < 0.02 ? 'down' : r < 0.07 ? 'degraded' : 'ok';
      return { sv: sv, status: st, ms: Math.round(sv.ms * wob(sv.name, now, 0.2) * (st === 'degraded' ? 4 : 1)), uptime: 99.99 - 0.6 * rnd(hashStr(sv.name), 3) };
    });
    var latency = (P.pipelineMs || 900) * wob('pipeline', now, 0.18) * (0.8 + 0.4 * load), queue = Math.max(0, Math.round((P.queueBase || 1200) * load * wob('queue', now, 0.35) * (okFeeds < feeds.length ? 1.8 : 1)));
    var gpus = nodes.filter(function (n) { return n.gpu !== null; }), gpuAvg = gpus.length ? gpus.reduce(function (s, n) { return s + n.gpu; }, 0) / gpus.length : null;
    var st = P.storage || { totalTb: 480, usedTb: 301, perDayTb: 1.9 };
    return { feeds: feeds, nodes: nodes, services: services, total: total, okFeeds: okFeeds, latency: latency, queue: queue, gpu: gpuAvg, storage: st, daysLeft: Math.floor((st.totalTb - st.usedTb) / st.perDayTb),
      cpuAvg: nodes.length ? nodes.reduce(function (s, n) { return s + n.cpu; }, 0) / nodes.length : 0 };
  }

  function spark(id, data, colour) {
    var cv = $(id); if (!cv || data.length < 2) { return; }
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) { return; }
    cv.width = w * dpr; cv.height = h * dpr; var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data), span = (max - min) || 1, x = function (i) { return i / (N - 1) * w; }, y = function (v) { return h - 3 - (v - min) / span * (h - 6); };
    var off = N - data.length; g.beginPath(); data.forEach(function (v, i) { if (i) { g.lineTo(x(i + off), y(v)); } else { g.moveTo(x(i + off), y(v)); } });
    g.strokeStyle = colour; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = colour; g.beginPath(); g.arc(x(N - 1), y(data[data.length - 1]), 3, 0, Math.PI * 2); g.fill();
  }
  var LABEL = { ok: ['free', 'Healthy'], delayed: ['heavy', 'Delayed'], degraded: ['heavy', 'Degraded'], warn: ['heavy', 'High load'], down: ['severe', 'Not receiving'] };
  function bar(label, v, unit) { return C.barRow(label, Math.round(v) + (unit || '%'), '', Math.min(1, v / 100)); }

  function tick() {
    if (!K.tabOpen('sys')) { stop(); return; }
    var now = Date.now() / 1000, s = sample(now), accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#3987e5';
    $('syRate').innerHTML = num(Math.round(s.total)) + '<small>/s</small>'; $('syLatency').innerHTML = (s.latency / 1000).toFixed(2) + '<small>s</small>';
    $('syFeeds').textContent = s.okFeeds + ' of ' + s.feeds.length; $('syQueue').textContent = num(s.queue);
    $('syCpu').innerHTML = Math.round(s.cpuAvg) + '<small>%</small>'; $('syGpu').innerHTML = s.gpu === null ? '–' : Math.round(s.gpu) + '<small>%</small>';
    spark('spRate', push('rate', s.total), accent); spark('spLatency', push('lat', s.latency), accent); spark('spQueue', push('queue', s.queue), accent); spark('spCpu', push('cpu', s.cpuAvg), accent); if (s.gpu !== null) { spark('spGpu', push('gpu', s.gpu), accent); }
    $('syClock').textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { timeZone: (CFG.time || {}).timeZone || 'Asia/Dubai', hour12: false }) + ' · every 2 s';
    var fl = $('syFeedList'); fl.innerHTML = '';
    s.feeds.forEach(function (f) {
      var L = LABEL[f.status];
      fl.appendChild(C.listButton(L[0], f.f.name, L[1] + ' · ' + esc(f.f.source) + ' · ' + (f.status === 'down' ? 'last message ' + f.last + ' s ago' : 'lag ' + (f.lag >= 1000 ? (f.lag / 1000).toFixed(1) + ' s' : Math.round(f.lag) + ' ms') + ' · errors ' + f.errors.toFixed(2) + '%'), num(Math.round(f.rate)) + '<small>/s</small>', function () {}));
    });
    $('syNodes').innerHTML = s.nodes.map(function (n) {
      return '<div class="sy-node"><div class="sy-node-head"><strong>' + esc(n.n.name) + '</strong><span>' + esc(n.n.role) + ' · ' + LABEL[n.status][1] + '</span></div>' + bar('CPU', n.cpu) + bar('Memory', n.mem) + (n.gpu !== null ? bar('GPU', n.gpu) : '') + bar('Disk', n.disk) + '</div>';
    }).join('');
    var sl = $('sySvc'); sl.innerHTML = '';
    s.services.forEach(function (v) { var L = LABEL[v.status]; sl.appendChild(C.listButton(L[0], v.sv.name, L[1] + ' · 30-day uptime ' + v.uptime.toFixed(2) + '%', v.status === 'down' ? '–' : v.ms + '<small>ms</small>', function () {})); });
    $('syStore').innerHTML = C.fact('Storage used', 'video, events and history', s.storage.usedTb + ' of ' + s.storage.totalTb + ' TB') + C.fact('Growth', 'at the current intake', s.storage.perDayTb + ' TB a day') + C.fact('Full in', 'without clean-up', s.daysLeft + ' days') +
      C.fact('Video retention', 'policy', (P.retentionDays || 30) + ' days') + C.fact('Last backup', 'nightly', 'Today 02:00, completed');
    var issues = s.feeds.filter(function (f) { return f.status !== 'ok'; }).map(function (f) { return f.f.name + ': ' + LABEL[f.status][1].toLowerCase(); }).concat(s.services.filter(function (v) { return v.status !== 'ok'; }).map(function (v) { return v.sv.name + ': ' + LABEL[v.status][1].toLowerCase(); })).concat(s.nodes.filter(function (n) { return n.status !== 'ok'; }).map(function (n) { return n.n.name + ': high load'; }));
    if (s.daysLeft < 120) { issues.push('Storage full in ' + s.daysLeft + ' days'); }
    $('syIssues').innerHTML = issues.length ? issues.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') : '<li class="muted">No open platform issues.</li>';
    $('syHealth').textContent = issues.length ? issues.length + ' to check' : 'All healthy';
  }
  // Fill the last two minutes on opening so the small charts are complete from the start.
  function backfill() {
    var now = Date.now() / 1000; hist = {};
    for (var i = N - 1; i >= 1; i--) { var s = sample(now - i * 2); push('rate', s.total); push('lat', s.latency); push('queue', s.queue); push('cpu', s.cpuAvg); if (s.gpu !== null) { push('gpu', s.gpu); } }
  }
  function start() { if (!timer) { backfill(); tick(); timer = setInterval(tick, 2000); } }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  C.onReady(function () { C.onTab(function (id) { if (id === 'sys') { start(); } else { stop(); } }); });
  T.platform = { sample: function () { return sample(Date.now() / 1000); } };
})();
