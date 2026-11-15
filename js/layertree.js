/* IntelliTwin: the map layers of the "Scenario and layers" card as a tree, grouped by type.
 *
 *   All layers
 *     Road · Public transport · Sea · Air and space · People and safety · City and environment
 *
 * Each group and the tree as a whole has a tick box that selects or clears everything under it; it shows a dash
 * when only some are on. The existing layer tick boxes are moved into the tree, so their behaviour is unchanged.
 * Layers whose own tick box lives in another section (buses, ships, critical sites …) get a linked copy here.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, $ = C.$;
  // [group, [[tick box id, label for a linked copy (only for boxes that live in another section)], …]]
  var TREE = [
    ['Road', [['showCars'], ['showSig'], ['lyTtFlow'], ['lyTtInc'], ['showAcc'], ['showSites'], ['showVms'], ['showDet'], ['showRail'], ['showCycle'], ['lyTtEv'], ['lyTtFuel']]],
    ['Public transport', [['showSynBuses', 'Buses <span class="muted">(synthetic)</span>'], ['showTaxis', 'Taxis <span class="muted">(synthetic)</span>'], ['showShuttles', 'Shuttles <span class="muted">(synthetic)</span>']]],
    ['Sea', [['lyLvShip'], ['showSea', 'Ships and sea lanes <span class="muted">(synthetic)</span>']]],
    ['Air and space', [['lyLvAir'], ['showAir', 'Aircraft and flight paths <span class="muted">(synthetic)</span>'], ['lyLvSat']]],
    ['People and safety', [['showPeople'], ['showBases'], ['showCams'], ['showZones', 'Critical sites'], ['lyLvFire']]],
    ['City and environment', [['showBld'], ['showEnv', 'Environment sensors <span class="muted">(synthetic)</span>']]]
  ];
  var groups = [], allBox = null, busy = false, top = { last: null };

  function rowOf(box) { return box.closest('label'); }
  function usable(box) { var r = rowOf(box); return !box.disabled && r && !r.hidden && r.style.display !== 'none'; }
  function setBox(box, on) { if (box.checked !== on && usable(box)) { box.checked = on; box.dispatchEvent(new Event('change', { bubbles: true })); } }

  // A copy in the tree of a tick box that lives in another section; the two stay in step.
  function link(orig, html) {
    var lab = document.createElement('label'); lab.className = 'check';
    var box = document.createElement('input'); box.type = 'checkbox'; box.id = 'ly_' + orig.id; box.checked = orig.checked;
    var sp = document.createElement('span'); sp.innerHTML = html; lab.appendChild(box); lab.appendChild(sp);
    box.addEventListener('change', function () { if (orig.checked !== box.checked) { orig.checked = box.checked; orig.dispatchEvent(new Event('change', { bubbles: true })); } });
    orig.addEventListener('change', function () { box.checked = orig.checked; refresh(); });
    box._orig = orig;
    return lab;
  }
  function refresh() {
    if (busy) { return; }
    var on = 0, total = 0;
    groups.forEach(function (g) {
      var live = g.boxes.filter(usable), n = live.filter(function (b) { return b.checked; }).length;
      g.boxes.forEach(function (b) { if (b._orig) { b.checked = b._orig.checked; var lab = rowOf(b._orig), sec = b._orig.closest('section'); rowOf(b).hidden = b._orig.disabled || (sec && sec.style.display === 'none') || (lab && lab.hidden); } });
      g.all.checked = live.length > 0 && n === live.length; g.all.indeterminate = n > 0 && n < live.length; g.all.disabled = !live.length;
      g.count.textContent = n + ' of ' + live.length; g.el.hidden = !live.length;
      on += n; total += live.length;
    });
    allBox.checked = total > 0 && on === total; allBox.indeterminate = on > 0 && on < total;
    $('lyAllCount').textContent = on + ' of ' + total + ' on';
  }
  // A layer that cannot be switched on (a refused key, say) leaves its group showing a dash; a second click on the
  // group box then clears the group instead of trying to select everything again.
  function intent(holder, box) { var want = box.checked; if (want && holder.last === true) { want = false; } holder.last = want; return want; }
  function setMany(boxes, on) { busy = true; boxes.forEach(function (b) { setBox(b, on); }); busy = false; refresh(); C.redraw(); }

  C.onReady(function () {
    var first = $('showCars'), card = first && first.closest('section'); if (!card) { return; }
    var tree = document.createElement('div'); tree.className = 'ly-tree'; tree.setAttribute('role', 'tree'); tree.setAttribute('aria-label', 'Map layers');
    var head = document.createElement('div'); head.className = 'ly-all';
    head.innerHTML = '<label class="check"><input type="checkbox" id="lyAll"><span><strong>All layers</strong> <span class="muted" id="lyAllCount"></span></span></label><button type="button" class="btn small" id="lyExpand" aria-expanded="true">Collapse all</button>';
    tree.appendChild(head);
    var narrow = window.innerWidth < 720;
    TREE.forEach(function (def, gi) {
      var boxes = [], body = document.createElement('div'); body.className = 'ly-items'; body.setAttribute('role', 'group');
      def[1].forEach(function (it) {
        var orig = $(it[0]); if (!orig) { return; }
        if (it[1]) { var lab = link(orig, it[1]); body.appendChild(lab); boxes.push(lab.firstChild); }
        else { body.appendChild(rowOf(orig)); boxes.push(orig); }
      });
      if (!boxes.length) { return; }
      var det = document.createElement('details'); det.className = 'ly-group'; det.open = !narrow || gi === 0; det.setAttribute('role', 'treeitem');
      var sum = document.createElement('summary');
      var all = document.createElement('input'); all.type = 'checkbox'; all.setAttribute('aria-label', 'All ' + def[0] + ' layers');
      var name = document.createElement('span'); name.className = 'ly-name'; name.textContent = def[0];
      var count = document.createElement('span'); count.className = 'muted ly-count';
      sum.appendChild(all); sum.appendChild(name); sum.appendChild(count); det.appendChild(sum); det.appendChild(body); tree.appendChild(det);
      var g = { el: det, all: all, count: count, boxes: boxes }; groups.push(g);
      all.addEventListener('click', function (e) { e.stopPropagation(); });
      all.addEventListener('change', function () { setMany(g.boxes, intent(g, all)); });
      boxes.forEach(function (b) { b.addEventListener('change', function () { if (!busy) { g.last = null; top.last = null; } refresh(); }); });
    });
    // The tree goes where the first layer row was: after the demand case and its note.
    var anchor = $('lyTtNote') || $('scenario').closest('label'); anchor.parentNode.insertBefore(tree, anchor.nextSibling);
    allBox = $('lyAll');
    allBox.addEventListener('change', function () { var list = [], want = intent(top, allBox); groups.forEach(function (g) { list = list.concat(g.boxes); g.last = null; }); setMany(list, want); });
    $('lyExpand').addEventListener('click', function () {
      var open = groups.some(function (g) { return g.el.open; }); groups.forEach(function (g) { g.el.open = !open; });
      this.textContent = open ? 'Expand all' : 'Collapse all'; this.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    refresh();
    setInterval(refresh, 2000);          // rows appear or become available as data and keys load
  });
  T.layerTree = { refresh: refresh };
})();
