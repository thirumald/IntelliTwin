/* IntelliTwin shell: shows the signed-in user in the front end's own (hidden) user button, with a menu for
 * the admin page and sign-out. Added to the front end by the server; no front-end file is edited. */
(function () {
  'use strict';
  function build(u) {
    var old = document.getElementById('userBtn'), host = old && old.parentNode;
    if (!old) { return; }
    var btn = old.cloneNode(false);          // drops the front end's own demo sign-in handler
    btn.id = 'itUserBtn'; btn.hidden = false; btn.removeAttribute('hidden'); btn.type = 'button';
    btn.textContent = u.name + ' · ' + u.role; btn.title = 'Account';
    var wrap = document.createElement('span'); wrap.style.position = 'relative'; wrap.style.display = 'inline-block';
    var menu = document.createElement('div'); menu.hidden = true;
    menu.setAttribute('style', 'position:absolute;right:0;top:calc(100% + 6px);min-width:200px;background:#0f1d33;border:1px solid #2a3f60;border-radius:10px;padding:6px;box-shadow:0 10px 30px #000a;z-index:99999;text-align:left');
    function item(label, fn) {
      var a = document.createElement('button'); a.type = 'button'; a.textContent = label;
      a.setAttribute('style', 'display:block;width:100%;text-align:left;background:none;border:0;color:#e8eef6;padding:8px 10px;border-radius:6px;cursor:pointer;font:inherit');
      a.onmouseenter = function () { a.style.background = '#162842'; }; a.onmouseleave = function () { a.style.background = 'none'; };
      a.onclick = fn; menu.appendChild(a);
    }
    if (u.role === 'admin') { item('Admin: users, audit, live data', function () { location.href = '/admin.html'; }); }
    item('Sign out', function () { fetch('/api/auth/logout', { method: 'POST' }).finally(function () { location.replace('/login.html'); }); });
    btn.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', function () { menu.hidden = true; });
    wrap.appendChild(btn); wrap.appendChild(menu);
    host.replaceChild(wrap, old);
  }
  fetch('/api/auth/me').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    if (!m || !m.user || m.user.username === 'demo') { return; }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', function () { build(m.user); }); } else { build(m.user); }
  }).catch(function () { /* not signed in: the server redirects to the login page */ });
})();
