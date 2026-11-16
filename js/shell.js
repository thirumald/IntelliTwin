/* IntelliTwin application shell: navigation rail behaviour and panel title. */
(function () {
  'use strict';
  var tabs = document.getElementById('tabs'), layout = document.querySelector('.layout'), title = document.getElementById('panelTitle');
  if (!tabs || !layout) { return; }
  // Selecting the section that is already open closes the panel, so the rail doubles as a full-view switch.
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'), an = document.getElementById('analytics');
    // Analytics opens in the same page; choosing a section closes it and shows that section.
    if (b && an && !an.hidden && window.IntelliTwin && window.IntelliTwin.analytics) { window.IntelliTwin.analytics.close(); return; }
    if (b && b.classList.contains('on') && layout.classList.contains('panel-open')) {
      e.stopPropagation();
      document.getElementById('panelMin').click();
    }
  }, true);
  function sync() {
    var open = layout.classList.contains('panel-open'), active = tabs.querySelector('[data-tab].on');
    tabs.classList.toggle('panel-closed', !open);
    if (active && title) { title.textContent = active.querySelector('span').textContent; }
  }
  // Interface style: 'government' (navy and gold, labelled side menu) or 'enterprise'. The choice is remembered in this browser.
  var cfg = (window.INTELLITWIN_CONFIG || {}).ui || {}, styleBtn = document.getElementById('styleBtn'), style = cfg.style || 'government';
  try { style = localStorage.getItem('itw-style2') || style; } catch (e1) { /* storage unavailable */ }
  // Styles: three colour schemes on the formal layout (standard, military, police) and the compact enterprise look.
  var STYLES = ['government', 'military', 'police', 'enterprise'], STYLE_NAME = { government: 'Standard', military: 'Military', police: 'Police', enterprise: 'Enterprise' };
  function setStyle(v, save) {
    style = STYLES.indexOf(v) >= 0 ? v : 'government';
    var b = document.body.classList;
    b.toggle('ui-gov', style !== 'enterprise'); b.toggle('scheme-military', style === 'military'); b.toggle('scheme-police', style === 'police');
    if (styleBtn) { styleBtn.textContent = 'Style: ' + STYLE_NAME[style]; }
    if (save) { try { localStorage.setItem('itw-style2', style); } catch (e2) { /* storage unavailable */ } }
    var T = window.IntelliTwin, m = T && T.getMap && T.getMap();
    if (m) { setTimeout(function () { m.resize(); if (T.core && T.core.redraw) { T.core.redraw(); } }, 60); }
  }
  setStyle(style, false);
  if (styleBtn) { styleBtn.addEventListener('click', function () { setStyle(STYLES[(STYLES.indexOf(style) + 1) % STYLES.length], true); }); }
  // Side menu: minimised to icons by default (ui.menu), with a button to expand it. The choice is remembered in this browser.
  var railBtn = document.getElementById('railToggle'), railMin = (cfg.menu || 'minimised') !== 'expanded';
  try { var savedMenu = localStorage.getItem('itw-menu'); if (savedMenu) { railMin = savedMenu === 'min'; } } catch (e3) { /* storage unavailable */ }
  function setRail(min, save) {
    railMin = min; document.body.classList.toggle('rail-min', min);
    if (railBtn) { railBtn.setAttribute('aria-expanded', min ? 'false' : 'true'); railBtn.title = min ? 'Expand the menu' : 'Minimise the menu'; }
    if (save) { try { localStorage.setItem('itw-menu', min ? 'min' : 'open'); } catch (e4) { /* storage unavailable */ } }
    var T2 = window.IntelliTwin, m2 = T2 && T2.getMap && T2.getMap();
    if (m2) { setTimeout(function () { m2.resize(); }, 60); }
  }
  setRail(railMin, false);
  if (railBtn) { railBtn.addEventListener('click', function (e) { e.stopPropagation(); setRail(!railMin, true); }); }
  // Version check: if a newer page has been published than the copy the browser cached, load the new one once.
  // (An old page with newer scripts is what produced a blank "data not built" screen.)
  (function () {
    var mine = (document.querySelector('script[src*="js/shell.js"]') || {}).src || '', cur = (mine.match(/[?&]v=(\w+)/) || [])[1];
    if (!cur || !window.fetch || location.protocol === 'file:') { return; }
    fetch('index.html?check=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
      var latest = (html.match(/js\/shell\.js\?v=(\w+)/) || [])[1];
      if (latest && latest !== cur && location.search.indexOf('r=' + latest) < 0) { location.replace(location.pathname + '?r=' + latest); }
    }).catch(function () { /* offline: keep the page as it is */ });
  })();
  // Check options: apply the layer defaults from config.js (layers) to the on-screen check boxes.
  var LAYER_BOX = { vehicles: 'showCars', people: 'showPeople', accidents: 'showAcc', enforcementSites: 'showSites', buildings3d: 'showBld', cameras: 'showCams', detectors: 'showDet', messageSigns: 'showVms',
    signals: 'showSig', responseBases: 'showBases', railway: 'showRail', cycleTracks: 'showCycle', criticalZones: 'showZones', environmentSensors: 'showEnv', buses: 'showSynBuses', taxis: 'showTaxis', shuttles: 'showShuttles', ships: 'showSea', aircraft: 'showAir' };
  function applyLayers() {
    var L = (window.INTELLITWIN_CONFIG || {}).layers || {};
    Object.keys(L).forEach(function (k) {
      var box = document.getElementById(LAYER_BOX[k]); if (!box || box.checked === !!L[k]) { return; }
      box.checked = !!L[k]; box.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  if (window.IntelliTwin && window.IntelliTwin.core && window.IntelliTwin.core.onReady) { window.IntelliTwin.core.onReady(applyLayers); }
  new MutationObserver(sync).observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'], characterData: true, childList: true });
  new MutationObserver(sync).observe(layout, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
