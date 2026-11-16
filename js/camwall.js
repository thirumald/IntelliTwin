/* IntelliTwin: live camera wall.
 *
 * A camera button beside the Scenario and layers button opens a wall of camera views: one tile per CCTV camera,
 * playing the test footage assigned to it, plus a view of the Earth from space (NASA's live stream on YouTube).
 * The footage is recorded test video from other cities, not the camera's own feed; every tile says so.
 * Only the tiles on the page shown load video, and everything stops when the wall is closed.
 */
(function () {
  'use strict';
  var T = window.IntelliTwin, C = T.core, CFG = C.CFG, $ = C.$, num = C.num;
  var W = CFG.cameraWall || {}, page = 0, wall = null, filter = '';
  function clipFor(c, idx) {
    if (c.stream && !/^iframe:|\.m3u8/i.test(c.stream)) { return { src: c.stream, kind: 'Video stream', real: true }; }
    var all = (CFG.devices || {}).sampleVideos || [], cls = C.edges()[c.edge] ? C.edges()[c.edge].c : 2;
    var fit = all.filter(function (v) { return !v.classes || v.classes.indexOf(cls) >= 0; }), list = fit.length ? fit : all, s = list.length ? list[idx % list.length] : null;
    return s ? { src: s.sources[0], kind: s.kind, credit: s.credit } : null;
  }
  function perPage() { return window.innerWidth < 720 ? 4 : window.innerWidth < 1200 ? 9 : (W.tilesPerPage || 12); }
  function list() {
    var cams = T.devices ? T.devices.cameras() : [], q = filter.toLowerCase();
    return cams.map(function (c, i) { return { c: c, i: i }; }).filter(function (x) { return !q || (x.c.id + ' ' + x.c.name).toLowerCase().indexOf(q) >= 0; });
  }
  function draw() {
    var rows = list(), n = perPage(), earth = W.earthStream && !filter ? 1 : 0, total = rows.length + earth, pages = Math.max(1, Math.ceil(total / n));
    page = Math.max(0, Math.min(page, pages - 1));
    var grid = $('cwGrid'); grid.innerHTML = '';
    var start = page * n, items = [];
    for (var k = start; k < Math.min(total, start + n); k++) { items.push(earth && k === 0 ? 'earth' : rows[k - earth]); }
    items.forEach(function (it) {
      var tile = document.createElement('button'); tile.type = 'button'; tile.className = 'cw-tile';
      if (it === 'earth') {
        tile.classList.add('cw-earth');
        tile.innerHTML = '<iframe title="Earth from space, NASA live stream" src="' + W.earthStream + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe><span class="cw-bar"><strong>Earth from space</strong><em>NASA live stream on YouTube · shows when NASA is broadcasting</em></span>';
      } else {
        var clip = clipFor(it.c, it.i), r = C.ratio(it.c.edge), sp = C.edges()[it.c.edge] ? Math.round(C.edges()[it.c.edge].s * r) : null;
        tile.innerHTML = (clip ? '<video muted loop playsinline autoplay preload="metadata"></video>' : '<span class="cw-none">No video</span>') + '<span class="cw-badge">' + (clip && clip.real ? 'LIVE' : 'TEST VIDEO') + '</span>' +
          '<span class="cw-bar"><strong></strong><em>' + (clip ? clip.kind + (clip.real ? '' : ' · recorded elsewhere, not this camera') : 'Synthetic view only') + (sp !== null ? ' · ' + sp + ' km/h simulated' : '') + '</em></span>';
        tile.querySelector('strong').textContent = it.c.id + ' · ' + it.c.name;
        if (clip) { var v = tile.querySelector('video'); v.src = clip.src; v.addEventListener('loadedmetadata', function () { try { v.currentTime = (it.i * 3.7) % Math.max(1, (v.duration || 20) - 2); } catch (e) { /* not seekable */ } }); }
        tile.addEventListener('click', function () { open(false); T.devices.openCamera(it.c.id); });
      }
      grid.appendChild(tile);
    });
    $('cwCount').textContent = num(rows.length) + ' cameras' + (earth ? ' and Earth from space' : '') + ' · page ' + (page + 1) + ' of ' + pages;
    $('cwPrev').disabled = page === 0; $('cwNext').disabled = page >= pages - 1;
  }
  function open(on) {
    if (!wall) { return; }
    wall.hidden = !on; $('camBtn').classList.toggle('on', on); $('camBtn').setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { draw(); } else { $('cwGrid').innerHTML = ''; }      // removing the tiles stops every video
  }
  C.onReady(function () {
    var gear = $('lyBtn'); if (!gear || !T.devices) { return; }
    var b = document.createElement('button'); b.type = 'button'; b.id = 'camBtn'; b.title = 'Live camera wall'; b.setAttribute('aria-label', 'Live camera wall'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 10.500l6-3v9l-6-3z"/></svg>';
    gear.parentNode.appendChild(b);
    wall = document.createElement('div'); wall.id = 'camWall'; wall.className = 'cw'; wall.hidden = true; wall.setAttribute('role', 'dialog'); wall.setAttribute('aria-label', 'Live camera wall');
    wall.innerHTML = '<header class="cw-head"><div><h2>Live camera wall</h2><span class="muted" id="cwCount"></span></div><input id="cwFind" type="search" placeholder="Find a camera or road" aria-label="Find a camera or road">' +
      '<div class="cw-nav"><button type="button" class="btn small" id="cwPrev">Previous</button><button type="button" class="btn small" id="cwNext">Next</button><button type="button" class="btn small" id="cwClose">Close</button></div></header>' +
      '<p class="notice"><strong>Test video.</strong> Camera positions are synthetic and each tile plays recorded test footage from another city, not that camera’s feed. Connect real streams in <code>devices.cameras</code>.</p><div class="cw-grid" id="cwGrid"></div>';
    document.body.appendChild(wall);
    b.addEventListener('click', function () { open(wall.hidden); });
    $('cwClose').addEventListener('click', function () { open(false); });
    $('cwPrev').addEventListener('click', function () { page--; draw(); }); $('cwNext').addEventListener('click', function () { page++; draw(); });
    var timer = 0; $('cwFind').addEventListener('input', function (e) { clearTimeout(timer); timer = setTimeout(function () { filter = e.target.value.trim(); page = 0; draw(); }, 250); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !wall.hidden) { open(false); } });
    var link = $('lyCamWall'); if (link) { link.addEventListener('click', function () { if (T.layerTree && T.layerTree.open) { T.layerTree.open(false); } open(true); }); }
  });
  T.cameraWall = { open: open };
})();
