// The pages a client sees (public, no sign-in): /connect/<slug>, /select, /done, /manual.
// Branded with the agency's name, logo and colour; same look as the rest of the app.

import { DEFAULT_ACCENT, FONT_LINKS, THEME_BOOT, THEME_BUTTON, THEME_SCRIPT, themeCss } from "../theme";
import { BASE_CSS } from "./agency-page";
import type { GbpMode } from "./config";
import type { LocationStatus, RequestLink } from "./db";

export interface Brand { name: string; logo: string | null; color: string }

/** The agency's name in a sentence, or "us" when Settings has none. */
const who = (b: Brand) => esc(b.name || "us");

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function brandFor(link: RequestLink, agencyName: string): Brand {
  return {
    name: agencyName.trim(),
    logo: link.logo_url && /^https:\/\//i.test(link.logo_url) ? link.logo_url : null,
    color: link.brand_color && /^#[0-9a-f]{6}$/i.test(link.brand_color) ? link.brand_color : DEFAULT_ACCENT,
  };
}

const role = (link: RequestLink) => (link.access_level === "owner" ? "Owner" : "Manager");

function layout(brand: Brand, title: string, body: string, script = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="same-origin"><title>${esc(title)} · ${esc(brand.name || "Business Profile access")}</title>
<meta name="theme-color" content="#FBF5EA">${FONT_LINKS}${THEME_BOOT}
<style>${themeCss(brand.color)}${BASE_CSS}
  main { max-width: 640px; margin: 0 auto; padding: 28px 16px 48px; display: flex; flex-direction: column; gap: 16px; }
  .top { display: flex; align-items: center; gap: 12px; }
  .top img { max-height: 44px; max-width: 180px; object-fit: contain; }
  .top .mark { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); font: 700 18px/1 var(--serif); flex: none; }
  .top .name { font: 600 18px/1.2 var(--serif); color: var(--head); flex: 1; }
  h1 { font-size: 26px; margin: 0 0 6px; }
  .card h2 { font-size: 17px; margin: 0 0 8px; }
  p { margin: 8px 0; }
  label.f { display: flex; flex-direction: column; gap: 4px; font-weight: 600; font-size: 13px; margin-top: 10px; }
  .big { width: 100%; padding: 12px 18px; font-size: 16px; margin-top: 16px; }
  .note { font-size: 13px; color: var(--muted); }
  .welcome { white-space: pre-line; }
  ol.steps { padding-left: 22px; margin: 8px 0; } ol.steps li { margin: 6px 0; }
  .acct { margin-top: 14px; } .acct h3 { font-size: 15px; margin: 0 0 6px; display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .loc { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; margin-top: 6px; cursor: pointer; }
  .loc input { margin-top: 4px; width: 18px; height: 18px; accent-color: var(--accent); flex: none; }
  .loc .t { font-weight: 600; } .loc .a { font-size: 13px; color: var(--muted); }
  .result { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); }
  .result:first-child { border-top: none; }
  .copy { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .copy code { font-size: 14px; padding: 4px 8px; }
  .foot { text-align: center; font-size: 12px; color: var(--muted); }
</style></head><body><main>
<div class="top">${brand.logo ? `<img src="${esc(brand.logo)}" alt="${esc(brand.name || "Logo")}">` : (brand.name ? `<div class="mark" aria-hidden="true">${esc(brand.name.slice(0, 1).toUpperCase())}</div>` : "")}<div class="name">${brand.logo ? "" : esc(brand.name)}</div>${THEME_BUTTON}</div>
${body}
</main>${THEME_SCRIPT}${script}</body></html>`;
}

function privacyNote(link: RequestLink, brand: Brand, manual: boolean): string {
  if (manual) {
    return `<p class="note">Your privacy: you add <b>${esc(link.agency_google_email)}</b> yourself, in your own Business Profile, so we never see your Google sign-in.
    You can remove ${who(brand)} at any time under People and access.</p>`;
  }
  return `<p class="note">Your privacy: Google asks you to allow access so we can see which business profiles you manage and invite
  <b>${esc(link.agency_google_email)}</b> as a ${esc(role(link).toLowerCase())} on the ones you tick. We don't post anything or change your profiles,
  and we don't keep your Google sign-in: it's deleted as soon as the invitations are sent. You can remove ${who(brand)} from a profile at any time
  in Business Profile, under People and access.</p>`;
}

export function landingPage(link: RequestLink, brand: Brand, mode: GbpMode, error = ""): string {
  const manual = mode === "manual";
  return layout(brand, "Share your Business Profile", `
<section class="card">
  <h1>Share your Google Business Profile with ${who(brand)}</h1>
  ${link.welcome_text ? `<p class="welcome">${esc(link.welcome_text)}</p>` : `<p>This takes about a minute. ${manual ? "We'll show you exactly where to click." : "You sign in with Google, tick your business, and you're done."}</p>`}
  <form method="post" action="/api/connect/${esc(link.slug)}/start">
    <label class="f">Your name <span class="hint">(optional)</span><input type="text" name="name" maxlength="120" autocomplete="name"></label>
    <label class="f">Your email <span class="hint">(optional, for a confirmation)</span><input type="email" name="email" maxlength="160" autocomplete="email"></label>
    ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
    <button type="submit" class="big">${manual ? "Show me how" : "Continue with Google"}</button>
  </form>
  ${manual ? "" : `<p class="note" style="text-align:center"><a href="/connect/${esc(link.slug)}/manual">Prefer to add us yourself?</a></p>`}
</section>
<section class="card">${privacyNote(link, brand, manual)}</section>
${manual ? "" : `<p class="foot">Google will ask you to allow access to your business listings. That's Google's standard wording for this kind of access; we only use it to send the invitations.</p>`}`);
}

export function selectPage(link: RequestLink, brand: Brand, googleEmail: string | null): string {
  return layout(brand, "Choose your profiles", `
<section class="card">
  <h1>Which profiles should we manage?</h1>
  <p class="muted">${googleEmail ? `Signed in as <b>${esc(googleEmail)}</b>. ` : ""}Tick the business profiles to share with ${who(brand)}.</p>
  <div id="list" aria-live="polite"><p class="muted">Looking up your business profiles…</p></div>
  <p class="err" id="err" role="alert"></p>
  <button type="button" class="big" id="grant" disabled>Grant access</button>
  <p class="note">${esc(link.agency_google_email)} is invited as a ${esc(role(link).toLowerCase())} on each profile you tick.</p>
</section>`, `<script>
(function () {
  var slug = ${JSON.stringify(link.slug)};
  var list = document.getElementById("list"), btn = document.getElementById("grant"), err = document.getElementById("err");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function picked() { return Array.prototype.map.call(document.querySelectorAll("input[name=loc]:checked"), function (x) { return x.value; }); }
  function update() { var n = picked().length; btn.disabled = n === 0; btn.textContent = n ? "Grant access to " + n + (n === 1 ? " profile" : " profiles") : "Grant access"; }
  fetch("/api/connect/" + slug + "/locations").then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
    var j = res.j;
    if (j.redirect) { location.href = j.redirect; return; }
    if (!res.ok) { list.innerHTML = ""; err.textContent = j.error || "We couldn't load your profiles."; return; }
    var total = 0;
    list.innerHTML = j.accounts.map(function (a) {
      if (!a.locations.length) return "";
      total += a.locations.length;
      return '<div class="acct"><h3><span>' + esc(a.accountName) + '</span><button type="button" class="ghost small" data-all="' + esc(a.name) + '">Select all</button></h3>' +
        a.locations.map(function (l) {
          return '<label class="loc"><input type="checkbox" name="loc" data-acct="' + esc(a.name) + '" value="' + esc(l.name) + '"><span><span class="t">' + esc(l.title) + '</span><br><span class="a">' + esc(l.address || "No address (service-area business)") + "</span></span></label>";
        }).join("") + "</div>";
    }).join("");
    if (!total) list.innerHTML = '<p>We couldn\\u2019t find any business profiles on this Google account. Try another account, or <a href="/connect/' + esc(slug) + '/manual">add us by hand</a>.</p>';
    if (total === 1) { document.querySelector("input[name=loc]").checked = true; }
    update();
  }).catch(function () { err.textContent = "We couldn't reach the server. Check your connection and reload."; });
  document.addEventListener("change", update);
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-all]") : null; if (!b) return;
    document.querySelectorAll('input[name=loc][data-acct="' + b.dataset.all + '"]').forEach(function (x) { x.checked = true; }); update();
  });
  btn.onclick = function () {
    btn.disabled = true; btn.textContent = "Sending invitations…"; err.textContent = "";
    fetch("/api/connect/" + slug + "/grant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locations: picked() }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) { if (res.j.redirect) { location.href = res.j.redirect; return; } err.textContent = res.j.error || "Something went wrong."; update(); })
      .catch(function () { err.textContent = "We couldn't reach the server. Please try again."; update(); });
  };
})();
</script>`);
}

const RESULT_WORDS: Record<LocationStatus, [string, string]> = {
  pending_invite: ["Invitation sent", "ok"],
  granted: ["Already shared", "ok"],
  failed: ["Not shared", "bad"],
};

export function donePage(link: RequestLink, brand: Brand, rows: { title: string | null; address: string | null; status: LocationStatus; error_message: string | null }[], manual: boolean): string {
  const failed = rows.filter((r) => r.status === "failed").length;
  const head = manual
    ? `<h1>Thanks, we'll take it from here</h1><p>We've passed this on. Once the invitation from Google is accepted, work on your profile can start.</p>`
    : !rows.length ? `<h1>Nothing was shared</h1><p>No profiles were picked.</p>`
    : failed === rows.length ? `<h1>We couldn't share your profiles</h1><p>Google didn't accept the invitations below. You can <a href="/connect/${esc(link.slug)}/manual">add us by hand</a> instead, it takes a minute.</p>`
    : `<h1>Done, thank you!</h1><p>Google has sent ${who(brand)} an invitation for ${failed ? "the profiles marked below" : rows.length === 1 ? "your profile" : "your profiles"}. It will be accepted shortly; there's nothing else you need to do.</p>`;
  const list = rows.length
    ? `<section class="card">${rows.map((r) => {
      const [word, cls] = RESULT_WORDS[r.status];
      return `<div class="result"><div><b>${esc(r.title || "Business profile")}</b>${r.address ? `<div class="note">${esc(r.address)}</div>` : ""}${r.error_message ? `<div class="note err">${esc(r.error_message)}</div>` : ""}</div><span class="pill ${cls}">${esc(word)}</span></div>`;
    }).join("")}</section>`
    : "";
  return layout(brand, "Done", `<section class="card">${head}</section>${list}
  ${failed && failed < rows.length ? `<p class="note">For the ones that weren't shared, you can <a href="/connect/${esc(link.slug)}/manual">add ${esc(link.agency_google_email)} by hand</a>.</p>` : ""}
  <p class="foot">You can remove ${who(brand)} from a profile at any time in Business Profile, under People and access.</p>`);
}

export function manualPage(link: RequestLink, brand: Brand, opts: { hasRequest: boolean; reason?: string | null; error?: string }): string {
  const why = opts.reason === "api"
    ? `<p class="callout">Google hasn't switched on automatic sharing for us yet, so here's how to add us yourself. It takes about a minute.</p>`
    : opts.reason === "google"
      ? `<p class="callout">Something went wrong signing in with Google. No problem: you can add us yourself in about a minute.</p>`
      : "";
  return layout(brand, "Add us to your profile", `${why}
<section class="card">
  <h1>Add ${who(brand)} to your Business Profile</h1>
  <div class="copy"><span>Our email:</span><code id="agencyEmail">${esc(link.agency_google_email)}</code><button type="button" class="ghost small" id="copyEmail">Copy</button></div>
  <ol class="steps">
    <li>On a computer, go to <a href="https://business.google.com" target="_blank" rel="noopener">business.google.com</a> and sign in with the Google account that manages your business (or search for your business name on Google while signed in).</li>
    <li>Open your profile's menu and choose <b>Business Profile settings</b>, then <b>People and access</b>.</li>
    <li>Choose <b>Add</b>, paste <b>${esc(link.agency_google_email)}</b>, set the access to <b>${esc(role(link))}</b> and send the invitation.</li>
    <li>If you have more than one business, repeat this for each one.</li>
  </ol>
  <form method="post" action="/api/connect/${esc(link.slug)}/manual">
    ${opts.hasRequest ? "" : `<label class="f">Your name <span class="hint">(optional)</span><input type="text" name="name" maxlength="120" autocomplete="name"></label>
    <label class="f">Your email <span class="hint">(optional)</span><input type="email" name="email" maxlength="160" autocomplete="email"></label>`}
    ${opts.error ? `<p class="err" role="alert">${esc(opts.error)}</p>` : ""}
    <button type="submit" class="big">I've added you</button>
  </form>
</section>`, `<script>
document.getElementById("copyEmail").onclick = function (e) {
  var t = document.getElementById("agencyEmail").textContent;
  navigator.clipboard.writeText(t).then(function () { e.target.textContent = "Copied"; }, function () { prompt("Copy this email:", t); });
};
</script>`);
}

export function notFoundPage(): string {
  return layout({ name: "Not found", logo: null, color: DEFAULT_ACCENT }, "Link not found",
    `<section class="card"><h1>This link isn't active</h1><p>It may have been mistyped or switched off. Please ask whoever sent it for a new one.</p></section>`);
}

export function expiredPage(link: RequestLink, brand: Brand, message: string): string {
  return layout(brand, "Start again", `<section class="card"><h1>Let's start again</h1><p>${esc(message)}</p>
  <a class="btn big" href="/connect/${esc(link.slug)}">Start again</a></section>`);
}
