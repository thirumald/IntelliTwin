/* IntelliTwin assistant.
 *
 * A built-in agent that answers questions from the simulation data loaded in the page and can
 * operate the twin (fly to a site or road, change the demand case, jump to a time, open a view).
 * It is rule-based: it matches the question to a known intent. It is not a large language model.
 *
 * Optional: set api.assistantUrl in config.js to the URL of your own service to have questions the
 * built-in rules do not cover answered by a language model. The page POSTs { question, context }
 * as JSON and expects { answer }. Keep API keys on that service, never here. See docs/assistant.md.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function api() { return window.IntelliTwin && window.IntelliTwin.api; }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9+\-:% ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  function findByName(list, q) {
    var best = null, bestLen = 0;
    list.forEach(function (name) {
      var n = norm(name);
      if (n.length >= 3 && q.indexOf(n) >= 0 && n.length > bestLen) { best = name; bestLen = n.length; }
    });
    if (best) { return best; }
    // Otherwise match on the most distinctive word of a name (for example "yas", "corniche", "mussafah").
    var skip = { street: 1, road: 1, island: 1, city: 1, the: 1, bin: 1, sheikh: 1, zayed: 1, international: 1, mohamed: 1, grand: 1 };
    list.forEach(function (name) {
      norm(name).split(' ').forEach(function (w) {
        if (w.length >= 4 && !skip[w] && new RegExp('\\b' + w + '\\b').test(q) && w.length > bestLen) { best = name; bestLen = w.length; }
      });
    });
    return best;
  }

  function context(a) {
    var k = a.kpi(), ev = a.events();
    return {
      time: a.timeText(), scenario: a.scenarioLabel(), average_speed_kmh: k.speed, extra_travel_time_pct: k.extra,
      vehicles_moving: k.vehicles, delay_vehicle_hours_per_hour: k.delay_h, slowest_roads: a.slowest(),
      illustrative_accidents: ev ? { today: ev.accidents, active: ev.active, with_injury: ev.injury } : null,
      illustrative_fines: ev ? { count: Math.round(ev.fines), value_aed: Math.round(ev.value) } : null,
      alerts: a.alerts().map(function (x) { return x.title; }),
      note: 'Traffic is a synthetic feed built from a simulation, not observed. Accidents and fines are illustrative, not real records.'
    };
  }

  var HELP = 'I can answer from the simulation in this page and operate the twin. Try:\n' +
    '• "How is traffic now?" or "Average speed at 08:30"\n' +
    '• "Which roads are slowest?"\n' +
    '• "Any alerts?" or "Forecast"\n' +
    '• "Show accidents" or "How many fines?"\n' +
    '• "Close Al Khaleej Al Arabi Street" or "Reopen roads"\n' +
    '• "Open a camera"\n' +
    '• "Go to Yas Island" or "Show Al Khaleej Al Arabi Street"\n' +
    '• "Switch to demand +20%" or "Compare the demand cases"\n' +
    '• "Orbit", "3D", "Pause", "Live"';

  // Returns a string, or a Promise of one.
  function answer(text) {
    var a = api(), q = norm(text);
    if (!a) { return 'The simulation data has not loaded yet.'; }
    var out = [];

    // Time: "at 08:30", "show 9:15", "0845"
    var tm = q.match(/\b([01]?\d|2[0-3])[:h. ]?([0-5]\d)\b/);
    if (tm && /\b(at|show|time|jump|set|go)\b|^\d/.test(q) && !/\+ ?20|- ?20/.test(q)) {
      var note = a.setTime(Number(tm[1]) * 3600 + Number(tm[2]) * 60);
      out.push((note || '') + 'Showing ' + a.timeText() + '.');
    }
    // Demand case
    if (/\+ ?20|\bhigh(er)? demand|\bmore (traffic|demand)|\bincrease/.test(q)) { return a.setScenario('high').then(function () { return 'Switched to Demand +20%. ' + summary(a); }); }
    if (/- ?20|−20|\blow(er)? demand|\bless (traffic|demand)|stagger/.test(q)) { return a.setScenario('low').then(function () { return 'Switched to Demand −20% (staggered hours). ' + summary(a); }); }
    if (/\b(typical|normal|baseline|base case|default)\b/.test(q)) { return a.setScenario('base').then(function () { return 'Switched to the typical weekday. ' + summary(a); }); }
    if (/\bcompare|\bversus\b|\bvs\b|scenario/.test(q)) {
      return out.join(' ') + 'At ' + a.timeText() + ': ' + a.compare().map(function (c) {
        return c.label + ' — ' + Math.round(c.speed) + ' km/h, ' + num(c.vehicles) + ' vehicles moving, +' + Math.round(c.extra) + '% travel time';
      }).join('; ') + '.';
    }
    // Operations
    if (/\breopen|\bclear (the )?closure|\bremove (the )?closure|\bopen (the )?road/.test(q)) { a.closeRoad(''); return 'Closure cleared.'; }
    if (/\bclose\b|\bclosure\b|\bshut\b|\bblock\b/.test(q)) {
      var cr = findByName(a.roads(), q);
      if (!cr) { return 'Tell me which road to close, for example "Close Al Khaleej Al Arabi Street".'; }
      var res = a.closeRoad(cr);
      if (!res || res.error) { return (res && res.error) || 'The what-if tool is not available.'; }
      a.setTab('cong');
      return cr + ' closed (what-if estimate, not re-simulated): ' + num(res.links) + ' nearby links slow down; network speed ' + Math.round(res.before.speed) + ' → ' + Math.round(res.after.speed) +
        ' km/h and delay ' + num(res.before.delay_h) + ' → ' + num(res.after.delay_h) + ' vehicle-hours per hour. Say "reopen roads" to clear it.';
    }
    if (/\balert|\bwarning|\battention|\bproblem/.test(q)) {
      var al = a.alerts(); a.setTab('dash');
      return al.length ? al.length + ' alerts at ' + a.timeText() + ': ' + al.slice(0, 5).map(function (x) { return x.title + ' (' + x.sub + ')'; }).join('; ') + '.' : 'No alerts at ' + a.timeText() + '.';
    }
    if (/\bforecast|\bpredict|\bnext (hour|30|15)|\bin (15|30|60) min|\blater\b|\bexpect/.test(q)) {
      var k0 = a.kpi(); a.setTab('dash');
      return 'From ' + Math.round(k0.speed) + ' km/h now: ' + [15, 30, 60].map(function (m) { var kk = a.kpiIn(m); return '+' + m + ' min ' + Math.round(kk.speed) + ' km/h with ' + num(kk.vehicles) + ' vehicles'; }).join('; ') +
        '. This follows the synthetic day profile; it is not a prediction from measured data.';
    }
    if (/\bcamera|\bcctv|\bvideo|\bfootage/.test(q)) {
      var dv = window.IntelliTwin.devices, cam = dv ? dv.openCamera(findByName(dv.cameras().map(function (c) { return c.name; }), q) || '') : null;
      return cam ? 'Opened ' + cam.id + ' on ' + cam.name + '. ' + (cam.stream ? 'It is playing the configured stream.' : 'No stream is configured, so it shows a synthetic view, not footage.') : 'No cameras are available.';
    }

    // View controls
    if (/\bstop orbit|\bno orbit/.test(q)) { a.orbit(false); return 'Orbit stopped.'; }
    if (/\borbit|\bcircle|\brotate/.test(q)) { a.orbit(true); return 'Orbiting the current view. Touch the map to stop.'; }
    if (/\b2d\b|\bflat\b|top ?down/.test(q)) { a.tilt(false); return 'Switched to the flat 2D view.'; }
    if (/\b3d\b|\btilt/.test(q)) { a.tilt(true); return 'Switched to the tilted 3D view. Zoom in to street level to see 3D vehicles.'; }
    if (/\bpause|\bstop\b|\bfreeze/.test(q)) { a.play(false); return 'Paused at ' + a.timeText() + '.'; }
    if (/\bplay|\bresume|\bstart\b/.test(q)) { a.play(true); return 'Playing.'; }
    if (/\blive\b|\bright now\b|current time/.test(q) && !/traffic|speed/.test(q)) { a.live(); return 'Live mode: the twin follows the current Abu Dhabi time. The feed is synthetic, not measured traffic.'; }
    if (/whole|entire|overview|zoom out|all of|full (map|area)/.test(q)) { a.goAll(); return 'Showing the whole study area.'; }

    // Navigation
    if (/\b(go|fly|zoom|show|take|navigate|where|find|locate)\b/.test(q) || q.split(' ').length <= 4) {
      var site = findByName(a.sites(), q);
      if (site) { a.goSite(site); return out.join(' ') + 'Flying to ' + site + ' (approximate location).'; }
      var road = findByName(a.roads(), q);
      if (road && !/accident|fine|slow|congest/.test(q)) {
        var r = a.goRoad(road);
        return out.join(' ') + 'Showing ' + road + (r ? ': ' + Math.round(r.speed) + ' km/h now, ' + Math.round(r.ratio * 100) + '% of its limit, about ' + num(r.vehicles) + ' vehicles on it.' : '.');
      }
    }
    // Topics
    if (/accident|crash|collision|incident/.test(q)) {
      a.setTab('acc');
      var ev = a.events();
      return out.join(' ') + (ev ? num(ev.accidents) + ' accidents today, ' + num(ev.active) + ' active now and ' + num(ev.injury) + ' with injury. ' +
        (ev.latest ? 'Latest: ' + ev.latest + '. ' : '') : '') + 'These are illustrative, generated from the synthetic traffic; no real accident data is public.';
    }
    if (/fine|violation|speeding|red light|enforcement|camera|penalt|ticket/.test(q)) {
      a.setTab('fines');
      var ef = a.events();
      return out.join(' ') + (ef ? num(ef.fines) + ' fines today, worth AED ' + num(ef.value) + ' at the assumed values. Largest type: ' + ef.topType + '. ' : '') +
        'These are illustrative: generated from simulated flow at assumed sites, with placeholder fine values.';
    }
    if (/slow|worst|congest|jam|bottleneck|busiest|queue/.test(q)) {
      a.setTab('cong');
      var sl = a.slowest();
      return out.join(' ') + (sl.length ? 'Slowest named roads at ' + a.timeText() + ': ' + sl.slice(0, 4).map(function (s) {
        return s.name + ' (' + Math.round(s.speed) + ' km/h, ' + Math.round(s.ratio * 100) + '% of limit)';
      }).join('; ') + '. ' : 'No named road has enough traffic right now. ') + 'Network travel time is +' + Math.round(a.kpi().extra) + '% against free flow.';
    }
    if (/real|accura|source|data|trust|calibrat|valid|official|how (does|do) (it|you|this) work|simulat|sumo/.test(q)) {
      a.setTab('model');
      return 'The roads are real, from OpenStreetMap. The traffic is simulated with Eclipse SUMO from an assumed morning demand, and the live and historical views are a synthetic 24-hour feed built from those simulated states. Nothing is measured or calibrated, because no traffic counts are public for Abu Dhabi. Accidents, fines, devices and camera views are illustrative. Details are in the docs folder.';
    }
    if (/traffic|speed|status|summary|how (is|are)|vehicle|delay|travel time|network|overview|kpi|dashboard/.test(q) || out.length) {
      if (!out.length) { a.setTab('dash'); }
      return (out.length ? out.join(' ') + ' ' : '') + summary(a);
    }
    if (/help|what can you|hello|hi\b|hey|option|command/.test(q) || !q) { return HELP; }

    // Not covered by the built-in rules: use the optional language-model endpoint if one is configured.
    var endpoint = window.IntelliTwin.core.CFG.api.assistantUrl;
    if (endpoint) {
      return fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, context: context(a) })
      }).then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.json(); })
        .then(function (j) { return String(j.answer || 'The assistant service returned no answer.'); })
        .catch(function () { return 'The assistant service could not be reached. ' + HELP; });
    }
    return 'I did not understand that. ' + HELP;
  }

  function summary(a) {
    var k = a.kpi();
    return a.scenarioLabel() + ' at ' + a.timeText() + ': average speed ' + Math.round(k.speed) + ' km/h, ' + num(k.vehicles) +
      ' vehicles moving, travel time +' + Math.round(k.extra) + '% against free flow, ' + num(k.delay_h) + ' vehicle-hours of delay per hour. Synthetic feed, not measured.';
  }

  /* ---------- chat window ---------- */
  function add(role, text) {
    var m = document.createElement('div');
    m.className = 'msg ' + role;
    m.textContent = text;
    $('chatLog').appendChild(m);
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
    return m;
  }
  function ask(text) {
    text = String(text).trim();
    if (!text) { return; }
    add('user', text);
    var res;
    try { res = answer(text); } catch (e) { res = 'Something went wrong answering that.'; }
    if (res && typeof res.then === 'function') {
      var pending = add('bot', '…');
      res.then(function (t) { pending.textContent = t; }, function () { pending.textContent = 'Something went wrong answering that.'; })
        .then(function () { $('chatLog').scrollTop = $('chatLog').scrollHeight; });
    } else { add('bot', res); }
  }

  function init() {
    var open = false;
    function toggle(on) {
      open = on; $('chat').hidden = !on; $('chatOpen').setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) {
        if (!$('chatLog').children.length) { add('bot', 'Hello. I am the IntelliTwin assistant. ' + HELP); }
        $('chatInput').focus();
      }
    }
    $('chatOpen').addEventListener('click', function () { toggle(!open); });
    $('chatClose').addEventListener('click', function () { toggle(false); });
    $('chatForm').addEventListener('submit', function (e) { e.preventDefault(); var v = $('chatInput').value; $('chatInput').value = ''; ask(v); });
    $('chatChips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { ask(b.textContent); } });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }

  window.IntelliTwinAssistant = { ask: ask, answer: answer };
})();
