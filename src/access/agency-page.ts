// "Client access" page for the team (signed in): share links that ask a client for access to their
// Google Business Profiles, and the requests that came in. Plain HTML + JS, like the dashboard.
// The page script is pasted into a template literal, so it uses no backticks or dollar-brace sequences.

import { FONT_LINKS, THEME_BOOT, THEME_BUTTON, THEME_SCRIPT, themeCss } from "../theme";

export const BASE_CSS = `
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; font: 14px/1.5 var(--sans); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
  h1, h2, h3 { font-family: var(--serif); color: var(--head); font-weight: 600; letter-spacing: -.01em; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; box-shadow: var(--shadow); }
  input, select, button, textarea { font: inherit; }
  input[type=text], input[type=email], input[type=url], select, textarea { padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: 9px;
    background: var(--panel); color: var(--text); width: 100%; }
  textarea { min-height: 80px; resize: vertical; }
  input:focus-visible, select:focus-visible, textarea:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); outline: none; }
  button, .btn { display: inline-block; padding: 8px 16px; border-radius: 999px; border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent);
    cursor: pointer; font-weight: 600; text-decoration: none; text-align: center; }
  button:hover, .btn:hover { filter: brightness(1.06); text-decoration: none; }
  button.ghost, .btn.ghost { background: var(--panel); color: var(--text); border-color: var(--line-strong); font-weight: 500; }
  button.ghost:hover { border-color: var(--accent-line); color: var(--accent); filter: none; }
  button.small { padding: 4px 11px; font-size: 12px; }
  button:disabled { opacity: .5; cursor: default; filter: none; }
  .muted { color: var(--muted); } .hint { font-size: 12px; color: var(--muted); } .err { color: var(--bad); }
  a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
  code { font-size: 12px; background: var(--chip); padding: 1px 5px; border-radius: 5px; overflow-wrap: anywhere; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 12px; font-weight: 600; background: var(--chip); color: var(--muted); white-space: nowrap; }
  .pill.ok { background: var(--ok-soft); color: var(--ok); } .pill.warn { background: var(--warn-soft); color: var(--warn); } .pill.bad { background: var(--bad-soft); color: var(--bad); }
  .callout { border-radius: 12px; padding: 10px 14px; background: var(--warn-soft); color: var(--warn); }
  .callout.bad { background: var(--bad-soft); color: var(--bad); } .callout.ok { background: var(--ok-soft); color: var(--ok); }
`;

