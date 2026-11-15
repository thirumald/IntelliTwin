/* IntelliTwin field devices: CCTV cameras, detectors, message signs, signals and the camera view.
 *
 * Unless real devices are listed in config.js, the devices are SYNTHETIC: the app places them on
 * busy roads, and their readings come from the synthetic traffic. A camera with a "stream" in
 * config.js plays that video; a camera without one shows a synthetic view drawn from the traffic
 * on its road, labelled as synthetic.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num, clock = C.clock, state = T.state;
  var cams = [], dets = [], signs = [], show = { cams: true, det: false, vms: true, sig: true };
  var KX = 111320 * Math.cos(24.45 * Math.PI / 180), KY = 110570;
  function dist(a, b) { return Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY); }
  function mid(e) { return e.path[e.path.length >> 1]; }

  // Busiest links of the wanted classes, kept at least minDist metres apart.
  function pick(maxClass, count, minDist, taken) {
    var edges = C.edges(), names = C.names(), bin = C.day().map[96], cand = [];       // 08:00 slot
    for (var i = 0; i < edges.length; i++) { var e = edges[i]; if (e.c <= maxClass && !e.k && names[e.n] && e.m >= 120) { cand.push([C.occAt(bin, i) / e.m, i]); } }
    cand.sort(function (a, b) { return b[0] - a[0]; });
    var out = [], pts = (taken || []).slice();
    for (var k = 0; k < cand.length && out.length < count; k++) {
      var p = mid(edges[cand[k][1]]), ok = true;
      for (var j = 0; j < pts.length; j++) { if (dist(p, pts[j]) < minDist) { ok = false; break; } }
      if (ok) { out.push(cand[k][1]); pts.push(p); }
    }
    return out;
  }
  function nearestEdge(lon, lat) {
    var edges = C.edges(), best = 0, bd = Infinity;
    for (var i = 0; i < edges.length; i++) { var d = dist(mid(edges[i]), [lon, lat]); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function reading(ei) {
    var e = C.edges()[ei], r = C.ratio(ei), occ = C.occ(ei), speed = e.s * r;
    return { speed: speed, vehicles: occ, flow: occ ? occ * (speed / 3.6) / e.m * 3600 : 0, density: occ / (e.m / 1000) / e.l, ratio: r, edge: e };
  }

  function setup() {
    var edges = C.edges(), names = C.names();
    if (CFG.devices.cameras.length) {
      cams = CFG.devices.cameras.map(function (c, i) { return { id: c.id || 'CAM-' + (i + 1), name: c.name || 'Camera ' + (i + 1), lon: c.lon, lat: c.lat, stream: c.stream || null, edge: nearestEdge(c.lon, c.lat), real: true }; });
    } else {
      cams = pick(2, CFG.devices.syntheticCameras, 900).map(function (ei, i) { var p = mid(edges[ei]); return { id: 'CAM-' + String(i + 1).padStart(3, '0'), name: names[edges[ei].n], lon: p[0], lat: p[1], stream: null, edge: ei, real: false }; });
    }
    dets = pick(3, CFG.devices.syntheticDetectors, 600).map(function (ei, i) { var p = mid(edges[ei]); return { id: 'DET-' + String(i + 1).padStart(3, '0'), name: names[edges[ei].n], lon: p[0], lat: p[1], edge: ei }; });
    signs = pick(1, CFG.devices.syntheticSigns, 2500).map(function (ei, i) { var p = mid(edges[ei]); return { id: 'VMS-' + String(i + 1).padStart(2, '0'), name: names[edges[ei].n], lon: p[0], lat: p[1], edge: ei }; });
  }

  function signMessage(s) {
    var e = C.eventTotals(state.scenario, state.t), near = e ? e.active.filter(function (a) { return dist([a.lon, a.lat], [s.lon, s.lat]) < 4000; })[0] : null;
    if (near) { return { text: 'ACCIDENT AHEAD · ' + near.road.toUpperCase(), level: 'severe' }; }
    var r = reading(s.edge);
    if (r.ratio < 0.5) { return { text: 'CONGESTION · ' + Math.round(r.speed) + ' KM/H · EXPECT DELAYS', level: 'heavy' }; }
    if (r.ratio < 0.75) { return { text: 'SLOW TRAFFIC AHEAD', level: 'moderate' }; }
    return { text: 'DRIVE SAFELY · KEEP A SAFE DISTANCE', level: 'free' };
  }

  /* ---------- map layers ---------- */
  function hash01(i) { var h = Math.imul(i + 11, 2654435761) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
  function layers(ctx) {
    var out = [];
    function dots(id, data, color, radius, onClick) {
      return new deck.ScatterplotLayer({
        id: id, data: data, pickable: true, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels',
        getPosition: function (d) { return [d.lon, d.lat]; }, getRadius: radius, getFillColor: color, getLineColor: [8, 14, 26], getLineWidth: 1.5,
        onClick: function (info) { if (info.object) { onClick(info.object); } }
      });
    }
    if (show.det && ctx.zoom >= 11.5) { out.push(dots('detectors', dets, [140, 210, 190, 230], 4, detPopup)); }
    if (show.vms && ctx.zoom >= 10.5) { out.push(dots('signs', signs, [255, 190, 60, 245], 6, vmsPopup)); }
    if (show.cams) {
      // Cameras stay visible at every zoom and are drawn larger, with a white ring, so they are easy to click.
      var camLayer = dots('cameras', cams, [70, 200, 255, 255], ctx.zoom >= 13 ? 9 : 7, camPopup);
      out.push(camLayer.clone({ getLineColor: [255, 255, 255], getLineWidth: 2 }));
    }
    var sig = C.signals();
    if (show.sig && sig && ctx.zoom >= 13.5) {
      var cyc = CFG.devices.signalCycleSeconds, sec = Math.floor(state.t);
      out.push(new deck.ScatterplotLayer({
        id: 'signals', data: sig, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getLineColor: [10, 10, 10], getLineWidth: 1, getRadius: 4.5,
        getPosition: function (p) { return p; },
        getFillColor: function (p, info) { var ph = ((sec + hash01(info.index) * cyc) % cyc) / cyc; return ph < 0.45 ? [60, 220, 120] : ph < 0.5 ? [250, 200, 60] : [235, 70, 80]; },
        updateTriggers: { getFillColor: sec }
      }));
    }
    return out;
  }

  /* ---------- popups ---------- */
  function detPopup(d) {
    var r = reading(d.edge);
    C.showPopup([d.lon, d.lat], d.id + ' · ' + d.name, [['Flow', num(r.flow) + ' veh/h'], ['Speed', Math.round(r.speed) + ' km/h'], ['Vehicles on link', r.vehicles.toFixed(r.vehicles < 10 ? 1 : 0)], ['Lanes', r.edge.l]],
      'Synthetic detector · reading at ' + clock(state.t));
  }
  function vmsPopup(s) {
    var m = signMessage(s);
    C.showPopup([s.lon, s.lat], s.id + ' · ' + s.name, [['Message', m.text]], 'Synthetic message sign · set from the synthetic traffic');
  }
  function camPopup(c) {
    var r = reading(c.edge), allowed = !T.ops || T.ops.can('video');
    var box = C.showPopup([c.lon, c.lat], c.id + ' · ' + c.name, [['Speed', Math.round(r.speed) + ' km/h'], ['Flow', num(r.flow) + ' veh/h'], ['Feed', c.stream ? 'Video stream' : (CFG.devices.sampleVideos || []).length ? 'Sample footage' : 'Synthetic view']],
      c.real ? 'Camera from config.js' : 'Synthetic camera position');
    // Clicking a camera opens its video straight away; the button reopens it after closing.
    if (allowed) { openVideo(c); }
    if (box && allowed) {
      var b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Open camera view'; b.style.marginTop = '8px';
      b.addEventListener('click', function () { openVideo(c); });
      box.appendChild(b);
    }
  }

  /* ---------- camera view ---------- */
  var open = null, raf = 0, lanes = [];
  function closeVideo() { open = null; cancelAnimationFrame(raf); $('video').hidden = true; $('videoBody').innerHTML = ''; }
  // Synthetic camera view, drawn from the synthetic traffic on the camera's road.
  function synthetic(c, body, why) {
    var cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; body.appendChild(cv);
    $('videoSub').textContent = 'Synthetic view';
    $('videoNote').textContent = why + 'This view is drawn from the synthetic traffic on its road; it is not footage.';
    lanes = [];
    var lastT = performance.now();
    var loop = function (now) { if (open !== c) { return; } draw(cv, c, Math.min((now - lastT) / 1000, 0.1)); lastT = now; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }
  function openVideo(c) {
    if (T.ops && !T.ops.can('video')) { return; }
    closeVideo();
    open = c;
    $('video').hidden = false;
    $('videoTitle').textContent = c.id + ' · ' + c.name;
    var body = $('videoBody'), s = c.stream;
    if (s && s.indexOf('iframe:') === 0) {
      var f = document.createElement('iframe'); f.src = s.slice(7); f.allow = 'autoplay; fullscreen'; f.setAttribute('allowfullscreen', ''); f.title = c.name; body.appendChild(f);
      $('videoSub').textContent = 'Embedded player'; $('videoNote').textContent = 'Stream configured in config.js.';
    } else if (s) {
      var v = document.createElement('video'); v.controls = true; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true; body.appendChild(v);
      $('videoSub').textContent = 'Video stream'; $('videoNote').textContent = 'Stream configured in config.js.';
      var isHls = /\.m3u8(\?|$)/.test(s);
      if (isHls && !v.canPlayType('application/vnd.apple.mpegurl') && CFG.devices.hlsScript) {
        var sc = document.createElement('script'); sc.src = CFG.devices.hlsScript;
        sc.onload = function () { if (window.Hls && window.Hls.isSupported()) { var h = new window.Hls(); h.loadSource(s); h.attachMedia(v); } };
        document.head.appendChild(sc);
      } else { v.src = s; }
      v.addEventListener('error', function () { $('videoNote').textContent = 'The stream could not be played in this browser. For HLS streams set devices.hlsScript in config.js.'; });
    } else {
      var samples = CFG.devices.sampleVideos || [], idx = cams.indexOf(c), sample = samples.length ? samples[Math.max(0, idx) % samples.length] : null;
      if (sample) {
        // Real traffic footage as a stand-in: the clip is not this camera's feed, and the window says so.
        var sv = document.createElement('video'); sv.controls = true; sv.autoplay = true; sv.muted = true; sv.loop = true; sv.playsInline = true;
        sample.sources.forEach(function (u) { var so = document.createElement('source'); so.src = u; sv.appendChild(so); });
        body.appendChild(sv);
        $('videoSub').textContent = 'Sample footage · not this camera';
        $('videoNote').textContent = 'Real traffic footage used as a stand-in until this camera has a stream in config.js. It is not Abu Dhabi and not this camera\u2019s feed. ' + sample.credit + '.';
        var failed = false, giveUp = function () {
          if (failed || open !== c) { return; }
          failed = true; body.innerHTML = ''; synthetic(c, body, 'The sample footage could not be played in this browser. ');
        };
        sv.addEventListener('error', giveUp);
        // Give up as well if nothing can be shown after 12 seconds (blocked or very slow network).
        setTimeout(function () { if (open === c && sv.readyState < 2) { giveUp(); } }, 12000);
        sv.lastElementChild.addEventListener('error', giveUp);       // the last source failing means none could be played
      } else { synthetic(c, body, 'No video stream is configured for this camera. '); }
    }
    if (T.audit) { T.audit('Camera view: ' + c.id); }
  }
  var PAINT = ['#f0f0f0', '#f0f0f0', '#c4c8ce', '#30333a', '#8b1e24', '#24468c', '#b09670'];
  function draw(cv, c, dt) {
    var g = cv.getContext('2d'), W = cv.width, H = cv.height, r = reading(c.edge), nl = Math.min(4, r.edge.l), hz = H * 0.3, VIEW = 170;
    var night = state.t < 5.5 * 3600 || state.t > 18.75 * 3600;
    g.fillStyle = night ? '#0a0f1c' : '#9fb7cf'; g.fillRect(0, 0, W, hz);
    g.fillStyle = night ? '#10161f' : '#b9a986'; g.fillRect(0, hz, W, H - hz);
    function px(z, lanePos) { var k = Math.pow(z, 1.9), half = 26 + (W * 0.46 - 26) * k; return [W / 2 + (lanePos * 2 - 1) * half, hz + (H - hz) * k, 0.12 + 0.88 * k]; }
    g.fillStyle = night ? '#1b212c' : '#3b4048';
    g.beginPath(); var a = px(0, 0), b = px(0, 1), d = px(1, 1), e2 = px(1, 0); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(d[0], d[1]); g.lineTo(e2[0], e2[1]); g.fill();
    var speed = r.speed / 3.6, dash = (performance.now() / 1000 * speed / VIEW) % 0.12;
    g.strokeStyle = 'rgba(255,255,255,.75)';
    for (var l = 1; l < nl; l++) {
      for (var z = dash; z < 1; z += 0.12) { var p0 = px(z, l / nl), p1 = px(Math.min(1, z + 0.05), l / nl); g.lineWidth = 1 + 3 * p1[2]; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
    }
    // Vehicles: as many per lane as the road's density implies over the visible stretch.
    var perLane = Math.max(0, Math.min(14, r.density * VIEW / 1000));
    for (var li = 0; li < nl; li++) {
      var arr = lanes[li] = lanes[li] || [], want = Math.floor(perLane) + (((li * 7919) % 10) / 10 < perLane % 1 ? 1 : 0);
      while (arr.length < want) { arr.push({ z: Math.random(), c: PAINT[Math.floor(Math.random() * PAINT.length)] }); }
      while (arr.length > want) { arr.pop(); }
      arr.forEach(function (car) { car.z += speed * dt / VIEW; if (car.z > 1.05) { car.z = 0; car.c = PAINT[Math.floor(Math.random() * PAINT.length)]; } });
      arr.slice().sort(function (x, y) { return x.z - y.z; }).forEach(function (car) {
        var p = px(Math.max(0, car.z), (li + 0.5) / nl), w = 58 * p[2], h = 44 * p[2];
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(p[0] - w / 2, p[1] - h * 0.12, w, h * 0.2);
        g.fillStyle = car.c; g.fillRect(p[0] - w / 2, p[1] - h, w, h * 0.9);
        g.fillStyle = 'rgba(20,28,40,.85)'; g.fillRect(p[0] - w * 0.38, p[1] - h * 0.92, w * 0.76, h * 0.34);
        if (night) { g.fillStyle = '#ffe9a8'; g.fillRect(p[0] - w * 0.42, p[1] - h * 0.42, w * 0.16, h * 0.12); g.fillRect(p[0] + w * 0.26, p[1] - h * 0.42, w * 0.16, h * 0.12); }
      });
    }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, 26); g.fillRect(0, H - 26, W, 26);
    g.fillStyle = '#fff'; g.font = '13px ui-monospace, Menlo, monospace'; g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText(c.id + '  ' + c.name.slice(0, 34), 8, 13);
    g.textAlign = 'right'; g.fillText(state.date + ' ' + clock(state.t), W - 8, 13);
    g.textAlign = 'left'; g.fillStyle = '#ffd866'; g.fillText('SYNTHETIC VIEW · NOT FOOTAGE', 8, H - 13);
    g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText(Math.round(r.speed) + ' km/h · ' + num(r.flow) + ' veh/h', W - 8, H - 13);
  }

  /* ---------- Devices tab ---------- */
  function renderTab() {
    var sig = C.signals(), streams = cams.filter(function (c) { return c.stream; }).length;
    $('devFacts').innerHTML =
      C.fact('CCTV cameras', cams.length && cams[0].real ? 'from config.js' : 'synthetic positions', cams.length + ' · ' + streams + ' with video') +
      C.fact('Enforcement cameras', 'synthetic sites', (C.events() ? C.events().sites.length : 0)) +
      C.fact('Detectors', 'synthetic positions', dets.length) + C.fact('Message signs', 'synthetic positions', signs.length) +
      C.fact('Traffic signals', sig ? 'positions from OpenStreetMap; generic cycle' : 'positions arrive with the next data build', sig ? sig.length : '–');
    var cl = $('camList'); cl.innerHTML = '';
    cams.map(function (c) { return { c: c, r: reading(c.edge) }; }).sort(function (a, b) { return a.r.ratio - b.r.ratio; }).slice(0, 10).forEach(function (row) {
      cl.appendChild(C.listButton(C.level(row.r.ratio), row.c.id + ' · ' + row.c.name, (row.c.stream ? 'Video stream' : (CFG.devices.sampleVideos || []).length ? 'Sample footage' : 'Synthetic view') + ' · ' + num(row.r.flow) + ' veh/h',
        Math.round(row.r.speed) + '<small>km/h</small>', function () { C.flyTo(row.c.lon, row.c.lat, 15); openVideo(row.c); }));
    });
    var vl = $('vmsList'); vl.innerHTML = '';
    signs.forEach(function (s) { var m = signMessage(s); vl.appendChild(C.listButton(m.level, s.id + ' · ' + s.name, m.text, '', function () { C.flyTo(s.lon, s.lat, 14); vmsPopup(s); })); });
  }

  T.devices = { cameras: function () { return cams; }, signs: function () { return signs; }, openCamera: function (name) {
    var q = String(name || '').toLowerCase(), c = cams.filter(function (x) { return x.id.toLowerCase() === q || x.name.toLowerCase().indexOf(q) >= 0; })[0] || cams[0];
    if (c) { C.flyTo(c.lon, c.lat, 15); openVideo(c); } return c || null; } };

  C.onReady(function () {
    setup();
    C.addLayers(layers);
    [['showCams', 'cams'], ['showDet', 'det'], ['showVms', 'vms'], ['showSig', 'sig']].forEach(function (p) {
      $(p[0]).addEventListener('change', function (e) { show[p[1]] = e.target.checked; C.redraw(); });
    });
    $('videoClose').addEventListener('click', closeVideo);
    renderTab();
    C.onMinute(renderTab);
  });
})();
