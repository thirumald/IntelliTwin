/* IntelliTwin vision-language model (VLM) sample.
 *
 * Adds a "Scene analysis" block to the camera window: a description of the scene, structured findings
 * and questions about the camera view.
 *
 * Without a model service, the text is a SAMPLE written from the twin's synthetic data for that camera
 * (vehicles, speed, events, weather). No model has looked at the video, and the block says so.
 * With api.vlmUrl set in config.js, the current video frame and the question are sent to that service
 * and its answer is shown instead. See docs/vlm.md.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, state = T.state, K = T.kit, esc = K.esc, cam = null;
  var QUESTIONS = ['Describe the scene', 'Is any vehicle stopped?', 'How busy is the road?', 'Any pedestrians on the road?', 'What is the visibility?'];

  function facts(c) {
    var e = C.edges()[c.edge] || {}, veh = Math.round(C.occ(c.edge) || 0), ratio = C.ratio(c.edge), speed = Math.round((e.s || 60) * (veh ? ratio : 1)), h = state.t / 3600;
    var ev = T.ops ? T.ops.events().filter(function (x) { return x.cam && x.cam.id === c.id && !/offline/i.test(x.type.text); }) : [], wx = T.weather ? T.weather.now() : null;
    var flow = !veh ? 'empty' : ratio >= 0.8 ? 'free-flowing' : ratio >= 0.55 ? 'steady' : ratio >= 0.35 ? 'slow' : 'queuing';
    var mix = window.TwinCars.MIX, mt = window.TwinCars.mixTotal, share = function (id) { var m = mix.filter(function (x) { return x.id === id; })[0]; return m ? m.share / mt : 0; };
    return { camera: c.id, road: c.name, time: C.clock(state.t), light: h >= 6.3 && h < 17.8 ? 'daylight' : h >= 5.6 && h < 18.6 ? 'low sun' : 'night, street lighting', vehicles: veh, speed_kmh: speed, speed_limit_kmh: e.s || null, flow: flow,
      lorries: Math.round(veh * share('lorry')), buses: Math.round(veh * share('bus')), events: ev.map(function (x) { return x.type.text; }), weather: wx ? wx.k.label.toLowerCase() : 'clear', visibility_m: wx ? wx.vis : 10000 };
  }
  function describe(f) {
    var s = 'A ' + (f.speed_limit_kmh >= 100 ? 'multi-lane motorway' : f.speed_limit_kmh >= 70 ? 'main road' : 'city street') + ' in ' + f.light + '. ';
    s += !f.vehicles ? 'No vehicles are in view. ' : 'About ' + f.vehicles + ' vehicles are in view and traffic is ' + f.flow + ' at roughly ' + f.speed_kmh + ' km/h' + (f.speed_limit_kmh ? ' (limit ' + f.speed_limit_kmh + ')' : '') + '. ';
    if (f.lorries || f.buses) { s += 'Heavy vehicles: ' + [f.lorries ? f.lorries + ' lorr' + (f.lorries > 1 ? 'ies' : 'y') : '', f.buses ? f.buses + ' bus' + (f.buses > 1 ? 'es' : '') : ''].filter(Boolean).join(' and ') + '. '; }
    s += f.events.length ? 'Attention: ' + f.events.join('; ').toLowerCase() + '. ' : 'Nothing unusual is visible. ';
    if (f.weather !== 'clear') { s += 'Conditions: ' + f.weather + ', visibility about ' + (f.visibility_m >= 1000 ? (f.visibility_m / 1000).toFixed(1) + ' km' : f.visibility_m + ' m') + '.'; }
    return s.trim();
  }
  function sampleAnswer(q, f) {
    q = q.toLowerCase();
    var has = function (re) { return f.events.filter(function (e) { return re.test(e); }).length > 0; };
    if (/describe|scene|what.*see|summar/.test(q)) { return describe(f); }
    if (/stop|broken|breakdown|stationary/.test(q)) { return has(/stopped|illegal stopping/i) ? 'Yes. A stopped vehicle is reported at this camera.' : 'No stopped vehicle is visible.'; }
    if (/busy|traffic|congest|queue|flow|how many|count/.test(q)) { return f.vehicles ? 'About ' + f.vehicles + ' vehicles in view; traffic is ' + f.flow + ' at roughly ' + f.speed_kmh + ' km/h.' : 'The road is empty.'; }
    if (/pedestrian|people|person|walking/.test(q)) { return has(/pedestrian/i) ? 'Yes. A pedestrian is on the carriageway.' : 'No pedestrians are on the carriageway.'; }
    if (/visib|weather|fog|rain|dust|sand/.test(q)) { return 'Conditions are ' + f.weather + '; visibility about ' + (f.visibility_m >= 1000 ? (f.visibility_m / 1000).toFixed(1) + ' km' : f.visibility_m + ' m') + '.'; }
    if (/wrong|debris|accident|incident|unusual|danger|hazard/.test(q)) { return f.events.length ? 'Reported at this camera: ' + f.events.join('; ').toLowerCase() + '.' : 'Nothing unusual is reported at this camera.'; }
    if (/lorr|truck|bus|heavy/.test(q)) { return 'Heavy vehicles in view: ' + f.lorries + ' lorries and ' + f.buses + ' buses.'; }
    return 'The sample cannot answer that. It covers the scene, stopped vehicles, traffic level, pedestrians, heavy vehicles, hazards and visibility. Connect a model service (api.vlmUrl) for free questions.';
  }
  function frame() {
    var v = $('videoBody').querySelector('video'); if (!v || !v.videoWidth) { return null; }
    try { var cv = document.createElement('canvas'), w = Math.min(640, v.videoWidth); cv.width = w; cv.height = Math.round(w * v.videoHeight / v.videoWidth); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', 0.7); } catch (e) { return null; }
  }
  function ask(q) {
    if (!cam) { return; }
    var f = facts(cam), url = CFG.api.vlmUrl, out = $('vlmAnswer');
    $('vlmQ').textContent = q;
    if (!url) { out.textContent = sampleAnswer(q, f); $('vlmSource').textContent = 'Sample answer from synthetic data. No model has analysed the video.'; return; }
    var img = frame();
    out.textContent = 'Asking the model service…'; $('vlmSource').textContent = '';
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, image: img, camera: { id: cam.id, name: cam.name }, context: f }) })
      .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.json(); })
      .then(function (j) { out.textContent = String(j.answer || 'The model service returned no answer.'); $('vlmSource').textContent = 'Answer from the configured model service' + (img ? ', using the current video frame.' : '; the frame could not be read, so only the context was sent.'); })
      .catch(function () { out.textContent = sampleAnswer(q, f); $('vlmSource').textContent = 'The model service could not be reached. Sample answer from synthetic data shown instead.'; });
    if (T.audit) { T.audit('VLM question at ' + cam.id); }
  }
  function render() {
    var id = ($('videoTitle').textContent.split(' · ')[0] || '').trim(), list = T.devices ? T.devices.cameras() : [];
    cam = $('video').hidden ? null : list.filter(function (c) { return c.id === id; })[0] || null;
    $('vlm').hidden = !cam; if (!cam) { return; }
    var f = facts(cam);
    $('vlmMode').textContent = CFG.api.vlmUrl ? 'Model service connected' : 'Sample output';
    $('vlmFind').innerHTML = [['Vehicles', f.vehicles], ['Flow', f.flow], ['Speed', f.speed_kmh + ' km/h'], ['Events', f.events.length || 'none'], ['Visibility', f.visibility_m >= 1000 ? (f.visibility_m / 1000).toFixed(0) + ' km' : f.visibility_m + ' m']].map(function (r) { return '<span><b>' + esc(r[1]) + '</b>' + r[0] + '</span>'; }).join('');
    $('vlmJson').textContent = JSON.stringify(f, null, 1);
    ask('Describe the scene');
  }

  C.onReady(function () {
    var box = document.createElement('div'); box.className = 'vlm'; box.id = 'vlm'; box.hidden = true;
    box.innerHTML = '<div class="vlm-head"><strong>Scene analysis · vision-language model</strong><span id="vlmMode"></span></div><div class="vlm-find" id="vlmFind"></div>' +
      '<p class="vlm-q" id="vlmQ"></p><p class="vlm-a" id="vlmAnswer"></p><p class="vlm-src" id="vlmSource"></p>' +
      '<div class="vlm-chips" id="vlmChips">' + QUESTIONS.map(function (q) { return '<button type="button">' + q + '</button>'; }).join('') + '</div>' +
      '<form id="vlmForm" autocomplete="off"><input id="vlmInput" type="text" placeholder="Ask about this camera view…" aria-label="Question about the camera view"><button class="btn small" type="submit">Ask</button></form>' +
      '<details><summary>Structured output</summary><pre id="vlmJson"></pre></details>';
    $('video').insertBefore(box, $('videoNote'));
    $('vlmChips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { ask(b.textContent); } });
    $('vlmForm').addEventListener('submit', function (e) { e.preventDefault(); var q = $('vlmInput').value.trim(); if (q) { ask(q); $('vlmInput').value = ''; } });
    new MutationObserver(render).observe($('video'), { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(render).observe($('videoTitle'), { childList: true, characterData: true, subtree: true });
  });
  T.vlm = { ask: ask, facts: function () { return cam ? facts(cam) : null; }, sample: sampleAnswer };
})();