export const agencyPageHtml = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Client access · Lead Finder</title><meta name="theme-color" content="#FBF5EA">
${FONT_LINKS}${THEME_BOOT}
<style>
${themeCss()}
${BASE_CSS}
  header { position: sticky; top: 0; z-index: 30; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line); padding: 10px 24px; display: flex; align-items: center; gap: 18px; }
  header .sp { flex: 1; }
  .brand { display: flex; align-items: center; gap: 10px; color: inherit; }
  .logo { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: var(--invert-text); background: var(--invert-bg); font: 700 15px/1 var(--serif); }
  header h1 { font-size: 18px; margin: 0; }
  main { padding: 20px 24px 48px; display: flex; flex-direction: column; gap: 16px; max-width: 1200px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
  .head h2 { margin: 0; font-size: 18px; }
  .tw { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 600; background: var(--panel-2); white-space: nowrap; }
  tr.sel td { background: var(--accent-soft); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
  label.f { display: flex; flex-direction: column; gap: 4px; font-weight: 600; font-size: 13px; }
  label.f .hint { font-weight: 400; }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; }
  .linkcell { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0 0 12px; } dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
  @media (max-width: 640px) { header, main { padding-left: 16px; padding-right: 16px; } }
</style></head><body>
<header><a class="brand" href="/"><div class="logo" aria-hidden="true">LF</div><h1>Lead Finder</h1></a><span class="muted">Client access</span><span class="sp"></span>
  <a href="/" class="btn ghost">Back to Lead Finder</a>${THEME_BUTTON}</header>
<main>
  <div id="modeNote" class="callout" hidden></div>
  <section class="card">
    <div class="head"><h2>Access links</h2><button type="button" id="newLink">New link</button></div>
    <p class="muted" style="margin-top:0">Send a link to a client. They sign in with Google, tick their business profiles, and your Google account is invited to manage them.</p>
    <form id="linkForm" class="card" style="margin-bottom:12px;background:var(--panel-2)" hidden novalidate>
      <h3 id="formTitle" style="margin-top:0">New link</h3>
      <div class="grid">
        <label class="f">Name (only your team sees it)<input type="text" name="title" maxlength="120" required></label>
        <label class="f">Link address <span class="hint">Letters, numbers, dashes. Leave empty to make one.</span><input type="text" name="slug" maxlength="48" pattern="[a-z0-9-]+"></label>
        <label class="f">Your Google account to invite<input type="email" name="agencyGoogleEmail" maxlength="160" required></label>
        <label class="f">Access to ask for<select name="accessLevel"><option value="manager">Manager</option><option value="owner">Owner</option></select></label>
        <label class="f">Send notifications to <span class="hint">Empty: the agency email in Settings.</span><input type="email" name="notifyEmail" maxlength="160"></label>
        <label class="f">Logo (https image address)<input type="url" name="logoUrl" maxlength="500"></label>
        <label class="f">Brand colour<input type="text" name="brandColor" maxlength="7" placeholder="#E4572E"></label>
      </div>
      <label class="f" style="margin-top:12px">Welcome message for the client<textarea name="welcomeText" maxlength="1200"></textarea></label>
      <p class="err" id="formErr" role="alert"></p>
      <div class="acts"><button type="submit">Save link</button><button type="button" class="ghost" id="cancelForm">Cancel</button></div>
    </form>
    <div class="tw"><table><thead><tr><th>Name</th><th>Link</th><th>Access</th><th>Requests</th><th>Status</th><th></th></tr></thead><tbody id="links"></tbody></table></div>
    <p class="muted" id="noLinks" hidden>No links yet.</p>
  </section>
  <section class="card">
    <div class="head"><h2>Requests</h2>
      <label class="acts" style="align-items:center">Show <select id="statusFilter" style="width:auto"></select></label></div>
    <div class="tw"><table><thead><tr><th>When</th><th>Client</th><th>Google account</th><th>Link</th><th>Status</th><th>Profiles</th><th></th></tr></thead><tbody id="requests"></tbody></table></div>
    <p class="muted" id="noRequests" hidden>No requests yet.</p>
  </section>
  <section class="card" id="detail" hidden aria-live="polite"></section>
</main>
${THEME_SCRIPT}
<script>
(function () {
  var STATUS = { opened: ["Opened", ""], authorized: ["Signed in", "warn"], granted: ["Access sent", "ok"], partial: ["Partly done", "warn"],
    failed: ["Failed", "bad"], manual_pending: ["Added by hand (check)", "warn"] };
  var LOC = { pending_invite: ["Invitation waiting", "warn"], granted: ["Access confirmed", "ok"], failed: ["Failed", "bad"] };
  var links = [], editing = null, filter = "", openId = null, canEdit = false;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pill(map, s) { var p = map[s] || [s, ""]; return '<span class="pill ' + p[1] + '">' + esc(p[0]) + "</span>"; }
  function when(t) { if (!t) return ""; var d = new Date(t.replace(" ", "T") + "Z"); return isNaN(d) ? t : d.toLocaleString(); }
  function api(path, opts) {
    opts = opts || {};
    if (opts.body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(opts.body); }
    return fetch(path, opts).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
      if (r.status === 401) { location.href = "/login"; }
      if (!r.ok) throw new Error(j.error || "Something went wrong."); return j; }); });
  }
  var publicBase = location.origin;
  function linkUrl(l) { return publicBase + "/connect/" + l.slug; }
  function drawLinks() {
    var tb = document.getElementById("links");
    document.getElementById("noLinks").hidden = links.length > 0;
    tb.innerHTML = links.map(function (l) {
      return "<tr><td>" + esc(l.title) + '</td><td><div class="linkcell"><code>' + esc(linkUrl(l)) + '</code><button type="button" class="ghost small" data-copy="' + esc(l.id) + '">Copy link</button></div></td>' +
        "<td>" + (l.access_level === "owner" ? "Owner" : "Manager") + '<div class="hint">' + esc(l.agency_google_email) + "</div></td><td>" + esc(l.requests) + "</td>" +
        "<td>" + (l.is_active ? '<span class="pill ok">On</span>' : '<span class="pill">Off</span>') + "</td>" +
        '<td><div class="acts">' + (canEdit ? '<button type="button" class="ghost small" data-edit="' + esc(l.id) + '">Edit</button><button type="button" class="ghost small" data-toggle="' + esc(l.id) + '">' + (l.is_active ? "Turn off" : "Turn on") + "</button>" : "") + "</div></td></tr>";
    }).join("");
  }
  function loadLinks() { return api("/api/access/links").then(function (j) { links = j.links; canEdit = j.canEdit; document.getElementById("newLink").hidden = !canEdit; drawLinks(); }); }
  function loadRequests() {
    return api("/api/access/requests" + (filter ? "?status=" + encodeURIComponent(filter) : "")).then(function (j) {
      var sel = document.getElementById("statusFilter"), total = 0;
      Object.keys(j.counts).forEach(function (k) { total += j.counts[k]; });
      sel.innerHTML = '<option value="">All (' + total + ")</option>" + Object.keys(STATUS).map(function (k) {
        return '<option value="' + k + '"' + (k === filter ? " selected" : "") + ">" + esc(STATUS[k][0]) + " (" + (j.counts[k] || 0) + ")</option>"; }).join("");
      document.getElementById("noRequests").hidden = j.requests.length > 0;
      document.getElementById("requests").innerHTML = j.requests.map(function (r) {
        return '<tr class="' + (r.id === openId ? "sel" : "") + '"><td>' + esc(when(r.created_at)) + "</td><td>" + esc(r.client_name || "") + '<div class="hint">' + esc(r.client_email || "") + "</div></td>" +
          "<td>" + esc(r.client_google_email || "") + "</td><td>" + esc(r.link_title) + "</td><td>" + pill(STATUS, r.status) + "</td>" +
          "<td>" + (r.locations ? esc(r.locations_ok + " of " + r.locations) : "") + '</td><td><button type="button" class="ghost small" data-open="' + esc(r.id) + '">Details</button></td></tr>';
      }).join("");
    });
  }
  function openDetail(id) {
    openId = id;
    api("/api/access/requests/" + encodeURIComponent(id)).then(function (d) {
      var box = document.getElementById("detail");
      box.hidden = false;
      var locs = d.locations.map(function (g) {
        return "<tr><td>" + esc(g.title || g.gbp_location_name) + '<div class="hint">' + esc(g.address || "") + "</div></td><td>" + pill(LOC, g.status) +
          (g.error_message ? '<div class="hint err">' + esc(g.error_message) + "</div>" : "") + "</td><td>" +
          (g.status === "pending_invite" ? '<button type="button" class="ghost small" data-accept="' + esc(g.id) + '">I accepted it</button>' : "") + "</td></tr>";
      }).join("");
      box.innerHTML = '<div class="head"><h2>Request details</h2><button type="button" class="ghost small" id="closeDetail">Close</button></div>' +
        "<dl><dt>Status</dt><dd>" + pill(STATUS, d.status) + "</dd><dt>Client</dt><dd>" + esc([d.client_name, d.client_email].filter(Boolean).join(" · ") || "Not given") + "</dd>" +
        "<dt>Signed in as</dt><dd>" + esc(d.client_google_email || "Didn't sign in with Google") + "</dd><dt>Link</dt><dd>" + esc(d.link_title) + "</dd>" +
        "<dt>Invites go to</dt><dd>" + esc(d.agency_google_email) + " (" + (d.access_level === "owner" ? "owner" : "manager") + ")</dd>" +
        "<dt>Started</dt><dd>" + esc(when(d.created_at)) + "</dd>" + (d.finished_at ? "<dt>Finished</dt><dd>" + esc(when(d.finished_at)) + "</dd>" : "") +
        (d.mode ? "<dt>Mode</dt><dd>" + esc(d.mode) + "</dd>" : "") + (d.error_message ? '<dt>Note</dt><dd class="err">' + esc(d.error_message) + "</dd>" : "") + "</dl>" +
        (d.status === "manual_pending" ? '<p class="callout">The client says they added ' + esc(d.agency_google_email) + " by hand. Check Business Profile (and its invitation email) to confirm.</p>" : "") +
        (d.locations.length ? '<p class="hint">Google sends ' + esc(d.agency_google_email) + " an invitation for each profile. Accept it (in the email or at business.google.com), then mark it here.</p>" +
          '<div class="tw"><table><thead><tr><th>Profile</th><th>Status</th><th></th></tr></thead><tbody>' + locs + "</tbody></table></div>" : "");
      loadRequests();
    }).catch(function (e) { alert(e.message); });
  }
  function showForm(l) {
    editing = l || null;
    var f = document.getElementById("linkForm");
    f.hidden = false; document.getElementById("formErr").textContent = "";
    document.getElementById("formTitle").textContent = l ? "Edit link" : "New link";
    var v = { title: l ? l.title : "", slug: l ? l.slug : "", agencyGoogleEmail: l ? l.agency_google_email : "", accessLevel: l ? l.access_level : "manager",
      notifyEmail: l ? (l.notify_email || "") : "", logoUrl: l ? (l.logo_url || "") : "", brandColor: l ? (l.brand_color || "") : "", welcomeText: l ? (l.welcome_text || "") : "" };
    Object.keys(v).forEach(function (k) { f.elements[k].value = v[k]; });
    f.elements.title.focus();
  }
  document.getElementById("newLink").onclick = function () { showForm(null); };
  document.getElementById("cancelForm").onclick = function () { document.getElementById("linkForm").hidden = true; };
  document.getElementById("linkForm").onsubmit = function (e) {
    e.preventDefault();
    var f = e.target, body = {};
    ["title", "slug", "agencyGoogleEmail", "accessLevel", "notifyEmail", "logoUrl", "brandColor", "welcomeText"].forEach(function (k) { body[k] = f.elements[k].value; });
    api(editing ? "/api/access/links/" + encodeURIComponent(editing.id) : "/api/access/links", { method: editing ? "PATCH" : "POST", body: body })
      .then(function () { f.hidden = true; return loadLinks(); })
      .catch(function (err) { document.getElementById("formErr").textContent = err.message; });
  };
  document.getElementById("statusFilter").onchange = function (e) { filter = e.target.value; loadRequests(); };
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("button") : null; if (!t) return;
    if (t.dataset.copy) {
      var l = links.find(function (x) { return x.id === t.dataset.copy; });
      navigator.clipboard.writeText(linkUrl(l)).then(function () { t.textContent = "Copied"; setTimeout(function () { t.textContent = "Copy link"; }, 1500); },
        function () { prompt("Copy this link:", linkUrl(l)); });
    }
    if (t.dataset.edit) showForm(links.find(function (x) { return x.id === t.dataset.edit; }));
    if (t.dataset.toggle) {
      var l2 = links.find(function (x) { return x.id === t.dataset.toggle; });
      api("/api/access/links/" + encodeURIComponent(l2.id), { method: "PATCH", body: { isActive: !l2.is_active } }).then(loadLinks).catch(function (err) { alert(err.message); });
    }
    if (t.dataset.open) openDetail(t.dataset.open);
    if (t.dataset.accept) api("/api/access/requests/" + encodeURIComponent(openId) + "/locations/" + encodeURIComponent(t.dataset.accept) + "/accepted", { method: "POST" })
      .then(function () { openDetail(openId); }).catch(function (err) { alert(err.message); });
    if (t.id === "closeDetail") { document.getElementById("detail").hidden = true; openId = null; loadRequests(); }
  });
  function showConfig(c) {
    if (c.publicBase) publicBase = c.publicBase;
    var n = document.getElementById("modeNote"), msg = "";
    if (c.publicBase && !c.reachable) msg = "The client pages at " + c.publicBase + " didn't answer. Check that the client-access app is released and its address is set up.";
    else if (c.mode === "mock") msg = "Test mode: clients see sample profiles and nothing is sent to Google (GBP_MODE=mock).";
    else if (c.mode === "manual") msg = "Manual mode: clients get the step-by-step guide to add you by hand (GBP_MODE=manual, or the Google keys aren't set).";
    if (c.emailOn === false) msg += (msg ? " " : "") + "Emails are off until RESEND_API_KEY and a sender address are set.";
    n.textContent = msg; n.hidden = !msg;
  }
  // The links are drawn after the config, so they show the client pages' own address.
  api("/api/access/config").then(showConfig, function () {})
    .then(loadLinks).then(loadRequests).catch(function (e) { alert(e.message); });
})();
</script>
</body></html>`;
