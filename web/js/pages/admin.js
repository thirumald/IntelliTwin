import { h, api, send, t, toast, modal, session } from "../core.js";

const ROLE_HELP = { admin: "Everything, plus users and audit log", operator: "Review, dispatch and demo controls", viewer: "Read-only" };
const when = ts => ts ? new Date(ts * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : t("never");

function userForm(u, roles, done) {
  const edit = !!u;
  const un = h("input", { value: u?.username || "", disabled: edit, autocomplete: "off", placeholder: "e.g. a.khan" });
  const nm = h("input", { value: u?.name || "", autocomplete: "off" });
  const rl = h("select", null, roles.map(r => h("option", { value: r, selected: r === (u?.role || "viewer") }, `${r}: ${t(ROLE_HELP[r])}`)));
  const pw = h("input", { type: "text", autocomplete: "off", placeholder: edit ? t("leave blank to keep") : t("temporary password, min 10 characters") });
  const err = h("div", { class: "ferr" });
  modal(edit ? `${t("Edit user")}: ${u.username}` : t("Add user"), [
    h("label", null, t("Username"), un), h("label", null, t("Full name"), nm), h("label", null, t("Role"), rl),
    h("label", null, edit ? t("Reset password") : t("Temporary password"), pw),
    h("p", { class: "muted" }, t("The user must choose their own password at first sign-in.")), err],
  async () => {
    try {
      if (edit) { const patch = { name: nm.value, role: rl.value }; if (pw.value) patch.password = pw.value; await send("PATCH", `/admin/users/${u.id}`, patch); }
      else await send("POST", "/admin/users", { username: un.value, name: nm.value, role: rl.value, password: pw.value });
      toast(t("Saved")); done(); return true;
    } catch (e) { err.textContent = e.message; return false; }
  });
}

export async function renderUsers(main) {
  const host = h("div");
  main.append(h("h1", { class: "page" }, t("Users")), h("p", { class: "sub" }, t("Who can sign in, and what they can do")), host);
  async function load() {
    const { users, roles } = await api("/admin/users");
    const me = session.user;
    host.replaceChildren(h("section", { class: "card" },
      h("h3", null, `${users.length} ${t("users")}`, h("span", { class: "spacer" }), h("button", { class: "btn primary sm", onclick: () => userForm(null, roles, load) }, "+ " + t("Add user"))),
      h("div", { class: "scroll", style: { maxHeight: "none" } }, h("table", { class: "t" },
        h("thead", null, h("tr", null, [t("User"), t("Name"), t("Role"), t("Status"), t("Last sign-in"), ""].map(x => h("th", null, x)))),
        h("tbody", null, users.map(u => h("tr", null,
          h("td", null, h("b", null, u.username), u.id === me.id ? h("span", { class: "pill info", style: { marginInlineStart: "6px" } }, t("you")) : null),
          h("td", null, u.name),
          h("td", null, h("span", { class: "pill " + (u.role === "admin" ? "warn" : u.role === "operator" ? "info" : "mute") }, u.role)),
          h("td", null, u.disabled ? h("span", { class: "pill crit" }, h("i"), t("Disabled")) : u.must_change ? h("span", { class: "pill warn" }, h("i"), t("Must change password")) : h("span", { class: "pill ok" }, h("i"), t("Active"))),
          h("td", { class: "muted" }, when(u.last_login)),
          h("td", { style: { textAlign: "end", whiteSpace: "nowrap" } },
            h("button", { class: "btn sm", onclick: () => userForm(u, roles, load) }, t("Edit")), " ",
            u.id === me.id ? null : [
              h("button", { class: "btn sm", onclick: async () => { try { await send("PATCH", `/admin/users/${u.id}`, { disabled: !u.disabled }); toast(u.disabled ? t("User enabled") : t("User disabled")); load(); } catch (e) { toast(e.message); } } }, u.disabled ? t("Enable") : t("Disable")), " ",
              h("button", { class: "btn sm danger", onclick: () => modal(`${t("Delete")} ${u.username}?`, [h("p", null, t("This removes the account and signs the user out. Audit entries are kept."))], async () => { try { await send("DELETE", `/admin/users/${u.id}`); toast(t("User deleted")); load(); return true; } catch (e) { toast(e.message); return false; } }, true, t("Delete"))}, t("Delete"))])))))),
      h("div", { class: "muted", style: { marginTop: "12px" } }, Object.entries(ROLE_HELP).map(([r, d]) => h("div", null, h("b", null, r), ": ", t(d))))));
  }
  await load();
  return () => {};
}

export async function renderAudit(main) {
  const host = h("div");
  const q = h("input", { class: "inp", placeholder: t("Filter by user, action or target"), oninput: () => { clearTimeout(q._t); q._t = setTimeout(load, 250); } });
  main.append(h("h1", { class: "page" }, t("Audit log")), h("p", { class: "sub" }, t("Sign-ins, user changes and every operator action")), h("div", { style: { margin: "0 0 12px" } }, q), host);
  async function load() {
    const { items } = await api("/admin/audit?limit=300" + (q.value ? "&q=" + encodeURIComponent(q.value) : ""));
    host.replaceChildren(h("section", { class: "card" }, items.length ? h("div", { class: "scroll", style: { maxHeight: "none" } }, h("table", { class: "t" },
      h("thead", null, h("tr", null, [t("Time"), t("User"), t("Action"), t("Target"), t("Detail"), "IP"].map(x => h("th", null, x)))),
      h("tbody", null, items.map(a => h("tr", null, h("td", { class: "muted tnum" }, when(a.ts)), h("td", null, a.actor || "-"), h("td", null, h("span", { class: "pill " + (/failed|locked|deleted/.test(a.action) ? "crit" : "mute") }, a.action)), h("td", null, a.target || ""), h("td", { class: "muted" }, a.detail || ""), h("td", { class: "faint" }, a.ip || "")))))) : h("div", { class: "empty" }, t("No entries"))));
  }
  await load();
  return () => {};
}
