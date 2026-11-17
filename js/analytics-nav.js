/* IntelliTwin Analytics: navigation by region, scenario and data layer, with a tree of the sections and their data.
 *
 * The header gets three drop-downs: Region (reloads the twin for that region), Scenario (the demand case the
 * figures are worked out for) and Data layer (shows the sections for one kind of data). The tree on the left
 * lists data layer > section > chart or table. It is built from the page each time it opens, so charts added to
 * a section, and the scorecard goals, appear in it without changes here. Groups come from analytics.nav in config.js.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, state = T.state;
  if (!T.analytics || !$('anTree')) { return; }
  var NAV = (CFG.analytics || {}).nav || [], layer = '', REOPEN = 'intellitwin.analytics.reopen';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sectionName(id) { var b = $('anMenu').querySelector('[data-an="' + id + '"]'); return b ? b.textContent : id; }
  // The title of a card: its caption without the colour key that some captions carry.
  function titleOf(el) {
    var cap = el.querySelector('figcaption, h3'); if (!cap) { return ''; }
    var t = ''; Array.prototype.forEach.call(cap.childNodes, function (n) { if (n.nodeType === 3) { t += n.textContent; } });
    return (t || cap.textContent).trim();
  }
  // Data layer > section > cards, read from the page as it is now.
  function model() {
    var ids = Array.prototype.map.call(document.querySelectorAll('#analytics [data-an-sec]'), function (s) { return s.getAttribute('data-an-sec'); }), used = {};
    var groups = NAV.map(function (g) { var secs = g.sections.filter(function (id) { return ids.indexOf(id) >= 0; }); secs.forEach(function (id) { used[id] = 1; }); return { name: g.name, sections: secs }; }).filter(function (g) { return g.sections.length; });
    var rest = ids.filter(function (id) { return !used[id]; }); if (rest.length) { groups.push({ name: 'Other', sections: rest }); }
    groups.forEach(function (g) {
      g.sections = g.sections.map(function (id) {
        var sec = document.querySelector('#analytics [data-an-sec="' + id + '"]'), cards = [];
        Array.prototype.forEach.call(sec.querySelectorAll('.an-card, .sc-goal'), function (el, k) { if (el.hidden) { return; } var t = titleOf(el); if (t) { cards.push({ k: k, title: t, kind: el.querySelector('canvas') ? 'chart' : el.querySelector('table') ? 'table' : 'list' }); } });
        return { id: id, name: sectionName(id), cards: cards };
      });
    });
    return groups;
  }
  function draw() {
    var cur = T.analytics.current(), groups = model(), open = {};
    Array.prototype.forEach.call($('anTreeList').querySelectorAll('details[data-key]'), function (d) { open[d.getAttribute('data-key')] = d.open; });
    $('anLayer').innerHTML = '<option value="">All layers</option>' + groups.map(function (g) { return '<option' + (g.name === layer ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('');
    $('anTreeNow').textContent = sectionName(cur);
    $('anTreeList').innerHTML = groups.filter(function (g) { return !layer || g.name === layer; }).map(function (g) {
      var has = g.sections.some(function (s) { return s.id === cur; }), gk = 'g:' + g.name;
      return '<details class="an-node" data-key="' + esc(gk) + '"' + ((open[gk] === undefined ? true : open[gk]) || has ? ' open' : '') + '><summary role="treeitem">' + esc(g.name) + '<small>' + g.sections.length + '</small></summary>' + g.sections.map(function (s) {
        var sk = 's:' + s.id, on = s.id === cur;
        return '<details class="an-node an-sec' + (on ? ' on' : '') + '" data-key="' + sk + '"' + (on || open[sk] ? ' open' : '') + '><summary role="treeitem" data-go="' + s.id + '"' + (on ? ' aria-current="page"' : '') + '>' + esc(s.name) + '<small>' + s.cards.length + '</small></summary>' +
          s.cards.map(function (c) { return '<button type="button" role="treeitem" class="an-leaf" data-go="' + s.id + '" data-card="' + c.k + '"><i class="' + c.kind + '" aria-hidden="true"></i>' + esc(c.title) + '</button>'; }).join('') + '</details>';
      }).join('') + '</details>';
    }).join('');
  }
  function go(id, card) {
    if (T.analytics.current() !== id) { T.analytics.section(id); }
    if (window.matchMedia('(max-width: 900px)').matches) { $('anTree').open = false; }
    draw();
    if (card !== null && card !== undefined) {
      var el = document.querySelectorAll('#analytics [data-an-sec="' + id + '"] .an-card, #analytics [data-an-sec="' + id + '"] .sc-goal')[Number(card)];
      if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); el.classList.add('an-flash'); setTimeout(function () { el.classList.remove('an-flash'); }, 1600); }
    }
  }
  function fit() { $('anTree').open = !window.matchMedia('(max-width: 900px)').matches; }
  C.onReady(function () {
    // Region: the same list as the top bar. Changing it reloads the twin, then Analytics opens again.
    $('anRegion').innerHTML = $('regionSel').innerHTML; $('anRegion').value = $('regionSel').value;
    $('anRegion').addEventListener('change', function () { try { sessionStorage.setItem(REOPEN, T.analytics.current()); } catch (e) { /* opens on the map instead */ } $('regionSel').value = $('anRegion').value; $('regionSel').dispatchEvent(new Event('change')); });
    // Scenario: the demand cases of this region. The figures are rebuilt once the case has loaded.
    $('anScenario').innerHTML = $('scenario').innerHTML; $('anScenario').value = state.scenario;
    $('anScenario').addEventListener('change', function () {
      var id = $('anScenario').value, tries = 0; $('scenario').value = id; $('scenario').dispatchEvent(new Event('change')); $('anScenario').disabled = true;
      var wait = setInterval(function () { if (state.scenario === id || ++tries > 60) { clearInterval(wait); $('anScenario').disabled = false; $('anScenario').value = state.scenario; T.analytics.refresh(); draw(); } }, 250);
    });
    $('scenario').addEventListener('change', function () { setTimeout(function () { $('anScenario').value = $('scenario').value; }, 0); });
    $('anLayer').addEventListener('change', function () {
      layer = $('anLayer').value; var g = model().filter(function (x) { return x.name === layer; })[0];
      if (g && !g.sections.some(function (s) { return s.id === T.analytics.current(); })) { T.analytics.section(g.sections[0].id); }
      draw();
    });
    $('anTreeList').addEventListener('click', function (e) {
      var leaf = e.target.closest('.an-leaf'), sum = e.target.closest('summary[data-go]');
      if (leaf) { go(leaf.getAttribute('data-go'), leaf.getAttribute('data-card')); }
      else if (sum && T.analytics.current() !== sum.getAttribute('data-go')) { e.preventDefault(); go(sum.getAttribute('data-go')); }
    });
    $('analyticsBtn').addEventListener('click', function () { setTimeout(function () { if (!$('analytics').hidden) { $('anScenario').value = state.scenario; fit(); draw(); } }, 0); });
    $('anMenu').addEventListener('click', function () { setTimeout(draw, 0); });
    C.onMinute(function () { if (!$('analytics').hidden) { $('anTreeNow').textContent = sectionName(T.analytics.current()); } });
    var back = null; try { back = sessionStorage.getItem(REOPEN); sessionStorage.removeItem(REOPEN); } catch (e2) { back = null; }
    if (back) { T.analytics.open(back); fit(); draw(); }
  });
  T.analyticsNav = { draw: draw, model: model };
})();
