/* IntelliTwin application shell: navigation rail behaviour and panel title. */
(function () {
  'use strict';
  var tabs = document.getElementById('tabs'), layout = document.querySelector('.layout'), title = document.getElementById('panelTitle');
  if (!tabs || !layout) { return; }
  // Selecting the section that is already open closes the panel, so the rail doubles as a full-view switch.
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
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
  new MutationObserver(sync).observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'], characterData: true, childList: true });
  new MutationObserver(sync).observe(layout, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
