// Single-page dashboard served at "/". Plain HTML + JS, no build step.
// Flow: one search row (What + Where, typed with suggestions) -> one answer card ("248 in your
// database: Show them" / "Not collected yet: Collect them") that reuses stored pulls and only pulls
// (and pays for) what's missing -> the list, with one-tap filters and the full dropdowns folded away.
// The Database tab uses the same search row to filter everything collected.

import { FONT_LINKS, THEME_BOOT, THEME_BUTTON, THEME_SCRIPT, themeCss } from "./theme";

export const dashboardHtml = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lead Finder</title>
<meta name="theme-color" content="#FBF5EA">
${FONT_LINKS}
${THEME_BOOT}
<style>
${themeCss()}
  :root { --type-landline: #175cd3; --type-toll: #6941c6; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --type-landline: #84adff; --type-toll: #b692f6; } }
  :root[data-theme="dark"] { --type-landline: #84adff; --type-toll: #b692f6; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  /* The sticky header (and the sticky list bar) never hide what the page scrolls to. */
  html { scroll-padding-top: calc(var(--hdrh, 64px) + var(--barh, 0px) + 8px); }
  body { margin: 0; font: 14px/1.5 var(--sans);
    background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
  header { position: sticky; top: 0; z-index: 30; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: saturate(1.4) blur(10px);
    border-bottom: 1px solid var(--line); padding: 10px 24px; display: flex; align-items: center; gap: 18px; }
  .brand { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; border-radius: 10px; }
  .brand:hover { text-decoration: none; }
  .logo { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: var(--invert-text); background: var(--invert-bg);
    font: 700 15px/1 var(--serif); }
  h1 { font: 700 18px/1.1 var(--serif); color: var(--head); margin: 0; letter-spacing: -.01em; }
  h1 small { font-family: var(--sans); }
  .pagehead h2, .stephead, .modal-head h2, .main h3 { font-family: var(--serif); color: var(--head); font-weight: 600; }
  h1 small { display: block; font-size: 11px; font-weight: 500; color: var(--muted); letter-spacing: 0; }
  h2 { font-size: 15px; margin: 0 0 10px; letter-spacing: -.01em; }
  .tabs { display: flex; gap: 2px; background: var(--chip); padding: 3px; border-radius: 999px; }
  .tab { padding: 6px 14px; border: none; border-radius: 999px; cursor: pointer; color: var(--muted); background: none; font: inherit; font-weight: 500; }
  .tab:hover { color: var(--text); }
  .tab.active { background: var(--panel); color: var(--text); font-weight: 600; box-shadow: var(--shadow); }
  main { padding: 20px 24px 48px; display: flex; flex-direction: column; gap: 16px; max-width: 1480px; margin: 0 auto; }
  .pagehead h2 { font-size: 22px; margin: 4px 0 2px; letter-spacing: -.02em; }
  .pagehead p { margin: 0; color: var(--muted); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; box-shadow: var(--shadow); }
  input, select, button { font: inherit; }
  input[type=text], input[type=number], input[type=date], input[type=password], input[type=email], input[type=search], input[type=url], select { padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: 9px;
    background: var(--panel); color: var(--text); transition: border-color .12s, box-shadow .12s; }
  input:focus-visible, select:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  button { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); cursor: pointer; font-weight: 600;
    box-shadow: 0 1px 2px rgba(15, 23, 42, .08); transition: filter .12s, background .12s, border-color .12s; }
  button:hover { filter: brightness(1.06); }
  button:focus-visible { box-shadow: 0 0 0 3px var(--accent-soft); }
  button.ghost { background: var(--panel); color: var(--text); border-color: var(--line-strong); font-weight: 500; }
  button.ghost:hover { border-color: var(--accent-line); color: var(--accent); filter: none; }
  button.danger:hover { border-color: var(--bad); color: var(--bad); }
  button.ghost.danger { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 35%, var(--panel)); }
  .saved { font-size: 12px; color: var(--ok); font-weight: 600; margin-left: 6px; }
  .saved:empty { display: none; }
  button.link { background: none; border: none; color: var(--accent); padding: 0; box-shadow: none; font-weight: 500; }
  button.small { padding: 4px 11px; font-size: 12px; border-radius: 999px; }
  button:disabled { opacity: .5; cursor: default; filter: none; }
  .muted { color: var(--muted); } .hint { font-size: 12px; color: var(--muted); }
  .err { color: var(--bad); }
  a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
  code { font-size: 12px; background: var(--chip); padding: 1px 5px; border-radius: 5px; }
  .line { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .tag { background: var(--accent-soft); color: var(--accent); border-radius: 99px; padding: 2px 4px 2px 9px; font-size: 12px; display: inline-flex; gap: 4px; align-items: center; }
  .tag button { background: none; border: none; color: inherit; padding: 0 4px; cursor: pointer; font-size: 13px; line-height: 1; box-shadow: none; }

  /* One search row: What / Where (type-ahead with chips), distance, data, Search */
  .sbar { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; }
  .sfield { position: relative; flex: 1 1 260px; min-width: 0; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--panel); padding: 5px 10px 6px; }
  .sfield:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .slbl { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .chipbox { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-height: 28px; cursor: text; }
  .chipbox input[type=text], .chipbox input[type=search] { flex: 1; min-width: 110px; border: none; outline: none; padding: 3px 2px; background: transparent; box-shadow: none; font-size: 15px; }
  .chipbox input[type=text]:focus-visible, .chipbox input[type=search]:focus-visible { box-shadow: none; }
  .tag.more { cursor: pointer; padding-right: 9px; }
  .aclist { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 45; background: var(--panel); border: 1px solid var(--line-strong); border-radius: 12px;
    box-shadow: var(--shadow-pop); padding: 4px; max-height: 320px; overflow-y: auto; }
  .acopt { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
  .acopt.on, .acopt:hover { background: var(--accent-soft); }
  .acsub { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .acact { color: var(--accent); font-weight: 600; }
  .sbar > select { border-radius: 12px; }
  .seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 12px; overflow: hidden; background: var(--panel); }
  .seg label { position: relative; display: flex; align-items: center; padding: 0 14px; cursor: pointer; font-weight: 500; color: var(--muted); white-space: nowrap; }
  .seg input { position: absolute; opacity: 0; pointer-events: none; }
  .seg label.on { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  .seg label:focus-within { outline: 2px solid var(--accent); outline-offset: -2px; }
  #findBtn { padding: 10px 26px; font-size: 15px; border-radius: 12px; }
  .sfoot { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 8px; font-size: 13px; }
  .sfoot:empty { display: none; }
  .optbox { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); display: grid; gap: 10px; }
  .olbl { width: 96px; flex: none; font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  .dbmode .findonly { display: none !important; }
  .examples { margin-top: 10px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; align-items: center; }
  /* The answer to a search: one line per situation, one button each */
  .rhead { font-size: 15px; margin-bottom: 4px; } .rhead .big { font-family: var(--serif); font-size: 26px; color: var(--head); }
  .rline { display: flex; justify-content: space-between; align-items: center; gap: 10px 16px; flex-wrap: wrap; padding: 10px 0; }
  .rline + .rline { border-top: 1px solid var(--line); }
  .rtext { font-size: 15px; }
  .rtext .big { font: 700 24px/1.1 var(--serif); color: var(--head); letter-spacing: -.02em; margin-right: 2px; }
  .rprob { font-size: 13px; color: var(--warn); padding: 3px 0; }
  .rprob.bad { color: var(--bad); } .rprob.info { color: var(--accent-strong); }
  .rprob button.link { font-size: 13px; margin-left: 4px; }
  .rlinks { display: flex; gap: 6px 16px; flex-wrap: wrap; align-items: center; margin-top: 6px; font-size: 13px; }
  .rlinks button.link, .sfoot button.link { padding: 0; }
  /* Results: quick filters + big count */
  .quick { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .qchip { background: var(--panel); color: var(--text); border: 1px solid var(--line-strong); font-weight: 500; box-shadow: none; padding: 5px 12px; font-size: 13px; }
  .qchip:hover { border-color: var(--accent-line); filter: none; }
  .qchip.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-strong); font-weight: 600; }
  .bigcount { font: 700 22px/1.1 var(--serif); color: var(--head); letter-spacing: -.02em; }
  @media (max-width: 760px) { .sfield, .sbar > select, .seg, #findBtn { flex: 1 1 100%; } .seg label { flex: 1; justify-content: center; padding: 9px 8px; } .olbl { width: 100%; } }

  .me { margin-left: auto; align-self: center; display: flex; gap: 12px; align-items: center; font-size: 13px; color: var(--muted); padding-bottom: 8px; }
  .spend { font-size: 12px; padding: 3px 9px; border-radius: 99px; background: var(--bg); white-space: nowrap; }
  .spend.warn { background: var(--warn-soft); color: var(--warn); } .spend.bad { background: var(--bad-soft); color: var(--bad); }
  .bellwrap { position: relative; }
  .bell { background: none; border: 1px solid var(--line-strong); border-radius: 99px; padding: 3px 9px; color: var(--text); position: relative; }
  .bell .badge { position: absolute; top: -6px; right: -6px; background: var(--bad); color: var(--panel); border-radius: 99px; font-size: 11px; padding: 0 6px; font-weight: 700; }
  .bellpanel { position: absolute; right: 0; top: calc(100% + 6px); width: min(380px, 92vw); max-height: 420px; overflow-y: auto; background: var(--panel); border: 1px solid var(--line-strong);
    border-radius: 12px; box-shadow: var(--shadow-pop); z-index: 40; padding: 6px; overscroll-behavior: contain; }
  .bellhead { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px 6px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--line); }
  button.spend { border: none; box-shadow: none; font-weight: 500; cursor: pointer; color: var(--muted); }
  button.spend:hover { filter: none; text-decoration: underline; }
  .note { display: flex; gap: 10px; align-items: flex-start; padding: 10px; border-radius: 8px; font-size: 13px; color: var(--text); }
  .note + .note { border-top: 1px solid var(--line); }
  .note .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; background: var(--warn); }
  .note.error .dot { background: var(--bad); } .note.info .dot { background: var(--accent); }
  .note .when { color: var(--muted); font-size: 11px; margin-top: 2px; }
  .note button { margin-left: auto; flex: none; }

  /* Category picker: a centered pop-up window over the page */
  .modal-backdrop { position: fixed; inset: 0; z-index: 50; background: var(--backdrop); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .modal { width: min(1120px, 100%); height: min(780px, 100%); background: var(--panel); border-radius: 16px; box-shadow: var(--shadow-pop);
    display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); overflow: hidden; overscroll-behavior: contain; }
  .modal-head { padding: 18px 22px 14px; border-bottom: 1px solid var(--line); }
  .modal-head .title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .modal-head h2 { font-size: 18px; margin: 0; }
  .modal-head .x { background: none; border: none; color: var(--muted); font-size: 22px; line-height: 1; padding: 4px 8px; border-radius: 8px; }
  .modal-head .x:hover { background: var(--bg); color: var(--text); }
  .searchrow { display: flex; gap: 10px; align-items: center; }
  .searchbox { flex: 1; position: relative; }
  .searchbox input { width: 100%; padding: 11px 14px 11px 38px; font-size: 15px; border-radius: 10px; border: 1px solid var(--line-strong); }
  .searchbox input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .searchbox::before { content: "⌕"; position: absolute; left: 13px; top: 50%; transform: translateY(-52%); font-size: 18px; color: var(--muted); }
  .pill-btn { border-radius: 99px; padding: 9px 14px; background: var(--panel); color: var(--text); border: 1px solid var(--line-strong); white-space: nowrap; }
  .pill-btn:hover { border-color: var(--accent-line); color: var(--accent); }
  .modal-body { display: grid; grid-template-columns: 290px 1fr; min-height: 0; }
  .side { border-right: 1px solid var(--line); overflow-y: auto; padding: 8px 10px 16px; background: var(--panel-2); }
  .side .gtitle { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--text); margin: 14px 8px 6px; }
  .side .gtitle .ico { width: 26px; height: 26px; border-radius: 8px; background: var(--bg); display: grid; place-items: center; font-size: 14px; }
  .side .sec { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 7px 10px 7px 42px; border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--text); }
  .side .sec:hover { background: var(--bg); }
  .side .sec.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .side .cnt { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .side .cnt.some { background: var(--accent); color: var(--on-accent); border-radius: 99px; padding: 1px 7px; font-weight: 700; }
  .main { overflow-y: auto; padding: 20px 24px 28px; }
  .main .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 4px; flex-wrap: wrap; }
  .main h3 { font-size: 20px; margin: 0 0 2px; }
  .main .sub { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 20px 0 10px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .tile { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line-strong); border-radius: 10px; padding: 11px 12px; cursor: pointer;
    background: var(--panel); text-align: left; font-size: 14px; color: var(--text); line-height: 1.3; transition: border-color .12s, background .12s; }
  .tile:hover { border-color: var(--accent-line); background: var(--accent-soft); }
  .tile .tick { flex: none; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--line-strong); display: grid; place-items: center; font-size: 11px; color: var(--on-accent); }
  .tile.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  .tile.on .tick { background: var(--accent); border-color: var(--accent); }
  .tile .star { margin-left: auto; color: var(--warn); font-size: 12px; }
  .showall { display: inline-flex; align-items: center; gap: 6px; margin-top: 16px; padding: 8px 14px; border-radius: 99px; background: var(--bg); color: var(--accent); border: none; font-weight: 600; }
  .alllist { columns: 3 220px; column-gap: 22px; margin-top: 4px; }
  .alllist label { display: flex; gap: 8px; align-items: flex-start; padding: 5px 0; break-inside: avoid; font-size: 13px; cursor: pointer; }
  .alllist input { margin-top: 2px; accent-color: var(--accent); }
  .alllist .in { color: var(--muted); font-size: 11px; }
  .modal-foot { display: flex; align-items: center; gap: 12px; padding: 12px 22px; border-top: 1px solid var(--line); background: var(--panel-2); }
  .modal-foot .chosen { flex: 1; min-width: 0; display: flex; gap: 6px; overflow-x: auto; white-space: nowrap; align-items: center; min-height: 30px; }
  .modal-foot .done { padding: 9px 20px; border-radius: 10px; font-weight: 600; flex: none; }
  .modal-foot .combo { white-space: nowrap; flex: none; }
  .main, .side, .modal.small .body { overscroll-behavior: contain; }
  @media (max-width: 760px) { .modal-body { grid-template-columns: 1fr; grid-template-rows: 200px 1fr; } .side { border-right: none; border-bottom: 1px solid var(--line); } }

  /* Plan */
  .plan table { margin: 8px 0; }
  .plan .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }

  /* Dropdown chips (multi-select) */
  .filterbar { display: flex; flex-direction: column; gap: 8px; }
  .fgroup { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .fgroup > .glabel { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); width: 88px; flex: none; }
  .dd { position: relative; }
  .dd > .chip { background: var(--panel); color: var(--text); border: 1px solid var(--line-strong); border-radius: 99px; padding: 4px 11px; font-size: 13px; display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
  .dd > .chip.on { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent); }
  .dd > .chip::after { content: "▾"; font-size: 10px; opacity: .7; }
  .pop { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; width: 290px; background: var(--panel); border: 1px solid var(--line-strong); border-radius: 10px;
    box-shadow: var(--shadow-pop); padding: 8px; display: none; }
  .dd.open .pop { display: block; }
  .pop .search { width: 100%; margin-bottom: 6px; }
  .pop .bulk { display: flex; justify-content: space-between; font-size: 12px; padding: 0 2px 6px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
  .pop .opts { max-height: 300px; overflow-y: auto; }
  .pop .opt { display: flex; gap: 7px; align-items: center; padding: 4px 4px; border-radius: 6px; cursor: pointer; }
  .pop .opt:hover { background: var(--bg); }
  .pop .opt .n { margin-left: auto; color: var(--muted); font-size: 12px; }
  .pop .grp { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .03em; color: var(--muted); padding: 8px 4px 3px; }
  .pop .grp button { font-size: 11px; text-transform: none; letter-spacing: 0; font-weight: 500; }
  .pop .empty { padding: 10px; color: var(--muted); font-size: 13px; }
  .pop .dates { display: grid; grid-template-columns: auto 1fr; gap: 6px 8px; align-items: center; font-size: 13px; }

  /* Results */
  /* clip (not hidden): rounded corners without making a scroll box, so the list bar and headings can stick */
  .results { padding: 0; overflow: clip; }
  .bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--line); gap: 10px; flex-wrap: wrap; }
  .scope { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 13px; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 12px; background: var(--chip); color: var(--muted); }
  .bizname { font-weight: 600; color: var(--text); font-size: 14px; cursor: pointer; } .bizname:hover { color: var(--accent); text-decoration: underline; }
  .maplink { font-size: 12px; color: var(--muted); } .maplink:hover { color: var(--accent); text-decoration: none; }
  @media (min-width: 761px) {
    #resultsBody > .bar:first-child { position: sticky; top: var(--hdrh, 64px); z-index: 6; background: var(--panel); }
    #resultsCard .table-wrap.fits { overflow: visible; }
    #resultsCard .table-wrap.fits thead th { position: sticky; top: calc(var(--hdrh, 64px) + var(--barh, 52px)); z-index: 4; }
    #rows td { white-space: normal; }
    #rows td.nowrap, #rows td[data-label="Phone"], #rows td[data-label="Score"], #rows td[data-label="Rating"] { white-space: nowrap; }
    #leadTable th, #leadTable td { padding: 8px 10px; }
    #rows td[data-label="Category"] { min-width: 100px; max-width: 150px; overflow-wrap: anywhere; }
    #rows td[data-label="City"] { min-width: 80px; }
    #rows td[data-label="Website"] { min-width: 130px; max-width: 200px; }
    #rows td[data-label="Website"] a { max-width: 180px; }
    #rows td[data-label="Email"] { max-width: 180px; }
  }
  td[data-label="Email"] a, td[data-label="Email"] s { display: inline-block; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
  .pill.st-untouched { background: var(--chip); color: var(--muted); }
  .pill.st-active { background: var(--accent-soft); color: var(--accent-strong); }
  button.pill.stagepill { border: none; box-shadow: none; padding: 2px 9px; font-size: 12px; cursor: pointer; }
  .pill.ok { background: var(--ok-soft); color: var(--ok); } .pill.bad { background: var(--bad-soft); color: var(--bad); } .pill.warn { background: var(--warn-soft); color: var(--warn); }
  button.pill.scorebtn { border: none; box-shadow: none; cursor: pointer; padding: 1px 9px; font: inherit; font-size: 12px; font-weight: 700; }
  .table-wrap { overflow-x: auto; }
  .nowrap { white-space: nowrap; }
  .cellnote { font-size: 12px; margin-top: 2px; } .bad-text { color: var(--bad); } .ok-text { color: var(--ok); }
  td[data-label="Website"] a { display: inline-block; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; background: var(--panel-2); }
  th[data-sort] { cursor: pointer; user-select: none; }
  th.sorted::after { content: " ▾"; } th.sorted.asc::after { content: " ▴"; }
  td.name { white-space: normal; min-width: 200px; font-weight: 500; }
  .type-mobile { color: var(--ok); } .type-toll_free { color: var(--type-toll); } .type-landline { color: var(--type-landline); }
  .empty-state { text-align: center; padding: 56px 20px; color: var(--muted); }
  .empty-state strong { display: block; color: var(--text); font-size: 16px; margin-bottom: 6px; }
  .history-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; padding: 12px 14px; border-bottom: 1px solid var(--line); }
  label.field { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); }
  @media (max-width: 760px) { .fgroup > .glabel { width: 100%; } }

  /* Phones and small tablets */
  @media (max-width: 760px) {
    header { flex-wrap: wrap; gap: 6px 12px; padding: 10px 12px 0; }
    header h1 { margin-bottom: 4px; }
    .me { order: 2; margin-left: auto; padding-bottom: 4px; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .tabs { order: 3; width: 100%; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
    .tab { white-space: nowrap; padding: 8px 12px; }
    main { padding: 10px 10px 32px; gap: 10px; }
    .card { padding: 12px; border-radius: 12px; }
    .line > * { max-width: 100%; }
    .line select, .line input[type=text] { max-width: 100%; }
    .fgroup { gap: 6px; }
    .dd .pop { position: fixed; left: 8px !important; right: 8px; top: auto; bottom: 8px; width: auto; max-height: 70vh; }
    .bar { padding: 10px; }
    /* Results: one card per business (other tables keep their headings and scroll sideways) */
    #leadTable thead { display: none; }
    #rows td a { overflow-wrap: anywhere; }
    /* Team and Activity log: one labelled card per row */
    table.ctable thead { display: none; }
    table.ctable tr { display: block; padding: 10px 12px; border-bottom: 1px solid var(--line); }
    table.ctable td { display: block; border: none; padding: 1px 0; white-space: normal !important; overflow-wrap: anywhere; }
    table.ctable td[data-label]::before { content: attr(data-label) ": "; color: var(--muted); font-size: 12px; }
    table.ctable td:empty { display: none; }
    table.ctable td.acts { padding-top: 6px; }
    .dlgroup { flex-wrap: wrap; } .dlgroup select { min-width: 0; }
    #rows tr { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; padding: 12px; border-bottom: 1px solid var(--line); }
    #rows td { border: none; padding: 3px 0; white-space: normal; min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
    #rows td::before { content: attr(data-label); display: block; font-size: 11px; color: var(--muted); }
    #rows td.name { grid-column: 1 / -1; font-size: 15px; }
    #rows td.name::before { display: none; }
    #rows td:empty { display: none; }
    #rows td.empty-state { grid-column: 1 / -1; }
    #historyRows td, #teamRows td, #activityRows td { white-space: normal; }
    /* Category picker fills the screen */
    .modal-backdrop { padding: 0; }
    .modal { width: 100%; height: 100%; border-radius: 0; }
    .modal-head { padding: 12px 14px 10px; }
    .searchrow { flex-wrap: wrap; }
    .modal-body { grid-template-columns: 1fr; grid-template-rows: 170px 1fr; }
    .side { border-right: none; border-bottom: 1px solid var(--line); }
    .main { padding: 14px; }
    .tiles { grid-template-columns: 1fr 1fr; gap: 8px; }
    .tile { font-size: 13px; padding: 10px; }
    .alllist { columns: 1; }
    .modal-foot { padding: 10px 12px; flex-wrap: wrap; }
    .modal-foot .chosen { flex-basis: 100%; }
  }
  @media (min-width: 761px) and (max-width: 1100px) {
    main { padding: 14px; }
    .modal { height: min(820px, 100%); }
    .modal-body { grid-template-columns: 240px 1fr; }
  }

  /* Filters: main row, "Showing" chips, more filters */
  .activechips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 24px; }
  details.morefilters > summary { cursor: pointer; color: var(--accent); font-weight: 600; list-style: none; display: inline-flex; gap: 8px; align-items: center; }
  details.morefilters > summary::-webkit-details-marker { display: none; }
  details.morefilters > summary::before { content: "▸"; } details.morefilters[open] > summary::before { content: "▾"; }
  details.morefilters[open] { display: flex; flex-direction: column; gap: 8px; }
  /* Store launch checklist */
  .launch { margin-top: 10px; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--panel-2); }
  .launchlist { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
  .launchlist li { display: grid; grid-template-columns: 22px 1fr; gap: 8px; align-items: start; font-size: 13px; }
  .launchlist .ck { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; border: 1.5px solid var(--line-strong); color: var(--muted); }
  .launchlist li.done .ck { background: var(--ok); border-color: var(--ok); color: var(--panel); }
  .launchlist li.done b { color: var(--muted); font-weight: 500; }
  .packrow { margin-top: 4px; }
  /* Admin sections */
  .subtabs { display: flex; gap: 6px; flex-wrap: wrap; }
  .subtabs button { background: var(--panel); color: var(--text); border: 1px solid var(--line-strong); font-weight: 500; box-shadow: none; padding: 7px 14px; }
  .subtabs button:hover { border-color: var(--accent-line); filter: none; }
  .subtabs button.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-strong); font-weight: 600; }
  .secoff { display: none !important; }
  .cardfail { margin-bottom: 10px; }
  details.dev { margin-top: 8px; } details.dev > summary { cursor: pointer; color: var(--muted); font-size: 12px; }
  /* Results toolbar */
  .baractions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .dlgroup { display: inline-flex; gap: 6px; align-items: center; } #downloadBtn { white-space: nowrap; }
  .dlgroup select { padding: 4px 8px; font-size: 12px; border-radius: 999px; }
  .actmenu { position: absolute; right: 0; top: calc(100% + 6px); width: min(340px, 92vw); background: var(--panel); border: 1px solid var(--line-strong); border-radius: 12px;
    box-shadow: var(--shadow-pop); z-index: 40; padding: 6px; display: flex; flex-direction: column; }
  .actmenu[hidden] { display: none; }
  .actmenu .mhead { font-size: 12px; color: var(--muted); padding: 6px 10px 8px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
  .actmenu > button { background: none; border: none; color: var(--text); text-align: left; box-shadow: none; padding: 8px 10px; border-radius: 8px; display: flex; flex-direction: column; gap: 2px; font-weight: 600; }
  .actmenu > button:hover { background: var(--chip); filter: none; }
  .actmenu > button small { font-weight: 400; color: var(--muted); font-size: 12px; }
  .actmenu .mt { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
  .cost { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; background: var(--warn-soft); color: var(--warn); white-space: nowrap; }
  .cost.free { background: var(--ok-soft); color: var(--ok); }
  .actmenu.cols { width: 230px; max-height: 60vh; overflow-y: auto; }
  .actmenu.cols label { display: flex; gap: 8px; align-items: center; padding: 5px 10px; font-size: 13px; cursor: pointer; }
  .pagerbar { border-bottom: none; border-top: 1px solid var(--line); }
  .pagehead { position: relative; }
  .headacts { float: right; margin: 4px 0 0 12px; }
  @media (max-width: 760px) { .baractions { width: 100%; } .dlgroup { width: 100%; } .dlgroup select { flex: 1; } .headacts { float: none; margin: 0 0 8px; } }  /* In-page dialogs and messages */
  .uitext { margin: 0; white-space: pre-line; }
  .copyrow { display: flex; gap: 8px; } .copyrow input { flex: 1; min-width: 0; font-family: ui-monospace, Menlo, Consolas, monospace; }
  button.dangerbtn { background: var(--bad); border-color: var(--bad); color: var(--panel); }
  .toasts { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 70; display: flex; flex-direction: column; gap: 8px; align-items: center; width: min(560px, calc(100vw - 24px)); pointer-events: none; }
  .toastx { pointer-events: auto; display: flex; gap: 12px; align-items: center; background: var(--invert-bg); color: var(--invert-text); padding: 10px 12px 10px 16px; border-radius: 12px;
    box-shadow: var(--shadow-pop); font-weight: 500; max-width: 100%; animation: toastin .18s ease-out; }
  .toastx > span { flex: 1; } .toastx.bad { background: var(--bad); color: var(--panel); } .toastx.ok { background: var(--ok); color: var(--panel); }
  .toastx button.link { color: inherit; font-weight: 700; text-decoration: underline; } .toastx .tx { text-decoration: none; font-size: 18px; line-height: 1; opacity: .8; }
  @keyframes toastin { from { transform: translateY(8px); opacity: 0; } }  /* Header: tabs never wrap inside; on narrower screens they move to their own row */
  .tab { white-space: nowrap; } h1 { white-space: nowrap; }
  /* One header row down to about 1100px wide: the name hides first, then the tabs get their own row. */
  @media (max-width: 1400px) { .mename { display: none; } .tab { padding: 6px 12px; } header { gap: 14px; padding-left: 18px; padding-right: 18px; } }
  @media (max-width: 1100px) {
    header { flex-wrap: wrap; row-gap: 8px; padding-bottom: 8px; }
    .tabs { order: 3; width: 100%; overflow-x: auto; scrollbar-width: none; }
    .me { margin-left: auto; }
  }
  .tabs::-webkit-scrollbar, .subtabs::-webkit-scrollbar { display: none; }
  /* A strip that scrolls sideways fades at the edge that has more. */
  .tabs.more-r, .subtabs.more-r { -webkit-mask-image: linear-gradient(to right, #000 82%, transparent); mask-image: linear-gradient(to right, #000 82%, transparent); }
  .tabs.more-l, .subtabs.more-l { -webkit-mask-image: linear-gradient(to left, #000 82%, transparent); mask-image: linear-gradient(to left, #000 82%, transparent); }
  .tabs.more-l.more-r, .subtabs.more-l.more-r { -webkit-mask-image: linear-gradient(to right, transparent, #000 14%, #000 86%, transparent); mask-image: linear-gradient(to right, transparent, #000 14%, #000 86%, transparent); }
  /* Account menu, banner */
  .menuwrap { position: relative; }
  .acct { display: inline-flex; align-items: center; gap: 8px; background: var(--panel); color: var(--text); border: 1px solid var(--line-strong); padding: 3px 10px 3px 3px; font-weight: 500; box-shadow: none; }
  .acct:hover { border-color: var(--accent-line); filter: none; }
  .acctmenu { position: absolute; right: 0; top: calc(100% + 6px); min-width: 220px; background: var(--panel); border: 1px solid var(--line-strong); border-radius: 12px;
    box-shadow: var(--shadow-pop); z-index: 40; padding: 6px; display: flex; flex-direction: column; }
  .acctmenu[hidden] { display: none; }
  .acctmenu .who { padding: 6px 10px 8px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--line); margin-bottom: 4px; overflow-wrap: anywhere; }
  .acctmenu button { background: none; border: none; color: var(--text); text-align: left; font-weight: 500; box-shadow: none; padding: 8px 10px; border-radius: 8px; }
  .acctmenu button:hover { background: var(--chip); filter: none; }
  .banner { margin: 12px 24px 0; display: flex; gap: 10px; align-items: flex-start; }
  .banner > span { flex: 1; }
  .banner button.link { color: inherit; font-size: 18px; line-height: 1; }
  .mename { white-space: nowrap; } #me { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
  @media (max-width: 760px) { .mename { display: none; } .banner { margin: 10px 10px 0; } }
  /* Polish */
  .me { margin-left: auto; padding-bottom: 0; }
  #me .pill { margin-left: 4px; }
  .avatar { width: 30px; height: 30px; border-radius: 50%; display: inline-grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 12px; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  tbody tr:hover td { background: var(--panel-2); }
  .results { box-shadow: var(--shadow); }
  .pill { font-weight: 600; }
  .spend { background: var(--chip); }
  .bell { background: var(--panel); }
  .bellpanel, .pop, .modal { background: var(--panel); }
  .empty-state { padding: 64px 20px; }
  @media (max-width: 760px) {
    /* Sticky but compact. No backdrop blur here: it would trap the fixed menus below inside the header. */
    header { position: sticky; top: 0; z-index: 30; padding: 6px 10px 6px; flex-wrap: wrap; row-gap: 6px; backdrop-filter: none; background: var(--bg); }
    header h1 { margin-bottom: 0; font-size: 16px; }
    .logo { width: 30px; height: 30px; }
    .tabs { order: 3; width: 100%; }
    .tab { padding: 6px 11px; }
    .bellpanel, .acctmenu { position: fixed; left: 8px; right: 8px; top: var(--menutop, 56px); width: auto; max-height: calc(100vh - var(--menutop, 56px) - 16px); overflow-y: auto; }
    .spend { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
    .me { gap: 6px; }
    .subtabs { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -10px; padding: 0 10px; }
    .subtabs button { white-space: nowrap; padding: 6px 12px; flex: none; }
    .stats { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
    .brand h1 small { display: none; }
    main { padding: 12px 10px 32px; }
    .pagehead h2 { font-size: 19px; }
  }
  /* Search answer, progress */
  details.breakdown > summary { cursor: pointer; color: var(--accent); font-weight: 600; list-style: none; }
  details.breakdown > summary::-webkit-details-marker { display: none; }
  details.breakdown > summary::before { content: "▸ "; } details[open] > summary::before { content: "▾ "; }
  .callout { margin-top: 10px; padding: 10px 12px; border-radius: 10px; font-size: 13px; }
  .callout.bad { background: var(--bad-soft); color: var(--bad); } .callout.warn { background: var(--warn-soft); color: var(--warn); }
  .plan .actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  button.big { padding: 11px 22px; font-size: 15px; }
  details.breakdown table { margin-top: 8px; }
  .proghead { font-size: 15px; margin: 0 0 4px; }
  .prow { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) minmax(0, 1.6fr) 84px; gap: 8px 14px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); }
  .pname { font-weight: 600; }
  .pbar { height: 8px; border-radius: 99px; background: var(--chip); overflow: hidden; }
  .pbar i { display: block; height: 100%; border-radius: 99px; background: var(--accent); transition: width .6s; }
  .pbar.run i { background: linear-gradient(90deg, var(--accent), var(--accent-line), var(--accent)); background-size: 200% 100%; animation: flow 1.4s linear infinite; }
  .pbar.ok i { background: var(--ok); } .pbar.bad i { background: var(--bad); } .pbar.warn i { background: var(--warn); }
  @keyframes flow { to { background-position: -200% 0; } }
  .pstate { font-size: 13px; } .pstate.ok { color: var(--ok); } .pstate.bad { color: var(--bad); } .pstate.warn { color: var(--warn); } .pstate.run { color: var(--accent); }
  .perr { grid-column: 1 / -1; font-size: 12px; color: var(--bad); }
  tr.noterow td { border-top: none; padding-top: 0; white-space: normal; }
  td.acts { white-space: nowrap; }
  @media (max-width: 760px) {
    .prow { grid-template-columns: minmax(0, 1fr) auto; }
    .prow .pbar { grid-column: 1 / -1; order: 3; }
  }
  .pill.free { background: var(--ok-soft); color: var(--ok); }
  button.recheck { opacity: .45; margin-left: 2px; } tr:hover button.recheck { opacity: 1; }
  input.masked { -webkit-text-security: disc; }
  .callout.info { background: var(--accent-soft); color: var(--accent-strong); }
  .plan .muted-row td { color: var(--muted); }
  .planmsg:empty { display: none; }
  .filterwarn { margin-left: 6px; }
  .modal.small { width: min(420px, 100%); height: auto; grid-template-rows: auto auto auto; }
  .modal.small .body { padding: 16px 22px; display: grid; gap: 10px; }
  .modal.small label { display: grid; gap: 4px; font-size: 13px; font-weight: 600; }
  .modal.small input { width: 100%; padding: 9px 11px; }
  .modal.small.wide { width: min(620px, 100%); max-height: 92vh; overflow: auto; }
  .modal.small textarea { width: 100%; padding: 9px 11px; font: inherit; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--panel); color: var(--text); }
  .modal.small .line label { display: inline-grid; }
  .lnote { border-top: 1px solid var(--line); padding: 8px 0; font-size: 13px; white-space: pre-wrap; }
  .ldacts { display: flex; gap: 8px; flex-wrap: wrap; }
  a.btnlink { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: 13px; text-decoration: none; }
  a.btnlink.ghost { background: var(--panel); color: var(--text); border: 1px solid var(--line-strong); }
  a.btnlink:hover { filter: brightness(1.06); text-decoration: none; }
  .dangerrow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border-top: 1px dashed var(--line-strong); padding-top: 10px; margin-top: 4px; }
  .dangerrow select { padding: 4px 8px; font-size: 12px; }
  .ldsum { display: grid; gap: 8px; }
  .ldbox { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--panel-2); font-size: 13px; }
  .ldbox b { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 4px; }
  .ldbox ul { margin: 0; padding-left: 18px; }
  .ldnext { border-left: 3px solid var(--accent); background: var(--panel); }
  .ldnext b { color: var(--accent-strong); }
  .lnote .who { color: var(--muted); font-size: 12px; }
  .stagepill { cursor: pointer; }
  /* Pipeline board */
  .kanban { display: grid; grid-template-columns: repeat(6, minmax(210px, 1fr)); gap: 10px; overflow-x: auto; align-items: start; padding-bottom: 6px; }
  .kcol { background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 8px; min-height: 220px; }
  .kcol.over { border-color: var(--accent); background: var(--accent-soft); }
  .kcol h3 { font-size: 13px; margin: 2px 4px 8px; display: flex; justify-content: space-between; }
  .kcard { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin-bottom: 6px; cursor: grab; font-size: 13px; box-shadow: var(--shadow); }
  .kcard:hover { border-color: var(--accent-line); }
  .kcard { overflow-wrap: anywhere; }
  .kcard .sub { color: var(--muted); font-size: 12px; }
  .kcard .sc { float: right; font-weight: 700; font-size: 12px; margin-left: 6px; }
  .kcard .kstage { margin-top: 6px; width: 100%; padding: 3px 6px; font-size: 12px; }
  .kcard a { color: var(--text); font-size: 12px; }
  /* Overview */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
  .stat { background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 12px; text-align: left; color: var(--text); font: inherit; box-shadow: none; width: 100%;
    display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; }
  button.stat { cursor: pointer; } button.stat:hover { border-color: var(--accent-line); filter: none; }
  .stat b { display: block; font: 700 24px/1.15 var(--serif); color: var(--head); letter-spacing: -.02em; }
  .stat span { color: var(--muted); font-size: 12px; font-weight: 400; }
  .bars { display: flex; align-items: flex-end; gap: 4px; height: 120px; }
  .bars div { flex: 1; background: var(--accent); border-radius: 4px 4px 0 0; }
  .hbar { display: grid; grid-template-columns: 110px 1fr 70px; gap: 8px; align-items: center; font-size: 13px; margin: 5px 0; }
  .hbar > button { justify-self: start; text-align: left; }
  .hbar i { display: block; height: 10px; background: var(--accent); border-radius: 99px; }
  .hbar i.zero { background: none; }
  .tl { font-size: 13px; padding: 6px 0; border-top: 1px solid var(--line); }
  .tl .who { color: var(--muted); font-size: 12px; }
  /* Map, openers */
  /* isolation: Leaflet's own layers (z-index 400-1000) stay under pop-ups and the sticky header */
  #leadMap { height: 520px; border-radius: 12px; border: 1px solid var(--line); position: relative; z-index: 0; isolation: isolate; }
  .opener { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin-top: 8px; }
  .opener pre { white-space: pre-wrap; font: inherit; margin: 4px 0 0; }
  .opener .h { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 12px; color: var(--muted); }
  .ta { width: 100%; padding: 8px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--panel); color: var(--text); font: inherit; }
  @media (max-width: 700px) { .kanban { grid-template-columns: repeat(6, 78vw); } #leadMap { height: 380px; } }
  /* Small phones: the logo alone (it still goes to Find leads), so the header is two short rows. */
  @media (max-width: 520px) { .brand h1 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); } header .me { flex-wrap: nowrap; } }
  /* Search history on phones: one labelled card per search */
  @media (max-width: 760px) {
    #historyTable thead { display: none; }
    #historyRows tr { display: block; position: relative; padding: 10px 12px 10px 40px; border-bottom: 1px solid var(--line); }
    #historyRows tr.noterow { padding-top: 0; }
    #historyRows tr:has(+ tr.noterow) { border-bottom: none; padding-bottom: 4px; }
    #historyRows td { display: block; border: none; padding: 1px 0; white-space: normal; }
    #historyRows td.hpick { position: absolute; left: 12px; top: 12px; padding: 0; }
    #historyRows td.hwhen { color: var(--muted); font-size: 12px; }
    #historyRows td[data-label]::before { content: attr(data-label) ": "; color: var(--muted); font-size: 12px; }
    #historyRows td.acts { padding-top: 6px; }
    #historyRows td.empty-state { padding: 32px 0; }
    #historyRows tr:has(td.empty-state) { padding-left: 12px; }
  }
  @media (max-width: 760px) { .stats { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); } .stat b { font-size: 20px; } .hbar { grid-template-columns: 96px 1fr 56px; } }
  /* The business window: the title and × stay in view while its body scrolls. */
  .modal.small.wide .modal-head { position: sticky; top: 0; z-index: 3; background: var(--panel); }
  .modal.small.wide .modal-head .title { margin-bottom: 0; }
  .ldsaved { min-height: 18px; }
  .addr { color: var(--muted); }
  /* Upload: a proper file button instead of the browser's own */
  .filepick, .modal.small label.filepick { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-weight: 400; }
  .filepick input[type=file] { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .filepick .fbtn { display: inline-flex; align-items: center; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--panel); font-weight: 600; cursor: pointer; }
  .filepick:focus-within .fbtn { box-shadow: 0 0 0 3px var(--accent-soft); border-color: var(--accent); }
  .pwrow { position: relative; display: block; } .pwrow input { padding-right: 64px !important; }
  .pwrow .show { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); padding: 3px 10px; font-size: 12px; background: var(--chip); color: var(--text); border: none; box-shadow: none; font-weight: 500; }
  .empty-ico { display: block; margin: 0 auto 12px; color: var(--muted); opacity: .7; }
  .ckl { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--text); cursor: pointer; }
  .history-filters label.field input, .history-filters label.field select { height: 36px; }
  .history-filters > button { height: 36px; align-self: end; padding-top: 0; padding-bottom: 0; }
  @media (min-width: 761px) { #storeCard th, #storeCard td { white-space: normal; } #storeCard td.nowrap { white-space: nowrap; } }
  #storeCard td .ghost.small + .ghost.small, #stRows td button + button { margin-top: 4px; }
  .pkempty { font-size: 13px; color: var(--muted); }
  .saved.err { color: var(--bad); }
  /* Small line icons (instead of emoji) */
  svg.ic { width: 1em; height: 1em; vertical-align: -.14em; flex: none; }
  .bell svg.ic { width: 16px; height: 16px; vertical-align: -3px; }
  .tl svg.ic { color: var(--muted); margin-right: 2px; }
  .side .gtitle .ico svg.ic { width: 15px; height: 15px; color: var(--accent); }
  .main .sub svg.ic, .main h3 svg.ic { color: var(--accent); margin-right: 2px; }
  /* Overview: a figure that opens a list says so; the others are plain figures */
  button.stat::after { content: "See them ›"; margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--accent); }
  div.stat { background: none; border-style: dashed; }
  /* Saved searches and Team: the buttons wrap instead of pushing the table off the screen */
  #savedRows td.acts, #teamRows td.acts { white-space: normal; }
  #savedRows td.acts > *, #teamRows td.acts > button { margin: 2px 4px 2px 0; }
  #savedRows td { white-space: normal; }
  #savedRows td.acts { min-width: 220px; }
  /* Long business types break after a slash, not in the middle of a word */
  .kcard, #rows td[data-label="Category"] { overflow-wrap: break-word !important; }
  /* The data switch looks the same whichever is picked; the keyboard outline only for the keyboard */
  .seg label:focus-within { outline: none; }
  .seg label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: -2px; }
  /* Narrower desktop screens: the wide columns give a little, so the list fits and its headings stick */
  @media (min-width: 761px) and (max-width: 1200px) {
    #rows td.name { min-width: 160px; }
    #rows td[data-label="Email"] { max-width: 150px; } td[data-label="Email"] a, td[data-label="Email"] s { max-width: 130px; }
    #rows td[data-label="Website"] { min-width: 110px; max-width: 160px; } #rows td[data-label="Website"] a { max-width: 140px; }
  }
  .launchticks { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
  @media (max-width: 760px) {
    /* The business window is a full-height sheet on phones */
    #leadDialog .modal { width: 100%; height: 100%; max-height: 100%; border-radius: 0; }
    #savedRows td.acts { min-width: 0; }
  }
  /* What to do next: one plain to-do per line, each with one button */
  .nexthead { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .nexthead h2 { margin-bottom: 4px; }
  .nextstep { display: flex; justify-content: space-between; align-items: center; gap: 8px 16px; flex-wrap: wrap; padding: 10px 0; }
  .nextstep + .nextstep { border-top: 1px solid var(--line); }
  .nextstep > div { flex: 1 1 280px; min-width: 0; } .nextstep > button { flex: none; }
  .nextstep .nt { font-weight: 600; } .nextstep .nd { font-size: 13px; color: var(--muted); margin-top: 2px; }
  .nextstep.info .nt { font-weight: 500; color: var(--muted); }
  .ndot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); margin-right: 8px; vertical-align: 1px; }
  .nextstep.info .ndot { background: var(--line-strong); }
  .nextstep > button { white-space: nowrap; }
  /* The one-line "N of these have no Google rating" under the list's toolbar */
  .gapline { font-size: 13px; padding: 6px 2px 8px; color: var(--muted); }
  .gapline button { margin-left: 6px; }
  /* AI helper results in the business window */
  .aibadge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .04em; padding: 0 5px; border-radius: 5px; background: var(--accent-soft); color: var(--accent-strong); vertical-align: 1px; margin-left: 4px; cursor: help; }
  .ldextra { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .aitags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .bigtext { width: 100%; min-height: 96px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; padding: 9px 11px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--panel-2); color: var(--text); resize: vertical; }
</style>
</head>
<body>
<header>
  <a class="brand" href="#find" id="brandHome" title="Go to Find leads"><div class="logo" aria-hidden="true">LF</div><h1>Lead Finder<small id="roleLabel"></small></h1></a>
  <div class="tabs" id="tabStrip">
    <button class="tab active" data-tab="find" type="button">Find leads</button>
    <button class="tab" data-tab="database" type="button">Database</button>
    <button class="tab" data-tab="pipeline" type="button">Pipeline</button>
    <button class="tab" data-tab="overview" type="button">Overview</button>
    <button class="tab" data-tab="history" type="button">Search history</button>
    <button class="tab" data-tab="team" type="button" id="teamTab" hidden>Team</button>
    <button class="tab" data-tab="activity" type="button" id="activityTab" hidden>Admin</button>
    <a class="tab" href="/access" style="text-decoration:none" title="Ask clients for access to their Google Business Profiles">Client access</a>
  </div>
  <div class="me">
    <button type="button" id="spend" class="spend" title="Spent this month (collecting, phone checks, counts) out of the monthly budget"></button>
    <div class="bellwrap"><button type="button" id="bell" class="bell" aria-label="Notifications" aria-haspopup="true" aria-expanded="false" aria-controls="bellPanel"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><span id="bellCount" class="badge" hidden></span></button>
      <div id="bellPanel" class="bellpanel" hidden></div></div>
    ${THEME_BUTTON}
    <div class="menuwrap"><button type="button" class="acct" id="acctBtn" aria-label="Your account" aria-haspopup="true" aria-expanded="false" aria-controls="acctMenu"><span id="me"></span><span aria-hidden="true">▾</span></button>
      <div class="acctmenu" id="acctMenu" hidden><div class="who" id="acctWho"></div>
        <button type="button" id="changePw">Change password</button><button type="button" id="signOut">Sign out</button></div></div>
  </div>
</header>
<div id="limitBanner" class="callout bad banner" hidden><span id="limitText"></span><button type="button" class="link" id="limitClose" aria-label="Close this message">×</button></div>

<main id="findView">
  <div class="pagehead"><div class="headacts"><button type="button" class="ghost" id="uploadBtn" title="Add businesses you already have, from a CSV file"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v5h16v-5"/></svg> Add my own list</button></div><h2 id="pageTitle">Find leads</h2><p id="pageSub">Search by type and place. You see the count and any cost first.</p></div>
  <section class="card nextcard" id="nextCard" aria-labelledby="nextHead" hidden>
    <div class="nexthead"><h2 id="nextHead">What to do next</h2><button type="button" class="link small" id="nextHide" title="Hide this list until you open the page again">Hide</button></div>
    <div id="nextList" class="nextlist"></div>
  </section>
  <section class="card" id="searchCard">
    <form class="sbar" role="search" id="searchForm" autocomplete="off" novalidate>
      <div class="sfield"><label class="slbl" for="whatInput">What</label>
        <div class="chipbox" id="whatBox"><input type="search" id="whatInput" name="lf-what-q" autocomplete="off" data-lpignore="true" data-1p-ignore spellcheck="false" placeholder="Plumber, dentist, roofer…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="whatList"></div>
        <div class="aclist" id="whatList" role="listbox" aria-label="Types of business" hidden></div></div>
      <div class="sfield"><label class="slbl" for="whereInput">Where</label>
        <div class="chipbox" id="whereBox"><input type="search" id="whereInput" name="lf-where-q" autocomplete="off" data-lpignore="true" data-1p-ignore spellcheck="false" placeholder="State or city" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="whereList"></div>
        <div class="aclist" id="whereList" role="listbox" aria-label="Places" hidden></div></div>
      <div class="seg findonly" role="radiogroup" aria-label="Where the businesses come from">
        <label class="on" title="Free: open map data. You get the name, phone, website and address (emails when listed). No star ratings or reviews. Costs nothing."><input type="radio" name="source" value="free" checked>Free</label>
        <label title="Google (paid): straight from Google Maps, with star rating, reviews and verified too. About $5 per 1,000 businesses. You always see the price before anything is spent."><input type="radio" name="source" value="google">Google (paid)</label>
      </div>
      <button id="findBtn" type="button">Search</button>
    </form>
    <div class="sfoot">
      <button type="button" class="link small findonly" id="browseTypes">Browse all types</button>
      <button type="button" class="link small findonly" id="moreBtn" aria-expanded="false" aria-controls="moreOptions">More options ▾</button>
      <span id="findMsg" class="hint" role="status"></span>
    </div>
    <div class="optbox findonly" id="moreOptions" hidden>
      <div class="line"><span class="olbl">Country</span><div class="dd" id="dd-country"></div></div>
      <div class="line"><span class="olbl">Distance</span>
        <select id="radiusMiles" aria-label="Distance" title="For cities: also search the towns around them">
        <option value="">Just the place</option><option value="5">Within 5 mi</option><option value="10">Within 10 mi</option>
        <option value="25">Within 25 mi</option><option value="50">Within 50 mi</option></select>
        <span class="hint">For a city: also take the towns around it.</span></div>
      <div class="line" id="howManyLine"><span class="olbl">How many</span>
        <label class="muted">Up to <select id="maxResults">
          <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100" selected>100</option>
          <option value="250">250</option><option value="500">500</option><option value="1000">1,000</option><option value="2500">2,500</option>
          <option value="5000">5,000</option><option value="10000">10,000</option><option value="0">No limit (everything)</option>
        </select> per search</label></div>
      <div class="line"><span class="olbl">Phones</span>
        <div class="dd" id="dd-phonetypes"></div>
        <label title="Mobile, landline or internet number. Google doesn’t say, so it’s checked after collecting."><input type="checkbox" id="checkPhones"> Check phone types after collecting</label>
        <span class="hint">Small fee per number.</span></div>
      <div class="line" id="countLine"><span class="olbl">Count first</span>
        <label title="See how many exist before collecting. Remembered for a week."><input type="checkbox" id="withCounts" checked> Count on Google</label>
        <select id="countWebsite" aria-label="Count only"><option value="">with or without a website</option><option value="no">without a website</option><option value="yes">with a website</option></select>
        <label><input type="checkbox" id="countPhone"> with a phone</label>
        <label><input type="checkbox" id="countVerified"> verified only</label>
        <span class="hint" title="These also set the matching filters on your list. Collecting always takes every business.">About 1¢ per type and place.</span></div>
    </div>
  </section>

  <section class="card" id="savedCard" hidden>
    <h2 title="New matches are counted every day (free); you get a notification when there are more">Saved searches</h2>
    <div class="table-wrap"><table class="ctable">
      <thead><tr><th>Name</th><th>Search</th><th title="Open, verified businesses, as the Database shows them">In your database</th><th>New</th><th></th></tr></thead>
      <tbody id="savedRows"></tbody>
    </table></div>
  </section>
  <section class="card plan" id="plan" aria-live="polite" hidden></section>

  <section class="card" id="progress" hidden></section>

  <section class="card" id="filtersCard" hidden>
    <div class="line" id="aiLine" style="margin-bottom:10px" hidden>
      <input type="text" id="aiText" placeholder="Describe it: roofers in Tampa with no website and under 20 reviews" style="flex:1;min-width:240px">
      <button type="button" id="aiGo" class="small" title="Sets the filters for you to check (about 1-2 cents)">Set filters</button>
      <span id="aiMsg" class="hint"></span>
    </div>
    <div class="filterbar" id="filterbar"></div>
  </section>

  <section class="card" id="mapCard" hidden>
    <div class="line" style="margin-bottom:8px"><strong>Map</strong><span id="mapInfo" class="hint"></span><span style="flex:1"></span>
      <button type="button" class="ghost small" id="mapDraw" title="Click the map to add corners, then press Use this area">Draw an area</button><button type="button" class="small" id="mapUse" hidden>Use this area</button>
      <button type="button" class="ghost small" id="mapClear" hidden>Clear the area</button><button type="button" class="ghost small" id="mapClose">Hide map</button></div>
    <div id="leadMap"></div>
    <div class="hint" style="margin-top:6px">Red: score under 40 (best prospects) · amber: 40-59 · green: 60+ · grey: not scored.</div>
  </section>

  <section class="card results" id="resultsCard">
    <div class="empty-state" id="emptyState">
      <svg class="empty-ico" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
      <strong id="emptyMsg">Type what and where, then press Search.</strong>
      <div class="examples" id="examples">Try:
        <button type="button" class="ghost small" data-example="plumb|Tampa|FL">Plumbers in Tampa, FL</button>
        <button type="button" class="ghost small" data-example="electric|Orlando|FL">Electricians in Orlando, FL</button>
        <button type="button" class="ghost small" data-example="roof||FL">Roofers in Florida</button></div>
    </div>
    <div id="resultsBody" hidden>
      <div class="bar">
        <div class="scope"><strong id="count" class="bigcount"></strong> <span id="dupInfo" class="muted"></span> <span id="scopeInfo"></span></div>
        <div class="baractions">
          <div class="menuwrap"><button class="ghost small" id="improveBtn" type="button" aria-haspopup="true" aria-expanded="false" title="Add what’s missing (phone types, Google ratings…) for every business in this list">Fill in missing info ▾</button>
            <div class="actmenu" id="improveMenu" hidden>
              <div class="mhead">For every business in this list. You see the price first.</div>
              <button type="button" id="checkSitesBtn"><span class="mt">Check their websites <span class="cost free">Free</span></span><small>Adds booking, contact form, ads, emails and owner names</small></button>
              <button type="button" id="checkPhonesBtn"><span class="mt">Check phone types <span class="cost" id="phoneCost">Small fee</span></span><small>Adds mobile, landline or internet number</small></button>
              <button type="button" id="verifyBtn"><span class="mt">Verify emails <span class="cost">Small fee</span></span><small>Marks emails that would bounce, so yours don’t</small></button>
              <button type="button" id="googleDetailsBtn"><span class="mt">Add Google ratings <span class="cost" id="gdCost">about $5 per 1,000</span></span><small>Adds star rating, reviews and verified to free-data businesses</small></button>
            </div></div>
          <button class="ghost small" id="bulkBtn" type="button" title="Give every business in this list to a team member, or set their stage">Assign</button>
          <div class="menuwrap"><button id="downloadBtn" type="button" aria-haspopup="true" aria-expanded="false" title="Every business in this list (all pages). Do-not-contact businesses and emails that would bounce are left out.">Download ▾</button>
            <div class="actmenu" id="dlMenu" hidden>
              <div class="mhead">Every business in this list, as a CSV file</div>
              <button type="button" data-export="ghl"><span class="mt">For GoHighLevel</span><small>Ready to import as contacts</small></button>
              <button type="button" data-export="cold_email"><span class="mt">For cold email (CSV)</span><small>Instantly, Smartlead and the like</small></button>
              <button type="button" data-export="simple"><span class="mt">Simple spreadsheet</span><small>For Excel or Google Sheets</small></button>
            </div></div>
          <div class="menuwrap"><button class="ghost small" id="toolsBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="More: map and columns" title="More: map and columns">⋯</button>
            <div class="actmenu" id="toolsMenu" hidden>
              <button type="button" id="mapBtn"><span class="mt" id="mapBtnText">Map</span><small>See them on a map; draw an area to narrow the list</small></button>
              <button type="button" id="colsBtn" aria-haspopup="true" aria-expanded="false"><span class="mt">Columns</span><small>Pick which columns to show</small></button>
            </div>
            <div class="actmenu cols" id="colsMenu" hidden></div></div>
        </div>
      </div>
      <div class="gapline" id="gapLine" hidden></div>
      <div class="table-wrap">
        <table id="leadTable">
          <thead><tr>
            <th data-sort="name">Business</th><th data-sort="score" class="sorted asc" aria-sort="ascending" title="Online presence score out of 100. Red (under 40) = weak online presence = the most you can sell them. Green (60+) = already strong. Sorted lowest first: the best prospects.">Score</th><th data-sort="stage">Stage</th><th data-sort="category">Category</th><th>Phone</th><th>Email</th><th>Phone type</th><th>Website</th>
            <th data-sort="rating">Rating</th><th data-sort="reviews">Reviews</th><th data-sort="rank">Position</th><th>Verified</th>
            <th>Status</th><th>Location</th><th data-sort="city">City</th><th>State</th><th>Neighborhood</th><th data-sort="added">Added</th>
          </tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <div class="bar pagerbar"><span id="pageInfo" class="muted"></span><span>
        <button class="ghost small" id="prevBtn" type="button">‹ Previous</button> <button class="ghost small" id="nextBtn" type="button">Next ›</button></span></div>
    </div>
  </section>
</main>

<main id="pipelineView" hidden>
  <div class="pagehead"><h2>Pipeline</h2><p>Your leads by stage, closed or not verified ones too. Click one for notes and next steps.</p></div>
  <section class="card">
    <div class="line"><label class="muted">Whose <select id="pWho"><option value="me">My leads</option><option value="">Everyone</option><option value="none">Nobody’s yet</option></select></label>
      <input type="search" id="pSearch" placeholder="Business name…" aria-label="Business name"><span id="pMsg" class="hint"></span></div>
  </section>
  <div class="callout warn" id="pFail" hidden></div>
  <div class="kanban" id="kanban"></div>
</main>

<main id="overviewView" hidden>
  <div class="pagehead"><h2>Overview</h2><p>How the database and the pipeline are doing.</p></div>
  <section class="card nextcard" id="ovNextCard" hidden><div class="nexthead"><h2>What to do next</h2></div><div id="ovNext" class="nextlist"></div></section>
  <section class="card"><div class="stats" id="ovStats"><div class="hint">Loading…</div></div></section>
  <section class="card"><h2>Hot leads: opened their report in the last 2 weeks</h2><div id="ovHot"></div></section>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
    <section class="card"><h2>Pipeline</h2><div class="hint" style="margin:-6px 0 6px">Every business being worked, closed or not verified ones too.</div><div id="ovStages"></div></section>
    <section class="card"><h2>New businesses per day (last 14 days)</h2><div class="bars" id="ovGrowth"></div><div class="hint" id="ovGrowthHint" style="margin-top:6px"></div></section>
  </div>
  <section class="card"><h2>By team member</h2><div class="table-wrap"><table class="ctable"><thead><tr><th>Who</th><th>Assigned</th><th>Untouched</th><th>Contacted / follow-up</th><th>Interested</th><th>Won</th></tr></thead><tbody id="ovReps"></tbody></table></div></section>
</main>

<main id="historyView" hidden>
  <div class="pagehead"><h2>Search history</h2><p>Every search, what it found and what it cost.</p></div>
  <section class="card results">
    <div class="history-filters">
      <label class="field">Business type<input type="search" id="hCategory" placeholder="e.g. plumber"></label>
      <label class="field">City<input type="search" id="hCity" placeholder="e.g. Orlando"></label>
      <label class="field">State<input type="search" id="hState" placeholder="FL or Florida" style="width:130px"></label>
      <label class="field">Status<select id="hStatus"><option value="">Any</option><option value="done">Done</option>
        <option value="pending">Starting</option><option value="scraping">Collecting</option><option value="ingesting">Saving</option><option value="enriching">Checking phones</option>
        <option value="paused">Waiting (daily free limit)</option><option value="stopped">Stopped</option><option value="failed">Failed</option></select></label>
      <label class="field">From<input type="date" id="hFrom"></label>
      <label class="field">To<input type="date" id="hTo"></label>
      <button class="ghost small" id="hClear" type="button" hidden>Clear filters</button>
      <button class="ghost small" id="hViewSelected" type="button" disabled>Open the ticked lists together</button>
    </div>
    <div class="table-wrap">
      <table id="historyTable">
        <thead><tr><th></th><th>When</th><th>Type of business</th><th>Where</th><th>Status</th>
          <th>Businesses</th><th>Cost</th><th></th></tr></thead>
        <tbody id="historyRows"></tbody>
      </table>
    </div>
    <div class="bar"><span id="historyCount" class="muted"></span><button class="ghost small" id="historyMore" type="button" hidden>Show older searches</button></div>
  </section>
</main>

<main id="teamView" hidden>
  <div class="pagehead"><h2>Team</h2><p>Who can sign in, and what they can do.</p></div>
  <section class="card">
    <h2>Add a team member</h2>
    <div class="line">
      <label class="field">Their email<input type="email" id="tEmail" placeholder="name@company.com" autocomplete="off" spellcheck="false" style="width:230px"></label>
      <label class="field">Name<input type="text" id="tName" placeholder="First Last" style="width:170px"></label>
      <label class="field">Temporary password<input type="text" id="tPassword" style="width:190px"></label>
      <label class="field">Role<select id="tRole"><option value="member">Member</option><option value="admin">Admin (can manage the team)</option></select></label>
      <button type="button" id="tAdd" style="align-self:end">Add</button>
      <span id="tMsg" class="hint" style="align-self:end"></span>
    </div>
    <div class="hint" style="margin-top:8px">They choose their own password when they first sign in.</div>
  </section>
  <section class="card results">
    <div class="bar"><span id="teamCount" class="muted"></span><label class="ckl" id="tOffWrap" hidden><input type="checkbox" id="tShowOff"> Show switched-off people</label></div>
    <div class="table-wrap"><table class="ctable">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
      <tbody id="teamRows"></tbody>
    </table></div>
  </section>
</main>

<main id="activityView" hidden>
  <div class="pagehead"><h2>Admin</h2><p>Settings for the whole team. Only you see this page.</p></div>
  <nav class="subtabs" id="adminNav" aria-label="Admin sections">
    <button type="button" data-sec="spend">Spending</button>
    <button type="button" data-sec="collect">Data collection</button>
    <button type="button" data-sec="store">Online store <span id="navStoreBadge" class="pill warn" hidden></span></button>
    <button type="button" data-sec="dnc">Do not contact</button>
    <button type="button" data-sec="brand">Agency, wording &amp; score</button>
    <button type="button" data-sec="connect">Connections</button>
    <button type="button" data-sec="backup">Backups</button>
    <button type="button" data-sec="log">Activity log</button>
  </nav>
  <section class="card" data-sec="spend">
    <h2>Monthly spending limit</h2>
    <div class="line">
      <span id="budgetNow" class="muted"></span>
      <label class="muted">Limit per month $ <input type="number" id="budgetInput" min="0" step="5" style="width:110px"></label>
      <button type="button" id="budgetSave">Save</button>
      <span id="budgetMsg" class="hint"></span>
    </div>
    <div class="hint" style="margin-top:6px">Google searches, counts and phone checks that would go over this are refused (free data always works). It starts again on the 1st of each month.</div>
  </section>
  <section class="card" id="freeCard" data-sec="collect">
    <h2>Free data (open map data)</h2>
    <div class="line"><span id="freeNow" class="muted"></span></div>
    <div class="line" style="margin-top:8px">
      <label class="muted">Free businesses saved per day <input type="number" id="freeLimit" min="0" step="500" style="width:110px"></label>
      <button type="button" id="freeLimitSave">Save</button><span id="freeMsg" class="hint"></span>
    </div>
    <div class="table-wrap" style="margin-top:10px"><table>
      <thead><tr><th>Collection</th><th>Status</th><th>Businesses</th><th></th></tr></thead>
      <tbody id="freeRows"></tbody>
    </table></div>
    <h2 style="margin-top:18px">Daily free collection</h2>
    <div class="line">
      <label><input type="checkbox" id="harvestOn"> Collect from the list below every day</label>
      <label class="muted">about <input type="number" id="harvestTarget" min="100" step="500" style="width:100px"> new businesses a day</label>
      <button type="button" id="harvestSave">Save</button><span id="harvestMsg" class="hint"></span>
    </div>
    <div class="hint" id="harvestNow" style="margin-top:6px"></div>
    <div class="callout warn" id="harvestWarn" hidden></div>
    <div class="table-wrap" style="margin-top:8px"><table>
      <thead><tr><th>Type and place</th><th>Last collected</th><th></th></tr></thead>
      <tbody id="harvestRows"></tbody>
    </table></div>
    <div class="hint" style="margin-top:6px" title="Each item is collected again every month, so new businesses keep arriving and closed ones are marked.">Add to this list from a Free data search: “+ Add to daily free collection”.</div>
    <div class="hint" style="margin-top:6px" title="The free database can save about 100,000 changes a day; the rest waits for the next day. 0 = no limit (paid database plan only).">The daily limit above keeps the free database within its limits.</div>
  </section>
  <section class="card" id="sitesCard" data-sec="collect">
    <h2>Website check</h2>
    <div class="line"><span id="sitesNow" class="muted"></span></div>
    <div class="line" style="margin-top:8px">
      <label><input type="checkbox" id="sitesOn"> Check new businesses' websites automatically</label>
      <label class="muted">up to <input type="number" id="sitesLimit" min="100" step="500" style="width:100px"> a day</label>
      <button type="button" id="sitesSave">Save</button><span id="sitesMsg" class="hint"></span>
    </div>
    <div class="hint" style="margin-top:6px" title="Does it load, is it secure and phone-friendly, online booking, contact form, ad tracking, chat, website builder, how old it looks, plus emails, social pages and owner names. Speed is added once the free Google speed key is set up.">Free. Each website is checked once, then the business gets a score (low = more to fix = better prospect).</div>
  </section>
  <section class="card" id="aiCard" data-sec="collect">
    <h2>AI helper</h2>
    <div id="aiNow" class="muted">Loading…</div>
    <div class="line" id="aiSetLine" style="margin-top:8px">
      <label><input type="checkbox" id="aiOn"> Read businesses’ websites with AI</label>
      <label class="muted">Businesses per day <input type="number" id="aiLimit" min="10" max="1500" step="10" style="width:90px"></label>
      <button type="button" id="aiSave">Save</button><span id="aiSaveMsg" class="hint"></span>
    </div>
    <div class="hint" style="margin-top:6px">Free. It writes what each business does, their services, the owner’s name and a first line for your email. What it finds is marked “AI” in the business window: double-check it.</div>
  </section>
  <section class="card" id="agencyCard" data-sec="brand">
    <h2>Your agency (shown on reports)</h2>
    <div class="hint">Shown at the bottom of every shared report, and used in the openers.</div>
    <div class="callout warn" id="agWarn" hidden>Openers will say “our team” until you add your agency name.</div>
    <div class="line" style="margin-top:8px;flex-wrap:wrap">
      <label class="field">Agency name<input type="text" id="agName"></label><label class="field">Phone<input type="text" id="agPhone"></label>
      <label class="field">Email<input type="email" id="agEmail"></label><label class="field">Website<input type="text" id="agSite" placeholder="https://..."></label>
    </div>
    <label class="field" style="margin-top:6px">What you do<textarea id="agBlurb" rows="2" class="ta" placeholder="One or two sentences: what you do for businesses like theirs"></textarea></label>
    <div class="line" style="margin-top:6px"><button type="button" id="agSave">Save</button><span id="agMsg" class="hint"></span></div>
  </section>
  <section class="card" id="openersCard" data-sec="brand">
    <h2>Openers (email, text and call wording)</h2>
    <div class="hint" title="Shown in each business’s pop-up, and as the First Line / SMS columns in the cold email download.">Words in {braces} are filled in per business: <span id="opFields"></span></div>
    <label class="field" style="margin-top:8px">Email subject<input type="text" id="opSubject" class="ta"></label>
    <label class="field">Email<textarea id="opEmail" rows="8" class="ta"></textarea></label>
    <label class="field">Text message<textarea id="opSms" rows="3" class="ta"></textarea></label>
    <label class="field">Call script<textarea id="opCall" rows="4" class="ta"></textarea></label>
    <div class="line" style="margin-top:6px"><button type="button" id="opSave">Save</button><button type="button" class="ghost" id="opReset">Back to the defaults</button><span id="opMsg" class="hint"></span></div>
  </section>
  <section class="card" id="ghlColsCard" data-sec="brand">
    <h2>GoHighLevel download columns</h2>
    <div class="hint" title="Grades and quick wins match the business’s shared report. Report links are made for businesses that don’t have one yet.">Extra columns at the end of the “For GoHighLevel” download, to fill your GoHighLevel custom fields. Type each name exactly as the custom field is called in GoHighLevel, then pick what fills it.</div>
    <div id="ghlColRows" style="margin-top:8px"></div>
    <div class="line" style="margin-top:6px"><button type="button" class="ghost small" id="ghlColAdd">Add a column</button></div>
    <div class="line" style="margin-top:6px"><button type="button" id="ghlColSave">Save</button><button type="button" class="ghost" id="ghlColReset">Back to the starter set</button><span id="ghlColMsg" class="hint"></span></div>
  </section>
  <section class="card" id="formCard" data-sec="brand">
    <h2>“Free website check” form for your agency’s website</h2>
    <div class="hint" title="Their website is checked and scored automatically, and you get a notification. Spam protection is built in.">Put this form on your agency’s website. Owners who fill it in are added here as “Interested”.</div>
    <div class="line" style="margin-top:8px"><a id="formLink" target="_blank" rel="noopener"></a></div>
    <textarea id="formEmbed" rows="3" readonly class="ta" style="margin-top:6px"></textarea>
    <div class="line" style="margin-top:6px"><button type="button" id="formCopy">Copy the code for your website</button><button type="button" class="ghost" id="formNew">New link (stops the old one)</button><span id="formMsg" class="hint"></span></div>
  </section>
  <section class="card" id="storeCard" data-sec="store">
    <h2>Online store <span id="stRemBadge" class="pill warn" hidden></span></h2>
    <div class="hint">Customers unlock leads in your online store with credits. They buy credits by card once card payments are switched on; until then, add credits here when a customer pays you.</div>
    <div class="launch" id="launchBox">
      <div class="line"><strong>Ready to sell?</strong> <span id="launchSummary" class="pill"></span></div>
      <ol class="launchlist" id="launchList"><li class="hint">Loading…</li></ol>
      <div class="hint" id="launchNote"></div>
      <div class="line launchticks">
        <label><input type="checkbox" id="lsLegal"> A lawyer has checked the legal pages</label>
        <label><input type="checkbox" id="lsPaid"> The Cloudflare Workers Paid plan is on</label>
        <button type="button" class="small" id="lsTicksSave">Save</button><span id="lsTicksMsg" class="hint"></span>
      </div>
    </div>
    <h2 style="margin-top:18px">Selling credits</h2>
    <div class="hint">The packs customers can buy by card (once card payments are on). Bigger packs usually get a lower price per credit. Example: 100 credits for $50, 500 for $200.</div>
    <div id="packRows" style="margin-top:8px"></div>
    <div class="line" style="margin-top:6px"><button type="button" class="ghost small" id="packAdd">Add a pack</button></div>
    <div class="line" style="margin-top:10px;flex-wrap:wrap">
      <label class="muted">Send emails from <input type="text" id="lsFrom" placeholder="Miami Goes Local <hello@yourdomain.com>" style="width:320px;max-width:100%"></label>
    </div>
    <div class="line" style="margin-top:6px"><button type="button" id="lsSave">Save</button><span id="lsMsg" class="hint"></span></div>
    <div class="line" style="margin-top:8px"><span id="revenueLine" class="muted"></span></div>
    <h2 style="margin-top:18px">Store settings</h2>
    <div class="line" style="margin-top:8px"><span id="stStats" class="muted"></span></div>
    <div class="line" style="margin-top:8px;flex-wrap:wrap">
      <label class="muted">Standard lead costs <input type="number" id="stPriceFree" min="0" max="1000" step="1" style="width:80px"> credits</label>
      <label class="muted">Premium Google lead costs <input type="number" id="stPriceGoogle" min="0" max="1000" step="1" style="width:80px"> credits</label>
      <label class="muted">New customers get <input type="number" id="stWelcome" min="0" step="1" style="width:90px"> free credits when approved</label>
      <label class="muted nowrap" title="Shown to customers next to every price, e.g. 3 credits ≈ $1.50. Leave it empty to hide dollar amounts.">1 credit = $ <input type="number" id="stCreditPrice" min="0" max="10000" step="0.01" placeholder="e.g. 0.50" style="width:130px"></label>
    </div>
    <div class="line" style="margin-top:6px;flex-wrap:wrap;align-items:end">
      <label class="field">Store name<input type="text" id="stBrand"></label>
      <label class="field">Color<input type="color" id="stColor" style="width:56px;height:36px;padding:0 2px"></label>
      <label class="field">Support email<input type="email" id="stSupport" placeholder="help@yourdomain.com"></label>
      <label class="field">Store web address<input type="url" id="stUrl" placeholder="https://..."></label>
      <label class="field" title="Right-click your logo on your website, Copy image address, and paste it here">Logo address<input type="url" id="stLogo" placeholder="https://.../logo.png"></label>
      <label style="align-self:center"><input type="checkbox" id="stSignup"> New companies can sign up</label>
    </div>
    <div class="line" style="margin-top:6px;flex-wrap:wrap">
      <label class="muted">How new companies join <select id="stSignupMode"><option value="open">Start straight away (self-serve)</option><option value="approval">I approve each one</option></select></label>
      <label class="muted">Free leads every month <input type="number" id="stFreeMonth" min="0" max="10000" step="1" style="width:90px"></label>
      <label><input type="checkbox" id="stPublic"> Let search engines list the public website and catalog (only when you’re ready to launch)</label>
    </div>
    <div class="line" style="margin-top:6px"><button type="button" id="stSave">Save</button><a id="stOpen" target="_blank" rel="noopener" hidden>Open the store</a><span id="stMsg" class="hint"></span></div>
    <h2 style="margin-top:18px">Removal requests <span id="stRemCount" class="pill warn" hidden></span></h2>
    <div class="hint">Business owners who asked, on your public website, to be taken out. “Remove from everything” puts their phone, website and email on your do-not-contact list, so they’re hidden everywhere, including in the store.</div>
    <div class="table-wrap" style="margin-top:8px"><table>
      <thead><tr><th>When</th><th>Business</th><th>Phone / website / email</th><th>From</th><th>Message</th><th>Status</th><th></th></tr></thead>
      <tbody id="stRemRows"></tbody>
    </table></div>
    <h2 style="margin-top:18px">Customers</h2>
    <div class="hint">New sign-ups wait here until you approve them. “Pause” stops a customer from buying (they keep what they bought).</div>
    <div class="table-wrap" style="margin-top:8px"><table>
      <thead><tr><th>Company</th><th>People</th><th>Status</th><th>Credits</th><th>Free used</th><th>Leads bought</th><th>Credits spent</th><th>Last purchase</th><th></th></tr></thead>
      <tbody id="stRows"></tbody>
    </table></div>
  </section>
  <section class="card" id="dncCard" data-sec="dnc">
    <h2>Do-not-contact list</h2>
    <div class="hint" title="Clients, people who asked not to be contacted, anyone to leave alone. Matches collected later are hidden too.">Paste phone numbers, emails or websites. Every matching business is hidden from lists and downloads.</div>
    <textarea id="dncText" rows="3" class="ta" aria-label="Phone numbers, emails or websites" placeholder="(407) 555-1234, info@joesplumbing.com, joesplumbing.com ..." style="margin-top:8px"></textarea>
    <div class="hint">Phone numbers with the area code. One or many, separated by commas or new lines.</div>
    <div class="line" style="margin-top:6px">
      <select id="dncReason" aria-label="Why"><option value="client">Clients</option><option value="asked_to_stop">Asked not to be contacted</option><option value="other">Other</option></select>
      <input type="text" id="dncNote" placeholder="Note (optional)" aria-label="Note"><button type="button" id="dncAdd">Add to the list</button><span id="dncMsg" class="hint"></span>
    </div>
    <div class="line" style="margin-top:10px"><input type="search" id="dncSearch" placeholder="Search the list…" aria-label="Search the list"><span id="dncCount" class="hint"></span></div>
    <div class="table-wrap" style="margin-top:6px"><table><thead><tr><th>Entry</th><th>Reason</th><th>Added</th><th></th></tr></thead><tbody id="dncRows"></tbody></table></div>
  </section>
  <section class="card" id="weightsCard" data-sec="brand">
    <h2>What counts in the score</h2>
    <div class="hint" title="Scores are always shown out of 100, so only how the numbers compare matters.">Points for each thing (0-50). Low score = more to fix = better prospect.</div>
    <div id="weightsForm" style="margin-top:8px"></div>
    <div class="line" style="margin-top:8px"><button type="button" id="weightsSave">Save and re-score</button><button type="button" class="ghost" id="weightsReset">Back to the defaults</button><span id="weightsMsg" class="hint"></span></div>
  </section>
  <section class="card" id="apiCard" data-sec="connect">
    <h2>Connections to other tools</h2>
    <div class="hint" title="A key lets that tool read your businesses and download lists; “can collect” lets it start collections too (Google searches spend from this month’s limit). The key is shown once.">Only for Zapier, Make, a CRM or a developer’s app.</div>
    <div class="line" style="margin-top:8px">
      <input type="text" id="keyName" placeholder="Which tool? e.g. Zapier">
      <label class="muted"><input type="checkbox" id="keyCollect"> can collect (can spend from your monthly limit)</label>
      <button type="button" id="keyAdd">Make a key</button><span id="keyMsg" class="hint"></span>
    </div>
    <div class="table-wrap" style="margin-top:8px"><table>
      <thead><tr><th>Key</th><th>Can collect</th><th>Last used</th><th></th></tr></thead><tbody id="keyRows"></tbody>
    </table></div>
    <h2 style="margin-top:18px">Tell another tool when something happens</h2>
    <div class="hint">Paste the address your tool gives you (for example a Zapier “Catch hook” address) and tick what it should hear about.</div>
    <details class="dev"><summary>Technical details for your developer</summary><div class="hint">Lead Finder posts JSON to the address. Each call has X-LeadFinder-Timestamp (unix seconds) and X-LeadFinder-Signature: sha256=HMAC-SHA256(secret, timestamp + "." + raw body), with the webhook’s secret (shown once). Check the signature and reject calls whose timestamp is more than 5 minutes old.</div></details>
    <div class="line" style="margin-top:8px">
      <input type="text" id="hookUrl" placeholder="https://hooks.zapier.com/..." style="min-width:280px">
      <label class="muted"><input type="checkbox" class="hookEv" value="search.finished" checked> search finished</label>
      <label class="muted"><input type="checkbox" class="hookEv" value="saved_search.new"> new businesses for a saved search</label>
      <label class="muted"><input type="checkbox" class="hookEv" value="list.uploaded"> list uploaded</label>
      <label class="muted"><input type="checkbox" class="hookEv" value="report.viewed"> report or demo opened</label>
      <label class="muted"><input type="checkbox" class="hookEv" value="form.submitted"> website form filled in</label>
      <button type="button" id="hookAdd">Add</button><span id="hookMsg" class="hint"></span>
    </div>
    <div class="table-wrap" style="margin-top:8px"><table>
      <thead><tr><th>Address</th><th>Events</th><th>Last delivery</th><th></th></tr></thead><tbody id="hookRows"></tbody>
    </table></div>
  </section>
  <section class="card" id="backupCard" data-sec="backup">
    <h2>Backups</h2>
    <div class="line"><span id="backupNow" class="muted"></span>
      <button type="button" class="ghost" id="backupRun">Back up now</button><span id="backupMsg" class="hint"></span></div>
    <div class="table-wrap" style="margin-top:10px"><table>
      <thead><tr><th>Backup</th><th>Status</th><th>Rows</th><th>Size</th><th></th></tr></thead>
      <tbody id="backupRows"></tbody>
    </table></div>
    <div class="hint" style="margin-top:6px" id="backupHint"></div>
  </section>
  <section class="card results" data-sec="log">
    <div class="history-filters">
      <label class="field">Person<select id="aUser"><option value="">Everyone</option></select></label>
      <label class="field">Action<select id="aAction"><option value="">Any</option></select></label>
      <label class="field">From<input type="date" id="aFrom"></label>
      <label class="field">To<input type="date" id="aTo"></label>
    </div>
    <div class="table-wrap"><table class="ctable">
      <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
      <tbody id="activityRows"></tbody>
    </table></div>
    <div class="bar"><span id="activityCount" class="muted"></span><span>
      <button class="ghost small" id="aPrev" type="button">‹ Previous</button> <button class="ghost small" id="aNext" type="button">Next ›</button></span></div>
  </section>
</main>

<div id="catPicker" class="modal-backdrop" hidden></div>
<div id="pwDialog" class="modal-backdrop" hidden><div class="modal small" role="dialog" aria-modal="true" aria-label="Change password">
  <div class="modal-head"><div class="title"><h2>Change password</h2><button type="button" class="x" id="pwClose" aria-label="Close">×</button></div></div>
  <form id="pwForm" autocomplete="on" novalidate>
  <div class="body">
    <input type="text" id="pwUser" name="username" autocomplete="username" tabindex="-1" aria-hidden="true" hidden>
    <label>Current password<span class="pwrow"><input type="password" id="pwCurrent" autocomplete="current-password"><button type="button" class="show" data-pwshow="pwCurrent" aria-label="Show the password">Show</button></span></label>
    <label>New password (at least 10 characters)<span class="pwrow"><input type="password" id="pwNew" autocomplete="new-password"><button type="button" class="show" data-pwshow="pwNew" aria-label="Show the password">Show</button></span></label>
    <label>New password again<span class="pwrow"><input type="password" id="pwNew2" autocomplete="new-password"><button type="button" class="show" data-pwshow="pwNew2" aria-label="Show the password">Show</button></span></label>
    <div id="pwMsg" class="hint"></div>
  </div>
  <div class="modal-foot"><span style="flex:1"></span><button type="button" class="ghost" id="pwCancel">Cancel</button><button type="button" id="pwSave">Change password</button></div>
  </form>
</div></div>
<div id="leadDialog" class="modal-backdrop" hidden><div class="modal small wide" role="dialog" aria-modal="true" aria-label="Business">
  <div class="modal-head"><div class="title"><h2 id="ldTitle">Business</h2><button type="button" class="x" data-close="leadDialog" aria-label="Close">×</button></div></div>
  <div class="body">
    <div class="ldacts" id="ldActions"></div>
    <div id="ldFacts"></div>
    <div class="line">
      <label>Stage <span><select id="ldStage"></select><span class="saved" id="ldStageSaved" role="status"></span></span></label>
      <label>Assigned to <span><select id="ldAssign"></select><span class="saved" id="ldAssignSaved" role="status"></span></span></label>
    </div>
    <label>Add a note<textarea id="ldNote" rows="3" placeholder="Called, spoke to the owner, call back Tuesday…"></textarea></label>
    <div><button type="button" id="ldAddNote" class="small">Add note</button> <span id="ldMsg" class="hint" role="status"></span></div>
    <div class="line"><button type="button" id="ldReport" class="ghost small" title="A one-page online presence check with your agency’s details, to send by email or text">Share report</button>
      <button type="button" id="ldDemo" class="ghost small" title="A one-page preview website made for this business, to show what you’d build (opens it and copies the link)">Demo website</button></div>
    <details id="ldOpen" class="breakdown"><summary>Ready-made openers (email, text, call script)</summary><div id="ldOpeners"></div></details>
    <div id="ldNotes"></div>
    <div><div style="font-weight:600;margin-top:4px">Activity</div><div id="ldEvents"></div></div>
    <div class="dangerrow"><span class="hint">Don’t want to contact them?</span>
      <select id="ldDncReason" aria-label="Why"><option value="client">They’re a client</option><option value="asked_to_stop">They asked us not to contact them</option><option value="other">Other reason</option></select>
      <button type="button" id="ldDnc" class="ghost small danger" title="Hide this business (its phone, website and emails) from every list and download">Do not contact</button></div>
  </div>
</div></div>
<div id="bulkDialog" class="modal-backdrop" hidden><div class="modal small" role="dialog" aria-modal="true" aria-label="Update these businesses">
  <div class="modal-head"><div class="title"><h2>Update these businesses</h2><button type="button" class="x" data-close="bulkDialog" aria-label="Close">×</button></div></div>
  <div class="body">
    <div id="bkCount" class="hint"></div>
    <label>Stage <select id="bkStage"></select></label>
    <label>Assign to <select id="bkAssign"></select></label>
    <div id="bkMsg" class="hint"></div>
  </div>
  <div class="modal-foot"><span style="flex:1"></span><button type="button" class="ghost" data-close="bulkDialog">Cancel</button><button type="button" id="bkSave" disabled>Update</button></div>
</div></div>
<div id="uploadDialog" class="modal-backdrop" hidden><div class="modal small" role="dialog" aria-modal="true" aria-label="Add your own list">
  <div class="modal-head"><div class="title"><h2>Add your own list</h2><button type="button" class="x" data-close="uploadDialog" aria-label="Close">×</button></div></div>
  <div class="body">
    <p class="uitext">A spreadsheet saved as CSV, with a <b>Business Name</b> column. Phone, website, email and address columns are used too. Up to 2,000 businesses.</p>
    <div class="hint">From Excel or Google Sheets: File → Download (or Save as) → CSV. Businesses you already have aren’t added twice. <a id="upSample" download="sample-list.csv" href="#">Download a sample CSV</a></div>
    <label>Name of the list<input type="text" id="upName" placeholder="e.g. Trade show contacts"></label>
    <label class="filepick"><input type="file" id="upFile" accept=".csv,text/csv,.txt"><span class="fbtn">Choose a CSV file</span><span id="upFileName" class="muted">No file chosen</span></label>
    <div id="upPreview" class="ldbox" hidden></div>
    <div id="upMsg" class="hint"></div>
  </div>
  <div class="modal-foot"><span style="flex:1"></span><button type="button" class="ghost" data-close="uploadDialog">Cancel</button><button type="button" id="upSave">Upload</button></div>
</div></div>

<div id="uiDialog" class="modal-backdrop" hidden><div class="modal small" role="dialog" aria-modal="true" aria-labelledby="uiTitle">
  <div class="modal-head"><div class="title"><h2 id="uiTitle"></h2><button type="button" class="x" id="uiX" aria-label="Close">×</button></div></div>
  <div class="body" id="uiBody"></div>
  <div class="modal-foot"><span style="flex:1"></span><button type="button" class="ghost" id="uiCancel">Cancel</button><button type="button" id="uiOk">OK</button></div>
</div></div>
<div id="toasts" class="toasts" aria-live="polite"></div>

<script>const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Amounts under a cent (e.g. one phone check) show as "<$0.01" rather than a misleading "$0.00".
// Company size ranges (src/company-facts.ts does the same on the server): "10–19", "$1M–$2.5M".
const rangeOf = (a, b) => a == null ? "" : b == null ? a.toLocaleString() + "+" : a === b ? String(a) : a.toLocaleString() + "–" + b.toLocaleString();
const shortMoney = (n) => n >= 1000000 ? "$" + (+(n / 1000000).toFixed(1)) + "M" : n >= 1000 ? "$" + Math.round(n / 1000) + "k" : "$" + n;
const revenueOf = (a, b) => a == null && b == null ? "" : !a && b != null ? "under " + shortMoney(b) : b == null ? shortMoney(a) + "+" : shortMoney(a) + "–" + shortMoney(b);
const money = (v) => { const n = Number(v || 0); return n > 0 && n < 0.005 ? "<$0.01" : "$" + n.toFixed(2); };
// Only normal web addresses become links. (No slashes in this pattern: this script sits inside a
// template string, where a backslash before a slash is silently dropped.)
const isWebLink = (u) => typeof u === "string" && /^https?:[/][/]/i.test(u);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Small line icons (one look everywhere, no emoji).
const ICONS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  ads: '<path d="M3 10v4h4l8 5V5l-8 5z"/><path d="M18 9a4 4 0 0 1 0 6"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h4"/>',
  stage: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  send: '<path d="M4 12l16-8-6 16-3-6z"/><path d="M11 14l9-10"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  health: '<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="4"/>',
  care: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
  car: '<rect x="3" y="10" width="18" height="7" rx="2"/><path d="M6 10l2-4h8l2 4"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  food: '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2"/>',
  shop: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  event: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};
const icon = (name) => '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.dot) + "</svg>";
async function api(path, opts) {
  // A read that fails (network blip, a busy database) is tried once more before showing an error;
  // so is a change that is safe to repeat (PATCH sets values; a price check or a plan only reads).
  const method = (opts && opts.method) || "GET";
  const isRead = method === "GET" || method === "PATCH" || !!(opts && opts.retry);
  let res;
  try { res = await fetch(path, opts); }
  catch (err) { if (!isRead) throw new Error("Couldn’t reach the server. Check the connection and try again."); await sleep(500); res = await fetch(path, opts).catch(() => null); if (!res) throw new Error("Couldn’t reach the server. Check the connection and try again."); }
  if (isRead && res.status >= 500 && res.status !== 503) { await sleep(500); res = await fetch(path, opts).catch(() => res); }
  const body = await res.json().catch(() => ({}));
  if ((res.status === 401 || res.status === 403) && body.signIn) { location.href = "/login"; throw new Error(body.error || "Please sign in again."); }
  if (res.status === 503 && body.limit) {
    $("limitBanner").hidden = false;
    $("limitText").textContent = body.error + " Free data still works. " + (me && me.role === "super_admin" ? "You can raise the limit on the Admin page (Spending)." : "Ask the owner to raise the monthly limit.");
    if (typeof polling !== "undefined" && polling) { clearInterval(polling); polling = null; }
  }
  if (!res.ok) { const e = new Error(body.error || "Something went wrong (" + res.status + ")"); e.status = res.status; e.body = body; throw e; }
  return body;
}
// A plan, a price check (dryRun) or a preview changes nothing, so it can be tried again too.
const postJson = (path, body) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  retry: !!body && (body.dryRun === true || body.mode === "plan" || body.preview === true) });
const patchJson = (path, body) => api(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Small things remembered on this computer (last search, columns, download format). Never needed: everything works without it. */
const mem = {
  get(k, d) { try { const v = localStorage.getItem("lf." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("lf." + k, JSON.stringify(v)); } catch (e) { /* private window: fine */ } },
};

// ---------------------------------------------------------------------------
// In-page dialogs and messages (instead of the browser's alert / confirm / prompt boxes)
// ---------------------------------------------------------------------------
/** A message at the bottom of the screen. kind: "" | "ok" | "bad". action: { label, run } (e.g. Undo). */
function toast(msg, kind, action) {
  const t = document.createElement("div");
  t.className = "toastx " + (kind || "");
  t.setAttribute("role", kind === "bad" ? "alert" : "status");
  t.innerHTML = "<span>" + esc(msg) + "</span>" + (action ? '<button type="button" class="link tact">' + esc(action.label) + "</button>" : "") +
    '<button type="button" class="link tx" aria-label="Close this message">×</button>';
  $("toasts").appendChild(t);
  const close = () => t.remove();
  t.querySelector(".tx").onclick = close;
  if (action) t.querySelector(".tact").onclick = () => { close(); action.run(); };
  setTimeout(close, kind === "bad" ? 15000 : action ? 15000 : 7000);
}
let uiResolve = null, uiOpts = {};
function uiClose(v) { $("uiDialog").hidden = true; const r = uiResolve; uiResolve = null; if (r) r(v); }
/**
 * One dialog for questions and small forms. o: { title, text | html, fields: [{ id, label, type, value, options, placeholder, hint }],
 * ok, danger, paid, cancel (false = no Cancel), confirmWord (must be typed), validate(values) -> error text }.
 * Resolves to true / false (no fields) or the values / null (fields).
 */
function uiForm(o) {
  if (uiResolve) uiClose(null);
  uiOpts = o;
  const fields = o.fields || [];
  $("uiTitle").textContent = o.title || "";
  $("uiBody").innerHTML = (o.html || (o.text ? '<p class="uitext">' + esc(o.text) + "</p>" : "")) + fields.map((fd) => "<label>" + esc(fd.label || "") +
    (fd.type === "select" ? '<select data-ui="' + esc(fd.id) + '">' + fd.options.map((op) => '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(fd.value == null ? "" : fd.value) ? " selected" : "") + ">" + esc(op[1]) + "</option>").join("") + "</select>"
      : fd.type === "textarea" ? '<textarea rows="3" data-ui="' + esc(fd.id) + '">' + esc(fd.value || "") + "</textarea>"
      : '<input type="' + esc(fd.type || "text") + '" data-ui="' + esc(fd.id) + '" value="' + esc(fd.value == null ? "" : fd.value) + '"' + (fd.placeholder ? ' placeholder="' + esc(fd.placeholder) + '"' : "") + ">") +
    (fd.hint ? '<span class="hint">' + esc(fd.hint) + "</span>" : "") + "</label>").join("") +
    (o.confirmWord ? "<label>Type <b>" + esc(o.confirmWord) + '</b> to go ahead<input type="text" data-ui="__confirm" autocomplete="off" inputmode="numeric"></label>' : "") +
    '<div class="err" id="uiErr" role="alert"></div>';
  $("uiOk").textContent = o.ok || "OK";
  $("uiOk").className = o.danger ? "dangerbtn" : "";
  $("uiCancel").hidden = o.cancel === false;
  $("uiCancel").textContent = o.cancelLabel || "Cancel";
  $("uiDialog").hidden = false;
  const first = $("uiBody").querySelector("input:not([readonly]), select, textarea");
  // Paid or risky: the keyboard starts on Cancel, so a stray Enter never spends or deletes.
  (first || (o.cancel !== false && (o.danger || o.paid) ? $("uiCancel") : $("uiOk"))).focus();
  return new Promise((res) => { uiResolve = res; });
}
$("uiOk").onclick = () => {
  const vals = {};
  $("uiBody").querySelectorAll("[data-ui]").forEach((el) => { vals[el.dataset.ui] = el.value; });
  const plain = (v) => String(v || "").replace(/[ ,]/g, "").toLowerCase();
  if (uiOpts.confirmWord && plain(vals.__confirm) !== plain(uiOpts.confirmWord)) { $("uiErr").textContent = "Type " + uiOpts.confirmWord + " to go ahead."; return; }
  if (uiOpts.validate) { const m = uiOpts.validate(vals); if (m) { $("uiErr").textContent = m; return; } }
  uiClose((uiOpts.fields || []).length ? vals : true);
};
const uiCancel = () => uiClose((uiOpts.fields || []).length ? null : false);
$("uiCancel").onclick = uiCancel; $("uiX").onclick = uiCancel;
$("uiBody").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); $("uiOk").click(); } });
/** Yes / no. */
const ask = (title, text, ok, opts) => uiForm({ title, text, ok: ok || "OK", ...(opts || {}) }).then(Boolean);
/** One line of text, or null. */
const askText = (title, label, value, opts) => uiForm({ title, fields: [{ id: "v", label, value }], ok: "Save", ...(opts || {}) }).then((v) => (v && v.v.trim()) || null);
/** Something to copy (a link, a password, a key) with a Copy button; a link can have an Open button too. */
function showCopy(title, value, text, multiline, openUrl) {
  const box = multiline ? '<textarea readonly id="uiCopyVal" class="bigtext" rows="4">' + esc(value) + "</textarea>"
    : '<input type="text" readonly id="uiCopyVal" value="' + esc(value) + '">';
  const open = openUrl && isWebLink(openUrl) ? '<a class="btnlink ghost" href="' + esc(openUrl) + '" target="_blank" rel="noopener">Open</a>' : "";
  const p = uiForm({ title, cancel: false, ok: "Done",
    html: (text ? '<p class="uitext">' + esc(text) + "</p>" : "") + (multiline ? box + '<div class="line"><button type="button" id="uiCopyBtn" class="ghost small">Copy</button>' + open + "</div>"
      : '<div class="copyrow">' + box + '<button type="button" id="uiCopyBtn" class="ghost">Copy</button>' + open + "</div>") });
  $("uiCopyBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(value); $("uiCopyBtn").textContent = "Copied ✓"; }
    catch (e) { $("uiCopyVal").select(); $("uiCopyBtn").textContent = "Press Ctrl+C"; }
  };
  $("uiCopyBtn").focus();
  return p;
}
// Every pop-up window closes with Escape or a click outside it (the business window asks first if a note isn't saved).
async function closeModal(box) {
  if (!box || box.hidden) return;
  if (box.id === "uiDialog") return uiCancel();
  if (box.id === "catPicker") return closePicker();
  if (box.id === "leadDialog" && $("ldNote").value.trim() && !(await ask("Close without saving the note?", "The note you typed hasn’t been added yet.", "Close anyway", { danger: true }))) return;
  box.hidden = true;
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = [...document.querySelectorAll(".modal-backdrop")].filter((b) => !b.hidden);
  if (open.length) { closeModal(open[open.length - 1]); return; }
  // Menus: the bell, the account menu, Fill in missing info / Download / ⋯ / Columns.
  closeMenus(true);
});
/** Close every small menu; back to the button that opened one when asked (Escape). */
function closeMenus(refocus) {
  const pairs = [["bellPanel", "bell"], ["acctMenu", "acctBtn"], ["improveMenu", "improveBtn"], ["dlMenu", "downloadBtn"], ["toolsMenu", "toolsBtn"], ["colsMenu", "toolsBtn"]];
  for (const [m, b] of pairs) {
    if (!$(m) || $(m).hidden) continue;
    $(m).hidden = true; $(b).setAttribute("aria-expanded", "false");
    if (refocus) $(b).focus();
  }
}
// While a pop-up window is open the page behind it doesn't scroll, and Tab or a screen reader can't reach it.
const lockScroll = () => {
  const open = [...document.querySelectorAll(".modal-backdrop")].some((b) => !b.hidden);
  document.body.style.overflow = open ? "hidden" : "";
  document.querySelectorAll("body > header, body > main, #limitBanner").forEach((el) => {
    if (el.inert === open) return;
    el.inert = open;
    if (open) el.setAttribute("aria-hidden", "true"); else el.removeAttribute("aria-hidden");
  });
};
new MutationObserver(lockScroll).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
document.addEventListener("mousedown", (e) => { if (e.target.classList && e.target.classList.contains("modal-backdrop")) closeModal(e.target); });
const PHONE_LABELS = { mobile: "Mobile", landline: "Landline", toll_free: "Toll-free", voip: "Internet (VoIP)", unknown: "Couldn’t tell", unchecked: "Not checked yet", no_phone: "No phone" };
const STATUS_LABELS = { operational: "Open", temporarily_closed: "Temporarily closed", permanently_closed: "Permanently closed" };
const SITE_PROBLEM_LABELS = {
  no_booking: "No online booking", no_form: "No contact form", no_tracking: "No ad tracking (Facebook or Google)", no_meta_pixel: "No Facebook ad tracking",
  no_https: "Not secure (no https)", not_mobile: "Not mobile friendly", outdated: "Looks outdated (© 3+ years old)", no_chat: "No chat widget",
  slow: "Slow on phones (speed under 50)",
};
/** Score pill: the overall number, coloured (low = opportunity), with the notes on hover. */
function scoreCell(l) {
  if (l.presence_score == null) return '<span class="muted" title="Scored once the website is checked or Google details arrive">–</span>';
  let n = {}; try { n = JSON.parse(l.score_notes || "{}"); } catch (e) { n = {}; }
  const tip = [l.gbp_score != null ? "Google profile " + l.gbp_score + "/100: " + (n.gbpComment || "") : "Google profile: not known (free data)",
    l.website_score != null ? "Website " + l.website_score + "/100: " + (n.websiteComment || "") : "Website: not checked yet",
    (n.suggestions || []).length ? "What to fix: " + n.suggestions.join("; ") : ""].filter(Boolean).join(" | ");
  // No website at all scores 0: say that instead of a red 0.
  if (Number(l.presence_score) === 0 && !l.website_domain && !isWebLink(l.website)) return '<button type="button" class="pill scorebtn" data-lead="' + esc(l.id) + '" title="No website, so nothing to score yet. Click for the details">No site</button>';
  const cls = l.presence_score >= 60 ? "ok" : l.presence_score >= 40 ? "warn" : "bad";
  // Low score = weak online presence = more you can sell them.
  return '<button type="button" class="pill scorebtn ' + cls + '" data-lead="' + esc(l.id) + '" title="' + esc(tip + " | Click for the details") + '">' + esc(l.presence_score) + "</button>";
}
/** Names as people would write them: no stray leading symbols or invisible characters, and "JOE'S PLUMBING LLC" -> "Joe's Plumbing LLC". */
const INVISIBLE = new RegExp("[" + String.fromCharCode(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0xad) + "]", "g");
const KEEP_UPPER = new Set(["LLC", "LLP", "USA", "US", "HVAC", "AC", "II", "III", "IV", "CPA", "DDS", "DMD", "MD", "PA", "PC", "PLLC", "BBQ", "TV", "RV", "ATM", "DJ", "LP", "IT", "UPS", "ABC", "AAA", "BMW", "GMC"]);
function bizName(raw) {
  let s = String(raw || "").replace(INVISIBLE, "").replace(/^[ *•·._,;:|~=+"'!?>-]+/, "").trim();
  if (!s) return String(raw || "").trim() || "Business";
  if (/[A-Z]{2}/.test(s) && !/[a-z]/.test(s)) {
    s = s.split(" ").map((w) => {
      const bare = w.replace(/[^A-Za-z]/g, "");
      if (KEEP_UPPER.has(bare) || (bare.length > 1 && bare.length <= 3 && !/[AEIOUY]/.test(bare))) return w;
      return w.toLowerCase().replace(/(^|[(&/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
    }).join(" ");
  }
  return s;
}
/** The best email, how it checked out, and how many more there are. */
function emailCell(l) {
  if (!l.emails) return '<span class="muted">—</span>';
  const KIND = { personal: "a person", role: "shared inbox", freemail: "free mail" };
  const CHECK = { ok: ' <span class="ok-text" title="Verified: safe to send">✓</span>', catch_all: ' <span class="muted" title="Risky: the domain accepts every address">?</span>',
    unknown: "", invalid: ' <span class="bad-text" title="Would bounce: left out of downloads">✗</span>', disposable: ' <span class="bad-text" title="A throwaway address: left out of downloads">✗</span>', queued: "" };
  const list = l.emails.split(", ");
  const more = list.length > 1 ? ' <span class="muted">+' + (list.length - 1) + "</span>" : "";
  // An address that would bounce isn't offered as a link.
  if (l.email_check === "invalid" || l.email_check === "disposable")
    return '<s class="muted" title="' + esc(l.emails + " · would bounce: left out of downloads") + '">' + esc(list[0]) + '</s> <span class="bad-text">' + (l.email_check === "invalid" ? "bounces" : "throwaway") + "</span>" + more;
  return '<a href="mailto:' + esc(list[0]) + '" title="' + esc(l.emails + (l.email_kind ? " · " + (KIND[l.email_kind] || "") : "")) + '">' + esc(list[0]) + "</a>" + (CHECK[l.email_check] || "") + more;
}
/** What the website check found, in a few words under the website link. */
function siteFacts(l) {
  const KIND = { personal: "a person", role: "shared inbox", freemail: "free mail" };
  const CHECK = { ok: '<span class="ok-text" title="Verified: safe to send">✓ valid</span>', catch_all: '<span class="muted" title="The domain accepts every address, so it can’t be confirmed">⚠ risky</span>',
    unknown: '<span class="muted" title="The mail server didn’t answer clearly">⚠ unknown</span>', invalid: '<span class="bad-text" title="Would bounce: left out of downloads">✗ bounces</span>',
    disposable: '<span class="bad-text" title="A throwaway address: left out of downloads">✗ throwaway</span>', queued: '<span class="muted">checking…</span>' };
  const emails = ""; // shown in the Email column
  void KIND; void CHECK;
  if (!l.website_domain) return emails;
  if (!l.audit) return (l.website_audit_status === "queued" || l.website_audit_status === "checking" ? '<div class="muted cellnote">checking soon…</div>' : "") + emails;
  let a = {}; try { a = JSON.parse(l.audit); } catch (e) { return emails; }
  if (!a.reachable) return '<div><span class="pill bad" title="' + esc(a.error || "") + '">doesn’t load</span></div>' + emails;
  if (a.error && a.error.startsWith("blocked:")) return '<div class="muted cellnote" title="' + esc(a.error.slice(8)) + '">couldn’t read it</div>' + emails;
  const miss = [];
  if (!a.booking) miss.push("no booking");
  if (!a.form) miss.push("no form");
  if (!a.pixel && !a.gtag) miss.push("no tracking");
  if (!a.https) miss.push("no https");
  if (!a.mobile) miss.push("not mobile");
  if (a.year && a.year <= new Date().getFullYear() - 3) miss.push("© " + a.year);
  if (a.psi != null && a.psi < 50) miss.push("slow (" + a.psi + ")");
  const built = a.builder && a.builder !== "other" ? BUILDER_LABELS[a.builder] || a.builder : "";
  const adSigns = [a.gads ? "Google Ads" : "", a.bing ? "Microsoft Ads" : "", a.calls ? "call tracking (" + a.calls + ")" : ""].filter(Boolean);
  const ads = adSigns.length ? '<div class="cellnote"><span class="pill warn" title="Advertising tags on the website: they spend money on ads">' + icon("ads") + " " + esc(adSigns.join(", ")) + '</span></div>' : "";
  // Email / domain setup: only what's worth saying.
  const soon = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  const setup = [a.mail === "No email on this domain" ? '<span class="bad-text">no email on their domain</span>' : a.mail ? "email: " + esc(a.mail) : "",
    a.since ? (a.since >= new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10) ? '<span class="ok-text">new domain (' + esc(a.since.slice(0, 7)) + ")</span>" : "domain since " + esc(a.since.slice(0, 4))) : "",
    a.cert && a.cert <= soon ? '<span class="bad-text">certificate ends ' + esc(a.cert) + "</span>" : ""].filter(Boolean);
  const setupLine = setup.length ? '<div class="cellnote muted">' + setup.join(" · ") + "</div>" : "";
  return '<div class="cellnote"><span class="muted">' + esc(built) + (built ? " · " : "") + "</span>" +
    (miss.length ? '<span class="bad-text">' + esc(miss.slice(0, 3).join(", ")) + (miss.length > 3 ? " +" + (miss.length - 3) : "") + "</span>" : '<span class="ok-text">all basics in place</span>') + "</div>" + ads + emails;
}
const BUILDER_LABELS = { wordpress: "WordPress", wix: "Wix", squarespace: "Squarespace", shopify: "Shopify", godaddy: "GoDaddy", weebly: "Weebly",
  duda: "Duda", webflow: "Webflow", highlevel: "HighLevel (GHL)", other: "Custom / other" };
const PULL_LABELS = { pending: "Starting", scraping: "Collecting", ingesting: "Saving", enriching: "Checking phones", done: "Done", failed: "Failed", stopped: "Stopped", cancelled: "Stopped", paused: "Waiting – daily free limit" };
/** A search that's still going (a free one paused until tomorrow counts as not running: nothing to wait for today). */
const isRunning = (s) => !!s && RUNNING.includes(s.status) && !s.paused;
const REVIEW_LABELS = { none: "No reviews", "1-10": "1 – 10", "11-100": "11 – 100", "101-1000": "101 – 1,000", "1001-10000": "1,001 – 10,000", "10001+": "More than 10,000" };

// ---------------------------------------------------------------------------
// Dropdown chip: multi-select (default) or single-select, with search, select all / clear, groups and counts.
// ---------------------------------------------------------------------------
const dropdowns = [];
function dropdown(el, cfg) {
  const dd = { el, cfg, selected: cfg.selected || new Set() };
  el.classList.add("dd");
  el.innerHTML = '<button type="button" class="chip"></button><div class="pop"></div>';
  const chip = el.querySelector(".chip"), pop = el.querySelector(".pop");
  let filterText = "";
  dd.summary = () => {
    const opts = cfg.options();
    const picked = [...dd.selected];
    if (cfg.custom) return cfg.summary();
    if (!picked.length) return cfg.label + (cfg.allLabel ? ": " + cfg.allLabel : "");
    if (picked.length === 1) { const o = opts.find((x) => x.value === picked[0]); return cfg.label + ": " + (o ? o.label : cfg.labelOf ? cfg.labelOf(picked[0]) : String(picked[0]).replace("|", ", ")); }
    return cfg.label + ": " + picked.length + " selected";
  };
  // The starting choice (e.g. Status: Open) isn't highlighted: only filters someone changed are.
  dd.defaults = [...dd.selected];
  dd.atDefault = () => dd.selected.size === dd.defaults.length && dd.defaults.every((v) => dd.selected.has(v));
  dd.isOn = () => (cfg.custom ? cfg.isOn() : dd.selected.size > 0 && !dd.atDefault());
  dd.renderChip = () => {
    chip.textContent = dd.summary();
    chip.classList.toggle("on", dd.isOn());
  };
  dd.renderPop = () => {
    if (cfg.custom) { pop.innerHTML = cfg.custom(); cfg.bind && cfg.bind(pop, dd); return; }
    const opts = cfg.options();
    const shown = filterText ? opts.filter((o) => (o.label + " " + (o.group || "")).toLowerCase().includes(filterText)) : opts;
    let html = "";
    if (cfg.search !== false && opts.length > 8) html += '<input type="text" class="search" placeholder="Search…" value="' + esc(filterText) + '">';
    if (cfg.hint) html += '<div class="hint" style="padding:0 2px 6px">' + esc(cfg.hint) + "</div>";
    if (!cfg.single) html += '<div class="bulk">' + (cfg.noBulk ? "<span></span>" : '<button type="button" class="link" data-act="all">Select all' + (filterText ? " shown" : "") + "</button>") + '<button type="button" class="link" data-act="clear">Clear</button></div>';
    html += '<div class="opts">';
    if (!shown.length) html += '<div class="empty">' + esc(cfg.emptyText || "Nothing here yet") + "</div>";
    let group = null;
    for (const o of shown) {
      if (o.group && o.group !== group) {
        group = o.group;
        html += '<div class="grp"><span>' + esc(group) + "</span>" + (cfg.single || cfg.noBulk ? "" : '<button type="button" class="link" data-grp="' + esc(group) + '">Select all</button>') + "</div>";
      }
      const on = dd.selected.has(o.value);
      html += '<label class="opt"><input type="' + (cfg.single ? "radio" : "checkbox") + '" name="' + esc(cfg.label) + '" value="' + esc(o.value) + '"' + (on ? " checked" : "") + "> " +
        '<span>' + esc(o.label) + "</span>" + (o.n != null ? '<span class="n">' + Number(o.n).toLocaleString() + "</span>" : "") + "</label>";
    }
    html += "</div>";
    pop.innerHTML = html;
    const search = pop.querySelector(".search");
    if (search) { search.oninput = () => { filterText = search.value.trim().toLowerCase(); dd.renderPop(); const s = pop.querySelector(".search"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }; }
  };
  const changed = () => { dd.renderChip(); dd.renderPop(); cfg.onChange && cfg.onChange(dd.selected); };
  pop.addEventListener("click", (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    const grp = e.target.dataset && e.target.dataset.grp;
    if (act === "all") { const opts = cfg.options(); (filterText ? opts.filter((o) => (o.label + " " + (o.group || "")).toLowerCase().includes(filterText)) : opts).forEach((o) => dd.selected.add(o.value)); changed(); }
    else if (act === "clear") { dd.selected.clear(); changed(); }
    else if (grp) { cfg.options().filter((o) => o.group === grp).forEach((o) => dd.selected.add(o.value)); changed(); }
  });
  pop.addEventListener("change", (e) => {
    if (cfg.custom) return;
    const input = e.target;
    if (input.classList.contains("search")) return;
    if (cfg.single) { dd.selected.clear(); if (input.value) dd.selected.add(input.value); el.classList.remove("open"); }
    else input.checked ? dd.selected.add(input.value) : dd.selected.delete(input.value);
    changed();
  });
  chip.setAttribute("aria-haspopup", "true");
  chip.setAttribute("aria-expanded", "false");
  // The list opens under the chip; near the right edge it lines up with the chip's right side, and
  // near the bottom of a short screen it opens upwards. (Phones show it as a sheet at the bottom.)
  const placePop = () => {
    ["left", "right", "top", "bottom"].forEach((k) => { pop.style[k] = ""; });
    const opts = pop.querySelector(".opts"); if (opts) opts.style.maxHeight = "";
    if (innerWidth <= 760) return;
    const r = pop.getBoundingClientRect(), c = chip.getBoundingClientRect();
    if (r.right > innerWidth - 8) { pop.style.left = "auto"; pop.style.right = "0"; }
    if (r.bottom > innerHeight - 8) {
      const below = innerHeight - c.bottom - 12, above = c.top - 12 - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdrh")) || 0);
      if (above > below) { pop.style.top = "auto"; pop.style.bottom = "calc(100% + 4px)"; }
      const room = Math.max(above, below), extra = r.height - (opts ? opts.offsetHeight : 0);
      if (opts && r.height > room) opts.style.maxHeight = Math.max(120, room - extra) + "px";
    }
  };
  const drawPop = dd.renderPop;
  dd.renderPop = () => { drawPop(); if (el.classList.contains("open")) placePop(); };
  chip.onclick = () => {
    const open = !el.classList.contains("open");
    dropdowns.forEach((d) => { d.el.classList.remove("open"); d.el.querySelector(".chip").setAttribute("aria-expanded", "false"); });
    if (open) {
      filterText = ""; dd.renderPop(); el.classList.add("open"); chip.setAttribute("aria-expanded", "true");
      placePop();
      const s = pop.querySelector(".search"); if (s) s.focus();
      // e.g. filter counts are only worked out when a dropdown is opened.
      if (cfg.beforeOpen) cfg.beforeOpen().then((changed) => { if (changed && el.classList.contains("open") && !filterText) dd.renderPop(); }).catch(() => {});
    }
  };
  dd.set = (values) => { dd.selected = new Set(values); dd.renderChip(); };
  // New counts/options: update the chip; an open list is left alone so typing isn't wiped.
  dd.refresh = () => { dd.renderChip(); };
  dd.renderChip();
  dropdowns.push(dd);
  return dd;
}
document.addEventListener("click", (e) => { if (!e.target.closest(".dd")) dropdowns.forEach((d) => d.el.classList.remove("open")); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") dropdowns.forEach((d) => d.el.classList.remove("open")); });

// ---------------------------------------------------------------------------
// Search row: What (types of business) and Where (states / cities), typed with suggestions.
// On "Find leads" they say what to collect; on "Database" they set the type / state / city filters.
// ---------------------------------------------------------------------------
let geo = { countries: [], regions: [] }, tree = null;
/** Picked places, each { key, kind: "region" | "city", country, region, city, label }. */
let places = [];

const whereCountry = dropdown($("dd-country"), {
  label: "Countries", allLabel: "none chosen",
  // United States first, then alphabetical.
  options: () => geo.countries.map((c) => ({ value: c.code, label: c.name, group: c.code === "US" ? "Most used" : "All countries" }))
    .sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group === "Most used" ? -1 : 1)),
  onChange: () => { loadRegions().then(renderWhat).catch((err) => setFindMsg(err.message, true)); },
});
// ---------------------------------------------------------------------------
// "What" picker: groups -> sectors -> popular tiles (+ "show all"), one search box, picks as tags.
// ---------------------------------------------------------------------------
const what = { selected: new Set(), refresh: () => renderWhat(), renderChip: () => renderWhat() };
const picker = { sector: "Home Services", search: "", showAll: false };
const sectorOf = (name) => tree && tree.industries.find((i) => i.industry === name);
const inSector = (name) => { const s = sectorOf(name); return s ? s.categories : []; };
let acWhat = null, acWhere = null; // the two type-ahead boxes (made further down)

/** Something changed in the search row: redraw it, and grey out an answer that no longer matches. */
function renderWhat() {
  if (acWhat) { acWhat.render(); acWhere.render(); }
  if (!$("catPicker").hidden) renderPicker();
  updateFindLabel();
  moreLabel();
  markPlanStale();
}
function setFindMsg(text, bad) { $("findMsg").className = bad ? "hint err" : "hint"; $("findMsg").textContent = text || ""; }
// One search = one type in one place. Any search gets a quick answer (database + estimate) up to
// this many; Google collecting then goes 40 at a time.
const MAX_SEARCHES = 400;
function comboCount() { return what.selected.size * Math.max(1, locationsFromBuilder().length); }
function comboText() {
  const t = what.selected.size, pl = Math.max(1, locationsFromBuilder().length);
  return t + " type" + (t === 1 ? "" : "s") + " × " + pl + " place" + (pl === 1 ? "" : "s") + " = " + (t * pl) + " search" + (t * pl === 1 ? "" : "es") +
    (t * pl > MAX_SEARCHES ? " (the most at once is " + MAX_SEARCHES + ")" : "");
}

// Matches the start of any word, so "dent" finds Dentist but not Residents.
function wordMatch(name, q) {
  const words = (s) => " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return words(name).includes(words(q));
}
// Each group of sectors gets a line icon (the server's emoji aren't used).
const GROUP_ICONS = { "Home & Property": "home", "Health & Wellness": "health", "Personal Care & Lifestyle": "care", "Professional & Financial": "work",
  "Automotive & Transport": "car", "Food & Drink": "food", "Retail, Trade & Industry": "shop", "Events, Travel & Community": "event" };
const groupIconOf = (group) => icon(GROUP_ICONS[group] || "dot");
function groupIcon(sector) { const g = tree && tree.groups.find((x) => x.sectors.includes(sector)); return g ? groupIconOf(g.group) : ""; }
function tileHtml(c, sel) {
  return '<button type="button" class="tile' + (sel.has(c.name) ? " on" : "") + '" data-cat="' + esc(c.name) + '"><span class="tick">✓</span><span>' +
    esc(c.name) + "</span>" + (c.top100 ? '<span class="star" title="Top 100">★</span>' : "") + "</button>";
}
function renderPicker() {
  const box = $("catPicker");
  if (!tree) { box.innerHTML = '<div class="modal"><div class="empty-state">Loading categories…</div></div>'; return; }
  const sel = what.selected;
  const total = tree.industries.reduce((s, i) => s + i.categories.length, 0);

  const side = tree.groups.map((g) =>
    '<div class="gtitle"><span class="ico">' + groupIconOf(g.group) + "</span>" + esc(g.group) + "</div>" + g.sectors.map((s) => {
      const cats = inSector(s), picked = cats.filter((c) => sel.has(c.name)).length;
      return '<div class="sec' + (picker.sector === s && !picker.search ? " active" : "") + '" data-sector="' + esc(s) + '"><span>' + esc(s) + '</span>' +
        (picked ? '<span class="cnt some">' + picked + "</span>" : '<span class="cnt">' + cats.length + "</span>") + "</div>";
    }).join("")).join("");

  let main = "";
  const q = picker.search.trim().toLowerCase();
  if (q) {
    const hits = tree.industries.flatMap((i) => i.categories.filter((c) => wordMatch(c.name, q)).map((c) => ({ ...c, sector: i.industry })));
    main = '<div class="head"><div><h3>' + hits.length.toLocaleString() + " result" + (hits.length === 1 ? "" : "s") + '</h3><span class="hint">for "' + esc(picker.search.trim()) + '" across all sectors</span></div>' +
      (hits.length ? '<button type="button" class="pill-btn" data-act="add-hits">Select all ' + Math.min(hits.length, 400) + "</button>" : "") + "</div>";
    if (!hits.length) main += '<p class="muted" style="margin-top:18px">Nothing matches. Try a shorter word, e.g. "roof", "dent" or "pizza".</p>';
    else {
      // Group the hits by sector so the same word in different trades is easy to tell apart.
      const bySector = new Map();
      hits.slice(0, 400).forEach((c) => { if (!bySector.has(c.sector)) bySector.set(c.sector, []); bySector.get(c.sector).push(c); });
      for (const [sector, list] of bySector) main += '<div class="sub">' + groupIcon(sector) + " " + esc(sector) + '</div><div class="tiles">' + list.map((c) => tileHtml(c, sel)).join("") + "</div>";
    }
  } else {
    const cats = inSector(picker.sector);
    const popular = cats.slice(0, tree.popularPerSector);
    const picked = cats.filter((c) => sel.has(c.name)).length;
    main = '<div class="head"><div><h3>' + groupIcon(picker.sector) + " " + esc(picker.sector) + '</h3><span class="hint">' + cats.length + " types" + (picked ? " · " + picked + " picked" : "") + "</span></div><div>" +
      (picked ? '<button type="button" class="link small" data-act="sector-none">Clear</button> &nbsp;' : "") +
      '<button type="button" class="pill-btn" data-act="sector-all">' + (picked === cats.length ? "✓ All selected" : "Select all " + cats.length) + "</button></div></div>" +
      '<div class="sub">Most popular</div><div class="tiles">' + popular.map((c) => tileHtml(c, sel)).join("") + "</div>";
    if (cats.length > popular.length) {
      if (!picker.showAll) main += '<button type="button" class="showall" data-act="show-all">Show all ' + cats.length + " types in " + esc(picker.sector) + " ›</button>";
      else {
        main += '<div class="sub">All ' + cats.length + ' types, A–Z</div><div class="alllist">' + [...cats].sort((a, b) => a.name.localeCompare(b.name)).map((c) =>
          '<label><input type="checkbox" data-cat="' + esc(c.name) + '"' + (sel.has(c.name) ? " checked" : "") + "> <span>" + esc(c.name) + (c.top100 ? ' <span style="color:var(--warn)">★</span>' : "") + "</span></label>").join("") + "</div>";
      }
    }
  }

  const chosen = [...sel];
  const foot = chosen.length
    ? chosen.slice(0, 30).map((c) => '<span class="tag">' + esc(c) + ' <button type="button" data-unpick="' + esc(c) + '" aria-label="Remove">×</button></span>').join("") +
      (chosen.length > 30 ? '<span class="muted">+' + (chosen.length - 30) + " more</span>" : "")
    : '<span class="hint">Nothing picked yet. Click a tile to pick it. ★ marks the Top 100 types.</span>';
  const comboNote = chosen.length ? '<span class="hint combo' + (comboCount() > MAX_SEARCHES ? " err" : "") + '">' + esc(comboText()) + "</span>" : "";
  // "Add Top 100" says what it adds, from what's on screen: the search results, or the sector shown.
  const topNew = top100Here().filter((c) => !sel.has(c.name)).length, topAll = top100Here().length;
  const topWhere = picker.search.trim() ? " from these results" : " in " + picker.sector;
  const topLabel = !topAll ? "No Top 100 types" + topWhere : topNew ? "★ Add " + topNew + " Top 100 type" + (topNew === 1 ? "" : "s") + topWhere : "★ Top 100" + topWhere + " added";

  const keepScroll = box.querySelector(".main")?.scrollTop || 0, keepSide = box.querySelector(".side")?.scrollTop || 0;
  box.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="Choose types of business">' +
    '<div class="modal-head"><div class="title"><h2>Choose types of business</h2><button type="button" class="x" data-act="close-picker" aria-label="Close">×</button></div>' +
    '<div class="searchrow"><div class="searchbox"><input type="text" id="pickerSearch" placeholder="Search ' + total.toLocaleString() + ' types, e.g. roofing, dentist, pizza" value="' + esc(picker.search) + '"></div>' +
    '<button type="button" class="pill-btn" data-act="top100"' + (topNew ? "" : " disabled") + ' title="The 100 types most worth targeting, from what’s shown here">' + esc(topLabel) + "</button></div></div>" +
    '<div class="modal-body"><div class="side">' + side + '</div><div class="main">' + main + "</div></div>" +
    '<div class="modal-foot"><div class="chosen">' + foot + "</div>" +
    comboNote + (chosen.length ? '<button type="button" class="link small" data-act="clear-what">Clear all</button>' : "") +
    '<button type="button" class="done" data-act="close-picker">Done' + (chosen.length ? " · " + chosen.length + " picked" : "") + "</button></div></div>";
  const m = box.querySelector(".main"); if (m) m.scrollTop = keepScroll;
  const s = box.querySelector(".side"); if (s) s.scrollTop = keepSide;
  const input = $("pickerSearch");
  input.oninput = () => { picker.search = input.value; renderPicker(); const i = $("pickerSearch"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
}
/** The Top 100 types on screen: in the search results (the first 400, as shown), or in the sector shown. */
function top100Here() {
  const q = picker.search.trim().toLowerCase();
  if (q) return tree.industries.flatMap((i) => i.categories.filter((c) => wordMatch(c.name, q))).slice(0, 400).filter((c) => c.top100);
  return inSector(picker.sector).filter((c) => c.top100);
}
function openPicker() { $("catPicker").hidden = false; document.body.style.overflow = "hidden"; renderPicker(); $("pickerSearch") && $("pickerSearch").focus(); }
function closePicker() { $("catPicker").hidden = true; document.body.style.overflow = ""; $("whatInput").focus(); }
$("browseTypes").onclick = openPicker;
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-cat],[data-sector],[data-act],[data-unpick]");
  if (!t || !t.closest("#catPicker")) return;
  const sel = what.selected;
  if (t.dataset.unpick) sel.delete(t.dataset.unpick);
  else if (t.dataset.sector) { picker.sector = t.dataset.sector; picker.search = ""; picker.showAll = false; }
  else if (t.dataset.cat && t.tagName === "BUTTON") sel.has(t.dataset.cat) ? sel.delete(t.dataset.cat) : sel.add(t.dataset.cat);
  else if (t.dataset.cat) t.checked ? sel.add(t.dataset.cat) : sel.delete(t.dataset.cat);
  else switch (t.dataset.act) {
    case "sector-all": inSector(picker.sector).forEach((c) => sel.add(c.name)); break;
    case "sector-none": inSector(picker.sector).forEach((c) => sel.delete(c.name)); break;
    case "show-all": picker.showAll = true; break;
    case "add-hits": { const q = picker.search.trim().toLowerCase(); tree.industries.flatMap((i) => i.categories).filter((c) => wordMatch(c.name, q)).slice(0, 400).forEach((c) => sel.add(c.name)); break; }
    case "top100": top100Here().forEach((c) => sel.add(c.name)); break;
    case "clear-what": sel.clear(); break;
    case "close-picker": closePicker(); break;
    default: return;
  }
  renderWhat();
});
// Phone types wanted: picking any switches phone checks on and filters the results to those types.
const phoneTypesWanted = dropdown($("dd-phonetypes"), {
  label: "Phone types wanted", allLabel: "All", search: false,
  options: () => [{ value: "mobile", label: "Mobile" }, { value: "landline", label: "Landline" }, { value: "voip", label: "Internet (VoIP)" }, { value: "toll_free", label: "Toll-free" }],
  onChange: (sel) => { if (sel.size) $("checkPhones").checked = true; $("checkPhones").disabled = sel.size > 0; markPlanStale(); },
});
function countryLabel(code) { const c = geo.countries.find((x) => x.code === code); return c ? c.name : code; }

/** States / provinces of the picked countries (for Where suggestions); places in other countries are dropped. */
async function loadRegions() {
  const countries = [...whereCountry.selected];
  geo.regions = countries.length ? await api("/api/geo/regions?" + countries.map((c) => "country=" + encodeURIComponent(c)).join("&")) : [];
  places = places.filter((p) => whereCountry.selected.has(p.country));
}
const regionPlace = (r) => ({ key: "r|" + r.country + "|" + r.code, kind: "region", country: r.country, region: r.code,
  label: r.name + (whereCountry.selected.size > 1 ? ", " + countryLabel(r.country) : "") });
const cityPlace = (c) => ({ key: "c|" + c.country + "|" + (c.region || "") + "|" + c.name, kind: "city", country: c.country, region: c.region || "", city: c.name,
  label: c.name + ", " + (c.country === "US" ? c.region : c.region_name || countryLabel(c.country)) });
/** A state code ("FL") as its name alone ("Florida") when we know it. */
function stateFull(code) { const r = geo.regions.find((x) => x.country === "US" && x.code === code); return r ? r.name : code; }
/** A state code ("FL") as its name ("Florida (FL)") when we know it. */
function stateName(code) { const r = geo.regions.find((x) => x.country === "US" && x.code === code); return r ? r.name + " (" + code + ")" : code; }

/** Every picked place (a state or a city); with none, whole countries (outside the US). */
function locationsFromBuilder() {
  if (places.length) return places.map((p) => (p.kind === "city" ? { country: p.country, region: p.region, city: p.city } : { country: p.country, region: p.region }));
  return [...whereCountry.selected].map((country) => ({ country }));
}

// Type-ahead box with chips. Arrow keys move through the suggestions, Enter picks one (or searches
// when the box is empty), Escape closes the list, Backspace in an empty box removes the last chip.
// o: { box, input, list, placeholder, suggest(q) -> items, pick(item), chips() -> [[key, label]], unpick(key), onEnter(), onNoMatch(q), onMore(), delay }
// An item is { label, sub, ... } or { label, action } (a command, e.g. "Browse all types").
function typeahead(o) {
  let items = [], active = -1, seq = 0, timer = null;
  const ta = {};
  const close = () => { o.list.hidden = true; o.input.setAttribute("aria-expanded", "false"); o.input.removeAttribute("aria-activedescendant"); active = -1; };
  const draw = () => {
    o.list.innerHTML = items.map((it, i) => '<div class="acopt' + (i === active ? " on" : "") + (it.action ? " acact" : "") + '" role="option" id="' + o.list.id + "-" + i +
      '" data-i="' + i + '" aria-selected="' + (i === active) + '"><span>' + esc(it.label) + "</span>" + (it.sub ? '<span class="acsub">' + esc(it.sub) + "</span>" : "") + "</div>").join("");
    o.list.hidden = !items.length;
    o.input.setAttribute("aria-expanded", String(!!items.length));
    const el = active >= 0 ? $(o.list.id + "-" + active) : null;
    if (el) { o.input.setAttribute("aria-activedescendant", el.id); el.scrollIntoView({ block: "nearest" }); } else o.input.removeAttribute("aria-activedescendant");
  };
  /** Suggestions for what's typed; null when a newer keystroke overtook this one. */
  ta.update = async () => {
    const q = o.input.value.trim(), my = ++seq;
    if (!q) { items = []; close(); return []; }
    let found = [];
    try { found = await o.suggest(q); } catch (e) { found = []; }
    if (my !== seq) return null;
    items = found || [];
    active = items.length ? 0 : -1;
    draw();
    return items;
  };
  const choose = (it) => {
    if (!it) return;
    o.input.value = ""; items = []; close();
    if (it.action) { it.action(); return; }
    o.pick(it); ta.render(); o.input.focus();
  };
  /** Typed but not picked (e.g. Search pressed): take the best suggestion. */
  ta.pickTop = async () => {
    clearTimeout(timer);
    const q = o.input.value.trim();
    const list = await ta.update();
    const it = (list || []).find((x) => !x.action);
    if (it) { choose(it); return true; }
    if (list) { close(); if (o.onNoMatch) o.onNoMatch(q); }
    return false;
  };
  // Chips take at most about two rows; the rest fold into "+N more".
  ta.render = () => {
    const chips = o.chips();
    const draw = (max) => {
      o.box.querySelectorAll(".tag").forEach((t) => t.remove());
      o.input.insertAdjacentHTML("beforebegin", chips.slice(0, max).map(([k, label]) => '<span class="tag">' + esc(label) +
        ' <button type="button" data-chip="' + esc(k) + '" aria-label="Remove ' + esc(label) + '">×</button></span>').join("") +
        (chips.length > max ? '<span class="tag more" data-chip-more title="See them all">+' + (chips.length - max) + " more</span>" : ""));
    };
    let max = Math.min(6, chips.length);
    draw(max);
    // Only measurable when shown; 2 rows of chips is about 64px.
    while (max > 1 && o.box.offsetHeight > 66) { max--; draw(max); }
    o.input.placeholder = chips.length ? "add more…" : o.placeholder();
  };
  ta.reset = () => { clearTimeout(timer); seq++; o.input.value = ""; items = []; close(); };
  o.input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(ta.update, o.delay || 0); });
  o.input.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (o.list.hidden) { await ta.update(); return; }
      const n = items.length; if (!n) return;
      active = e.key === "ArrowDown" ? (active + 1) % n : (active - 1 + n) % n;
      draw();
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Always the same, however fast you type: Enter with text picks the top suggestion;
      // Enter on an empty box searches.
      if (!o.list.hidden && active >= 0) choose(items[active]);
      else if (o.input.value.trim()) await ta.pickTop();
      else o.onEnter();
    } else if (e.key === "Escape") {
      // A search box clears itself on Escape: keep what was typed, just close the suggestions.
      if (o.input.value) e.preventDefault();
      if (!o.list.hidden) { e.stopPropagation(); close(); }
    } else if (e.key === "Backspace" && !o.input.value) {
      const c = o.chips(); if (c.length) { o.unpick(c[c.length - 1][0]); ta.render(); }
    } else if (e.key === "Tab") close();
  });
  o.input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== o.input) close(); }, 150));
  o.input.addEventListener("focus", () => { if (o.input.value.trim()) ta.update(); });
  // mousedown (not click) so the box keeps the keyboard focus.
  o.list.addEventListener("mousedown", (e) => { const el = e.target.closest("[data-i]"); if (!el) return; e.preventDefault(); choose(items[Number(el.dataset.i)]); });
  o.box.addEventListener("click", (e) => {
    const x = e.target.closest("[data-chip]");
    if (x) { o.unpick(x.dataset.chip); ta.render(); o.input.focus(); return; }
    if (e.target.closest("[data-chip-more]")) { if (o.onMore) o.onMore(); return; }
    o.input.focus();
  });
  return ta;
}
const isDb = () => currentTab === "database";
let allTypes = null; // every type of business, flat: [{ name, top, sector }]
/** Types of business whose words start with what's typed: exact and Top 100 first. */
function typeHits(q, limit) {
  if (!tree) return [];
  if (!allTypes) {
    const seen = new Set();
    allTypes = tree.industries.flatMap((i) => i.categories.map((c) => ({ name: c.name, top: !!c.top100, sector: i.industry })))
      .filter((c) => !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()));
  }
  const ql = q.toLowerCase();
  const rank = (c) => (c.name.toLowerCase() === ql ? 0 : c.name.toLowerCase().startsWith(ql) ? 2 : 4) + (c.top ? 0 : 1);
  return allTypes.filter((c) => !what.selected.has(c.name) && wordMatch(c.name, q))
    .sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit).map((c) => ({ value: c.name, label: c.name, sub: c.sector }));
}
/** Filter counts (type / state / city in the database), loaded once per change of filters. */
async function freshFacets() { if (!facets || facetsStale) await loadFacets(); return facets || {}; }
/** "Tampa, fl" -> name "Tampa" + region "fl" (to tell the Springfields apart). */
function splitPlace(q) { const [name, reg] = q.split(",").map((s) => s.trim()); return { name: name || "", reg: (reg || "").toLowerCase() }; }

acWhat = typeahead({
  box: $("whatBox"), input: $("whatInput"), list: $("whatList"),
  placeholder: () => (isDb() ? "Type of business" : "Plumber, dentist, roofer…"),
  suggest: async (q) => {
    if (isDb()) {
      const fc = await freshFacets();
      return (fc.categories || []).filter((c) => c.value && !f.category.selected.has(c.value) && wordMatch(c.value, q)).slice(0, 8)
        .map((c) => ({ value: c.value, label: c.value, sub: num(c.n) }));
    }
    const hits = typeHits(q, 8);
    return hits.length ? hits : [{ label: "No match. Browse all types", action: openPicker }];
  },
  pick: (it) => {
    if (isDb()) { f.category.selected.add(it.value); f.category.renderChip(); reload(); }
    else { what.selected.add(it.value); renderWhat(); }
  },
  chips: () => [...(isDb() ? f.category.selected : what.selected)].map((v) => [v, v]),
  unpick: (k) => {
    if (isDb()) { f.category.selected.delete(k); f.category.renderChip(); reload(); }
    else { what.selected.delete(k); renderWhat(); }
  },
  onMore: () => { if (isDb()) { $("moreFilters").open = true; setTimeout(() => f.category.el.querySelector(".chip").click(), 0); } else openPicker(); },
  onEnter: () => runFind(),
  onNoMatch: (q) => setFindMsg("No type of business matches “" + q + "”." + (isDb() ? "" : " Try Browse all types."), true),
});
acWhere = typeahead({
  box: $("whereBox"), input: $("whereInput"), list: $("whereList"), delay: 150,
  placeholder: () => "State or city",
  suggest: async (q) => {
    const { name, reg } = splitPlace(q);
    const ql = name.toLowerCase();
    if (isDb()) {
      const fc = await freshFacets();
      const states = (fc.states || []).filter((s) => s.value && !f.state.selected.has(s.value) && !reg && (s.value.toLowerCase() === ql || wordMatch(stateName(s.value), name)))
        .slice(0, 4).map((s) => ({ kind: "state", value: s.value, label: stateName(s.value), sub: num(s.n) }));
      const cities = (fc.cities || []).filter((c) => c.city && wordMatch(c.city, name) && !f.city.selected.has(c.city + "|" + (c.state || "")) && (!reg || (c.state || "").toLowerCase().startsWith(reg)))
        .sort((a, b) => b.n - a.n).slice(0, 8).map((c) => ({ kind: "city", value: c.city + "|" + (c.state || ""), label: c.city + (c.state ? ", " + c.state : ""), sub: num(c.n) }));
      return [...states, ...cities];
    }
    if (!whereCountry.selected.size) return [{ label: "Choose a country first (More options)", action: () => toggleMore(true) }];
    const taken = new Set(places.map((p) => p.key));
    const states = reg ? [] : geo.regions.filter((r) => (r.country === "US" && r.code.toLowerCase() === ql) || wordMatch(r.name, name))
      .map(regionPlace).filter((p) => !taken.has(p.key)).slice(0, 4).map((p) => ({ place: p, label: p.label, sub: "whole state" }));
    const p = new URLSearchParams();
    whereCountry.selected.forEach((c) => p.append("country", c));
    p.set("q", name); p.set("limit", reg ? "40" : "8");
    const found = name ? await api("/api/geo/cities?" + p) : [];
    const cities = found.filter((c) => !reg || String(c.region || "").toLowerCase().startsWith(reg) || String(c.region_name || "").toLowerCase().startsWith(reg))
      .map(cityPlace).filter((x) => !taken.has(x.key)).slice(0, 8).map((x) => ({ place: x, label: x.label, sub: "city" }));
    return [...states, ...cities];
  },
  pick: (it) => {
    if (isDb()) { (it.kind === "state" ? f.state : f.city).selected.add(it.value); f.state.renderChip(); f.city.renderChip(); reload(); }
    else { places.push(it.place); renderWhat(); }
  },
  chips: () => (isDb() ? [...[...f.state.selected].map((v) => ["s:" + v, stateName(v)]), ...[...f.city.selected].map((v) => ["c:" + v, v.replace("|", ", ")])]
    : places.map((p) => [p.key, p.label])),
  unpick: (k) => {
    if (isDb()) { (k.startsWith("s:") ? f.state : f.city).selected.delete(k.slice(2)); f.state.renderChip(); f.city.renderChip(); reload(); }
    else { places = places.filter((p) => p.key !== k); renderWhat(); }
  },
  onMore: () => { if (isDb()) { $("moreFilters").open = true; setTimeout(() => f.city.el.querySelector(".chip").click(), 0); } },
  onEnter: () => runFind(),
  onNoMatch: (q) => setFindMsg("No place matches “" + q + "”." + (isDb() ? " Nothing collected there yet?" : " Small towns: pick the state."), true),
});
function toggleMore(open) {
  const show = open == null ? $("moreOptions").hidden : open;
  $("moreOptions").hidden = !show; $("moreBtn").setAttribute("aria-expanded", String(show));
  moreLabel();
}
/** "More options ▾", saying when a distance is set there (so it's never a hidden surprise). */
function moreLabel() {
  const r = $("radiusMiles").value;
  $("moreBtn").textContent = !$("moreOptions").hidden ? "Fewer options ▴" : r ? "More options (within " + r + " mi) ▾" : "More options ▾";
}
$("moreBtn").onclick = () => toggleMore();
$("radiusMiles").addEventListener("change", moreLabel);
// Example searches (when nothing is shown yet): fill the search row, ready to press Search.
async function fillExample(spec) {
  const [typeQ, city, st] = spec.split("|");
  if (!tree) return;
  if (!whereCountry.selected.has("US")) { whereCountry.set([...whereCountry.selected, "US"]); await loadRegions(); }
  what.selected.clear();
  const hit = typeHits(typeQ, 1)[0];
  if (hit) what.selected.add(hit.value);
  let place = null;
  if (city) { const r = await api("/api/geo/cities?region=US." + st + "&q=" + encodeURIComponent(city) + "&limit=1").catch(() => []); if (r[0]) place = cityPlace(r[0]); }
  else { const r = geo.regions.find((x) => x.country === "US" && x.code === st); if (r) place = regionPlace(r); }
  places = place ? [place] : [];
  renderWhat();
  $("findBtn").focus();
}
// An example fills the row and searches straight away (free data: nothing is spent).
$("emptyState").addEventListener("click", (e) => {
  const b = e.target.closest("[data-example]"); if (!b) return;
  const free = document.querySelector('input[name="source"][value="free"]'); if (free && !free.checked) { free.checked = true; applySource(); }
  fillExample(b.dataset.example).then(() => runFind()).catch((err) => setFindMsg(err.message, true));
});

// ---------------------------------------------------------------------------
// Find leads: plan (+ counts) -> (maybe) pull -> show results
// ---------------------------------------------------------------------------
let lastRequest = null;
const BIG = 100000;
const RUNNING = ["pending", "scraping", "ingesting"];
/** free (open map data) or google (Google Maps, paid). */
function dataSource() { const r = document.querySelector('input[name="source"]:checked'); return r ? r.value : "free"; }
function applySource() {
  const free = dataSource() === "free";
  document.querySelectorAll(".seg label").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
  ["howManyLine", "countLine"].forEach((id) => { $(id).hidden = free; });
  updateFindLabel();
  markPlanStale();
}
document.querySelectorAll('input[name="source"]').forEach((r) => r.addEventListener("change", applySource));
/** What the search row is asking for right now. */
function currentRequest() {
  return {
    source: dataSource(),
    categories: [...what.selected], locations: locationsFromBuilder(), maxResults: Number($("maxResults").value),
    withCounts: $("withCounts").checked, countWebsite: $("countWebsite").value || null, countVerifiedOnly: $("countVerified").checked,
    countWithPhone: $("countPhone").checked,
    checkPhones: $("checkPhones").checked || phoneTypesWanted.selected.size > 0,
    radiusMiles: Number($("radiusMiles").value) || null,
  };
}
let planStarted = false; // Collect (or "Show them") was pressed for the answer on screen
let searching = false; // between pressing Search and the answer arriving
/** The parts of a search that change its answer, in a fixed order (so two equal searches always compare equal). */
function reqKey(r) {
  if (!r) return "";
  const google = r.source === "google";
  return JSON.stringify([r.source || "free", [...(r.categories || [])].sort(),
    (r.locations || []).map((l) => [l.country || "", l.region || "", l.city || ""].join("|")).sort(), Number(r.radiusMiles) || 0, !!r.checkPhones,
    google ? Number(r.maxResults) || 0 : 0, google ? !!r.withCounts : 0, google ? r.countWebsite || "" : "", google ? !!r.countVerifiedOnly : 0, google ? !!r.countWithPhone : 0]);
}
/** The search changed after Search was pressed (or after Show them): grey the answer out until it's searched again. */
function markPlanStale() {
  if (searching || !lastRequest || $("plan").hidden || !$("staleNote")) return;
  const stale = reqKey(currentRequest()) !== reqKey(lastRequest);
  $("staleNote").hidden = !stale;
  $("plan").querySelectorAll(".actions button").forEach((b) => b.disabled = stale || b.dataset.off === "1");
}
["maxResults", "withCounts", "countWebsite", "countPhone", "countVerified", "checkPhones", "radiusMiles"].forEach((id) => $(id).addEventListener("change", markPlanStale));

let lastCountFilters = {};
function rememberFind() {
  mem.set("lastFind", { source: dataSource(), countries: [...whereCountry.selected], places, cats: [...what.selected], maxResults: $("maxResults").value, radius: $("radiusMiles").value });
}
async function restoreLastFind() {
  const last = mem.get("lastFind", null);
  const known = (c) => geo.countries.some((x) => x.code === c);
  const countries = last && last.countries && last.countries.length ? last.countries.filter(known) : known("US") ? ["US"] : [];
  // The paid Google source is never remembered: every visit starts on free data.
  whereCountry.set(countries);
  await loadRegions();
  if (!last) return;
  const inCountry = (p) => p && p.key && p.label && whereCountry.selected.has(p.country);
  if (Array.isArray(last.places)) places = last.places.filter(inCountry);
  else {
    // Saved by the older page: "US|FL|Orlando" cities, else "US.FL" states.
    const cities = (last.cities || []).map((k) => { const [country, region, name] = String(k).split("|"); const r = geo.regions.find((x) => x.country === country && x.code === region); return cityPlace({ country, region, name, region_name: r ? r.name : region }); });
    const states = (last.regions || []).map((k) => { const [country, code] = String(k).split("."); const r = geo.regions.find((x) => x.country === country && x.code === code); return r ? regionPlace(r) : null; });
    places = (cities.length ? cities : states).filter(inCountry);
  }
  (last.cats || []).forEach((c) => what.selected.add(c));
  if (last.maxResults) $("maxResults").value = String(last.maxResults);
  $("radiusMiles").value = String(last.radius || "");
  renderWhat();
  if (what.selected.size && places.length && currentTab === "find") {
    setFindMsg("Your last search is filled in.");
    // The empty list says what to do with it (not "type what and where").
    $("emptyMsg").textContent = "Press Search to see the count.";
  }
  if (isDb()) { acWhat.render(); acWhere.render(); }
}
/** Saved locations ({ country, region, city }) back into Where chips. */
async function placesFromLocations(locs) {
  const countries = [...new Set((locs || []).map((l) => l.country).filter(Boolean))];
  if (countries.some((c) => !whereCountry.selected.has(c))) { whereCountry.set([...new Set([...whereCountry.selected, ...countries])]); await loadRegions(); }
  return (locs || []).map((l) => {
    const r = geo.regions.find((x) => x.country === l.country && x.code === l.region);
    if (l.city) return cityPlace({ country: l.country, region: l.region || "", name: l.city, region_name: r ? r.name : l.region });
    return r ? regionPlace(r) : null;
  }).filter(Boolean);
}
/** Put a search (saved, or from the history) back into the search row. */
async function fillRow(req) {
  const src = document.querySelector('input[name="source"][value="' + (req.source === "google" ? "google" : "free") + '"]');
  if (src && !src.checked) { src.checked = true; applySource(); }
  what.selected.clear(); (req.categories || []).forEach((c) => what.selected.add(c));
  places = await placesFromLocations(req.locations);
  $("radiusMiles").value = String(req.radiusMiles || "");
  if (req.maxResults != null && [...$("maxResults").options].some((o) => o.value === String(req.maxResults))) $("maxResults").value = String(req.maxResults);
  acWhat.reset(); acWhere.reset();
  renderWhat();
}
/** A short note under the row, only when it matters: too many searches, or what counting on Google costs. */
function updateFindLabel() {
  if (isDb()) return;
  const n = comboCount();
  if (what.selected.size && n > MAX_SEARCHES) return setFindMsg(comboText() + ". Pick fewer types or places.", true);
  const counting = dataSource() === "google" && $("withCounts").checked && what.selected.size > 0;
  setFindMsg(counting ? "Counting on Google first: about " + money(n * 0.01) + "." : "");
}
$("withCounts").addEventListener("change", updateFindLabel);
/** Search: on Find leads, show what we have and what collecting would cost; on Database, filter. */
async function runFind() {
  searching = true;
  try { await runFindNow(); } finally { searching = false; }
}
async function runFindNow() {
  // Typed but not picked yet: take the best match (like a search engine does).
  const ignored = [];
  for (const [id, ac, has] of [["whatInput", acWhat, () => what.selected.size > 0], ["whereInput", acWhere, () => places.length > 0 || isDb()]]) {
    const typed = $(id).value.trim();
    if (!typed) continue;
    // An email or other text a browser filled in by itself: drop it.
    if (typed.includes("@")) { $(id).value = ""; continue; }
    if (await ac.pickTop()) continue;
    if (has()) { ignored.push(typed); $(id).value = ""; continue; }
    return setFindMsg("Couldn’t find “" + typed + "”. Pick one of the suggestions.", true);
  }
  if (isDb()) { setFindMsg(""); reload(); return; }
  const req = currentRequest();
  rememberFind();
  const msg = setFindMsg;
  if (!req.categories.length) { msg("Type a business type in What.", true); return $("whatInput").focus(); }
  if (!req.locations.length) { msg("Type a state or city in Where.", true); return $("whereInput").focus(); }
  if (req.locations.some((l) => l.country === "US" && !l.region && !l.city)) { msg("Add a state or city in Where (all of the US is too big).", true); return $("whereInput").focus(); }
  if (comboCount() > MAX_SEARCHES) return msg(comboText() + ". Pick fewer types or places.", true);
  lastPhoneTypes = [...phoneTypesWanted.selected];
  lastCountFilters = { website: req.countWebsite, phone: req.countWithPhone, verified: req.countVerifiedOnly };
  msg((ignored.length ? "Left out “" + ignored.join("”, “") + "” (no match). " : "") + (req.source === "google" && req.withCounts ? "Counting on Google…" : "Checking…"));
  $("findBtn").disabled = true;
  // A new search: the old list and answer go away, so nothing stale sits under the new answer.
  hideList();
  try {
    const plan = await postJson("/api/find", { ...req, mode: "plan" });
    lastRequest = req; planStarted = false; startedIds = [];
    msg(ignored.length ? "Left out “" + ignored.join("”, “") + "” (no match)." : "");
    renderProgress();
    showPlan(plan);
    // Everything is already here and nothing needs paying for: show the list straight away, here.
    if (planAllHere(plan)) showHere(req, planLabel(plan));
  } catch (err) {
    // The answer on screen was for the earlier search: it goes, so nothing outdated can be collected.
    $("plan").hidden = true; lastRequest = null; planStarted = false;
    msg(err.message, true); if ($("resultsBody").hidden) { $("resultsCard").hidden = false; $("emptyState").hidden = false; }
  }
  finally { $("findBtn").disabled = false; }
}
/** Nothing left to collect or pay for: the answer is just the list. */
const planAllHere = (plan) => plan.mode === "plan" && !plan.needPull && !plan.blocked && !plan.checkPhones && (plan.inDatabase > 0 || plan.alreadyHave) &&
  !plan.combinations.some((c) => !c.existing && !c.blocked);
/** Hide the business list on Find leads (until the next answer shows one). */
function hideList() {
  if (isDb()) return;
  $("resultsBody").hidden = true; $("filtersCard").hidden = true; $("mapCard").hidden = true; $("resultsCard").hidden = true;
  view.scope = null; view.scopeLabel = "";
}
["whatInput", "whereInput"].forEach((id) => $(id).addEventListener("input", () => { if ($(id).value.includes("@")) $(id).value = ""; }));
$("findBtn").onclick = () => { runFind().catch((err) => setFindMsg(err.message, true)); };

function where(c) { return c.place ? c.place.label : c.city ? c.city + ", " + c.state : "all of " + c.state; }
function planLabel(plan) {
  const cats = [...new Set(plan.combinations.map((c) => c.category))], locs = [...new Set(plan.combinations.map(where))];
  return (cats.length > 2 ? cats.length + " types" : cats.join(", ")) + " in " + (locs.length > 2 ? locs.length + " places" : locs.join(", "));
}
const num = (n) => Number(n || 0).toLocaleString();
// The answer to a search: one line for what you already have, one for what isn't collected yet,
// each with one button; problems as one short line each with their one-click fix; the rest under Details.
let startedIds = [];
const expectedById = {};
function names(list, max) {
  const labels = list.map((c) => c.category + " in " + where(c));
  return labels.length > max ? labels.slice(0, max).join(", ") + " and " + (labels.length - max) + " more" : labels.join(", ");
}
const plural = (w, n) => n === 1 ? w : /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + "ies" : /(s|x|z|ch|sh)$/i.test(w) ? w + "es" : w + "s";
const lowerFirst = (s) => /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
/** "plumbers", or "businesses" when there are several types. */
function whatWords(list, n) {
  const cats = [...new Set(list.map((c) => c.category))];
  return cats.length === 1 ? plural(lowerFirst(cats[0]), n) : n === 1 ? "business" : "businesses";
}
/** "Tampa, FL and Orlando, FL", or "5 places". */
function placeWords(list) {
  const p = [...new Set(list.map(where))];
  return p.length > 2 ? p.length + " places" : p.join(" and ");
}
function showPlan(plan) {
  if (plan.mode !== "plan") return showStarted(plan);
  const free = plan.source === "free";
  const req = lastRequest || {};
  const phones = plan.checkPhones;
  const combos = plan.combinations;
  const have = combos.filter((c) => c.existing);
  const running = have.filter((c) => isRunning(c.existing));
  const ready = have.filter((c) => !isRunning(c.existing));
  const missing = combos.filter((c) => !c.existing && !c.blocked);
  const blocked = combos.filter((c) => !c.existing && c.blocked);
  const haveBiz = have.reduce((s, c) => s + (c.existing.leads_in_database || 0), 0);
  const oneType = new Set(combos.map((c) => c.category)).size === 1;
  const b = plan.budget;
  const cost = free ? 0 : plan.batchCost != null ? plan.batchCost : plan.estimatedCostMissing;
  const overBudget = !free && !!b && missing.length > 0 && cost > b.left + 1e-9;
  const allOverBudget = !free && !!b && plan.estimatedCostAll > b.left + 1e-9;
  const checks = plan.existingPhoneChecks || 0;

  let html = '<div class="rprob info" id="staleNote" hidden>You changed the search. Press Search to update this.</div>';
  // 0. About how many there are (quick: our data + an estimate; the exact Google count is optional).
  const dbTotal = plan.inDatabase || 0;
  // The estimate only matters when something isn't collected yet (else the exact number says it all).
  const estimateShown = plan.aboutTotal > 0 && missing.length > 0 && plan.aboutTotal > dbTotal;
  if (estimateShown) {
    html += '<div class="rhead"><span class="big">≈ ' + num(plan.aboutTotal) + "</span> " + esc(whatWords(combos, plan.aboutTotal)) + " in " + esc(placeWords(combos)) +
      ' <span class="muted" title="From the businesses we already have and the population of each place. Turn on Google counts under More options for exact numbers (paid).">estimate</span></div>';
  }
  // 1. Already in the database (exact, the same list the Database tab shows).
  const dbCount = plan.inDatabase || 0;
  // Everything is collected: the list shows right below this answer (with a link to the Database tab), so no button.
  const allHere = planAllHere(plan);
  if (dbCount > 0 || have.length) {
    const showLabel = phones && checks ? "Show them + check " + num(checks) + " phone" + (checks > 1 ? "s" : "") + (plan.estimatedCostExisting > 0 ? " · up to " + money(plan.estimatedCostExisting) : "") : "Show them";
    const n = dbCount || haveBiz;
    html += '<div class="rline"><div class="rtext"><span class="big">' + num(n) + "</span> " + (missing.length ? "already in your database" : esc(whatWords(combos, n)) + " in " + esc(placeWords(combos)) + ", ready in your database") +
      (running.length ? ' <span class="pill warn" title="' + esc(names(running, 3)) + '">still collecting</span>' : "") + "</div>" +
      '<div class="actions">' + (allHere ? '<span class="hint">Listed below.</span> <button type="button" class="link small" id="openInDb">Open in Database</button>'
        : '<button type="button" id="useHave"' + (missing.length ? ' class="ghost"' : "") + ">" + esc(showLabel) + "</button>") + "</div></div>";
  }
  // 2. Not collected yet (Google: 40 searches at a time).
  if (missing.length) {
    const capped = !free && plan.maxResults > 0 && missing.some((c) => c.count && c.count.total > plan.maxResults);
    const batched = !free && missing.length > plan.batchSize;
    const parts = [plan.aboutMissing > 0 ? "about " + num(plan.aboutMissing) + " more" : "", free ? "free" : "", capped ? "first " + num(plan.maxResults) + " each" : ""].filter(Boolean);
    const whatTxt = missing.length > 3 ? num(missing.length) + " searches" : oneType ? placeWords(missing) : names(missing, 3);
    // Types already in the database from other searches (e.g. a whole-state one) aren't "not collected".
    const fromOther = missing.reduce((s, c) => s + (Number(c.inDb) || 0), 0);
    const head = !free ? "Not collected from Google yet" : fromOther ? "Not searched yet" : "Not collected yet";
    if (fromOther) parts.unshift("you have " + num(fromOther) + (free ? " from other searches" : " from free data or other searches"));
    html += '<div class="rline"><div class="rtext">' + head + ": <b>" + esc(whatTxt) + "</b>" + (parts.length ? ' <span class="muted">(' + esc(parts.join(", ")) + ")</span>" : "") + "</div>" +
      '<div class="actions"><button type="button" id="pullMissing" class="big"' + (overBudget ? ' data-off="1" disabled' : "") + ">" +
      (free ? "Collect them (free)" : batched ? "Collect the first " + plan.batchSize + " (up to " + money(cost) + ")" : "Collect them (up to " + money(cost) + ")") + "</button></div></div>";
  }
  // 3. Problems: one short line each, with the fix.
  const prob = (text, cls) => { html += '<div class="rprob ' + (cls || "") + '">' + text + "</div>"; };
  if (overBudget) prob("Only " + money(b.left) + " of this month’s budget is left." + ' <button type="button" class="link" data-switch-source="free">Use free data instead</button>', "bad");
  const shortList = (list) => list.length > 3 ? list.slice(0, 3).join(", ") + " and " + (list.length - 3) + " more" : list.join(", ");
  if (blocked.length && free) prob("Not in the free data: " + esc(shortList([...new Set(blocked.map((c) => c.category))])) + "." + ' <button type="button" class="link" data-switch-source="google">Check on Google instead</button>');
  if (blocked.length && !free) prob(esc(blocked[0].blocked) + (blocked.length > 1 ? " (" + blocked.length + " searches)" : ""));
  if (plan.unknownPlaces && plan.unknownPlaces.length) prob("Couldn’t find: " + esc(plan.unknownPlaces.join("; ")) + ".");
  if (plan.countsSkipped) prob(esc(plan.countsSkipped), "info");
  const countFail = !free && req.withCounts && !plan.countsSkipped && estimateShown ? combos.find((c) => c.count && c.count.total == null && c.count.error) : null;
  if (countFail) prob('<span title="' + esc(String(countFail.count.error)) + '">Exact Google counts aren’t available right now; the estimate is shown.</span>', "info");
  if (plan.totalCount != null && plan.totalCount > BIG) prob("That’s " + num(plan.totalCount) + " businesses on Google. Try fewer places or types.");
  html += '<div class="rprob bad planmsg" id="planMsg" role="alert"></div>';
  // 4. Small links.
  const savedAs = savedList.find((s) => reqKey(s.request) === reqKey(req));
  let links = savedAs ? '<span class="hint">★ Saved as “' + esc(savedAs.name) + "”</span>" : SAVE_BTN;
  if (free && me && me.role !== "member") links += '<button type="button" class="link small" id="addHarvest" title="Collected by itself, a batch a day, and refreshed monthly">+ Add to daily free collection</button>';
  if (ready.length && (free || plan.estimatedCostAll > 0)) links += '<button type="button" class="link small" id="refreshAll"' + (allOverBudget ? ' data-off="1" disabled' : "") +
    ' title="Collect everything again, including what you have, for fresh details">Collect everything again' + (free ? "" : " (up to " + money(plan.estimatedCostAll) + ")") + "</button>";
  html += '<div class="rlinks actions">' + links + "</div>";
  // 5. Details: per-search breakdown.
  // Per row: what the database has for that type and place (inDb), else what the earlier search saved.
  const inDb = (c) => c.existing && isRunning(c.existing) ? '<span class="pill warn">collecting now</span>'
    : c.inDb != null ? (c.inDb > 0 ? num(c.inDb) : '<span class="muted">none yet</span>') + (c.existing ? ' <span class="muted">(searched ' + esc(ago(c.existing.created_at)) + ")</span>" : "")
    : !c.existing ? '<span class="muted">none yet</span>'
    : num(c.existing.leads_in_database) + ' <span class="muted">(' + esc(ago(c.existing.created_at)) + ")</span>";
  const rows = combos.map((c) => {
    const third = free ? (c.blocked ? '<span class="muted">not in the free data</span>' : esc((c.freeCategories || []).map((x) => x.replace(/_/g, " ")).join(", ")))
      : !c.count ? '<span class="muted">not counted</span>' : c.count.total == null ? '<span class="muted" title="' + esc(c.count.error || "") + '">couldn’t count</span>' : num(c.count.total);
    const toPay = free ? "" : "<td>" + (c.existing ? '<span class="muted">free (you have it)</span>' : c.blocked ? '<span class="muted">can’t price</span>'
      : "up to " + money(c.pullCost) + (phones && c.phoneCost ? ' <span class="muted">+ ' + money(c.phoneCost) + " phones</span>" : "")) + "</td>";
    return "<tr" + (c.existing ? ' class="muted-row"' : "") + "><td>" + esc(c.category) + "</td><td>" + esc(where(c)) + "</td><td>" + third + "</td><td>" + inDb(c) + "</td>" + toPay + "</tr>";
  }).join("");
  const refine = [req.countWebsite === "no" ? "without a website" : req.countWebsite === "yes" ? "with a website" : "", req.countWithPhone ? "with a phone" : "", req.countVerifiedOnly ? "verified" : ""].filter(Boolean).join(", ");
  const foot = free ? "Free data has no Google rating or reviews. Add them later: Fill in missing info → Add Google ratings."
    : (plan.maxResults ? "Up to " + num(plan.maxResults) + " per search. " : "No limit per search. ") + "Costs shown are the most it can be." +
      (refine ? " Counted " + refine + "; collecting takes every business." : "") + (plan.countCost ? " Counting cost " + money(plan.countCost) + "." : "");
  html += '<details class="breakdown"><summary>Details</summary><div class="table-wrap"><table><thead><tr><th>Type of business</th><th>Where</th><th>' + (free ? "Free data type" : "On Google") +
    "</th><th>In your database</th>" + (free ? "" : "<th>Cost to collect</th>") + "</tr></thead><tbody>" + rows + '</tbody></table></div><div class="hint" style="margin-top:6px">' + esc(foot) + "</div></details>";

  $("plan").hidden = false; emptyAfterSearch();
  $("plan").innerHTML = html;
  if ($("pullMissing")) $("pullMissing").onclick = async () => (free || (await confirmBig(cost))) && runPull("pull_missing");
  if ($("useHave")) $("useHave").onclick = () => {
    if (phones && checks) return runPull("use_existing");
    if ($("staleNote") && !$("staleNote").hidden) return;
    planStarted = true;
    // The list shows below (the page goes to it once it's loaded); the button becomes the link to the Database.
    scrollToListOnLoad = true;
    if (plan.inDatabase > 0) showHere(req, planLabel(plan)); else showResults(plan);
    $("useHave").parentElement.innerHTML = '<span class="hint">Listed below.</span> <button type="button" class="link small" id="openInDb">Open in Database</button>';
    $("openInDb").onclick = () => showInDatabase(req);
  };
  if ($("openInDb")) $("openInDb").onclick = () => showInDatabase(req);
  if ($("refreshAll")) $("refreshAll").onclick = async () => (await ask("Collect everything again?", free ? "Collects these again from the latest free data. Free." : "Includes what you already have. Up to " + money(plan.estimatedCostAll) + ".",
    free ? "Collect again" : "Collect again · up to " + money(plan.estimatedCostAll), free ? {} : { paid: true })) && runPull("refresh_all");
  if ($("addHarvest")) $("addHarvest").onclick = async () => {
    try {
      const r = await postJson("/api/harvest", { categories: lastRequest.categories, locations: lastRequest.locations, radiusMiles: lastRequest.radiusMiles });
      toast("Added " + r.added + " to the daily free collection" + (r.alreadyListed ? " (" + r.alreadyListed + " already on it)" : "") +
        (r.notInFreeData.length ? ". Not in the free data: " + r.notInFreeData.join(", ") : "") + ".", "ok");
    } catch (err) { toast(err.message, "bad"); }
  };
  wireSave();
  // On a phone the answer is usually below the fold (the keyboard was open): bring it into view.
  $("plan").scrollIntoView({ behavior: "smooth", block: innerWidth <= 760 ? "start" : "nearest" });
}
/** "Show them": the Database tab, filtered to these types and places (the same count as the answer). */
function showInDatabase(req) {
  setTab("database", false, () => filtersFor(req));
}
/** The Database tab with these filters (on top of the usual ones), loaded once. */
function openDatabase(prep) {
  setTab("database", false, () => { restore({ ...defaultFilters, scope: null, label: "" }); prep(); });
}
/** The usual filters plus this search's types and places (a city searched "within N mi" uses the distance filter). */
function filtersFor(req) {
  restore({ ...defaultFilters, scope: null, label: "" });
  f.category.set(req.categories || []);
  const locs = req.locations || [];
  const cities = locs.filter((l) => l.city).map((l) => l.city + "|" + (l.region || ""));
  if (req.radiusMiles && cities.length === 1 && locs.length === 1) { view.text.near = cities[0]; view.text.radius = String(req.radiusMiles); }
  else if (cities.length) f.city.set(cities);
  else f.state.set(locs.map((l) => l.region).filter(Boolean));
  Object.values(f).forEach((d) => d.renderChip());
}
/** The same list on Find leads, right under the answer (the count matches the answer's). */
function showHere(req, label) {
  filtersFor(req);
  useScope(null, label);
}
/** Collecting has started: a short line here; the progress card below takes over. */
function showStarted(plan) {
  const started = plan.combinations.filter((c) => c.started && !c.error);
  const failed = plan.combinations.filter((c) => c.error);
  const s = started.length === 1 ? "" : "es";
  $("plan").hidden = false; emptyAfterSearch();
  $("plan").innerHTML = '<div class="rline"><div class="rtext">' +
    (started.length ? (plan.source === "free" ? "Started " + started.length + " free search" + s + ". Results arrive in about 10-15 minutes; you can leave this page."
      : "Started " + started.length + " search" + s + ". Follow it below.")
      : plan.mode === "use_existing" ? (plan.checkPhones ? "Showing what you have; phone checks are queued." : "Showing what you have.")
      : '<span class="err">Nothing could be started.</span>') +
    '</div><button type="button" class="link" id="newSearch">New search</button></div>' +
    (plan.remainingAfterBatch > 0 ? '<div class="rline"><div class="rtext">' + num(plan.remainingAfterBatch) + " more searches to collect.</div>" +
      '<div class="actions"><button type="button" id="nextBatch">Collect the next ' + Math.min(plan.batchSize || 40, plan.remainingAfterBatch) + "</button></div></div>" : "") +
    (plan.source === "free" && plan.freeCollector && plan.freeCollector.error ? '<div class="rprob">' + esc(plan.freeCollector.error) + "</div>" : "") +
    failed.map((c) => '<div class="rprob bad">' + esc(c.category + " in " + where(c)) + ": " + esc(c.error) + "</div>").join("");
  if ($("nextBatch")) $("nextBatch").onclick = async () => {
    // Prices the next batch first (same as pressing Search), then collects it.
    try {
      const p = await postJson("/api/find", { ...lastRequest, mode: "plan" });
      if (await confirmBig(p.batchCost)) runPull("pull_missing");
    } catch (err) { toast(err.message, "bad"); }
  };
  $("newSearch").onclick = () => {
    $("plan").hidden = true; lastRequest = null; planStarted = false; startedIds = []; renderProgress();
    window.scrollTo({ top: 0, behavior: "smooth" }); $("whatInput").focus();
  };
}

// Saved searches: save the search on screen; list, check again, see what's new, alerts, delete.
const SAVE_BTN = '<button type="button" class="link small" id="saveSearch" title="Run it again later, and get told when new businesses appear">☆ Save this search</button>';
function wireSave() {
  if (!$("saveSearch")) return;
  $("saveSearch").onclick = async () => {
    if (!lastRequest) return;
    const cats = lastRequest.categories || [];
    const locs = lastRequest.locations || [];
    const where = locs.length > 2 ? locs.length + " places" : locs.map((l) => l.city ? l.city + (l.region ? ", " + l.region : "") : l.region ? stateName(l.region).replace(/ [(][A-Z]+[)]$/, "") : countryLabel(l.country)).join(" and ");
    const name = await askText("Save this search", "Name", (cats.length > 2 ? cats.length + " types" : cats.join(", ")) + (where ? " in " + where : "") + (lastRequest.radiusMiles ? " (within " + lastRequest.radiusMiles + " mi)" : ""));
    if (!name) return;
    try { await postJson("/api/saved-searches", { name, request: lastRequest }); await loadSaved(); toast("Saved. New matches are counted every day.", "ok"); if ($("saveSearch")) $("saveSearch").outerHTML = '<span class="hint">★ Saved as “' + esc(name) + "”</span>"; }
    catch (err) { toast(err.message, "bad"); }
  };
}
let savedList = [];
async function loadSaved() {
  savedList = await api("/api/saved-searches").catch(() => []);
  $("savedCard").hidden = !savedList.length || currentTab !== "find";
  // "3 new since Oct 2"; with none, just "None new yet" (no "since just now").
  const fresh = (s) => {
    const since = ago(s.since), recent = /now|min ago| h ago/.test(since);
    return s.newSince ? '<span class="pill ok">' + num(s.newSince) + " new</span>" + (recent ? "" : ' <span class="muted">since ' + esc(since) + "</span>")
      : '<span class="muted">' + (recent ? "None new yet" : "None new since " + esc(since)) + "</span>";
  };
  $("savedRows").innerHTML = savedList.map((s) => "<tr><td><b>" + esc(s.name) + '</b></td><td data-label="Search">' + esc(s.description) + '</td><td data-label="In your database">' + (s.total == null ? '<span class="muted">—</span>' : num(s.total)) +
    '</td><td data-label="New">' + fresh(s) + '</td><td class="acts">' +
    '<button type="button" class="ghost small" data-saved-run="' + esc(s.id) + '" title="Fills in the search and shows what’s new and any cost. Nothing is collected until you say so.">Check again</button> ' +
    (s.newSince ? '<button type="button" class="ghost small" data-saved-new="' + esc(s.id) + '">See new</button> ' : "") +
    '<label class="ckl" title="A notification in the bell when new businesses appear"><input type="checkbox" data-saved-alert="' + esc(s.id) + '"' + (s.alert_new ? " checked" : "") + "> Tell me about new ones</label> " +
    '<button type="button" class="ghost small danger" data-saved-del="' + esc(s.id) + '">Delete</button></td></tr>').join("");
}
$("savedRows").addEventListener("click", async (e) => {
  const run = e.target.closest("[data-saved-run]"), fresh = e.target.closest("[data-saved-new]"), del = e.target.closest("[data-saved-del]");
  const id = (run && run.dataset.savedRun) || (fresh && fresh.dataset.savedNew) || (del && del.dataset.savedDel);
  const s = id ? savedList.find((x) => x.id === id) : null;
  try {
    if (del && s && (await ask("Delete this saved search?", "“" + s.name + "” will be deleted. Businesses you collected stay in your database.", "Delete", { danger: true }))) { await api("/api/saved-searches/" + s.id, { method: "DELETE" }); return loadSaved(); }
    if (run && s) {
      run.disabled = true;
      searching = true;
      try { await fillRow(s.request); } catch (e) { /* the answer still shows */ }
      hideList();
      const plan = await postJson("/api/find", { ...s.request, mode: "plan" }).finally(() => { searching = false; });
      lastRequest = s.request; planStarted = false; startedIds = [];
      lastCountFilters = { website: s.request.countWebsite, phone: s.request.countWithPhone, verified: s.request.countVerifiedOnly }; lastPhoneTypes = [];
      renderProgress(); showPlan(plan);
      if (planAllHere(plan)) showHere(s.request, s.name);
      $("searchCard").scrollIntoView({ behavior: "smooth", block: "start" });
      patchJson("/api/saved-searches/" + s.id, { ran: true }).catch(() => {}); // only a note of when it was last run
      run.disabled = false;
    }
    if (fresh && s) {
      // The Database tab, filtered to these types added since the team last looked.
      const since = s.since.slice(0, 10);
      await patchJson("/api/saved-searches/" + s.id, { seen: true });
      setTab("database", false, () => { filtersFor(s.request); view.text.addedFrom = since; });
    }
  } catch (err) {
    toast(err.message, "bad");
    // A failed check: the answer from before (another search) goes, so nothing outdated can be collected.
    if (run) { run.disabled = false; $("plan").hidden = true; lastRequest = null; planStarted = false; }
  }
});
$("savedRows").addEventListener("change", async (e) => {
  const box = e.target.closest("[data-saved-alert]"); if (!box) return;
  await api("/api/saved-searches/" + box.dataset.savedAlert, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ alert: box.checked }) }).catch((err) => toast(err.message, "bad"));
});

// Step 3: one row per search with a progress bar; stop / resume in place.
const STAGE = {
  pending: ["Starting…", 8], scraping: ["Collecting on Google Maps…", 40], ingesting: ["Saving to your database…", 75],
  enriching: ["Checking…", 90], done: ["Ready", 100], failed: ["Failed", 100],
};
const FREE_STAGE = { pending: ["Waiting for the free collector…", 8], scraping: ["Collecting open map data…", 40], ingesting: ["Saving to your database…", 75] };
const DETAILS_STAGE = { pending: ["Starting…", 8], scraping: ["Looking up on Google Maps…", 40], ingesting: ["Adding Google details…", 75] };
function stageOf(s) { return (s.source === "free" ? FREE_STAGE[s.status] : s.source === "google_details" ? DETAILS_STAGE[s.status] : null) || STAGE[s.status] || [s.status, 50]; }
function placeLabel(s) {
  if (s.source === "google_details") return num(s.max_results) + " businesses";
  if (s.source === "upload") return "uploaded list";
  return (s.city ? s.city + ", " : "all of ") + (s.region_name || s.state || s.country || "") + (s.radius_miles && s.city ? " (within " + s.radius_miles + " mi)" : ""); }
function renderProgress() {
  if (!startedIds.length || currentTab !== "find") { $("progress").hidden = true; return; }
  const rows = startedIds.map((id) => pulls.find((p) => p.id === id)).filter(Boolean);
  if (!rows.length) return;
  const running = rows.filter(isRunning);
  const pausedRows = rows.filter((s) => s.paused && RUNNING.includes(s.status));
  const saved = rows.reduce((n, s) => n + (s.leads_in_database || 0), 0);
  const failed = rows.filter((s) => s.status === "failed");
  const head = running.length
    ? "Collecting… " + (rows.length - running.length - pausedRows.length) + " of " + rows.length + " done · " + num(saved) + " saved so far"
    : pausedRows.length ? "Waiting – daily free limit · " + num(saved) + " saved so far (it carries on by itself)"
    : failed.length ? "Finished with problems · " + num(saved) + " saved" : "All done · " + num(saved) + " saved";
  $("progress").hidden = false;
  $("progress").innerHTML = '<h2 class="proghead">' + esc(head) + "</h2>" +
    (running.length ? '<div class="hint" style="margin-bottom:6px">They appear in the list below as they’re saved. You can leave this page.</div>' : "") +
    rows.map((s) => {
      let [label, pct] = stageOf(s);
      const stopped = !!s.cancelled_at && s.status === "done";
      const exp = s.source === "free" ? s.rows_expected || 0 : expectedById[s.id] || s.max_results || 0;
      if (s.status === "ingesting" && exp) pct = Math.min(95, 75 + Math.round(20 * (s.leads_in_database || 0) / exp));
      const text = s.status === "done" ? (stopped ? "Stopped · kept " + num(s.leads_in_database) : !s.leads_in_database ? (s.source === "free" ? "None in the free data here" : s.source === "google_details" ? "Done" : "None on Google here") : "Ready · " + num(s.leads_in_database) + " businesses")
        : s.paused ? "Waiting – daily free limit · " + num(s.leads_in_database) + " saved"
        : s.status === "ingesting" ? "Saving… " + num(s.leads_in_database) + (exp ? " of ~" + num(exp) : "") + " saved" : label;
      const cls = s.status === "failed" ? "bad" : s.status === "done" ? (stopped ? "warn" : "ok") : s.paused ? "warn" : "run";
      const btn = (s.status === "pending" || s.status === "scraping" || (s.source === "free" && s.status === "ingesting")) && !s.cancelled_at ? '<button type="button" class="ghost small danger" data-cancel="' + esc(s.id) + '">Stop</button>'
        : s.status === "failed" && s.apify_run_id ? '<button type="button" class="ghost small" data-resume="' + esc(s.id) + '">Resume</button>' : "";
      return '<div class="prow"><div class="pname">' + esc(s.category) + ' <span class="muted">· ' + esc(placeLabel(s)) + "</span></div>" +
        '<div class="pbar ' + cls + '"><i style="width:' + pct + '%"></i></div><div class="pstate ' + cls + '">' + esc(text) + "</div><div>" + btn + "</div>" +
        (s.error && s.status === "failed" ? '<div class="perr">' + esc(s.error) + "</div>" : "") + "</div>";
    }).join("");
}
async function pullAction(e, after) {
  const c = e.target.closest("[data-cancel]");
  if (c) {
    if (!(await ask("Stop this search?", "What it already collected is kept.", "Stop it", { danger: true }))) return true;
    c.disabled = true;
    try { await api("/api/searches/" + c.dataset.cancel + "/cancel", { method: "POST" }); tracked.add(c.dataset.cancel); startPolling(); } catch (err) { toast(err.message, "bad"); }
    await loadPulls().catch(() => {}); await Promise.resolve(after()).catch(() => {}); return true;
  }
  const r = e.target.closest("[data-resume]");
  if (r) {
    r.disabled = true;
    try { await api("/api/searches/" + r.dataset.resume + "/resume", { method: "POST" }); tracked.add(r.dataset.resume); startPolling(); } catch (err) { toast(err.message, "bad"); }
    await loadPulls().catch(() => {}); await Promise.resolve(after()).catch(() => {}); return true;
  }
  return false;
}
$("progress").onclick = (e) => pullAction(e, renderProgress);
// One click to try the same search with the other data (free / Google Maps).
$("plan").addEventListener("click", (e) => {
  const b = e.target.closest("[data-switch-source]"); if (!b) return;
  const r = document.querySelector('input[name="source"][value="' + b.dataset.switchSource + '"]'); if (!r) return;
  r.checked = true; applySource();
  $("searchCard").scrollIntoView({ behavior: "smooth", block: "start" });
  $("findBtn").click();
});
let lastPhoneTypes = [];
/** Show a plan's businesses with the default filters, plus what the search asked for (phone types, counts). */
function showResults(plan) {
  if (!plan.searchIds || !plan.searchIds.length) return;
  restore({ ...defaultFilters, scope: null, label: "" });
  if (lastCountFilters.website === "no") f.website.set(["no"]);
  if (lastCountFilters.website === "yes") f.website.set(["yes"]);
  if (lastCountFilters.phone) f.phone.set(["yes"]);
  if (lastPhoneTypes.length) { f.phoneType.set(lastPhoneTypes); f.phone.set(["yes"]); }
  useScope(plan.searchIds, planLabel(plan));
}
function confirmBig(cost) {
  // Any Google collection over $2 is confirmed in plain words first.
  return cost == null || cost < 2 || ask("Start collecting?", "This could cost up to " + money(cost) + " from this month’s budget.", "Collect · up to " + money(cost), { paid: true });
}
async function runPull(mode) {
  // Never collect for a search that was changed after its answer showed.
  if (!lastRequest || ($("staleNote") && !$("staleNote").hidden)) { markPlanStale(); return; }
  const buttons = [...document.querySelectorAll("#plan .actions button")];
  buttons.forEach((b) => b.disabled = true);
  if ($("planMsg")) $("planMsg").textContent = "";
  try {
    const result = await postJson("/api/find", { ...lastRequest, mode });
    planStarted = true;
    startedIds = result.startedIds || [];
    startedIds.forEach((id) => tracked.add(id));
    result.combinations.forEach((c) => { if (c.started) expectedById[c.started.id] = c.expected || c.pullCap; });
    if (result.checkPhones) phonesWatched = true;
    showPlan(result);
    await loadPulls().catch(() => {}); // the progress fills in on the next check
    renderProgress();
    showResults(result);
    if (startedIds.length || result.checkPhones) startPolling();
    loadSpend(); loadNotifications();
  } catch (err) {
    // Show the refusal right under the buttons, and let them try again.
    if ($("planMsg")) { $("planMsg").textContent = err.message; $("planMsg").scrollIntoView({ behavior: "smooth", block: "center" }); }
    else toast(err.message, "bad");
    buttons.forEach((b) => b.disabled = b.dataset.off === "1");
  }
}
// ---------------------------------------------------------------------------
// Results scope + filters
// ---------------------------------------------------------------------------
// Lowest score first: the businesses with the most to fix (unscored ones come last).
const view = { scope: null, scopeLabel: "", page: 1, sort: "score", dir: "asc", text: {} };
let facets = null, pulls = [];
const f = {}; // filter dropdowns by key

function countOf(rows, value) { const r = (rows || []).find((x) => x.value === value); return r ? r.n : 0; }
function fromFacet(rows, labels) { return (rows || []).filter((r) => r.value != null).map((r) => ({ value: r.value, label: (labels && labels[r.value]) || r.value, n: r.n })); }

const CORE_FILTERS = ["state", "city", "category", "score", "owner", "website", "phone", "email", "leadStatus", "assigned"];
// One-tap filters: [filter, value, label, tooltip]. Each just switches that value of an existing filter on or off.
// At most five, so they fit on one line; the rest (Score, Owner …) are under All filters.
const QUICK = [
  ["phone", "yes", "Has phone", "With a phone number"], ["email", "yes", "Has email", "With an email address"],
  ["website", "no_real", "No website", "No website, or only a Facebook / directory page"],
  ["leadStatus", "Untouched", "Not contacted yet", "Nobody has called or emailed them yet (stage: Untouched)"], ["assigned", "me", "My leads", "Given to me"],
];
function renderQuick() {
  const box = $("quickChips"); if (!box) return;
  box.innerHTML = QUICK.map(([k, v, label, tip], i) => { const on = !!f[k] && f[k].selected.has(v);
    return '<button type="button" class="qchip' + (on ? " on" : "") + '" data-quick="' + i + '" aria-pressed="' + on + '" title="' + esc(tip) + '">' + (on ? "✓ " : "") + esc(label) + "</button>"; }).join("");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-quick]"); if (!b) return;
  const [k, v] = QUICK[Number(b.dataset.quick)], d = f[k];
  if (d.selected.has(v)) d.selected.delete(v); else { if (d.cfg.single) d.selected.clear(); d.selected.add(v); }
  d.renderChip(); reload();
});
const MORE_FILTERS = [
  ["Location", ["neighborhood", "postal", "distance"]],
  ["Category", ["industry", "exclude", "top100"]],
  ["Business", ["status", "verified", "location", "price", "photos", "attribute"]],
  ["Reputation", ["rating", "reviews", "position"]],
  ["Contact", ["phoneType", "emailCheck", "dedupe", "dataSource"]],
  ["Website", ["chain", "siteCheck", "siteProblem", "builder", "ads"]],
  ["Other", ["dates", "dnc"]],
];
/** With no other filters on: what the open / verified defaults leave in. */
function usualText() {
  const open = isDefault(f.status, ["operational"]), ver = isDefault(f.verified, ["verified"]);
  return open && ver ? "open, verified businesses (the usual view)" : open ? "open businesses" : ver ? "verified businesses, open or closed" : "everything (no filters)";
}
/** Only the usual filters (open + verified, or none) are on. */
function onlyUsual() {
  const usual = (k, d) => (k === "status" && (isDefault(d, ["operational"]) || !d.selected.size)) || (k === "verified" && (isDefault(d, ["verified"]) || !d.selected.size));
  return Object.entries(f).every(([k, d]) => usual(k, d) || !(d.cfg.custom ? d.cfg.isOn() : d.selected.size > 0)) && !view.text.q && !view.text.area && !view.text.ai;
}
/** "Showing:" chips for every filter that is on, each with × to take it off. */
function renderActive() {
  const box = $("activeChips"); if (!box) return;
  // A filter is "on" when it isn't at its starting choice: the same rule highlights its chip and counts it below.
  const chips = Object.entries(f).filter(([, d]) => d.isOn()).map(([k, d]) => [k, d.summary()]);
  if (view.text.q) chips.push(["__q", "Name contains “" + view.text.q + "”"]);
  if (view.text.area) chips.push(["__area", "Inside the area drawn on the map"]);
  if (view.text.ai) chips.push(["__ai", "Exact limits from your description"]);
  const open = isDefault(f.status, ["operational"]), ver = isDefault(f.verified, ["verified"]);
  const also = open && ver ? "Also showing only open, verified" : open ? "Also showing only open ones" : ver ? "Also showing only verified ones" : "";
  box.innerHTML = chips.length ? '<span class="hint">Showing:</span> ' + chips.map(([k, t]) => '<span class="tag">' + esc(t) +
    ' <button type="button" data-unfilter="' + esc(k) + '" aria-label="Remove this filter" title="Remove this filter">×</button></span>').join("") +
    (also ? ' <span class="hint">' + esc(also) + "</span>" : "")
    : '<span class="hint">Showing: ' + esc(usualText()) + "</span>";
  const moreOn = Object.values(f).filter((d) => d.isOn()).length;
  $("moreOn").hidden = !moreOn; $("moreOn").textContent = moreOn + " on";
  renderQuick();
  // On the Database tab the search row shows the type / state / city filters: keep it in step.
  if (acWhat && isDb()) { acWhat.render(); acWhere.render(); }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-unfilter]"); if (!b) return;
  const k = b.dataset.unfilter;
  if (k === "__q") { view.text.q = ""; $("nameSearch").value = ""; }
  else if (k === "__area") delete view.text.area;
  else if (k === "__ai") view.text.ai = null;
  else if (k === "distance") { view.text.radius = ""; view.text.near = ""; }
  else if (k === "dates") ["addedFrom", "addedTo", "updatedFrom", "updatedTo"].forEach((x) => { view.text[x] = ""; });
  else if (f[k]) f[k].selected.clear();
  if (f[k]) f[k].renderChip();
  reload();
});
function buildFilters() {
  const bar = $("filterbar");
  // One-tap chips and the name search are always shown; every dropdown folds away under "All filters".
  bar.innerHTML = '<div class="fgroup"><div id="quickChips" class="quick"></div><div id="f-name"></div><div id="f-clear"></div></div>' +
    '<div id="activeChips" class="activechips"></div>' +
    '<details class="morefilters" id="moreFilters"><summary>All filters <span id="moreOn" class="pill" hidden></span></summary>' +
    '<div class="fgroup core"><span class="glabel">Main</span>' + CORE_FILTERS.map((k) => '<div id="f-' + k + '"></div>').join("") + "</div>" +
    MORE_FILTERS.map(([g, keys]) => '<div class="fgroup"><span class="glabel">' + g + "</span>" + keys.map((k) => '<div id="f-' + k + '"></div>').join("") + "</div>").join("") + "</details>";
  // Counts next to options are worked out when a dropdown is opened (and respect the other filters).
  const beforeOpen = () => (facetsStale ? loadFacets().then(() => true) : Promise.resolve(false));
  const multi = (key, label, options, extra) => { f[key] = dropdown($("f-" + key), { label, allLabel: "All", options, onChange: reload, beforeOpen, ...(extra || {}) }); };
  const single = (key, label, options, extra) => { f[key] = dropdown($("f-" + key), { label, allLabel: "All", single: true, search: false, options, onChange: reload, beforeOpen, ...(extra || {}) }); };

  // States by name ("State: Florida"), cities as "Tampa, FL".
  multi("state", "State", () => fromFacet(facets && facets.states).map((o) => ({ ...o, label: stateFull(o.value) })), { labelOf: stateFull });
  // "City|ST" so two cities with the same name in different states stay separate.
  multi("city", "City", () => ((facets && facets.cities) || []).filter((c) => !f.state.selected.size || f.state.selected.has(c.state)).map((c) => ({ value: c.city + "|" + (c.state || ""), label: c.city + (c.state ? ", " + c.state : ""), n: c.n })));
  multi("neighborhood", "Neighborhood", () => ((facets && facets.neighborhoods) || []).map((r) => ({ value: r.value, label: r.value + (r.city ? ", " + r.city : ""), n: r.n })), { hint: "The 500 most common; type to search.", emptyText: "No neighborhoods for these businesses. Google Maps results have them; the free data doesn’t." });
  multi("postal", "ZIP code", () => fromFacet(facets && facets.postalCodes), { hint: "The 500 most common; type to search." });
  f.distance = dropdown($("f-distance"), {
    label: "Distance", custom: () => {
      const placesOpts = ((facets && facets.cities) || []).map((c) => '<option value="' + esc(c.city + "|" + (c.state || "")) + '"' + (view.text.near === c.city + "|" + (c.state || "") ? " selected" : "") + ">" + esc(c.city + (c.state ? ", " + c.state : "")) + "</option>").join("") +
        ((facets && facets.postalCodes) || []).map((p) => '<option value="zip:' + esc(p.value) + '"' + (view.text.near === "zip:" + p.value ? " selected" : "") + ">ZIP " + esc(p.value) + "</option>").join("");
      return '<div class="dates"><span>Within</span><select id="radiusSel" aria-label="Distance"><option value="">any distance</option>' + [1, 5, 10, 25, 50].map((m) => '<option value="' + m + '"' + (String(view.text.radius) === String(m) ? " selected" : "") + ">" + m + " mile" + (m > 1 ? "s" : "") + "</option>").join("") +
        '</select><span>of</span><select id="nearSel" aria-label="From where"><option value="">choose a place</option>' + placesOpts + '</select></div><div class="hint" style="margin-top:6px">Measured from the middle of the businesses we have in that place.</div>';
    },
    bind: (pop, dd) => { pop.querySelectorAll("select").forEach((s) => s.onchange = () => { view.text.radius = pop.querySelector("#radiusSel").value; view.text.near = pop.querySelector("#nearSel").value; dd.renderChip(); reload(); }); },
    summary: () => view.text.radius && view.text.near ? "Within " + view.text.radius + " mi of " + view.text.near.replace("zip:", "ZIP ").replace("|", ", ") : "Distance: All",
    isOn: () => !!(view.text.radius && view.text.near),
    options: () => [],
  });

  multi("industry", "Industry", () => fromFacet(facets && facets.industries));
  multi("category", "Category", () => {
    const inds = f.industry.selected;
    return ((facets && facets.categories) || []).filter((c) => !inds.size || inds.has(industryOfCategory(c.value))).map((c) => ({ value: c.value, label: c.value, n: c.n, group: industryOfCategory(c.value) }))
      .sort((a, b) => a.group.localeCompare(b.group) || b.n - a.n);
  });
  // Leaving types out: the chip just says "Leave out types" until some are picked.
  multi("exclude", "Leave out types", () => fromFacet(facets && facets.categories), { allLabel: "" });
  single("top100", "Top 100", () => [{ value: "", label: "All types" }, { value: "1", label: "Top 100 types only" }]);

  multi("status", "Status", () => Object.keys(STATUS_LABELS).map((v) => ({ value: v, label: STATUS_LABELS[v], n: countOf(facets && facets.statuses, v) })), { selected: new Set(["operational"]) });
  multi("verified", "Verification", () => [{ value: "verified", label: "Verified (or unknown)", n: countOf(facets && facets.verified, "verified") }, { value: "unverified", label: "Not verified", n: countOf(facets && facets.verified, "unverified") }], { selected: new Set(["verified"]) });
  multi("location", "Location type", () => [{ value: "storefront", label: "Physical location (street address)", n: countOf(facets && facets.location, "storefront") }, { value: "service_area", label: "Service area only", n: countOf(facets && facets.location, "service_area") }]);
  multi("price", "Price", () => ["$", "$$", "$$$", "$$$$"].map((v) => ({ value: v, label: v, n: countOf(facets && facets.prices, v) })));
  single("photos", "Photos", () => [{ value: "", label: "Any" }, ...[1, 10, 25, 50, 100].map((n) => ({ value: String(n), label: n + "+ photos" }))]);
  multi("attribute", "Has all of these features", () => fromFacet(facets && facets.attributes), { noBulk: true, hint: "Businesses must have every feature you tick.", emptyText: "No features listed for these businesses. Google Maps results have them; the free data doesn’t (Fill in missing info → Add Google ratings adds them)." });

  single("rating", "Rating", () => [{ value: "", label: "Any rating" },
    ...["4.5", "4.0", "3.5", "3.0", "2.5", "2.0"].map((v) => ({ value: "min:" + v, label: v + " and up" })),
    ...["4.0", "3.5", "3.0", "2.5", "2.0", "1.5"].map((v) => ({ value: "max:" + v, label: v + " and below" }))]);
  multi("reviews", "Reviews", () => Object.keys(REVIEW_LABELS).map((k) => ({ value: k, label: REVIEW_LABELS[k], n: countOf(facets && facets.reviewBuckets, k) })));
  single("position", "Position", () => [{ value: "", label: "Any position" },
    ...[3, 10, 20, 50].map((n) => ({ value: "rank:" + n, label: n === 3 ? "Top 3 (map pack)" : "Top " + n })),
    ...[1, 5, 10, 25].map((n) => ({ value: "pct:" + n, label: "Top " + n + "% of results" }))]);

  single("phone", "Phone", () => [{ value: "", label: "All" }, { value: "yes", label: "With a phone number" }, { value: "no", label: "Without a phone number" }]);
  multi("phoneType", "Phone type", () => ["mobile", "landline", "toll_free", "voip", "unknown", "unchecked"].map((v) => ({ value: v, label: PHONE_LABELS[v], n: countOf(facets && facets.phoneTypes, v) })));
  single("website", "Website", () => [{ value: "", label: "All" },
    { value: "yes", label: "Has a real website", n: countOf(facets && facets.websites, "yes") },
    { value: "no_real", label: "No real website (none, or only a Facebook / directory page)" },
    { value: "no", label: "No website at all", n: countOf(facets && facets.websites, "no") },
    { value: "social", label: "Only a Facebook / Yelp / directory page", n: countOf(facets && facets.websites, "social") }]);
  multi("dataSource", "Data", () => [["google", "Google Maps"], ["free", "Free data only"], ["free+google", "Free + Google details"]]
    .map(([v, label]) => ({ value: v, label, n: countOf(facets && facets.dataSources, v) })), { search: false });
  multi("dedupe", "Remove duplicates", () => [{ value: "website", label: "One business per website" }, { value: "phone", label: "One business per phone number" }, { value: "listing", label: "One per Google listing" }], { allLabel: "", search: false });
  single("email", "Email", () => [{ value: "", label: "All" }, { value: "yes", label: "Has an email address" },
    { value: "personal", label: "Has a person’s email (not info@ or Gmail)" }, { value: "no", label: "No email address" }]);
  multi("emailCheck", "Email check", () => [["ok", "Verified email"], ["risky", "Risky (catch-all or unknown)"], ["bad", "Has an email that bounces"], ["unchecked", "Email not verified yet"]]
    .map(([v, label]) => ({ value: v, label })), { search: false });
  multi("score", "Score", () => [["weak", "Weak (0-39): the most to fix"], ["basic", "Basic (40-59)"], ["good", "Good (60-79)"], ["strong", "Strong (80+)"], ["none", "Not scored yet"]]
    .map(([v, label]) => ({ value: v, label, n: countOf(facets && facets.scores, v) })), { search: false, hint: "Overall online presence (Google profile + website). Low scores = more for you to fix = better prospects." });
  single("chain", "Chains", () => [{ value: "", label: "All businesses" },
    { value: "hide", label: "Hide chains & franchises", n: countOf(facets && facets.chains, "hide") },
    { value: "only", label: "Only chains & franchises", n: countOf(facets && facets.chains, "only") }]);
  multi("siteCheck", "Website check", () => [["works", "Website works"], ["broken", "Website doesn’t load"], ["blocked", "Couldn’t read it (blocks checks)"], ["not_checked", "Not checked yet"]]
    .map(([v, label]) => ({ value: v, label, n: countOf(facets && facets.siteChecks, v) })), { search: false });
  multi("siteProblem", "Website problems", () => Object.entries(SITE_PROBLEM_LABELS).map(([v, label]) => ({ value: v, label })),
    { noBulk: true, search: false, hint: "Businesses must have every problem you tick (checked websites only).", emptyText: "Nothing to pick" });
  multi("ads", "Advertising", () => [["google_ads", "Runs Google Ads (tag on the website)"], ["call_tracking", "Uses call tracking (usually paid ads)"],
    ["meta_pixel", "Has a Meta (Facebook) pixel"], ["bing_ads", "Runs Microsoft Ads"], ["none", "No advertising signs"]].map(([v, label]) => ({ value: v, label })),
    { search: false, hint: "Signs on the website that a business pays for ads (checked websites only)." });
  single("owner", "Owner", () => [{ value: "", label: "All" }, { value: "yes", label: "Owner name known" }, { value: "no", label: "Owner name not known" }]);
  multi("builder", "Built with", () => fromFacet(facets && facets.builders, BUILDER_LABELS), { search: false, emptyText: "No websites checked yet." });

  f.dates = dropdown($("f-dates"), {
    label: "Dates", options: () => [],
    custom: () => '<div class="dates"><span>Added from</span><input type="date" id="dAddedFrom" aria-label="Added from" value="' + esc(view.text.addedFrom || "") + '"><span>Added to</span><input type="date" id="dAddedTo" aria-label="Added to" value="' + esc(view.text.addedTo || "") + '">' +
      '<span>Updated from</span><input type="date" id="dUpdatedFrom" aria-label="Updated from" value="' + esc(view.text.updatedFrom || "") + '"><span>Updated to</span><input type="date" id="dUpdatedTo" aria-label="Updated to" value="' + esc(view.text.updatedTo || "") + '"></div>',
    bind: (pop, dd) => { pop.querySelectorAll("input").forEach((i) => i.onchange = () => {
      view.text.addedFrom = pop.querySelector("#dAddedFrom").value; view.text.addedTo = pop.querySelector("#dAddedTo").value;
      view.text.updatedFrom = pop.querySelector("#dUpdatedFrom").value; view.text.updatedTo = pop.querySelector("#dUpdatedTo").value;
      dd.renderChip(); reload(); }); },
    summary: () => { const n = ["addedFrom", "addedTo", "updatedFrom", "updatedTo"].filter((k) => view.text[k]).length; return "Dates: " + (n ? n + " set" : "All"); },
    isOn: () => ["addedFrom", "addedTo", "updatedFrom", "updatedTo"].some((k) => view.text[k]),
  });
  // Do-not-contact businesses are left out unless asked for: the chip just says "Do-not-contact" then.
  single("dnc", "Do-not-contact", () => [{ value: "", label: "Leave them out (the usual)" }, { value: "show", label: "Show them too" }, { value: "only", label: "Only the do-not-contact list" }], { allLabel: "" });
  multi("leadStatus", "Stage", () => fromFacet(facets && facets.leadStatuses));
  multi("assigned", "Assigned to", () => [{ value: "me", label: "Me (my leads)" }, { value: "none", label: "Nobody yet" },
    ...team.filter((t) => !me || t.id !== me.id).map((t) => ({ value: t.id, label: t.name }))], { search: false });
  $("f-name").innerHTML = '<input type="search" id="nameSearch" placeholder="Search by business name…" aria-label="Search by business name" style="border-radius:99px;padding:4px 11px">';
  let typing; $("nameSearch").oninput = () => { clearTimeout(typing); typing = setTimeout(() => { view.text.q = $("nameSearch").value.trim(); reload(); }, 300); };
  $("f-clear").innerHTML = '<button type="button" class="link" id="clearFilters" title="Back to the usual view: open, verified businesses">Reset filters</button>';
  $("clearFilters").onclick = () => {
    restore({ ...defaultFilters, scope: view.scope, label: view.scopeLabel });
    reload();
  };
}
// Category -> industry, built once when the category list loads.
let industryByCat = null;
function industryOfCategory(cat) {
  if (!tree) return "Other";
  if (!industryByCat) industryByCat = new Map(tree.industries.flatMap((i) => i.categories.map((c) => [c.name.toLowerCase(), i.industry])));
  return industryByCat.get(String(cat).toLowerCase()) || "Other";
}

function query() {
  const p = new URLSearchParams({ page: view.page, sort: view.sort, dir: view.dir });
  if (view.scope) view.scope.forEach((id) => p.append("search_id", id));
  const add = (key, dd) => dd && dd.selected.forEach((v) => p.append(key, v));
  add("state", f.state); add("city", f.city); add("neighborhood", f.neighborhood); add("postal_code", f.postal);
  add("industry", f.industry); add("category", f.category); add("exclude_category", f.exclude);
  add("status", f.status); add("verified", f.verified); add("location", f.location); add("price", f.price); add("attribute", f.attribute);
  add("reviews", f.reviews); add("phone_type", f.phoneType); add("lead_status", f.leadStatus); add("assigned", f.assigned); add("data_source", f.dataSource);
  const one = (dd) => [...dd.selected][0] || "";
  if (one(f.top100)) p.set("top100", "1");
  if (one(f.photos)) p.set("min_photos", one(f.photos));
  const rating = one(f.rating); if (rating) p.set(rating.startsWith("min:") ? "min_rating" : "max_rating", rating.slice(4));
  const pos = one(f.position); if (pos) p.set(pos.startsWith("rank:") ? "max_rank" : "top_pct", pos.split(":")[1]);
  if (one(f.phone)) p.set("phone", one(f.phone));
  if (one(f.website)) p.set("website", one(f.website));
  if (one(f.email)) p.set("email", one(f.email));
  if (one(f.chain)) p.set("chain", one(f.chain));
  if (one(f.owner)) p.set("owner", one(f.owner));
  if (one(f.dnc)) p.set("dnc", one(f.dnc));
  add("ads", f.ads); add("email_check", f.emailCheck);
  add("score", f.score); add("site_check", f.siteCheck); add("site_problem", f.siteProblem); add("builder", f.builder);
  f.dedupe.selected.forEach((v) => p.set("dedupe_" + v, "1"));
  if (view.text.radius && view.text.near) { p.set("radius_miles", view.text.radius); p.set("near", view.text.near); }
  // Exact numbers from a plain-English search that the chips can't show (reviews / rating limits).
  if (view.text.ai) for (const [k, v] of Object.entries(view.text.ai)) p.set(k, v);
  if (view.text.area) p.set("area", view.text.area);
  const map = { q: "q", addedFrom: "added_from", addedTo: "added_to", updatedFrom: "updated_from", updatedTo: "updated_to" };
  for (const [k, key] of Object.entries(map)) if (view.text[k]) p.set(key, view.text[k]);
  return p;
}
/** The current filters without paging (for counts, phone checks and the CSV). */
function filterQuery() { const p = query(); p.delete("page"); return p; }

function useScope(searchIds, label) {
  view.scope = searchIds && searchIds.length ? searchIds : null;
  view.scopeLabel = label || "";
  view.page = 1;
  // A new list: "Loading…" until it arrives, never the previous list's numbers.
  $("count").textContent = "Loading…"; $("dupInfo").innerHTML = ""; $("scopeInfo").innerHTML = ""; $("pageInfo").textContent = "";
  $("downloadBtn").disabled = true; $("downloadBtn").textContent = "Download ▾";
  $("rows").innerHTML = '<tr><td colspan="18" class="empty-state">Loading…</td></tr>';
  $("gapLine").hidden = true;
  $("emptyState").hidden = true; $("resultsBody").hidden = false; $("filtersCard").hidden = false; $("resultsCard").hidden = false;
  refreshAll();
}
// The list must never depend on the filter counts: if the counts fail, the businesses still show.
async function refreshAll() {
  facetsStale = true;
  try { await loadFacets(); } catch (err) { console.error("filter counts failed", err); }
  $("mapBtnText").textContent = view.text.area ? "Map · area on" : "Map";
  if (!$("mapCard").hidden) loadMap().catch((err) => { $("mapInfo").textContent = err.message; });
  await loadLeads();
}
// Filter counts are refreshed when a dropdown is opened after a change, not on every click.
function reload() {
  view.page = 1; facetsStale = true; loadLeads();
  $("mapBtnText").textContent = view.text.area ? "Map · area on" : "Map";
  if (!$("mapCard").hidden) loadMap().catch((err) => { $("mapInfo").textContent = err.message; });
}
let facetsStale = true;
async function loadFacets() {
  const p = filterQuery(); p.delete("sort"); p.delete("dir");
  facets = await api("/api/leads/facets?" + p);
  facetsStale = false;
  Object.values(f).forEach((d) => d.refresh());
}

/** "+14075550101" -> "(407) 555-0101"; other countries keep "+<digits>". */
function phoneText(e164, raw) {
  const d = String(e164 || "").replace(/[^0-9]/g, "");
  if (d.length === 11 && d[0] === "1") return "(" + d.slice(1, 4) + ") " + d.slice(4, 7) + "-" + d.slice(7);
  return e164 || raw || "";
}
const isDefault = (dd, values) => dd.selected.size === values.length && values.every((v) => dd.selected.has(v));
let leadsSeq = 0, lastListTotal = 0;
const rowsById = new Map(); // the rows on screen (the business window shows their address too)
async function loadLeads() {
  if ($("resultsBody").hidden) return;
  renderActive();
  const seq = ++leadsSeq;
  let data;
  try {
    data = await api("/api/leads?" + query());
  } catch (err) {
    if (seq !== leadsSeq) return;
    // Nothing from the last list stays on screen as if it were current.
    $("count").textContent = "Couldn’t load the list";
    $("dupInfo").innerHTML = ""; $("scopeInfo").innerHTML = ""; $("pageInfo").textContent = "";
    $("downloadBtn").disabled = true; $("downloadBtn").textContent = "Download ▾"; $("prevBtn").disabled = true; $("nextBtn").disabled = true;
    $("rows").innerHTML = '<tr><td colspan="18" class="empty-state">' + esc(err.message) + ' <button type="button" class="link" id="retryList">Try again</button></td></tr>';
    $("retryList").onclick = () => loadLeads();
    $("gapLine").hidden = true;
    return;
  }
  if (seq !== leadsSeq) return; // an older answer arriving late: a newer one is on its way
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  lastListTotal = data.total;
  $("count").textContent = data.total.toLocaleString() + " business" + (data.total === 1 ? "" : "es");
  // A list of searches: everything they hold that the filters leave out. Otherwise: what only the
  // open / verified filters leave out (the server counts it), whatever else is on.
  const usualSet = (f.status.selected.size || f.verified.selected.size) && (isDefault(f.status, ["operational"]) || !f.status.selected.size) &&
    (isDefault(f.verified, ["verified"]) || !f.verified.selected.size);
  const hidden = data.inScope != null ? data.inScope - data.total - (data.duplicatesHidden || 0) : usualSet && data.hiddenByUsual ? data.hiddenByUsual : 0;
  const usualOnly = data.inScope != null ? onlyUsual() && usualSet : true;
  const hiddenWhat = f.status.selected.size && f.verified.selected.size ? "closed or not verified" : f.status.selected.size ? "closed" : "not verified";
  $("dupInfo").innerHTML = (data.duplicatesHidden ? "(" + num(data.duplicatesHidden) + " duplicate" + (data.duplicatesHidden === 1 ? "" : "s") + " hidden) " : "") +
    (hidden <= 0 ? "" : usualOnly ? "· " + num(hidden) + " " + hiddenWhat + " hidden · " + '<button type="button" class="link small" id="showAllHere">show them</button>'
      : "· " + num(hidden) + " more hidden by your filters · " + '<button type="button" class="link small" id="showAllHere">show all</button>');
  if ($("showAllHere")) $("showAllHere").onclick = () => {
    // Just the two usual filters (open, verified), or every filter when others are on too.
    if (usualOnly) { f.status.selected.clear(); f.verified.selected.clear(); }
    else { Object.values(f).forEach((d) => d.selected.clear()); view.text = {}; $("nameSearch").value = ""; }
    Object.values(f).forEach((d) => d.renderChip()); reload();
  };
  const running = view.scope ? pulls.filter((p) => view.scope.includes(p.id) && isRunning(p)).length : 0;
  const unusual = !isDefault(f.status, ["operational"]) || !isDefault(f.verified, ["verified"]);
  $("scopeInfo").innerHTML = (view.scope ? '<span class="pill">' + esc(view.scopeLabel || view.scope.length + " searches") + '</span> <button type="button" class="link small" id="clearScope">show everything we have</button>' : "") +
    (unusual ? ' <span class="pill warn filterwarn" title="The usual view shows only open, verified businesses">includes closed or not-verified businesses</span>' : "") +
    (running ? ' <span class="pill warn">' + running + " still collecting…</span>" : "") +
    (phonesWatched && phoneState && phoneState.message ? ' <span class="pill ' + (/paused|no_service/.test(phoneState.state) ? "bad" : "warn") + '">' + esc(phoneState.message) + "</span>" : "") +
    (data.nearNotFound ? ' <span class="pill bad">no businesses with a map position in that place yet</span>' : "");
  if ($("clearScope")) $("clearScope").onclick = () => useScope(null, "");
  $("pageInfo").textContent = "Page " + data.page + " of " + pages;
  $("prevBtn").disabled = data.page <= 1; $("nextBtn").disabled = data.page >= pages;
  $("downloadBtn").disabled = data.total === 0; $("checkPhonesBtn").disabled = data.total === 0; $("checkSitesBtn").disabled = data.total === 0;
  $("downloadBtn").textContent = "Download " + num(data.total) + " ▾";
  const paused = phoneState && /paused|no_service/.test(phoneState.state);
  rowsById.clear(); data.results.forEach((l) => rowsById.set(l.id, l));
  $("rows").innerHTML = data.results.length ? data.results.map((l) => {
    const type = l.phone_type || (l.gbp_phone_formatted ? "unchecked" : "no_phone");
    const shownSite = isWebLink(l.website) ? l.website_domain || l.website.replace(/^https?:[/][/](www[.])?/, "").split(/[/?#]/)[0] : "";
    const site = isWebLink(l.website)
      ? '<a href="' + esc(l.website) + '" target="_blank" rel="noopener" title="' + esc(l.website) + '">' + esc(shownSite) + "</a>" + (l.website_domain ? "" : ' <span class="muted">(social / directory page)</span>')
      : '<span class="pill">No website</span>';
    const isFree = l.data_source === "free" || l.data_source === "upload";
    const mapsSearch = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([l.business_name, l.address || l.city].filter(Boolean).join(" "));
    // The name wraps like text; the map arrow stays on the same line as its last word.
    const name = '<span role="button" tabindex="0" class="bizname" data-lead="' + esc(l.id) + '" title="Open: notes, next step, what to fix">' + esc(bizName(l.business_name)) + "</span>" +
      '&nbsp;<a class="maplink" href="' + esc(isWebLink(l.gbp_url) ? l.gbp_url : mapsSearch) + '" target="_blank" rel="noopener" title="Open in Google Maps" aria-label="Open in Google Maps">↗</a>' +
      (l.data_source === "upload" ? ' <span class="pill free" title="From a list you uploaded">uploaded</span>' : "") +
      (l.owner_name ? '<div class="cellnote muted" title="' + (l.owner_source === "registry" ? "From the state business registry" : "From the business’s website") + '">' + icon("user") + " " + esc(l.owner_name) + (l.owner_title ? ", " + esc(l.owner_title) : "") + '</div>' : "") +
      (l.suppressed ? ' <span class="pill bad" title="On the do-not-contact list">do not contact</span>' : "") +
      (l.is_chain === 1 ? ' <span class="pill warn" title="A chain or franchise (a known brand, or its website is shared by businesses in 3+ cities)">chain</span>' : "");
    const verified = l.is_claimed === 0 ? '<span class="pill bad">Not verified</span>'
      : isFree ? (l.google_match === "queued" ? '<span class="pill warn">looking up…</span>' : l.google_match === "not_found" ? '<span class="pill" title="Google Maps had no matching listing">not on Google</span>'
        : '<span class="muted" title="The free data doesn’t say. Fill in missing info → Add Google ratings adds it.">—</span>')
      : '<span class="pill ok">Verified</span>';
    const status = l.business_status === "operational" ? '<span class="pill ok">Open</span>'
      : '<span class="pill ' + (l.business_status === "permanently_closed" ? "bad" : "warn") + '">' + esc(STATUS_LABELS[l.business_status] || l.business_status) + "</span>";
    const loc = l.has_street_address === 0 ? "Service area" : l.has_street_address === 1 ? "Physical" : "";
    // Phone type cell: the answer (kept while a re-check runs), or where the check stands.
    const queued = l.phone_check_requested > 0;
    const typeText = type === "unchecked"
      ? (queued ? (paused ? "Waiting (checks paused)" : "Checking…") : l.enrichment_error ? "Couldn’t check" : PHONE_LABELS.unchecked)
      : type === "no_phone" ? '<span class="muted">No phone</span>' : esc(PHONE_LABELS[type] || type) + (queued ? ' <span class="muted">(re-checking…)</span>' : "");
    const action = type === "unchecked" && !queued ? ' <button type="button" class="link small" data-checkphone="' + esc(l.id) + '">Check' + (l.enrichment_error ? " again" : "") + "</button>"
      : l.phone_type && l.phone_type !== "toll_free" && !queued ? ' <button type="button" class="link small recheck" data-recheckphone="' + esc(l.id) + '" title="Check this number again" aria-label="Check this number again">↻</button>' : "";
    // data-label lets small screens show each business as a labelled card instead of a wide row.
    const cell = (label, html, cls) => '<td data-label="' + label + '"' + (cls ? ' class="' + cls + '"' : "") + ">" + html + "</td>";
    const stage = l.lead_status || "Untouched";
    const stageCell = '<button type="button" class="pill stagepill ' + (stage === "Untouched" ? "st-untouched" : "st-active") + '" data-lead="' + esc(l.id) + '" title="Stage, assignment and notes">' + esc(stage) + "</button>" +
      (l.assigned_name ? '<div class="cellnote muted">→ ' + esc(l.assigned_name) + "</div>" : "") + (l.notes_count ? '<div class="cellnote muted" title="Notes">' + icon("note") + " " + esc(l.notes_count) + "</div>" : "");
    return "<tr>" + cell("Business", name, "name") + cell("Score", scoreCell(l)) + cell("Stage", stageCell) + cell("Category", esc(l.gbp_category).replace(/[/]/g, "/<wbr>")) + cell("Phone", l.gbp_phone_formatted ? '<a href="tel:' + esc(l.gbp_phone_formatted) + '">' + esc(phoneText(l.gbp_phone_formatted, l.gbp_phone_raw)) + "</a>" : '<span class="muted">—</span>') + cell("Email", emailCell(l)) +
      cell("Phone type", typeText + (l.phone_carrier ? ' <span class="muted">' + esc(l.phone_carrier) + "</span>" : "") + action, "type-" + esc(type)) +
      cell("Website", site + siteFacts(l)) + cell("Rating", l.rating == null || l.rating === "" ? "" : esc(Number(l.rating).toFixed(1))) + cell("Reviews", esc(l.review_count ?? "")) + cell("Position", esc(l.gbp_rank ?? "")) +
      cell("Verified", verified) + cell("Status", status) + cell("Location", esc(loc)) + cell("City", esc(l.city)) + cell("State", esc(l.state)) +
      cell("Neighborhood", esc(l.neighborhood)) + cell("Added", esc(l.lead_date)) + "</tr>";
  }).join("") : '<tr><td colspan="18" class="empty-state">' + (running
    ? "Still collecting. They appear here when it finishes."
    : f.phoneType.selected.size && phoneState && phoneState.pending
      ? esc(phoneState.message || "Phone types are still being checked.") + " Businesses appear here as their phones are checked, or untick Phone type to see them all."
      : "No businesses match these filters." + (unusual || hidden > 0 ? "" : " Try Reset filters.")) + "</td></tr>";
  fitTable();
  updateGapLine();
  if (scrollToListOnLoad) { scrollToListOnLoad = false; toListTop(true); }
}
// "N of these have no Google rating yet. [Add them · about $X]": one line under the toolbar, for
// whoever can spend (owner / admins). The price check is made once per list (kept 5 minutes) and
// only after the filters stop changing, so clicking around doesn't call it again and again.
const gapCache = new Map();
let gapTimer = null, gapSeq = 0;
const canSpend = () => !!me && me.role !== "member";
function showGap(pv, qs) {
  const line = $("gapLine");
  $("gdCost").textContent = pv && pv.eligible ? "about " + money(pv.costUsd) : "about $5 per 1,000";
  if (!pv || !pv.eligible) { line.hidden = true; return; }
  const n = pv.capped ? "More than " + num(pv.eligible) : num(pv.eligible);
  line.innerHTML = '<span class="ndot" aria-hidden="true"></span>' + n + " of these " + (pv.eligible === 1 && !pv.capped ? "has" : "have") + " no Google rating yet." +
    '<button type="button" class="ghost small" id="gapAdd" title="Adds star rating, reviews and verified from Google Maps. You see the price first.">' +
    (pv.capped ? "Add the first " + num(pv.eligible) : "Add " + (pv.eligible === 1 ? "it" : "them")) + " · about " + esc(money(pv.costUsd)) + "</button>";
  line.hidden = false;
  $("gapAdd").onclick = async () => {
    $("gapAdd").disabled = true;
    try { await requestGoogleDetails({}, qs); } catch (err) { toast(err.message, "bad"); }
    finally { if ($("gapAdd")) $("gapAdd").disabled = false; }
  };
}
function updateGapLine() {
  clearTimeout(gapTimer);
  const my = ++gapSeq;
  const free = facets && !facetsStale ? countOf(facets.dataSources, "free") + countOf(facets.dataSources, "upload") : null;
  if (!canSpend() || !lastListTotal || free === 0) { $("gapLine").hidden = true; showGap(null); return; }
  const q = filterQuery(); q.delete("sort"); q.delete("dir");
  const qs = q.toString(), hit = gapCache.get(qs);
  if (hit && Date.now() - hit.at < 300000) return showGap(hit.pv, qs);
  $("gapLine").hidden = true;
  gapTimer = setTimeout(async () => {
    try {
      const pv = await postJson("/api/google-details?" + qs, { dryRun: true });
      gapCache.set(qs, { at: Date.now(), pv });
      if (my === gapSeq) showGap(pv, qs);
    } catch (err) { /* only a hint: the menu item still works */ }
  }, 800);
}
let scrollToListOnLoad = false;
/** The list's column headings stick under the header when the table fits the width (no sideways scrolling). */
// When the list is wider than the screen, the less important columns fold away first (Category, then
// Rating, then the website notes), so the table fits and its headings can stick under the header.
const AUTO_FOLD = [
  '#resultsCard thead th:nth-child(4), #rows td[data-label="Category"] { display: none; }',
  '#resultsCard thead th:nth-child(9), #rows td[data-label="Rating"] { display: none; }',
  '#rows td[data-label="Website"] .cellnote { display: none; }',
];
let autoFolded = 0;
function fitTable() {
  const wrap = $("leadTable").parentElement, bar = document.querySelector("#resultsBody > .bar");
  if (bar) document.documentElement.style.setProperty("--barh", bar.offsetHeight + "px");
  let st = $("colAuto");
  if (!st) { st = document.createElement("style"); st.id = "colAuto"; document.head.appendChild(st); }
  const fits = () => $("leadTable").offsetWidth <= wrap.clientWidth + 1;
  wrap.classList.remove("fits");
  autoFolded = 0; st.textContent = "";
  // Phones show cards instead of the table: nothing to fold there.
  if (innerWidth > 760) while (!fits() && autoFolded < AUTO_FOLD.length) { autoFolded++; st.textContent = AUTO_FOLD.slice(0, autoFolded).join(" "); }
  wrap.classList.toggle("fits", fits());
}
/** The header's height, for whatever sticks under it (and for menus on phones). */
function measureHeader() {
  const h = document.querySelector("header");
  document.documentElement.style.setProperty("--hdrh", getComputedStyle(h).position === "sticky" ? h.offsetHeight + "px" : "0px");
  document.documentElement.style.setProperty("--menutop", Math.round(h.getBoundingClientRect().bottom + 6) + "px");
  stripFade($("tabStrip")); stripFade($("adminNav"));
}
/** A sideways-scrolling strip fades at the edge that has more to see. */
function stripFade(el) {
  if (!el) return;
  const more = el.scrollWidth > el.clientWidth + 2;
  el.classList.toggle("more-r", more && el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  el.classList.toggle("more-l", more && el.scrollLeft > 2);
}
window.addEventListener("resize", () => { measureHeader(); if (!$("resultsBody").hidden) fitTable(); });
["tabStrip", "adminNav"].forEach((id) => $(id).addEventListener("scroll", () => stripFade($(id)), { passive: true }));

/** Show which column the list is sorted by (arrow + aria-sort for screen readers). */
function markSorted() {
  document.querySelectorAll("#leadTable th").forEach((h) => {
    const on = h.dataset.sort === view.sort;
    h.classList.toggle("sorted", on); h.classList.toggle("asc", on && view.dir === "asc");
    if (on) h.setAttribute("aria-sort", view.dir === "asc" ? "ascending" : "descending"); else h.removeAttribute("aria-sort");
  });
}
document.querySelectorAll("#leadTable th[data-sort]").forEach((th) => {
  th.tabIndex = 0; th.title = (th.title ? th.title + " " : "") + "(Click to sort.)";
  const sort = () => {
    if (view.sort === th.dataset.sort) view.dir = view.dir === "asc" ? "desc" : "asc";
    else { view.sort = th.dataset.sort; view.dir = ["name", "city", "category", "rank", "score", "stage"].includes(th.dataset.sort) ? "asc" : "desc"; }
    markSorted(); view.page = 1;
    loadLeads();
  };
  th.onclick = sort;
  th.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } };
});
// A new page starts at the top of the list.
const toListTop = (always) => {
  const top = $("resultsCard").getBoundingClientRect().top, hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdrh")) || 0;
  if (always || top < hdr) window.scrollTo(0, Math.max(0, scrollY + top - hdr - 8));
};
$("prevBtn").onclick = () => { view.page--; loadLeads(); toListTop(); };
$("nextBtn").onclick = () => { view.page++; loadLeads(); toListTop(); };
// Text-like buttons (business names) work from the keyboard too.
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[role="button"][data-lead]')) { e.preventDefault(); e.target.click(); }
});

/** The price word on "Check phone types" (Improve menu): the same words before and after a price check. */
function setPhoneCost(p) {
  if (!p || p.maxPerCheck == null) return;
  const paid = p.maxPerCheck > 0;
  $("phoneCost").textContent = paid ? "Small fee" : p.hasService === false ? "Not set up" : "Free";
  $("phoneCost").classList.toggle("free", !paid && p.hasService !== false);
}
// Phone checks on demand: one business (Check / ↻) or every business in the list.
async function requestPhones(body, qs, single) {
  const url = "/api/phones/request" + (qs ? "?" + qs : "");
  const pv = await postJson(url, { ...body, dryRun: true });
  // "Free" only when it really costs nothing; otherwise the same "small fee" words as the Improve menu.
  const cost = (n) => pv.maxPerCheck > 0
    ? (pv.hasFreeService ? "Small fee: up to " + money(n * pv.maxPerCheck) + " (free checks are used first, so it’s often less)." : "Small fee: about " + money(pv.maxPerCheck) + " each, up to " + money(n * pv.maxPerCheck) + ", from this month’s budget.")
    : "Free.";
  setPhoneCost(pv);
  if (!pv.queued) {
    if (!pv.total) return toast("There’s nothing in this list to check.");
    const parts = [];
    if (pv.checked) parts.push(num(pv.checked) + " already checked");
    if (pv.tollFree) parts.push(num(pv.tollFree) + " toll-free (known from the number)");
    if (pv.waiting) parts.push(num(pv.waiting) + " already being checked");
    if (pv.noPhone) parts.push(num(pv.noPhone) + " with no phone number on Google");
    if (pv.checked && !body.recheck) {
      if (!(await ask("These phones are all checked", parts.join(", ").charAt(0).toUpperCase() + parts.join(", ").slice(1) + ". Check the " + num(pv.checked) + " checked number" + (pv.checked > 1 ? "s" : "") + " again, for example if a business may have switched to a mobile? " + cost(pv.checked), "Check again", { paid: pv.maxPerCheck > 0 }))) return;
      return requestPhones({ ...body, recheck: true }, qs, single);
    }
    const pausedNow = phoneState && /paused|no_service/.test(phoneState.state);
    return toast(pv.waiting
      ? (pausedNow ? "These phones are waiting to be checked, but " + phoneState.message.charAt(0).toLowerCase() + phoneState.message.slice(1) + " (" + parts.join(", ") + ")."
        : "These phones are already being checked; results appear within a few minutes (" + parts.join(", ") + ").")
      : "Nothing to check: " + parts.join(", ") + ".");
  }
  if (pv.fits === false) return toast("Not enough budget left this month (" + money(pv.budgetLeft) + ") to check " + num(pv.queued) + " numbers. The owner can raise it on the Admin page (Spending).");
  if (!single) {
    const extra = [pv.checked && !body.recheck ? num(pv.checked) + " already checked" : "", pv.waiting ? num(pv.waiting) + " already waiting" : "", pv.noPhone ? num(pv.noPhone) + " have no phone" : ""].filter(Boolean);
    // Checks paused (no service, or the budget): they wait in line until that's sorted.
    const pausedNote = phoneState && /paused|no_service/.test(phoneState.state) && phoneState.message ? " Right now checks are paused (" + lowerFirst(phoneState.message).replace(/[.]$/, "") + "): these wait until that’s fixed." : "";
    if (!(await ask("Check " + num(pv.queued) + " phone number" + (pv.queued > 1 ? "s" : "") + "?", "Finds out which are mobiles, landlines or internet (VoIP) numbers." + (extra.length ? " (" + extra.join(", ") + ".)" : "") + (pv.capped ? " Only the first " + num(pv.limit) + " at a time." : "") + " " + cost(pv.queued) + pausedNote, "Check phones", { paid: pv.maxPerCheck > 0 }))) return;
  }
  await postJson(url, body);
  phonesWatched = true;
  startPolling();
  await loadLeads();
}
$("rows").addEventListener("click", async (e) => {
  const one = e.target.closest("[data-checkphone]"), again = e.target.closest("[data-recheckphone]");
  if (!one && !again) return;
  const b = one || again; b.disabled = true;
  try { await requestPhones({ ids: [one ? one.dataset.checkphone : again.dataset.recheckphone], recheck: !!again }, "", true); }
  catch (err) { toast(err.message, "bad"); b.disabled = false; }
});
$("checkPhonesBtn").onclick = async () => {
  const p = filterQuery(); p.delete("sort"); p.delete("dir");
  $("checkPhonesBtn").disabled = true;
  try { await requestPhones({}, p.toString()); } catch (err) { toast(err.message, "bad"); } finally { $("checkPhonesBtn").disabled = false; }
};

// Website check for the whole list (free; runs on the free collector, paced per day).
$("checkSitesBtn").onclick = async () => {
  const q = filterQuery(); q.delete("sort"); q.delete("dir");
  const url = "/api/websites/check?" + q.toString();
  $("checkSitesBtn").disabled = true;
  try {
    const pv = await postJson(url, { dryRun: true });
    const pace = pv.status.enabled ? "Up to " + num(pv.status.limit) + " websites are checked a day (" + num(pv.status.checkedToday) + " so far today)." : "Website checks are switched off on the Admin page.";
    if (!pv.withWebsite) return toast("No business in this list has a real website to check.");
    if (!pv.notChecked) {
      const parts = [pv.done ? num(pv.done) + " already checked" : "", pv.waiting ? num(pv.waiting) + " waiting to be checked" : ""].filter(Boolean).join(", ");
      if (pv.done && (await ask("Nothing new to check", parts.charAt(0).toUpperCase() + parts.slice(1) + ". Check the " + num(pv.done) + " checked website" + (pv.done === 1 ? "" : "s") + " again? It’s free. " + pace, "Check again"))) {
        const r = await postJson(url, { recheck: true });
        toast(num(r.queued) + " websites will be checked again. " + pace, "ok");
        await loadLeads();
      } else if (!pv.done) toast("Nothing new to check (" + parts + "). " + pace);
      return;
    }
    if (!(await ask("Check " + num(Math.min(pv.notChecked, 5000)) + " website" + (pv.notChecked > 1 ? "s" : "") + "?", "Free. " + (pv.notChecked > 5000 ? "The first 5,000 of the " + num(pv.notChecked) + " not checked yet in this list; do the rest after. " : "") + pace, "Check websites"))) return;
    const r = await postJson(url, {});
    toast(num(r.queued) + " websites are queued. Results appear here as they’re checked. " + pace, "ok");
    await loadLeads();
  } catch (err) { toast(err.message, "bad"); } finally { $("checkSitesBtn").disabled = false; }
};

// Paid tier: look free businesses up on Google Maps (whole list, or one row).
async function requestGoogleDetails(body, qs) {
  const url = "/api/google-details" + (qs ? "?" + qs : "");
  const pv = await postJson(url, { ...body, dryRun: true });
  if (!pv.eligible) {
    const why = [pv.alreadyGoogle ? num(pv.alreadyGoogle) + " already have Google details" : "", pv.running ? num(pv.running) + " are being looked up now" : "",
      pv.notFoundBefore ? num(pv.notFoundBefore) + " weren’t found on Google before" : ""].filter(Boolean);
    if (pv.notFoundBefore && (await ask("Nothing new to look up", why.join(", ").charAt(0).toUpperCase() + why.join(", ").slice(1) + ". Try the " + num(pv.notFoundBefore) + " that weren’t found on Google again? About " + money(pv.notFoundBefore * 0.005) + ".", "Try again", { paid: true }))) return requestGoogleDetails({ ...body, retryNotFound: true }, qs);
    if (!pv.notFoundBefore) toast(pv.total ? "Nothing to look up: " + why.join(", ") + "." : "There’s nothing in this list.");
    return;
  }
  if (pv.budget && pv.costUsd > pv.budget.left + 1e-9) return toast("That would cost about " + money(pv.costUsd) + ", but only " + money(pv.budget.left) + " of this month’s budget is left.");
  const msg = "Adds their Google rating, reviews, verified status and listing." + (pv.capped ? " The first 500 now; do the rest after." : "") + (pv.alreadyGoogle ? " " + num(pv.alreadyGoogle) + " already have Google details and are skipped." : "") + " Cost: about " + money(pv.costUsd) + ", from this month’s budget.";
  if (!(await ask("Look up " + num(pv.eligible) + " business" + (pv.eligible > 1 ? "es" : "") + " on Google?", msg, "Look up · about " + money(pv.costUsd), { paid: true }))) return;
  const r = await postJson(url, body);
  gapCache.clear();
  tracked.add(r.search.id);
  if (currentTab === "find") { startedIds = [...new Set([...startedIds, r.search.id])]; }
  await loadPulls(); renderProgress(); startPolling(); loadSpend();
  toast("Looking them up on Google. Ratings and reviews appear in the list within a few minutes.", "ok");
  await loadLeads();
  return true;
}
$("googleDetailsBtn").onclick = async () => {
  const q = filterQuery(); q.delete("sort"); q.delete("dir");
  $("googleDetailsBtn").disabled = true;
  try { await requestGoogleDetails({}, q.toString()); } catch (err) { toast(err.message, "bad"); } finally { $("googleDetailsBtn").disabled = false; }
};
// One business (the "Add Google rating" button in the business window).
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-gdetail]"); if (!b) return;
  b.disabled = true;
  try {
    const started = await requestGoogleDetails({ ids: [b.dataset.gdetail] }, "");
    if (started && b.isConnected) b.outerHTML = '<span class="hint">Looking it up on Google…</span>';
    else b.disabled = false;
  } catch (err) { toast(err.message, "bad"); b.disabled = false; }
});

// ---------------------------------------------------------------------------
// Working the leads: stage, assignment, notes; upload a list.
// ---------------------------------------------------------------------------
const STAGES = ["Untouched", "Contacted", "Follow-up", "Interested", "Won", "Lost"];
let team = [];
async function loadTeam2() { team = await api("/api/team").catch(() => []); }
function teamOptions(selected, withKeep) {
  return (withKeep ? '<option value="__keep">(leave as it is)</option>' : "") + '<option value="">Nobody</option><option value="me">Me</option>' +
    team.filter((t) => !me || t.id !== me.id).map((t) => '<option value="' + esc(t.id) + '"' + (t.id === selected ? " selected" : "") + ">" + esc(t.name) + "</option>").join("");
}
document.addEventListener("click", (e) => {
  const x = e.target.closest("[data-close]");
  if (x) closeModal($(x.dataset.close));
});
let openLeadId = null, openNotes = [], openLeadData = null;
/** Marks what the AI helper found (owner name, summary, opener): worth a second look. */
const AI_BADGE = '<span class="aibadge" title="Found by the AI helper — double-check">AI</span>';
// Which optional features are on (GET /api/features), filled in when the page opens.
let features = {};
// The AI helper reads one business's website on request (it's queued first; usually a few minutes).
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-ai-run]"); if (!b) return;
  b.disabled = true;
  try {
    await postJson("/api/ai-helper/run", { ids: [b.dataset.aiRun] });
    toast("Queued — usually ready within a few minutes. Open this business again to see it.", "ok");
    if (b.isConnected) b.outerHTML = '<span class="hint">AI helper: queued</span>';
  } catch (err) { toast(err.message, "bad"); b.disabled = false; }
});
/** Server wording made plainer for the window. */
const fixWords = (x) => (String(x || "") === "Add a website (none today)" ? "Has no website yet" : String(x || "")).replace(/'/g, "’");
/**
 * The business window. refresh = true redraws it in place after a change (keeps the note being
 * typed, the scroll position and the openers), so the facts, next step and activity stay current.
 */
async function openLead(id, refresh) {
  openLeadId = id;
  if (!refresh) { ldSay(""); $("ldNote").value = ""; savedNext("ldStageSaved", ""); savedNext("ldAssignSaved", ""); }
  if (!team.length) await loadTeam2();
  const d = await api("/api/leads/" + id + "/detail");
  if (openLeadId !== id) return; // another business was opened meanwhile
  const l = d.lead, row = rowsById.get(id) || {};
  const name = bizName(l.business_name);
  $("ldTitle").textContent = name;
  const emails = String(l.emails || "").split(", ").filter(Boolean);
  const address = l.address || row.address || "";
  const maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([l.business_name, address || [l.city, l.state].filter(Boolean).join(" ")].filter(Boolean).join(" "));
  $("ldActions").innerHTML = (l.gbp_phone_formatted ? '<a class="btnlink" href="tel:' + esc(l.gbp_phone_formatted) + '">Call ' + esc(phoneText(l.gbp_phone_formatted)) + "</a>" : "") +
    (emails[0] ? '<a class="btnlink ghost" href="mailto:' + esc(emails[0]) + '">Email</a>' : "") +
    (isWebLink(l.website) ? '<a class="btnlink ghost" href="' + esc(l.website) + '" target="_blank" rel="noopener">Website</a>' : "") +
    '<a class="btnlink ghost" href="' + esc(maps) + '" target="_blank" rel="noopener">Google Maps</a>';
  openLeadData = l;
  // Free data has no Google rating: one small button adds it (owner / admins: it costs about half a cent).
  const src = l.data_source != null ? l.data_source : row.data_source, gm = l.google_match !== undefined ? l.google_match : row.google_match;
  const gExtra = (src === "free" || src === "upload") && canSpend()
    ? (gm == null ? '<button type="button" class="ghost small" data-gdetail="' + esc(id) + '" title="Adds their star rating, reviews and verified from Google Maps">Add Google rating · about 1¢</button>'
      : gm === "queued" ? '<span class="hint">Looking it up on Google…</span>' : "")
    : "";
  // The AI helper: read their website on request (free), when it hasn't yet.
  const aiExtra = isWebLink(l.website) && !l.ai_status && features.aiHelper
    ? '<button type="button" class="ghost small" data-ai-run="' + esc(id) + '" title="The free AI helper reads their website: what they do, their services, the owner’s name and an opener">Read their website with AI (free)</button>' : "";
  if (gExtra || aiExtra) $("ldActions").insertAdjacentHTML("beforeend", '<span class="ldextra">' + gExtra + " " + aiExtra + "</span>");
  // Facts as HTML: every email and phone is a link.
  const tel = (p) => '<a href="tel:' + esc(p) + '">' + esc(phoneText(p)) + "</a>";
  const facts = [esc([l.gbp_category, l.city, l.state].filter(Boolean).join(" · ")),
    address ? '<span class="addr">' + esc(address) + "</span>" : "",
    l.owner_name ? esc("Owner: " + l.owner_name + (l.owner_title ? " (" + l.owner_title + ")" : "") + (l.owner_source === "registry" ? " · from the state business records" : l.owner_source === "ai" ? " · found on their website" : " · from their website")) + (l.owner_source === "ai" ? AI_BADGE : "") : "",
    l.registry_name ? esc("Registered as: " + l.registry_name) : "",
    emails.length ? "Email: " + emails.map((e) => '<a href="mailto:' + esc(e) + '">' + esc(e) + "</a>").join(", ") : "",
    l.gbp_phone_formatted ? "Phone: " + tel(l.gbp_phone_formatted) : "",
    l.domain_created ? esc("Website address registered: " + l.domain_created.slice(0, 4)) : ""].filter(Boolean);
  const company = [rangeOf(l.employees_min, l.employees_max) ? rangeOf(l.employees_min, l.employees_max) + " employees" : "",
    revenueOf(l.revenue_min, l.revenue_max) ? revenueOf(l.revenue_min, l.revenue_max) + " revenue" : "", l.founded ? "founded " + l.founded.slice(0, 4) : ""].filter(Boolean);
  if (company.length) facts.push(esc("Company: " + company.join(" · ") + (l.size_source === "ppp" ? " (from their government loan record" + (l.size_year ? ", " + l.size_year : "") + "; revenue is an estimate)" : l.size_source === "estimate" ? " (estimated)" : "")));
  if ((l.local_labels || []).length) facts.push(esc("Compared with similar businesses nearby: " + l.local_labels.join(", ")));
  if ((d.contacts || []).length) facts.push(esc("Contacts: " + d.contacts.map((p) => p.name + (p.title ? " (" + p.title + ")" : "")).join("; ")));
  if ((d.phones || []).length) facts.push("Other phones: " + d.phones.map((p) => tel(p.phone)).join(", "));
  if (l.report_views) facts.push(esc("Report opened " + l.report_views + (l.report_views === 1 ? " time" : " times") + ", last " + ago(l.report_viewed_at)));
  // Score, what to fix and a suggested next step, in plain words.
  let sn = {}; try { sn = JSON.parse(l.score_notes || "{}"); } catch (e) { sn = {}; }
  const fixes = (sn.suggestions || []).slice(0, 5).map(fixWords);
  const v = l.presence_score;
  const noSite = !isWebLink(l.website);
  const scoreLine = v == null ? "Not scored yet (it’s scored once the website is checked)."
    : Number(v) === 0 && noSite ? "No website, so there’s nothing online to score yet: a website is the first thing you can offer."
    : v + " out of 100 · " + (v < 40 ? "weak online presence: lots you can help with" : v < 60 ? "basic: some things to fix" : "already strong online");
  const first = l.owner_name ? l.owner_name.split(" ")[0] : "them";
  const mention = !fixes.length ? "" : fixes[0] === "Has no website yet" ? " and offer them a website (they don’t have one)"
    : " and mention: " + fixes[0].charAt(0).toLowerCase() + fixes[0].slice(1);
  const next = !l.lead_status || l.lead_status === "Untouched"
    ? (l.gbp_phone_formatted ? "Call " + first + mention + ". Then set the stage to Contacted."
      : emails.length ? "Email " + first + mention + " (the openers below help). Then set the stage to Contacted."
      : "No phone or email yet. Look them up on Google Maps (button above) for a phone number or website, then add a note with what you found.")
    : l.lead_status === "Contacted" ? "No reply yet? Share the report (you’ll be told when they open it) and set the stage to Follow-up."
    : l.lead_status === "Follow-up" ? "Follow up by phone or text. Add a note with what they said."
    : l.lead_status === "Interested" ? "Send the demo website and book a call. Add a note with the date."
    : "";
  // What the AI helper found on their website (marked, to double-check).
  const services = String(l.ai_services || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12);
  const aiBox = l.ai_summary || services.length
    ? '<div class="ldbox"><b>What they do' + AI_BADGE + "</b>" + esc(l.ai_summary || "") +
      (services.length ? '<div class="aitags">' + services.map((x) => '<span class="pill">' + esc(x) + "</span>").join("") + "</div>" : "") + "</div>"
    : l.ai_status === "nothing" ? '<div class="ldbox"><b>What they do</b><span class="muted">The AI helper read their website but found nothing more to add.</span></div>'
    : l.ai_status === "later" ? '<div class="ldbox"><b>What they do</b><span class="muted">The AI helper couldn’t reach their website just now. It tries again tomorrow.</span></div>'
    : l.ai_status === "failed" ? '<div class="ldbox"><b>What they do</b><span class="muted">The AI helper couldn’t read their website.</span></div>' : "";
  $("ldFacts").innerHTML = '<div class="ldsum">' +
    '<div class="ldbox"><b>Online score</b>' + esc(scoreLine) + (fixes.length ? "<ul>" + fixes.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") + "</div>" +
    (next ? '<div class="ldbox ldnext"><b>Suggested next step</b>' + esc(next) + "</div>" : "") + aiBox +
    '<div class="ldbox"><b>About them</b>' + facts.join("<br>") + "</div></div>";
  if (!refresh) { $("ldOpen").open = false; $("ldOpeners").dataset.for = ""; $("ldOpeners").innerHTML = '<div class="hint">Loading…</div>'; $("ldEvents").innerHTML = '<div class="hint">Loading…</div>'; }
  api("/api/leads/" + id + "/events").then((ev) => {
    if (openLeadId !== id) return;
    $("ldEvents").innerHTML = ev.length ? ev.map((e) => '<div class="tl">' + icon(EV_ICON[e.kind] || "dot") + " " + esc(e.detail || e.kind) + '<div class="who">' +
      esc(e.who || (/_viewed$|^form$/.test(e.kind) ? "The business" : "Someone")) + " · " + esc(ago(e.created_at)) + "</div></div>").join("") : '<div class="hint">Nothing yet.</div>';
  }).catch((err) => { $("ldEvents").innerHTML = '<div class="err">' + esc(err.message) + "</div>"; });
  $("ldStage").innerHTML = d.stages.map((s) => '<option value="' + esc(s) + '"' + (s === (l.lead_status || "Untouched") ? " selected" : "") + ">" + esc(s) + "</option>").join("");
  $("ldAssign").innerHTML = teamOptions(l.assigned_to === (me && me.id) ? "me" : l.assigned_to);
  if (me && l.assigned_to === me.id) $("ldAssign").value = "me"; else $("ldAssign").value = l.assigned_to || "";
  // What's saved now: a change that fails goes back to this.
  $("ldStage").dataset.prev = $("ldStage").value; $("ldAssign").dataset.prev = $("ldAssign").value;
  openNotes = d.notes;
  $("ldNotes").innerHTML = d.notes.length ? d.notes.map((n) => '<div class="lnote"><div class="who">' + esc(n.author || "Someone") + " · " + esc(ago(n.created_at)) +
    ((me && (n.user_id === me.id || me.role !== "member")) ? ' · <button type="button" class="link small" data-del-note="' + esc(n.id) + '">delete</button>' : "") + "</div>" + esc(n.body) + "</div>").join("")
    : '<div class="hint">No notes yet.</div>';
  if ($("leadDialog").hidden) { $("leadDialog").hidden = false; $("leadDialog").querySelector(".modal").scrollTop = 0; }
}
/** "Saved ✓" next to the field that changed, for a few seconds (red, and longer, when it wasn't saved). */
function savedNext(id, text, bad, tip) {
  const el = $(id); clearTimeout(el.timer);
  el.textContent = text == null ? "Saved ✓" : text; el.classList.toggle("err", !!bad); el.title = tip || "";
  if (el.textContent) el.timer = setTimeout(() => { el.textContent = ""; el.classList.remove("err"); el.title = ""; }, bad ? 10000 : 3000);
}
/** The message line in the business window (one message at a time; "" clears it). */
function ldSay(text, bad) { $("ldMsg").className = bad ? "hint err" : "hint"; $("ldMsg").textContent = text || ""; }
/** Stage or assignment: saved straight away; when that fails the field goes back to what's saved and says so. */
async function saveLead(changes, savedId, sel) {
  const id = openLeadId;
  ldSay(""); savedNext(savedId, "Saving…");
  sel.disabled = true;
  try {
    await patchJson("/api/leads/" + id, changes);
    sel.dataset.prev = sel.value;
    savedNext(savedId);
    loadLeads();
    if (currentTab === "pipeline") loadPipeline();
    if (openLeadId === id && !$("leadDialog").hidden) openLead(id, true).catch(() => {});
  } catch (err) {
    if (sel.dataset.prev != null) sel.value = sel.dataset.prev;
    savedNext(savedId, "Not saved – try again", true, err.message);
  } finally { sel.disabled = false; }
}
$("ldStage").onchange = () => saveLead({ status: $("ldStage").value }, "ldStageSaved", $("ldStage"));
$("ldReport").onclick = async () => {
  const id = openLeadId;
  ldSay("");
  try {
    const r = await postJson("/api/leads/" + id + "/report", {});
    showCopy("Report link", r.url, "Anyone with this link can open the report. Send it by email or text.", false, r.url);
    if (openLeadId === id) openLead(id, true).catch(() => {});
  } catch (err) { ldSay(err.message, true); }
};
$("ldDnc").onclick = async () => {
  const id = openLeadId, name = $("ldTitle").textContent;
  if (!(await ask("Put " + name + " on the do-not-contact list?", "It will be hidden from every list and download, and so will its phone, website and emails.", "Do not contact", { danger: true }))) return;
  ldSay("");
  try {
    const r = await postJson("/api/leads/" + id + "/dnc", { reason: $("ldDncReason").value });
    $("leadDialog").hidden = true; loadLeads(); if (currentTab === "pipeline") loadPipeline();
    // Undo takes back exactly the entries this added (when the server says which).
    const ids = (r && Array.isArray(r.entryIds)) ? r.entryIds : [];
    toast(name + " is on the do-not-contact list.", "ok", ids.length ? { label: "Undo", run: async () => {
      try { for (const e of ids) await api("/api/dnc/" + encodeURIComponent(e), { method: "DELETE" }); toast(name + " is back in your lists.", "ok"); loadLeads(); if (currentTab === "pipeline") loadPipeline(); }
      catch (err) { toast(err.message, "bad"); }
    } } : null);
  } catch (err) { ldSay(err.message, true); }
};
$("ldAssign").onchange = () => saveLead({ assignedTo: $("ldAssign").value || null }, "ldAssignSaved", $("ldAssign"));
$("ldAddNote").onclick = async () => {
  if (!$("ldNote").value.trim()) { ldSay("Type the note first.", true); $("ldNote").focus(); return; }
  const id = openLeadId;
  ldSay(""); $("ldAddNote").disabled = true;
  try {
    await postJson("/api/leads/" + id + "/notes", { body: $("ldNote").value });
    $("ldNote").value = "";
    if (openLeadId === id) { await openLead(id, true).catch(() => {}); ldSay("Note added ✓"); }
    loadLeads();
  } catch (err) { ldSay(err.message, true); }
  finally { $("ldAddNote").disabled = false; }
};
// Typing a note clears an old message ("Type the note first.", "Note added ✓").
$("ldNote").addEventListener("input", () => { if ($("ldMsg").textContent) ldSay(""); });
$("ldNotes").onclick = async (e) => {
  const b = e.target.closest("[data-del-note]"); if (!b) return;
  const n = openNotes.find((x) => String(x.id) === b.dataset.delNote);
  const body = n ? String(n.body || "") : "";
  if (!(await ask("Delete this note?", body ? "“" + (body.length > 200 ? body.slice(0, 200) + "…" : body) + "”" : "This note will be deleted.", "Delete", { danger: true }))) return;
  const id = openLeadId;
  ldSay("");
  try { await api("/api/notes/" + b.dataset.delNote, { method: "DELETE" }); } catch (err) { ldSay(err.message, true); return; }
  if (openLeadId === id) { await openLead(id, true).catch(() => {}); ldSay("Note deleted."); }
  loadLeads();
};
$("rows").addEventListener("click", (e) => { const b = e.target.closest("[data-lead]"); if (b) openLead(b.dataset.lead).catch((err) => toast(err.message, "bad")); });
const EV_ICON = { stage: "stage", assigned: "user", note: "note", report_shared: "send", report_viewed: "eye", demo_shared: "globe", demo_viewed: "eye", dnc: "ban", form: "inbox" };
$("ldDemo").onclick = async () => {
  const id = openLeadId;
  // The window opens now, while the click still counts (pop-up blockers allow that), and shows the demo when it's ready.
  const w = window.open("about:blank", "_blank");
  if (w) { try { w.opener = null; w.document.title = "Making the demo website…"; w.document.body.textContent = "Making the demo website…"; } catch (e) { /* fine */ } }
  ldSay("");
  try {
    const r = await postJson("/api/leads/" + id + "/demo", {});
    if (w && !w.closed) w.location.href = r.url;
    let copied = false;
    try { await navigator.clipboard.writeText(r.url); copied = true; } catch (e) { copied = false; }
    ldSay((w ? "Opened in a new tab. " : "") + (copied ? "Link copied: anyone with it can open it." : ""));
    if (!w) showCopy("Demo website link", r.url, "Your browser blocked the new tab. Copy the link, or open it from here.", false, r.url);
    if (openLeadId === id) openLead(id, true).catch(() => {});
  } catch (err) { if (w && !w.closed) w.close(); ldSay(err.message, true); }
};
$("ldOpen").addEventListener("toggle", async () => {
  const id = openLeadId;
  if (!$("ldOpen").open || $("ldOpeners").dataset.for === id) return;
  try {
    const o = await api("/api/leads/" + id + "/opener");
    if (id !== openLeadId) return;
    $("ldOpeners").dataset.for = id;
    const block = (title, text) => '<div class="opener"><div class="h"><span>' + esc(title) + '</span><button type="button" class="ghost small" data-copy>Copy</button></div><pre>' + esc(text) + "</pre></div>";
    const ai = openLeadData && openLeadData.id === id && openLeadData.ai_opener
      ? '<div class="opener"><div class="h"><span>AI-written opener' + AI_BADGE + '</span><button type="button" class="ghost small" data-copy>Copy</button></div><pre>' + esc(openLeadData.ai_opener) + "</pre></div>" : "";
    $("ldOpeners").innerHTML = ai + block("First line (for any email)", o.firstLine) + block("Email subject", o.subject) + block("Email", o.email) +
      block("Text message", o.sms) + block("Call script", o.call) + '<div class="hint" style="margin-top:6px">The wording is set on the Admin page (Openers). Read it over and adjust before you send.</div>';
  } catch (err) { $("ldOpeners").innerHTML = '<div class="err">' + esc(err.message) + "</div>"; }
});
$("ldOpeners").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  const text = b.closest(".opener").querySelector("pre").textContent;
  try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy"; }, 1500); } catch (err) { showCopy("Copy this", text); }
});

// ---------------------------------------------------------------------------
// Map (Leaflet from Cloudflare's CDN, OpenStreetMap tiles), with a drawn-area filter
// ---------------------------------------------------------------------------
let leafletLoading = null, lmap = null, mapLayer = null, areaShape = null, drawLine = null, drawing = false, drawPts = [];
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((ok, fail) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = ok; js.onerror = () => { leafletLoading = null; fail(new Error("The map couldn’t load. Check the internet connection and try again.")); };
    document.head.appendChild(js);
  });
  return leafletLoading;
}
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// The map redraws in the other colours when light / dark is switched.
document.addEventListener("themechange", () => { if (lmap && !$("mapCard").hidden) loadMap().catch(() => {}); });
const dotColor = (v) => v == null ? "#94a3b8" : v < 40 ? "#dc2626" : v < 60 ? "#d97706" : "#16a34a";
async function loadMap() {
  if ($("mapCard").hidden) return;
  await loadLeaflet();
  if (!lmap) {
    lmap = L.map("leadMap", { preferCanvas: true }).setView([27.8, -81.7], 7);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(lmap);
    lmap.on("click", (e) => { if (!drawing) return; drawPts.push([e.latlng.lat, e.latlng.lng]); drawShape(); });
  }
  setTimeout(() => lmap.invalidateSize(), 30);
  $("mapInfo").textContent = "Loading…";
  const r = await api("/api/leads/map?" + filterQuery().toString());
  if (mapLayer) mapLayer.remove();
  mapLayer = L.layerGroup().addTo(lmap);
  const pts = [];
  for (const p of r.points) {
    L.circleMarker([p.lat, p.lng], { radius: 5, color: dotColor(p.s), fillColor: dotColor(p.s), fillOpacity: .8, weight: 1 })
      .bindPopup("<b>" + esc(p.n) + "</b><br>" + esc(p.cat || "") + "<br>Score: " + esc(p.s ?? "–") + " · " + esc(p.st) + '<br><button type="button" class="small" data-lead="' + esc(p.id) + '" style="margin-top:6px">Open</button>')
      .addTo(mapLayer);
    pts.push([p.lat, p.lng]);
  }
  if (areaShape) { areaShape.remove(); areaShape = null; }
  if (view.text.area) areaShape = L.polygon(view.text.area.split(";").map((x) => x.split(",").map(Number)), { color: cssVar("--accent"), weight: 2, fillOpacity: .05 }).addTo(lmap);
  if (areaShape) lmap.fitBounds(areaShape.getBounds(), { padding: [20, 20] });
  else if (pts.length) lmap.fitBounds(pts, { padding: [20, 20], maxZoom: 14 });
  $("mapInfo").textContent = r.points.length.toLocaleString() + " on the map" + (r.capped ? " (the 3,000 lowest scores: narrow the filters to see the rest)" : "") +
    (r.withoutPosition ? " · " + r.withoutPosition.toLocaleString() + " have no map position" : "");
  $("mapClear").hidden = !view.text.area;
}
function drawShape() {
  if (drawLine) { drawLine.remove(); drawLine = null; }
  if (drawPts.length) drawLine = L.polygon(drawPts, { color: cssVar("--accent"), weight: 2, fillOpacity: .08, dashArray: "4 4" }).addTo(lmap);
  $("mapUse").hidden = drawPts.length < 3;
}
$("leadMap").addEventListener("click", (e) => { const b = e.target.closest("[data-lead]"); if (b) openLead(b.dataset.lead).catch((err) => toast(err.message, "bad")); });
$("mapBtn").onclick = () => {
  $("mapCard").hidden = !$("mapCard").hidden;
  if (!$("mapCard").hidden) { loadMap().catch((err) => { $("mapInfo").textContent = err.message; }); $("mapCard").scrollIntoView({ behavior: "smooth", block: "start" }); }
};
$("mapClose").onclick = () => { $("mapCard").hidden = true; };
$("mapDraw").onclick = () => {
  drawing = !drawing; drawPts = []; if (lmap) drawShape();
  $("mapDraw").textContent = drawing ? "Cancel drawing" : "Draw an area";
  $("mapInfo").textContent = drawing ? "Click the map to add corners (3 or more), then press Use this area." : "";
};
$("mapUse").onclick = () => {
  view.text.area = drawPts.slice(0, 40).map((x) => x[0].toFixed(5) + "," + x[1].toFixed(5)).join(";");
  drawing = false; drawPts = []; drawShape(); $("mapDraw").textContent = "Draw an area";
  view.page = 1; refreshAll();
};
$("mapClear").onclick = () => { delete view.text.area; view.page = 1; refreshAll(); };

// ---------------------------------------------------------------------------
// Pipeline board
// ---------------------------------------------------------------------------
let dragId = null, pTimer = null;
function kcard(l) {
  const v = l.presence_score;
  return '<div class="kcard" draggable="true" data-kid="' + esc(l.id) + '"><span class="sc" style="color:' + (v == null ? "var(--muted)" : v < 40 ? "var(--bad)" : v < 60 ? "var(--warn)" : "var(--ok)") + '" title="Score">' + esc(v ?? "–") + "</span><b>" +
    esc(bizName(l.business_name)) + '</b><div class="sub">' + esc([l.gbp_category, l.city].filter(Boolean).join(" · ")).replace(/[/]/g, "/<wbr>") + "</div>" +
    (l.gbp_phone_formatted ? '<div class="sub"><a href="tel:' + esc(l.gbp_phone_formatted) + '">' + esc(phoneText(l.gbp_phone_formatted)) + "</a></div>" : "") +
    (l.assigned_name ? '<div class="sub">→ ' + esc(l.assigned_name) + "</div>" : "") +
    '<select class="kstage" data-kstage="' + esc(l.id) + '" aria-label="Stage">' + STAGES.map((s) => '<option value="' + esc(s) + '"' + (s === (l.lead_status || "Untouched") ? " selected" : "") + ">" + esc(s) + "</option>").join("") + "</select></div>";
}
/** Whose leads: me, everyone, nobody's yet, then each team member (rebuilt when the team changes). */
function pWhoOptions() {
  const cur = $("pWho").value;
  $("pWho").innerHTML = '<option value="me">My leads</option><option value="">Everyone</option><option value="none">Nobody’s yet</option>' +
    team.filter((t) => !me || t.id !== me.id).filter((t) => t.active !== false && t.active !== 0).map((t) => '<option value="' + esc(t.id) + '">' + esc(t.name || "Team member") + "</option>").join("");
  $("pWho").value = [...$("pWho").options].some((o) => o.value === cur) ? cur : "me";
}
let pWhoChosen = false; // the choice on screen came from the person (or memory), not the automatic switch
const touchOnly = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
async function loadPipeline() {
  if (!team.length) await loadTeam2();
  if (!pWhoChosen) { pWhoOptions(); const saved = mem.get("pWho", null); if (saved != null && [...$("pWho").options].some((o) => o.value === saved)) { $("pWho").value = saved; pWhoChosen = true; } }
  $("kanban").innerHTML = STAGES.map((st) => '<div class="kcol" data-stage="' + esc(st) + '"><h3><span>' + esc(st) + '</span><span class="muted" data-count></span></h3><div data-cards><div class="hint">Loading…</div></div></div>').join("");
  // Nothing assigned to me: the owner usually wants everyone's board. Decided first (one small
  // count), so the columns load once.
  let switched = false;
  if (!pWhoChosen && $("pWho").value === "me" && !$("pSearch").value.trim()) {
    const mine = await api("/api/leads?assigned=me&page_size=1").catch(() => null);
    if (mine && !mine.total) { $("pWho").value = ""; switched = true; }
    pWhoChosen = true;
  }
  const who = $("pWho").value, q = $("pSearch").value.trim();
  const totals = {}, failed = [];
  await Promise.all(STAGES.map((st) => loadColumn(st, who, q).then((n) => { totals[st] = n; }).catch(() => { failed.push(st); })));
  const all = Object.values(totals).reduce((a, n) => a + n, 0);
  $("pFail").hidden = !failed.length;
  $("pFail").innerHTML = failed.length ? "Some stages couldn’t load (" + esc(failed.join(", ")) + '). <button type="button" class="link" id="pRetryAll">Try again</button>' : "";
  if ($("pRetryAll")) $("pRetryAll").onclick = () => loadPipeline();
  $("pMsg").innerHTML = failed.length ? ""
    : all ? (switched ? "Nothing is assigned to you, so this shows everyone’s. " : "") + (touchOnly ? "Change a card’s stage with its menu." : "Drag a card, or use its menu, to change its stage.") + " Best prospects (lowest scores) first."
    : who === "me" ? 'Nothing assigned to you yet (Database → Assign). <button type="button" class="link" id="pEveryone">Show everyone’s</button>'
    : q ? "No business with that name here."
    : "Nothing here yet. Businesses appear once they’re assigned or their stage changes (Database → Assign).";
  if ($("pEveryone")) $("pEveryone").onclick = () => { $("pWho").value = ""; pWhoChosen = true; mem.set("pWho", ""); loadPipeline(); };
}
/** One stage column; on a failure the column says so with its own Try again. Resolves to the column's total. */
async function loadColumn(st, who, q) {
  const p = new URLSearchParams({ lead_status: st, page_size: "50", sort: "score", dir: "asc" });
  if (who) p.set("assigned", who);
  if (q) p.set("q", q);
  const col = document.querySelector('.kcol[data-stage="' + st + '"]');
  try {
    const r = await api("/api/leads?" + p.toString());
    col.querySelector("[data-count]").textContent = r.total.toLocaleString();
    col.querySelector("[data-cards]").innerHTML = r.results.length ? r.results.map(kcard).join("") +
      (r.total > r.results.length ? '<button type="button" class="link small" data-stage-more="' + esc(st) + '">+ ' + (r.total - r.results.length).toLocaleString() + " more: see them all</button>" : "") : '<div class="hint">Nothing here.</div>';
    return r.total;
  } catch (err) {
    col.querySelector("[data-count]").textContent = "";
    col.querySelector("[data-cards]").innerHTML = '<div class="err" style="font-size:13px">Couldn’t load this stage.</div><button type="button" class="ghost small" data-col-retry="' + esc(st) + '">Try again</button>';
    throw err;
  }
}
/** Moving a card (drag or menu): one message, the same either way. */
async function moveCard(id, stage) {
  const nameEl = document.querySelector('.kcard[data-kid="' + id + '"] b');
  try {
    await patchJson("/api/leads/" + id, { status: stage });
    toast("Moved " + (nameEl ? nameEl.textContent : "it") + " to " + stage + ".", "ok");
  } catch (err) { toast(err.message, "bad"); }
  loadPipeline();
}
$("kanban").addEventListener("change", (e) => {
  const sel = e.target.closest("[data-kstage]"); if (!sel) return;
  moveCard(sel.dataset.kstage, sel.value);
});
$("kanban").addEventListener("click", (e) => {
  const b = e.target.closest("[data-col-retry]"); if (!b) return;
  e.stopPropagation();
  const st = b.dataset.colRetry;
  b.disabled = true;
  loadColumn(st, $("pWho").value, $("pSearch").value.trim()).then(() => {
    if (!document.querySelector("[data-col-retry]")) { $("pFail").hidden = true; }
  }).catch(() => {});
}, true);
$("kanban").addEventListener("click", (e) => {
  const m = e.target.closest("[data-stage-more]"); if (!m) return;
  e.stopPropagation();
  const who = $("pWho").value;
  // The same businesses as the column: closed or not verified ones too.
  openDatabase(() => { f.leadStatus.set([m.dataset.stageMore]); if (who) f.assigned.set([who]); f.status.set([]); f.verified.set([]); });
}, true);
$("kanban").addEventListener("dragstart", (e) => {
  const c = e.target.closest(".kcard"); if (!c) return;
  dragId = c.dataset.kid; e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move";
});
$("kanban").addEventListener("dragover", (e) => {
  const col = e.target.closest(".kcol"); if (!col || !dragId) return;
  e.preventDefault();
  document.querySelectorAll(".kcol.over").forEach((x) => { if (x !== col) x.classList.remove("over"); });
  col.classList.add("over");
});
$("kanban").addEventListener("dragleave", (e) => { const col = e.target.closest(".kcol"); if (col && !col.contains(e.relatedTarget)) col.classList.remove("over"); });
$("kanban").addEventListener("dragend", () => { dragId = null; document.querySelectorAll(".kcol.over").forEach((x) => x.classList.remove("over")); });
$("kanban").addEventListener("drop", async (e) => {
  const col = e.target.closest(".kcol"); if (!col || !dragId) return;
  e.preventDefault(); col.classList.remove("over");
  const id = dragId; dragId = null;
  const card = document.querySelector('.kcard[data-kid="' + id + '"]');
  if (!card || card.closest(".kcol") === col) return;
  col.querySelector("[data-cards]").prepend(card);
  moveCard(id, col.dataset.stage);
});
$("kanban").addEventListener("click", (e) => { if (e.target.closest("select, a, button")) return; const c = e.target.closest(".kcard"); if (c) openLead(c.dataset.kid).catch((err) => toast(err.message, "bad")); });
$("pWho").onchange = () => { pWhoChosen = true; mem.set("pWho", $("pWho").value); loadPipeline(); };
$("pSearch").oninput = () => { clearTimeout(pTimer); pTimer = setTimeout(loadPipeline, 350); };

// ---------------------------------------------------------------------------
// What to do next: a few plain to-dos (GET /api/next-steps), each with one button that does the whole job
// ---------------------------------------------------------------------------
let nextData = null, nextHidden = false;
const nextDone = new Set(); // steps done here: they go away straight away (the counts refresh every 10 minutes)
async function loadNextSteps() {
  try { nextData = await api("/api/next-steps"); } catch (err) { nextData = null; }
  renderNext();
}
function nextHtml() {
  if (!nextData) return "";
  let steps = (nextData.steps || []).filter((s) => !nextDone.has(s.key));
  if (!steps.some((s) => s.button)) steps = [{ key: "caught_up", text: "You’re all caught up", detail: "Nothing is waiting for you right now.", button: "Find more businesses", action: "find_more" }, ...steps.filter((s) => s.key !== "caught_up")];
  let first = true;
  return steps.map((s) => {
    const btn = s.button ? '<button type="button" class="small' + (first ? "" : " ghost") + '" data-next="' + esc(s.key) + '">' + esc(s.button) + "</button>" : "";
    if (s.button) first = false;
    return '<div class="nextstep' + (s.button ? "" : " info") + '"><div><div class="nt"><span class="ndot" aria-hidden="true"></span>' + esc(s.text) + "</div>" +
      (s.detail ? '<div class="nd">' + esc(s.detail) + "</div>" : "") + "</div>" + btn + "</div>";
  }).join("");
}
function renderNext() {
  const html = nextHtml();
  $("nextList").innerHTML = html; $("ovNext").innerHTML = html;
  $("ovNextCard").hidden = !html;
  syncNext();
}
/** Find leads: only while no search answer or list is showing. Database: always (unless hidden). */
function syncNext() {
  const onFind = currentTab === "find" && $("plan").hidden && $("resultsBody").hidden;
  $("nextCard").hidden = !$("nextList").innerHTML || nextHidden || !(onFind || currentTab === "database");
}
$("nextHide").onclick = () => { nextHidden = true; syncNext(); };
// A search answer or a list appearing (or going) on Find leads shows / hides the card.
["plan", "resultsBody"].forEach((id) => new MutationObserver(syncNext).observe($(id), { attributes: true, attributeFilter: ["hidden"] }));
/** A date N days ago, as the date filters want it (yyyy-mm-dd, this computer's calendar). */
function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const listQs = () => { const q = filterQuery(); q.delete("sort"); q.delete("dir"); return q.toString(); };
const AI_SETUP_HTML = '<p class="uitext">The AI helper reads each business’s website and writes down what they do, their services, the owner’s name and a first line for your email. It’s free.</p>' +
  '<ol class="uitext"><li><b>Get a free key.</b> Go to <a href="https://aistudio.google.com" target="_blank" rel="noopener">aistudio.google.com</a>, sign in with a Google account and press <b>Get API key</b>, then <b>Create API key</b>. Don’t add billing: the free key is enough.</li>' +
  '<li><b>Hand it over.</b> Send the key to your developer and ask them to add it as <b>GEMINI_API_KEY</b>. Once it’s in, this list says so and the helper starts by itself.</li></ol>';
async function runNext(key) {
  const s = ((nextData && nextData.steps) || []).find((x) => x.key === key) || { key, action: key === "caught_up" ? "find_more" : key };
  const d = (nextData && nextData.newDays) || 14, r = (nextData && nextData.recentDays) || 30;
  switch (s.action) {
    case "assign_new":
      // The new, untouched businesses nobody has, then the Assign window for that list.
      openDatabase(() => { f.assigned.set(["none"]); f.leadStatus.set(["Untouched"]); view.text.addedFrom = daysAgo(d); });
      await $("bulkBtn").onclick(null, 50);
      break;
    case "show_mine":
      openDatabase(() => { f.assigned.set(["me"]); f.leadStatus.set(["Untouched"]); });
      nextDone.add(key);
      break;
    case "google_ratings":
      openDatabase(() => { f.dataSource.set(["free"]); view.text.addedFrom = daysAgo(r); });
      if (await requestGoogleDetails({}, listQs())) nextDone.add(key);
      break;
    case "check_sites":
      openDatabase(() => { f.siteCheck.set(["not_checked"]); if (me && me.role === "member") f.assigned.set(["me"]); });
      await $("checkSitesBtn").onclick();
      nextDone.add(key);
      break;
    case "ai_setup":
      await uiForm({ title: "Turn on the free AI helper", html: AI_SETUP_HTML, ok: "Got it", cancel: false });
      break;
    case "ai_enable":
      await api("/api/ai-helper", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true }) });
      toast("The AI helper is on. It reads a batch of websites every few minutes.", "ok");
      nextDone.add(key);
      break;
    default:
      // Find more businesses: the search box on Find leads.
      if (currentTab !== "find") setTab("find");
      window.scrollTo({ top: 0, behavior: "smooth" });
      $("whatInput").focus();
      return;
  }
  renderNext();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-next]"); if (!b) return;
  b.disabled = true;
  runNext(b.dataset.next).catch((err) => toast(err.message, "bad")).finally(() => { if (b.isConnected) b.disabled = false; });
});

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
async function loadOverview() {
  loadNextSteps();
  const o = await api("/api/overview");
  const t = o.totals || {}, n = (v) => Number(v || 0).toLocaleString(), pct = (v) => (t.total ? Math.round((100 * Number(v || 0)) / t.total) + "%" : "–");
  // A tile with a matching Database view opens it.
  const stat = (big, label, go) => go ? '<button type="button" class="stat" data-ov-go="' + esc(go) + '" title="See them in the Database"><b>' + esc(big) + "</b><span>" + esc(label) + "</span></button>"
    : '<div class="stat"><b>' + esc(big) + "</b><span>" + esc(label) + "</span></div>";
  const mob = Number(t.mobiles || 0);
  // Mobiles only mean something once a fair share of the phones has been checked.
  const checkedShare = Number(t.phones) ? Number(t.phones_checked || 0) / Number(t.phones) : 0;
  $("ovStats").innerHTML = [stat(n(t.total), "open, verified businesses (the usual Database view)", "all"), stat("+" + n(t.week), "added in the last 7 days", "week"),
    stat(pct(t.owners), "with an owner’s name (" + n(t.owners) + ")", "owner"), stat(pct(t.emails), "with an email (" + n(t.emails) + ")", "email"),
    stat(n(t.verified), "with a verified email", "verified"), stat(pct(t.phones), "with a phone" + (checkedShare > 0.05 ? " (" + n(mob) + (mob === 1 ? " mobile)" : " mobiles)") : ""), "phone"),
    stat(pct(t.websites), "with a website", "website"), stat(n(t.weak), "weak online presence (score under 40)", "weak"),
    stat(n(t.reports_shared), (Number(t.reports_shared) === 1 ? "report shared · " : "reports shared · ") + n(t.reports_opened) + " opened"), stat(n(t.demos_shared), Number(t.demos_shared) === 1 ? "demo website made" : "demo websites made"),
    stat(n(t.assigned), "assigned to someone")].join("");
  const stageN = Object.fromEntries(o.stages.map((x) => [x.stage, x.n])), max = Math.max(1, ...o.stages.map((x) => x.n));
  $("ovStages").innerHTML = STAGES.map((st) => { const v = stageN[st] || 0;
    return '<div class="hbar"><button type="button" class="link" data-ov-stage="' + esc(st) + '">' + esc(st) + '</button><i' + (v ? ' style="width:' + Math.max(2, Math.round((100 * v) / max)) + '%"' : ' class="zero"') + '></i><span class="muted">' + n(v) + "</span></div>"; }).join("");
  const gmax = Math.max(1, ...o.growth.map((g) => g.n));
  $("ovGrowth").innerHTML = o.growth.map((g) => '<div title="' + esc(fmtDay(g.day) + ": " + g.n.toLocaleString()) + '" style="height:' + Math.round((100 * g.n) / gmax) + '%"></div>').join("");
  $("ovGrowthHint").textContent = fmtDay(o.growth[0].day) + " to " + fmtDay(o.growth[o.growth.length - 1].day) + " · " + n(o.growth.reduce((a, g) => a + g.n, 0)) + " added";
  $("ovReps").innerHTML = o.reps.map((r) => "<tr><td><b>" + esc(r.name) + '</b></td><td data-label="Assigned">' + n(r.total) + '</td><td data-label="Untouched">' + n(r.untouched) +
    '</td><td data-label="Contacted / follow-up">' + n(r.working) + '</td><td data-label="Interested">' + n(r.interested) + '</td><td data-label="Won">' + n(r.won) + "</td></tr>").join("") ||
    '<tr><td colspan="6" class="muted">Nobody on the team yet.</td></tr>';
  $("ovHot").innerHTML = o.hot.length ? o.hot.map((h) => '<div class="tl"><button type="button" class="link" data-lead="' + esc(h.id) + '">' + esc(bizName(h.business_name)) + '</button> <span class="muted">' +
    esc([[h.city, h.state].filter(Boolean).join(", "), h.lead_status || "Untouched", h.rep].filter(Boolean).join(" · ")) + '</span><div class="who">Opened ' + esc(ago(h.report_viewed_at)) + " · " +
    n(h.report_views) + (h.report_views === 1 ? " view" : " views") + "</div></div>").join("")
    : '<div class="hint">No report opened yet. Share one from a business’s pop-up; you’re told when they open it.</div>';
}
$("ovStages").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ov-stage]"); if (!b) return;
  // The same businesses as the bar: closed or not verified ones too.
  openDatabase(() => { f.leadStatus.set([b.dataset.ovStage]); f.status.set([]); f.verified.set([]); });
});
$("ovHot").addEventListener("click", (e) => { const b = e.target.closest("[data-lead]"); if (b) openLead(b.dataset.lead).catch((err) => toast(err.message, "bad")); });
$("ovStats").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ov-go]"); if (!b) return;
  const go = b.dataset.ovGo;
  // One load of the Database, already filtered.
  openDatabase(() => {
    if (go === "week") { const d = new Date(Date.now() - 7 * 86400000); view.text.addedFrom = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    else if (go === "owner") f.owner.set(["yes"]);
    else if (go === "email") f.email.set(["yes"]);
    else if (go === "verified") f.emailCheck.set(["ok"]);
    else if (go === "phone") f.phone.set(["yes"]);
    else if (go === "website") f.website.set(["yes"]);
    else if (go === "weak") f.score.set(["weak"]);
  });
});

// ---------------------------------------------------------------------------
// Admin: opener wording, website form
// ---------------------------------------------------------------------------
let opDefaults = null;
function fillOp(t) { $("opSubject").value = t.subject; $("opEmail").value = t.email; $("opSms").value = t.sms; $("opCall").value = t.call; }
async function loadOpenersAdmin() {
  const r = await api("/api/openers/templates").catch((err) => cardFail("openersCard", err, loadOpenersAdmin)); if (!r) return;
  opDefaults = r.defaults;
  $("opFields").textContent = r.fields.map((x) => "{" + x + "}").join(" ");
  fillOp(r.templates);
}
/** A short message next to a Save button: red when something's wrong; a success message clears itself. */
function say(id, text, bad) {
  const el = $(id); if (!el) return;
  el.className = bad ? "hint err" : "hint"; el.textContent = text || "";
  clearTimeout(el.clearTimer);
  if (text && !bad && !/…$/.test(text)) el.clearTimer = setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 8000);
}
async function saveOpeners(note) {
  say("opMsg", "Saving…");
  try {
    await api("/api/openers/templates", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject: $("opSubject").value, email: $("opEmail").value, sms: $("opSms").value, call: $("opCall").value }) });
    say("opMsg", note || "Saved.");
  } catch (err) { say("opMsg", err.message, true); }
}
$("opSave").onclick = () => saveOpeners();
// Both "Back to the defaults" buttons work the same way: ask, fill in the defaults, save.
$("opReset").onclick = async () => {
  if (!opDefaults || !(await ask("Back to the default wording?", "The email, text and call wording go back to the defaults and are saved. Your changes are lost.", "Use the defaults"))) return;
  fillOp(opDefaults); saveOpeners("Back to the default wording. Saved.");
};
// Admin: extra columns in the GoHighLevel download (name as in GoHighLevel, and what fills it).
let ghlSources = [], ghlDefaults = [];
function ghlColRow(c) {
  return '<div class="line ghlcol" style="flex-wrap:wrap"><input type="text" class="gcName" maxlength="60" placeholder="GoHighLevel column name" aria-label="GoHighLevel column name" value="' + esc(c ? c.name : "") + '" style="width:240px;max-width:100%">' +
    ' <span class="muted">filled with</span> <select class="gcSrc" aria-label="Filled with">' +
    ghlSources.map((s) => '<option value="' + esc(s.id) + '"' + (c && c.source === s.id ? " selected" : "") + ">" + esc(s.label) + "</option>").join("") + "</select>" +
    ' <button type="button" class="ghost small danger" data-gc-del>Remove</button></div>';
}
/** No extra columns: a short line instead of an empty list. */
function ghlColsEmpty() {
  const none = !document.querySelector("#ghlColRows .ghlcol");
  const msg = document.querySelector("#ghlColRows .gcempty");
  if (none && !msg) $("ghlColRows").insertAdjacentHTML("afterbegin", '<div class="gcempty muted">No extra columns: the download has only the standard columns.</div>');
  if (!none && msg) msg.remove();
}
function fillGhlCols(cols) { $("ghlColRows").innerHTML = cols.map(ghlColRow).join(""); ghlColsEmpty(); }
async function loadGhlCols() {
  const r = await api("/api/ghl-columns").catch((err) => cardFail("ghlColsCard", err, loadGhlCols)); if (!r) return;
  ghlSources = r.sources; ghlDefaults = r.defaults;
  fillGhlCols(r.columns);
}
$("ghlColRows").addEventListener("click", (e) => { const b = e.target.closest("[data-gc-del]"); if (b) { b.closest(".ghlcol").remove(); ghlColsEmpty(); } });
$("ghlColRows").addEventListener("input", () => { if ($("ghlColMsg").classList.contains("err")) say("ghlColMsg", ""); });
$("ghlColAdd").onclick = () => {
  if (document.querySelectorAll("#ghlColRows .ghlcol").length >= 30) return toast("Up to 30 columns.", "bad");
  $("ghlColRows").insertAdjacentHTML("beforeend", ghlColRow(null)); ghlColsEmpty();
  const rows = document.querySelectorAll("#ghlColRows .ghlcol"); rows[rows.length - 1].querySelector(".gcName").focus();
};
async function saveGhlCols(cols, note) {
  say("ghlColMsg", "Saving…");
  try {
    const r = await api("/api/ghl-columns", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ columns: cols }) });
    fillGhlCols(r.columns);
    say("ghlColMsg", note || "Saved. Your next GoHighLevel download has these columns.");
  } catch (err) { say("ghlColMsg", err.message, true); }
}
$("ghlColSave").onclick = () => saveGhlCols([...document.querySelectorAll("#ghlColRows .ghlcol")].map((r) => ({ name: r.querySelector(".gcName").value.trim(), source: r.querySelector(".gcSrc").value })));
$("ghlColReset").onclick = async () => {
  if (!ghlDefaults.length || !(await ask("Back to the starter set?", "The columns go back to the starter set and are saved. Your changes are lost.", "Use the starter set"))) return;
  saveGhlCols(ghlDefaults, "Back to the starter set. Saved.");
};
async function loadFormAdmin() {
  const r = await api("/api/form").catch(() => null);
  $("formCard").hidden = !r; if (!r) return;
  $("formLink").href = r.url; $("formLink").textContent = r.url; $("formEmbed").value = r.embed;
}
$("formCopy").onclick = async () => { try { await navigator.clipboard.writeText($("formEmbed").value); say("formMsg", "Copied."); } catch (e) { $("formEmbed").select(); say("formMsg", "Press Ctrl+C to copy."); } };
$("formNew").onclick = async () => {
  if (!(await ask("Make a new form link?", "The form on your website stops working until you paste the new code there.", "Make a new link", { danger: true }))) return;
  try { await postJson("/api/form/new-link", {}); await loadFormAdmin(); say("formMsg", "New link made. Update your website with the new code."); } catch (err) { say("formMsg", err.message, true); }
};

// Admin: online store (settings, customers, credits).
let storeAccounts = [];
const STORE_STATUS = { pending: ["warn", "Waiting for approval"], active: ["ok", "Active"], suspended: ["bad", "Paused"] };
async function loadStoreAdmin() {
  const s = await api("/api/store/settings").catch(() => null);
  $("storeCard").hidden = !s; if (!s) return;
  $("stPriceFree").value = s.priceFree; $("stPriceGoogle").value = s.priceGoogle; $("stWelcome").value = s.welcomeCredits;
  $("stBrand").value = s.brandName; $("stColor").value = s.brandColor; $("stSupport").value = s.supportEmail;
  $("stUrl").value = s.storeUrl; $("stLogo").value = s.logoUrl || ""; $("stSignup").checked = !!s.signupOpen;
  $("stSignupMode").value = s.signupMode === "approval" ? "approval" : "open"; $("stFreeMonth").value = s.freePerMonth; $("stPublic").checked = !!s.publicPages;
  $("stCreditPrice").value = s.creditPrice == null ? "" : String(s.creditPrice);
  $("stOpen").hidden = !isWebLink(s.storeUrl); if (isWebLink(s.storeUrl)) $("stOpen").href = s.storeUrl;
  await Promise.all([loadStoreCustomers(), loadStoreRemovals().catch(() => {}), loadLaunch().catch((err) => cardFail("storeCard", err, loadStoreAdmin))]);
}
// Getting the store ready to sell: the checklist, credit packs, the email sender, card sales.
function packRow(p) {
  return '<div class="line packrow"><label class="muted"><input type="number" class="pkC" min="1" step="1" value="' + esc(p ? p.credits : "") + '" style="width:100px" aria-label="Credits"> credits for $ ' +
    '<input type="number" class="pkP" min="0.5" step="0.01" value="' + esc(p ? p.price : "") + '" style="width:100px" aria-label="Price in dollars"></label> <span class="hint pkEach"></span>' +
    ' <button type="button" class="ghost small danger" data-pack-del>Remove</button></div>';
}
/** No packs: a short line instead of an empty row. */
function packsEmpty() {
  const none = !document.querySelector("#packRows .packrow");
  const msg = document.querySelector("#packRows .pkempty");
  if (none && !msg) $("packRows").insertAdjacentHTML("afterbegin", '<div class="pkempty">No packs yet. Add one, e.g. 100 credits for $50.</div>');
  if (!none && msg) msg.remove();
}
/** The launch checklist comes from the server: drop the developer file references and use US spelling here. */
const plainLaunch = (s) => String(s || "").replace(/ *[(]docs[/][^)]*[)]/g, "").replace(/colour/g, "color").replace(/ +[.]/g, ".").replace(/"([^"]*)"/g, "“$1”").replace(/'/g, "’");
function packEach() {
  document.querySelectorAll("#packRows .packrow").forEach((r) => {
    const c = Number(r.querySelector(".pkC").value), p = Number(r.querySelector(".pkP").value);
    r.querySelector(".pkEach").textContent = c > 0 && p > 0 ? "= " + money(p / c) + " per credit" : "";
  });
}
async function loadLaunch() {
  const d = await api("/api/store/launch");
  const done = d.items.filter((i) => i.done && i.required).length, need = d.items.filter((i) => i.required).length;
  $("launchSummary").className = "pill " + (d.ready ? "ok" : "warn");
  $("launchSummary").textContent = d.ready ? "Ready to launch ✓" : done + " of " + need + " done";
  $("launchList").innerHTML = d.items.map((i) => '<li class="' + (i.done ? "done" : "") + '"><span class="ck">' + (i.done ? "✓" : "") + "</span><div><b>" + esc(plainLaunch(i.label)) + "</b>" +
    (i.required ? "" : ' <span class="muted">(optional)</span>') + (i.done ? "" : '<div class="hint">' + esc(plainLaunch(i.how)) + "</div>") + "</div></li>").join("");
  $("launchNote").textContent = "Card payments, emails and the spam check show as done once your developer has connected them and someone opens the store" +
    (d.features.checkedAt ? " (last checked " + ago(d.features.checkedAt.replace("T", " ").slice(0, 19)) + ")." : ".");
  $("packRows").innerHTML = d.settings.packs.map(packRow).join("");
  packsEmpty(); packEach();
  if (document.activeElement !== $("lsFrom")) $("lsFrom").value = d.settings.emailFrom || "";
  $("lsLegal").checked = !!d.settings.legalReviewed; $("lsPaid").checked = !!d.settings.paidPlan;
  const r = d.revenue;
  $("revenueLine").textContent = r.payments ? "Card sales: " + money(r.total) + " in total, " + money(r.last30) + " in the last 30 days (" + num(r.payments) + " payments). Latest: " +
    r.recent.slice(0, 3).map((x) => x.company + " " + money(x.amount)).join(", ") + "." : "No card sales yet.";
}
// Editing a pack clears an old error about it.
$("packRows").addEventListener("input", () => { packEach(); if ($("lsMsg").classList.contains("err")) say("lsMsg", ""); });
$("packRows").addEventListener("click", (e) => { const b = e.target.closest("[data-pack-del]"); if (b) { b.closest(".packrow").remove(); packsEmpty(); packEach(); if ($("lsMsg").classList.contains("err")) say("lsMsg", ""); } });
$("packAdd").onclick = () => {
  if (document.querySelectorAll("#packRows .packrow").length >= 6) return toast("Up to 6 packs.", "bad");
  $("packRows").insertAdjacentHTML("beforeend", packRow(null)); packsEmpty();
  const rows = document.querySelectorAll("#packRows .packrow"); rows[rows.length - 1].querySelector(".pkC").focus();
};
$("lsSave").onclick = async () => {
  const packs = [...document.querySelectorAll("#packRows .packrow")].map((r) => ({ credits: r.querySelector(".pkC").value.trim(), price: r.querySelector(".pkP").value.trim() }))
    .filter((p) => p.credits || p.price).map((p) => ({ credits: Number(p.credits), price: Number(p.price) }));
  say("lsMsg", "Saving…");
  try {
    await api("/api/store/launch", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ packs, emailFrom: $("lsFrom").value }) });
    say("lsMsg", "Saved."); loadLaunch().catch(() => {});
  } catch (err) { say("lsMsg", err.message, true); }
};
// The two checklist ticks you set yourself (lawyer, paid plan) save on their own.
$("lsTicksSave").onclick = async () => {
  say("lsTicksMsg", "Saving…");
  try {
    await api("/api/store/launch", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ legalReviewed: $("lsLegal").checked, paidPlan: $("lsPaid").checked }) });
    say("lsTicksMsg", "Saved."); loadLaunch().catch(() => {});
  } catch (err) { say("lsTicksMsg", err.message, true); }
};
let storeRemovals = [];
const REMOVAL_STATUS = { new: ["warn", "New"], done: ["ok", "Removed"], dismissed: ["", "Dismissed"] };
async function loadStoreRemovals() {
  const list = await api("/api/store/removals");
  storeRemovals = list;
  const fresh = list.filter((r) => r.status === "new").length;
  for (const id of ["stRemBadge", "stRemCount", "navStoreBadge"]) { $(id).hidden = !fresh; $(id).textContent = num(fresh) + " new removal request" + (fresh === 1 ? "" : "s"); }
  $("stRemRows").innerHTML = list.length ? list.map((r) => {
    const [cls, label] = REMOVAL_STATUS[r.status] || ["", r.status];
    const contact = [r.phone, r.website, r.email].filter(Boolean).map((v) => esc(v)).join("<br>") || '<span class="muted">none given</span>';
    const from = [r.name, r.contactEmail].filter(Boolean).map((v) => esc(v)).join("<br>") || '<span class="muted">not given</span>';
    const acts = r.status === "new" ? '<button type="button" class="ghost small danger" data-rm="suppress">Remove from everything</button> <button type="button" class="ghost small" data-rm="dismiss">Dismiss</button>' : "";
    return '<tr data-rem="' + esc(r.id) + '"><td class="nowrap">' + esc(ago(r.createdAt)) + "</td><td>" + esc(r.business) + "</td><td>" + contact + "</td><td>" + from +
      "</td><td>" + (r.message ? esc(r.message) : '<span class="muted">none</span>') + '</td><td><span class="pill ' + esc(cls) + '">' + esc(label) + '</span></td><td class="nowrap">' + acts + "</td></tr>";
  }).join("") : '<tr><td colspan="7" class="muted">No removal requests. When a business owner asks to be taken out on your public website, it shows up here.</td></tr>';
}
$("stRemRows").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-rm]"), row = e.target.closest("[data-rem]");
  if (!b || !row) return;
  const r = storeRemovals.find((x) => String(x.id) === row.dataset.rem); if (!r) return;
  const action = b.dataset.rm;
  if (action === "suppress" && !(await ask("Remove " + r.business + " from everything?", "Their phone, website and email go on your do-not-contact list, so they’re hidden from your lists, downloads and the store.", "Remove from everything", { danger: true }))) return;
  try {
    await postJson("/api/store/removals/" + encodeURIComponent(r.id), { action });
    await loadStoreRemovals();
  } catch (err) { toast(err.message, "bad"); }
});
async function loadStoreCustomers() {
  const [accounts, st] = await Promise.all([api("/api/store/accounts"), api("/api/store/stats").catch(() => null)]);
  storeAccounts = accounts;
  if (st) {
    const week = st.byDay.slice(-7).reduce((a, d) => a + d.leads, 0);
    $("stStats").textContent = num(st.accounts.active) + (st.accounts.active === 1 ? " active customer" : " active customers") + (st.accounts.pending ? " · " + num(st.accounts.pending) + " waiting for approval" : "") +
      (st.accounts.suspended ? " · " + num(st.accounts.suspended) + " paused" : "") + " · " + num(st.leadsSold) + " leads sold (" + num(week) + " in the last 7 days) · " +
      num(st.creditsSpent) + " credits spent · " + num(st.creditsGranted) + " credits given";
  }
  $("stRows").innerHTML = accounts.length ? accounts.map((a) => {
    const [cls, label] = STORE_STATUS[a.status] || ["", a.status];
    const people = a.users.map((u) => esc(u.name || "") + (u.name ? ' <span class="muted">' + esc(u.email) + "</span>" : esc(u.email))).join("<br>");
    const acts = (a.status === "pending" ? '<button type="button" class="small" data-st="approve">Approve</button>' : a.status === "active" ? '<button type="button" class="ghost small danger" data-st="pause">Pause</button>' : '<button type="button" class="ghost small" data-st="reactivate">Reactivate</button>') +
      ' <button type="button" class="ghost small" data-st="credits">Add credits</button>' + (a.users.length ? ' <button type="button" class="ghost small" data-st="password">Reset password</button>' : "");
    return '<tr data-acct="' + esc(a.id) + '"><td>' + esc(a.company) + '<div class="muted small">signed up ' + esc(ago(a.createdAt)) + "</div></td><td>" + (people || '<span class="muted">none</span>') +
      '</td><td><span class="pill ' + esc(cls) + '">' + esc(label) + "</span></td><td>" + esc(num(a.credits)) + "</td><td>" + esc(num(a.freeUsed || 0)) + "</td><td>" + esc(num(a.leadsBought)) + "</td><td>" + esc(num(a.creditsSpent)) +
      "</td><td>" + (a.lastPurchaseAt ? esc(ago(a.lastPurchaseAt)) : '<span class="muted">never</span>') + '</td><td class="nowrap">' + acts + "</td></tr>";
  }).join("") : '<tr><td colspan="9" class="muted">No customers yet. When a company signs up in your store, it appears here for you to approve.</td></tr>';
}
$("stSave").onclick = async () => {
  try {
    await api("/api/store/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
      priceFree: Number($("stPriceFree").value), priceGoogle: Number($("stPriceGoogle").value), welcomeCredits: Number($("stWelcome").value || 0),
      brandName: $("stBrand").value, brandColor: $("stColor").value, supportEmail: $("stSupport").value, storeUrl: $("stUrl").value, logoUrl: $("stLogo").value, signupOpen: $("stSignup").checked,
      signupMode: $("stSignupMode").value, freePerMonth: Number($("stFreeMonth").value || 0), publicPages: $("stPublic").checked,
      creditPrice: $("stCreditPrice").value.trim() === "" ? null : Number($("stCreditPrice").value),
    }) });
    say("stMsg", "Saved.");
    loadStoreAdmin().catch(() => {});
  } catch (err) { say("stMsg", err.message, true); }
};
$("stRows").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-st]"), row = e.target.closest("[data-acct]");
  if (!b || !row) return;
  const a = storeAccounts.find((x) => x.id === row.dataset.acct); if (!a) return;
  const base = "/api/store/accounts/" + encodeURIComponent(a.id);
  try {
    const act = b.dataset.st;
    if (act === "approve" || act === "reactivate") {
      const r = await postJson(base + "/status", { status: "active" });
      toast(r.welcomeGiven ? a.company + " is approved and got " + num(r.welcomeGiven) + " welcome credits." : a.company + " is active.", "ok");
    } else if (act === "pause") {
      if (!(await ask("Pause " + a.company + "?", "They can still sign in and download what they unlocked, but can’t unlock more.", "Pause", { danger: true }))) return;
      await postJson(base + "/status", { status: "suspended" });
    } else if (act === "credits") {
      const v = await uiForm({ title: "Credits for " + a.company, text: "They have " + num(a.credits) + " credits now.", ok: "Save",
        fields: [{ id: "delta", label: "Credits to add (a minus sign takes some away, e.g. -10)", type: "number" },
          { id: "note", label: "Note for the history (optional)", placeholder: "Paid $100 by bank transfer" }],
        validate: (x) => { const d = Number(String(x.delta).replace(/,/g, "")); return Number.isInteger(d) && d !== 0 ? "" : "Type a whole number, like 100 or -10."; } });
      if (!v) return;
      const r = await postJson(base + "/credits", { delta: Number(String(v.delta).replace(/,/g, "")), note: v.note });
      toast(a.company + " now has " + num(r.balance) + " credits.", "ok");
    } else if (act === "password") {
      let email = a.users[0].email;
      if (a.users.length > 1) {
        const v = await uiForm({ title: "Reset whose password?", ok: "Next", fields: [{ id: "who", label: "Person", type: "select", value: a.users[0].email, options: a.users.map((u) => [u.email, (u.name ? u.name + " · " : "") + u.email]) }] });
        if (!v) return;
        email = v.who;
      }
      if (!(await ask("Give " + email + " a new temporary password?", "They’ll be signed out and asked to choose their own password when they sign in.", "Reset password", { danger: true }))) return;
      const r = await postJson(base + "/reset-password", { email });
      await showCopy("Temporary password for " + email, r.password, "Copy it now and send it to them. It isn’t shown again.");
    }
    await loadStoreCustomers();
  } catch (err) { toast(err.message, "bad"); }
});

// The whole filtered list: stage and / or assignment.
// "Hand out 50" (What to do next) passes take: only the newest 50 of the list.
let bulkCount = 0, bulkTake = 0;
const bulkQuery = () => { const q = filterQuery(); if (bulkTake) { q.set("take", String(bulkTake)); q.set("sort", "added"); q.set("dir", "desc"); } else { q.delete("sort"); q.delete("dir"); } return q; };
$("bulkBtn").onclick = async (e, take) => {
  bulkTake = take || 0;
  if (!team.length) await loadTeam2();
  const q = bulkQuery();
  const pv = await postJson("/api/leads/bulk?" + q, { dryRun: true }).catch((err) => { toast(err.message, "bad"); return null; });
  if (!pv) return;
  bulkCount = pv.count;
  const capped = pv.capped && lastListTotal > pv.count;
  $("bkCount").innerHTML = bulkTake ? "Changes <b>the newest " + num(pv.count) + "</b> of the " + num(pv.total != null ? pv.total : lastListTotal) + " in this list. Do more any time." : capped ? "Changes <b>the first " + num(pv.count) + " of " + num(lastListTotal) + "</b> in this list. Do the rest after."
    : "Changes <b>all " + num(pv.count) + "</b> in this list, not just this page.";
  if (pv.count > 200) $("bkCount").innerHTML += " You can undo it straight after.";
  $("bkSave").textContent = "Update " + num(pv.count) + " business" + (pv.count === 1 ? "" : "es");
  $("bkStage").innerHTML = '<option value="">(leave as it is)</option>' + STAGES.map((s) => '<option value="' + esc(s) + '">' + esc(s) + "</option>").join("");
  $("bkAssign").innerHTML = teamOptions(null, true);
  $("bkMsg").textContent = "Pick a stage, a person, or both.";
  $("bkSave").disabled = true;
  $("bulkDialog").hidden = false;
  $("bkStage").focus();
};
// Update stays off until there's something to change.
const bulkReady = () => { const ok = !!$("bkStage").value || $("bkAssign").value !== "__keep"; $("bkSave").disabled = !ok; $("bkMsg").textContent = ok ? "" : "Pick a stage, a person, or both."; };
$("bkStage").onchange = bulkReady; $("bkAssign").onchange = bulkReady;
$("bkSave").onclick = async () => {
  const q = bulkQuery();
  const b = {};
  if ($("bkStage").value) b.status = $("bkStage").value;
  if ($("bkAssign").value !== "__keep") b.assignedTo = $("bkAssign").value || null;
  if (!("status" in b) && !("assignedTo" in b)) { $("bkMsg").textContent = "Pick a stage or a person."; return; }
  if (bulkCount > 200 && !(await uiForm({ title: "Change " + num(bulkCount) + " businesses?", text: "That’s a lot at once. To be sure, type the number.", confirmWord: String(bulkCount), ok: "Update " + num(bulkCount), paid: true }))) return;
  try {
    const r = await postJson("/api/leads/bulk?" + q, b);
    $("bulkDialog").hidden = true; loadLeads();
    toast("Updated " + num(r.updated) + " businesses.", "ok", r.previous && r.previous.length ? { label: "Undo", run: async () => {
      try { const u = await postJson("/api/leads/bulk/undo", { previous: r.previous }); toast("Undone: " + num(u.restored) + " businesses are back as they were.", "ok"); loadLeads(); if (currentTab === "pipeline") loadPipeline(); }
      catch (err) { toast(err.message, "bad"); }
    } } : null);
  }
  catch (err) { $("bkMsg").textContent = err.message; }
};

// Plain-English search: the AI sets the filter chips (and exact review / rating limits).
async function runAiSearch() {
  const text = $("aiText").value.trim();
  if (!text) return;
  $("aiGo").disabled = true; $("aiMsg").className = "hint"; $("aiMsg").textContent = "Reading…";
  try {
    const r = await postJson("/api/ai-search", { text });
    const p = r.params;
    const arr = (k) => (Array.isArray(p[k]) ? p[k] : p[k] ? [p[k]] : []);
    restore({ ...defaultFilters, scope: view.scope, label: view.scopeLabel });
    f.category.set(arr("category")); f.state.set(arr("state")); f.city.set(arr("city"));
    const one = (dd, key) => { if (p[key]) dd.set([p[key]]); };
    one(f.website, "website"); one(f.phone, "phone"); one(f.email, "email"); one(f.owner, "owner"); one(f.chain, "chain");
    f.phoneType.set(arr("phone_type")); f.score.set(arr("score")); f.siteCheck.set(arr("site_check")); f.siteProblem.set(arr("site_problem"));
    f.ads.set(arr("ads")); f.builder.set(arr("builder"));
    const ai = {};
    for (const k of ["min_reviews", "max_reviews", "min_rating", "max_rating"]) if (p[k]) ai[k] = p[k];
    view.text.ai = Object.keys(ai).length ? ai : null;
    if (p.near) { view.text.near = p.near; view.text.radius = p.radius_miles; }
    if (p.added_from) view.text.addedFrom = p.added_from;
    if (p.q) { view.text.q = p.q; $("nameSearch").value = p.q; }
    Object.values(f).forEach((d) => d.renderChip());
    const extra = view.text.ai ? " Also: " + Object.entries(view.text.ai).map(([k, v]) => k.replace("_", " ") + " " + v).join(", ") + '. <button type="button" class="link small" id="aiClearExtra">remove</button>' : "";
    $("aiMsg").innerHTML = "✓ " + esc(r.summary) + extra + (r.notUnderstood ? ' <span class="bad-text">' + esc(r.notUnderstood) + "</span>" : "");
    if ($("aiClearExtra")) $("aiClearExtra").onclick = () => { view.text.ai = null; $("aiMsg").textContent = ""; reload(); };
    reload(); loadSpend();
  } catch (err) { $("aiMsg").className = "hint err"; $("aiMsg").textContent = err.message; }
  finally { $("aiGo").disabled = false; }
}
$("aiGo").onclick = runAiSearch;
$("aiText").onkeydown = (e) => { if (e.key === "Enter") runAiSearch(); };

// Email verification (MillionVerifier) for the best email of each business in the list.
$("verifyBtn").onclick = async () => {
  const q = filterQuery(); q.delete("sort"); q.delete("dir");
  const url = "/api/emails/verify?" + q.toString();
  $("verifyBtn").disabled = true;
  try {
    const pv = await postJson(url, { dryRun: true });
    if (!pv.withEmail) return toast("No business in this list has an email address.");
    if (!pv.toCheck) return toast("All " + num(pv.withEmail) + " emails here are already verified (or being checked). Nothing to pay for.");
    if (pv.credits != null && pv.credits < pv.toCheck && !(await ask("Not enough checks left", "Only " + num(pv.credits) + " email checks are left for " + num(pv.toCheck) + " emails; the rest will wait until the plan is topped up.", "Continue", { paid: true }))) return;
    if (!(await ask("Verify " + num(pv.toCheck) + " email" + (pv.toCheck > 1 ? "s" : "") + "?", "Checks that each address really exists, so your emails don’t bounce." + (pv.alreadyChecked ? " " + num(pv.alreadyChecked) + " already verified are skipped." : "") + " About $0.001-0.0025 each" + (pv.credits != null ? " (" + num(pv.credits) + " checks left on the plan)." : "."), "Verify emails", { paid: true }))) return;
    const r = await postJson(url, {});
    toast(num(r.queued) + " emails are being verified (about 20 a minute). Results show next to each email, and downloads leave out ones that would bounce.", "ok");
    loadLeads();
  } catch (err) { toast(err.message, "bad"); } finally { $("verifyBtn").disabled = false; }
};

// Upload a list (CSV).
$("uploadBtn").onclick = () => { $("upMsg").textContent = ""; $("upFile").value = ""; $("upFileName").textContent = "No file chosen"; $("upPreview").hidden = true; $("upSave").disabled = true; $("upSave").textContent = "Upload"; $("uploadDialog").hidden = false; };
const UP_WORDS = { name: "Business name", website: "Website", phone: "Phone", email: "Email", address: "Address", city: "City", state: "State", zip: "ZIP", category: "Type of business" };
// A sample file to start from: the headings it understands and one example row (made here, nothing is downloaded from elsewhere).
$("upSample").href = "data:text/csv;charset=utf-8," + encodeURIComponent(["Business Name,Website,Phone,Email,Address,City,State,Zip,Category",
  "Joe's Plumbing,https://joesplumbing.com,(407) 555-0123,info@joesplumbing.com,123 Main St,Orlando,FL,32801,Plumber"].join(String.fromCharCode(13, 10)) + String.fromCharCode(13, 10));
$("upFile").onchange = async () => {
  const file = $("upFile").files && $("upFile").files[0];
  $("upFileName").textContent = file ? file.name : "No file chosen";
  $("upPreview").hidden = true; $("upSave").disabled = true; $("upMsg").className = "hint"; $("upMsg").textContent = "";
  if (!file) return;
  if (file.size > 3000000) { $("upMsg").className = "hint err"; $("upMsg").textContent = "That file is too big (up to about 3 MB). Split it into smaller files."; return; }
  $("upMsg").textContent = "Reading the file…";
  try {
    const r = await postJson("/api/uploads", { csv: await file.text(), preview: true });
    const found = Object.keys(UP_WORDS).filter((k) => r.columns[k]);
    const missing = Object.keys(UP_WORDS).filter((k) => !r.columns[k]);
    $("upPreview").innerHTML = "<b>Looks good</b>" + num(r.rows) + " businesses found" + (r.skipped ? " (" + num(r.skipped) + " rows without a business name are skipped)" : "") + ".<br>" +
      "Columns we’ll use: " + found.map((k) => "✓ " + esc(UP_WORDS[k]) + ' <span class="muted">(“' + esc(r.columns[k]) + "”)</span>").join(", ") +
      (missing.length ? '<br><span class="muted">Not in the file: ' + esc(missing.map((k) => UP_WORDS[k]).join(", ")) + "</span>" : "") +
      (r.sample.length ? '<br><span class="muted">First: ' + esc(r.sample.map((x) => [x.name, x.city].filter(Boolean).join(", ")).join(" · ")) + "</span>" : "");
    $("upPreview").hidden = false; $("upSave").disabled = false; $("upMsg").textContent = "";
    $("upSave").textContent = "Add " + num(r.rows) + " businesses";
  } catch (err) { $("upMsg").className = "hint err"; $("upMsg").textContent = err.message; }
};
$("upSave").onclick = async () => {
  const file = $("upFile").files && $("upFile").files[0];
  if (!file) { $("upMsg").className = "hint err"; $("upMsg").textContent = "Choose a CSV file first."; return; }
  $("upMsg").className = "hint";
  if (file.size > 3000000) { $("upMsg").textContent = "That file is too big (up to about 3 MB). Split it into smaller files."; return; }
  $("upSave").disabled = true; $("upMsg").textContent = "Uploading…";
  try {
    const r = await postJson("/api/uploads", { name: $("upName").value || file.name.replace(/\\.[^.]+$/, ""), csv: await file.text() });
    $("uploadDialog").hidden = true;
    toast("Saved " + num(r.rows) + " businesses: " + num(r.added) + " new" + (r.matched ? ", " + num(r.matched) + " you already had" : "") + (r.skipped ? " (" + num(r.skipped) + " rows had no business name)" : "") +
      ". Their websites are checked and scored over the next hours.", "ok");
    await loadPulls();
    useScope([r.searchId], r.name);
  } catch (err) { $("upMsg").className = "hint err"; $("upMsg").textContent = err.message; } finally { $("upSave").disabled = false; }
};

// Every business matching the current filters (all pages, same order as the table), in the GHL upload format.
// Download ▾ has three plain choices; picking one downloads straight away.
async function downloadList(format) {
  const btn = $("downloadBtn"), label = btn.textContent;
  btn.disabled = true; btn.textContent = "Preparing…";
  mem.set("exportFormat", format);
  try {
    const q = filterQuery(); q.set("format", format);
    const res = await fetch("/api/export?" + q);
    if (res.status === 401) { location.href = "/login"; return; }
    if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || "The download failed (" + res.status + ")."); }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (/filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "") || [])[1] || "leads.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast("Downloaded. Businesses on the do-not-contact list and emails that would bounce are left out.", "ok");
  } catch (err) { toast(err.message, "bad"); }
  finally { btn.disabled = false; btn.textContent = label; }
}

// Menus in the results bar (Fill in missing info, Download, ⋯ and Columns): one open at a time.
function menuToggle(btn, menu, onOpen) {
  btn.onclick = (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    document.querySelectorAll(".actmenu").forEach((m) => { m.hidden = true; });
    menu.hidden = !open; btn.setAttribute("aria-expanded", String(open));
    if (open && onOpen) onOpen();
  };
}
menuToggle($("improveBtn"), $("improveMenu"));
$("improveMenu").addEventListener("click", (e) => { if (e.target.closest("button")) { $("improveMenu").hidden = true; $("improveBtn").setAttribute("aria-expanded", "false"); } });
// The last format used goes first in the list.
menuToggle($("downloadBtn"), $("dlMenu"), () => {
  const last = $("dlMenu").querySelector('[data-export="' + mem.get("exportFormat", "ghl") + '"]');
  if (last) $("dlMenu").querySelector(".mhead").after(last);
});
$("dlMenu").addEventListener("click", (e) => {
  const b = e.target.closest("[data-export]"); if (!b) return;
  $("dlMenu").hidden = true; $("downloadBtn").setAttribute("aria-expanded", "false");
  downloadList(b.dataset.export);
});
menuToggle($("toolsBtn"), $("toolsMenu"));
$("toolsMenu").addEventListener("click", (e) => { if (e.target.closest("button") && !e.target.closest("#colsBtn")) { $("toolsMenu").hidden = true; $("toolsBtn").setAttribute("aria-expanded", "false"); } });
document.addEventListener("click", (e) => { if (!e.target.closest(".actmenu")) document.querySelectorAll(".actmenu").forEach((m) => { m.hidden = true; }); });

// Columns: pick which to show (remembered on this computer). Fewer columns = no sideways scrolling.
const COLS = [...document.querySelectorAll("#leadTable thead th")].map((th) => th.textContent.trim());
const USUAL_HIDDEN = ["Phone type", "Reviews", "Position", "Verified", "Status", "Location", "State", "Neighborhood", "Added"];
let hiddenCols = new Set(mem.get("hiddenCols2", USUAL_HIDDEN));
function applyCols() {
  let st = $("colStyle");
  if (!st) { st = document.createElement("style"); st.id = "colStyle"; document.head.appendChild(st); }
  st.textContent = COLS.map((name, i) => hiddenCols.has(name) ? "#resultsCard thead th:nth-child(" + (i + 1) + "), #rows td:nth-child(" + (i + 1) + ") { display: none; }" : "").join(" ");
  if (!$("resultsBody").hidden) fitTable();
}
function renderCols() {
  $("colsMenu").innerHTML = '<div class="mhead">Columns to show (remembered on this computer)</div>' + COLS.map((name) => '<label><input type="checkbox" data-col="' + esc(name) + '"' +
    (hiddenCols.has(name) ? "" : " checked") + (name === "Business" ? " disabled" : "") + "> " + esc(name) + "</label>").join("") +
    '<button type="button" class="link small" data-col-reset style="margin:6px 10px">Back to the usual columns</button>' +
    (autoFolded ? '<div class="hint" style="padding:0 10px 6px">To fit this screen, ' + ["Category", "Category and Rating", "Category, Rating and the website notes"][autoFolded - 1] + (autoFolded === 1 ? " is" : " are") + " folded away. Hide other columns to bring them back.</div>" : "");
}
menuToggle($("colsBtn"), $("colsMenu"), renderCols);
$("colsMenu").addEventListener("change", (e) => {
  const c = e.target.dataset.col; if (!c) return;
  if (e.target.checked) hiddenCols.delete(c); else hiddenCols.add(c);
  mem.set("hiddenCols2", [...hiddenCols]); applyCols();
});
$("colsMenu").addEventListener("click", (e) => {
  if (!e.target.closest("[data-col-reset]")) return;
  hiddenCols = new Set(USUAL_HIDDEN); mem.set("hiddenCols2", [...hiddenCols]); applyCols(); renderCols();
});
applyCols();
// ---------------------------------------------------------------------------
// Searches: light polling (only the searches this page follows) + history
// ---------------------------------------------------------------------------
let polling = null;
const tracked = new Set(); // searches this page follows: started here, or still running when it opened
async function loadPulls() {
  if (!tracked.size) { pulls = []; return pulls; }
  const p = new URLSearchParams({ limit: "200" });
  [...tracked].forEach((id) => p.append("id", id));
  pulls = await api("/api/searches?" + p);
  return pulls;
}
let pollBusy = false, phoneState = null, phonesWatched = false, lastResultsRefresh = 0;
async function pollActive() {
  // Nothing to update while the browser tab is in the background, or while another view (Pipeline, Admin…) is open.
  if (pollBusy || document.hidden || ($("findView").hidden && $("historyView").hidden)) return;
  pollBusy = true;
  try {
    const before = pulls.filter(isRunning).length;
    try { await loadPulls(); } catch (err) { return; } // a failed check: the next one tries again
    renderProgress();
    const running = pulls.filter(isRunning).length;
    const finishedNow = before > running;
    if (phonesWatched) {
      phoneState = await api("/api/phones/status").catch(() => phoneState);
      if (phoneState && (!phoneState.pending || /paused|no_service/.test(phoneState.state))) phonesWatched = false;
    }
    if (!running && !phonesWatched && polling) { clearInterval(polling); polling = null; }
    // The list on screen is refreshed every 30 s while things run, and straight away when something finishes.
    if (!$("findView").hidden && !$("resultsBody").hidden && (finishedNow || !polling || Date.now() - lastResultsRefresh > 30000)) {
      lastResultsRefresh = Date.now();
      if (finishedNow || !polling) await refreshAll(); else await loadLeads();
    }
    if (!$("historyView").hidden && (finishedNow || !polling)) loadHistory().catch(() => {});
  } catch (err) { /* the next check tries again */ }
  finally { pollBusy = false; }
}
function startPolling() { if (!polling) polling = setInterval(() => { pollActive().catch(() => {}); }, 10000); }
document.addEventListener("visibilitychange", () => { if (!document.hidden && polling) pollActive().catch(() => {}); });

/** "Florida" or "fl" -> "FL" (US states by name or code); anything else as typed. */
function stateCode(v) {
  const s = String(v || "").trim(); if (!s) return "";
  const lo = s.toLowerCase();
  const r = geo.regions.find((x) => x.code.toLowerCase() === lo || x.name.toLowerCase() === lo) || (s.length > 2 ? geo.regions.find((x) => x.name.toLowerCase().startsWith(lo)) : null);
  return r ? r.code : s.length <= 3 ? s.toUpperCase() : s;
}
function historyQuery() {
  const p = new URLSearchParams();
  const map = { hCategory: "category", hCity: "city", hState: "state", hStatus: "status", hFrom: "from", hTo: "to" };
  for (const [id, key] of Object.entries(map)) if ($(id).value.trim()) p.set(key, id === "hState" ? stateCode($(id).value) : $(id).value.trim());
  // From / To are days on this computer's clock.
  p.set("tzo", String(new Date().getTimezoneOffset()));
  return p;
}
const historyFiltered = () => ["hCategory", "hCity", "hState", "hStatus", "hFrom", "hTo"].some((id) => $(id).value.trim());
const historySelection = new Set();
let historyRowsData = [], historyLimit = 100;
async function loadHistory() {
  const q = historyQuery(); q.set("limit", String(historyLimit));
  const rows = await api("/api/searches?" + q);
  historyRowsData = rows;
  $("hClear").hidden = !historyFiltered();
  $("historyCount").textContent = rows.length ? num(rows.length) + " search" + (rows.length === 1 ? "" : "es") + " shown" : "";
  $("historyMore").hidden = rows.length < historyLimit;
  $("historyRows").innerHTML = rows.length ? rows.map((s) => {
    const stopped = !!s.cancelled_at && (s.status === "done" || s.status === "stopped" || s.status === "cancelled");
    // Free saving waits for the daily limit: say so, and about how long (the server works out the days).
    const label = stopped ? "Stopped" : s.paused && RUNNING.includes(s.status)
      ? "Waiting – daily free limit" + (s.waitDays > 1 ? " (about " + num(s.waitDays) + " days)" : s.waitDays === 1 ? " (until tomorrow)" : "")
      : PULL_LABELS[s.status] || String(s.status || "").replace(/_/g, " ");
    const cls = s.status === "failed" ? "bad" : stopped || s.paused ? "warn" : s.status === "done" ? "ok" : "warn";
    const biz = s.status === "done" && !s.leads_in_database && !stopped ? '<span class="muted">none on Google here</span>'
      : s.leads_in_database ? num(s.leads_in_database) + (s.new_leads_count != null && s.new_leads_count !== s.leads_in_database ? ' <span class="muted">(' + num(s.new_leads_count) + " new)</span>" : "") : '<span class="muted">—</span>';
    const finished = s.status === "done" || s.status === "failed";
    const spent = (s.cost_apify || 0) + (s.cost_twilio || 0);
    const cost = s.source === "free" ? '<span class="muted">free</span>' : finished ? (spent ? money(spent) : '<span class="muted">no charge</span>') : s.estimated_cost != null ? "~" + money(s.estimated_cost) : "";
    const test = (s.apify_actor_id === "dataforseo-test" && me && me.role !== "member" ? ' <span class="pill">test</span>' : "") + (s.source === "free" ? ' <span class="pill free">free data</span>' : s.source === "google_details" ? ' <span class="pill">paid lookup</span>' : "");
    const note = s.paused ? "" : s.error || ""; // waiting for the daily free limit: the status says it
    return '<tr><td class="hpick"><input type="checkbox" aria-label="Pick this search" data-pick="' + esc(s.id) + '"' + (historySelection.has(s.id) ? " checked" : "") + "></td>" +
      '<td class="nowrap hwhen">' + esc(fmtTime(s.created_at)) + '</td><td class="hwhat"><b>' + esc(s.category) + "</b>" + test + '</td><td data-label="Where">' + esc(placeLabel(s)) + "</td>" +
      '<td data-label="Status"><span class="pill ' + cls + '">' + esc(label) + '</span></td><td data-label="Businesses">' + biz + '</td><td data-label="Cost">' + cost + "</td>" +
      // Nothing saved (and nothing coming): no list to open.
      '<td class="acts">' + (s.leads_in_database || RUNNING.includes(s.status) ? '<button class="ghost small" type="button" data-view="' + esc(s.id) + '">Open list</button>' : "") +
      (s.status === "failed" && s.apify_run_id ? ' <button class="ghost small" type="button" data-resume="' + esc(s.id) + '" title="Carries on saving what was collected. Does not pay again.">Resume</button>' : "") +
      ((s.status === "pending" || s.status === "scraping") && !s.cancelled_at ? ' <button class="ghost small danger" type="button" data-cancel="' + esc(s.id) + '" title="Stops collecting. What it already collected is kept.">Stop</button>' : "") + "</td></tr>" +
      (note ? '<tr class="noterow"><td></td><td colspan="7" class="hint ' + (s.status === "failed" ? "err" : "") + '">' + esc(note) + "</td></tr>" : "");
  }).join("")
    : '<tr><td colspan="8" class="empty-state">' + (historyFiltered() ? 'No searches match. <button type="button" class="link" data-hclear>Clear filters</button>' : "No searches yet. Searches you run on Find leads show here.") + "</td></tr>";
}
function clearHistoryFilters() { ["hCategory", "hCity", "hState", "hStatus", "hFrom", "hTo"].forEach((id) => { $(id).value = ""; }); historyLimit = 100; loadHistory().catch(() => {}); }
$("hClear").onclick = clearHistoryFilters;
$("historyMore").onclick = () => { historyLimit = Math.min(500, historyLimit + 100); loadHistory(); };$("historyRows").onclick = async (e) => {
  if (e.target.closest("[data-hclear]")) return clearHistoryFilters();
  if (await pullAction(e, loadHistory)) return;
  const v = e.target.closest("[data-view]");
  if (v) { const p = historyRowsData.find((x) => x.id === v.dataset.view); showPulls([v.dataset.view], p ? p.category + " in " + placeLabel(p) : "", p); return; }
  const pick = e.target.closest("[data-pick]");
  if (pick) { pick.checked ? historySelection.add(pick.dataset.pick) : historySelection.delete(pick.dataset.pick); $("hViewSelected").disabled = !historySelection.size; }
};
$("hViewSelected").onclick = () => showPulls([...historySelection], historySelection.size + " searches");
let hTyping;
["hCategory", "hCity", "hState"].forEach((id) => $(id).oninput = () => { clearTimeout(hTyping); hTyping = setTimeout(() => { historyLimit = 100; loadHistory(); }, 300); });
["hStatus", "hFrom", "hTo"].forEach((id) => $(id).onchange = () => { historyLimit = 100; loadHistory(); });
function showPulls(ids, label, one) {
  // The answer card belonged to another search: hide it.
  lastRequest = null; planStarted = false; startedIds = [];
  // Everything from those searches, including not-verified and closed (the header says so),
  // starting from clean filters so nothing from an earlier list carries over (and loaded once).
  setTab("find", false, () => {
    restore({ ...defaultFilters, scope: null, label: "" });
    f.verified.set([]); f.status.set([]);
    return { scope: ids, label };
  });
  $("plan").hidden = true; renderProgress();
  // One search: the search row shows what it was (type + place).
  if (one && one.category && one.source !== "upload" && one.source !== "google_details") {
    // Searches store the country as "USA" or a code; the row wants the 2-letter code.
    const c = String(one.country || "US"), known = geo.countries.find((x) => x.code === c || x.name === c);
    const country = known ? known.code : c === "USA" ? "US" : c;
    fillRow({ source: one.source === "google" ? "google" : "free", categories: [one.category], radiusMiles: one.radius_miles || null,
      locations: [{ country, region: one.state || "", city: one.city || undefined }] }).catch(() => {});
  }
  // Land at the top of the list (once it's loaded, so the page is long enough to scroll).
  scrollToListOnLoad = true;
}

// "Find leads" and "Database" share the results table but keep their own filters and scope.
let currentTab = "find";
const tabState = { find: null, database: null };
function snapshot() {
  return {
    sel: Object.fromEntries(Object.entries(f).map(([k, d]) => [k, [...d.selected]])),
    text: { ...view.text }, scope: view.scope, label: view.scopeLabel, shown: !$("resultsBody").hidden,
  };
}
function restore(s) {
  Object.entries(f).forEach(([k, d]) => { d.selected = new Set(s.sel[k] || []); d.renderChip(); });
  view.text = { ...s.text }; $("nameSearch").value = view.text.q || "";
  view.scope = s.scope; view.scopeLabel = s.label;
}
/** After a search, the empty list says where the businesses will appear instead of repeating the instructions. */
function emptyAfterSearch() {
  if ($("resultsBody").hidden) $("resultsCard").hidden = true;
  if ($("emptyMsg")) $("emptyMsg").textContent = "Your businesses show here once you press the button above.";
  if ($("examples")) $("examples").hidden = true;
}
const TABS = ["find", "database", "pipeline", "overview", "history", "team", "activity"];
/** prep (Database / Find): sets the filters before anything shows, so the list loads once, with them. */
function setTab(tab, fromHash, prep) {
  if (!TABS.includes(tab)) tab = "find";
  const tabBtn = document.querySelector('.tab[data-tab="' + tab + '"]');
  if (tabBtn && tabBtn.hidden) tab = "find"; // e.g. #team for someone who can’t see it
  if (currentTab === "find" || currentTab === "database") tabState[currentTab] = snapshot();
  const changed = currentTab !== tab;
  currentTab = tab;
  // The tab is in the address (#database …): refresh and Back keep you where you were.
  const hash = "#" + (tab === "activity" ? "admin" : tab);
  if (location.hash !== hash) { if (fromHash) history.replaceState(null, "", hash); else history.pushState(null, "", hash); }
  if (changed) window.scrollTo(0, 0);
  const active = document.querySelector('.tab[data-tab="' + tab + '"]');
  if (active && active.scrollIntoView) { const strip = $("tabStrip"); if (strip.scrollWidth > strip.clientWidth) active.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  closeMenus(false);
  if (polling && (tab === "find" || tab === "database" || tab === "history")) setTimeout(() => pollActive().catch(() => {}), 50);
  $("mapCard").hidden = true; drawing = false; drawPts = []; $("mapDraw").textContent = "Draw an area";
  document.querySelectorAll(".tab").forEach((t) => { t.classList.toggle("active", t.dataset.tab === tab); if (t.dataset.tab === tab) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
  $("findView").hidden = ["history", "team", "activity", "pipeline", "overview"].includes(tab);
  $("pipelineView").hidden = tab !== "pipeline";
  $("overviewView").hidden = tab !== "overview";
  $("activityView").hidden = tab !== "activity";
  $("historyView").hidden = tab !== "history";
  $("teamView").hidden = tab !== "team";
  const failed = (rows, cols, retry) => (err) => {
    $(rows).innerHTML = '<tr><td colspan="' + cols + '" class="err">' + esc(err.message) + ' <button type="button" class="link" data-retry-rows>Try again</button></td></tr>';
    const b = $(rows).querySelector("[data-retry-rows]"); if (b) b.onclick = () => retry().catch(failed(rows, cols, retry));
  };
  if (tab === "history") { loadHistory().catch(failed("historyRows", 8, loadHistory)); return; }
  if (tab === "team") { loadTeam().catch(failed("teamRows", 6, loadTeam)); return; }
  if (tab === "activity") { adminSec(mem.get("adminSec", "spend")); loadSpend(); loadActivity().catch(failed("activityRows", 4, loadActivity)); loadBackups(); loadFree(); loadOpenersAdmin(); loadFormAdmin(); loadAiHelper(); loadStoreAdmin().catch(() => {}); setTimeout(() => stripFade($("adminNav")), 0); return; }
  if (tab === "pipeline") { loadPipeline().catch((err) => { $("pMsg").textContent = err.message; }); return; }
  if (tab === "overview") { loadOverview().catch((err) => { $("ovStats").innerHTML = '<div class="err">' + esc(err.message) + "</div>"; }); return; }
  // Both tabs share the search row: Find leads collects, Database filters what's collected.
  const db = tab === "database";
  $("findView").classList.toggle("dbmode", db);
  acWhat.reset(); acWhere.reset(); setFindMsg("");
  $("savedCard").hidden = db || !savedList.length;
  if (!db) renderProgress(); else $("progress").hidden = true;
  $("pageTitle").textContent = db ? "Database" : "Find leads";
  $("pageSub").textContent = db ? "Everything collected. Filter it, then download." : "Search by type and place. You see the count and any cost first.";
  $("plan").hidden = db || !lastRequest;
  const saved = tabState[tab] || defaultFilters;
  restore(saved);
  // prep may say which list to show ({ scope, label }) on Find leads.
  const target = prep ? prep() || null : null;
  if (prep) Object.values(f).forEach((d) => d.renderChip());
  acWhat.render(); acWhere.render(); updateFindLabel();
  if (db) useScope(null, "");
  else if (target) useScope(target.scope, target.label);
  else if (saved.shown) useScope(saved.scope, saved.label);
  else {
    $("emptyState").hidden = false; $("resultsBody").hidden = true; $("filtersCard").hidden = true;
    // A filled-in search with no answer yet: the empty list says to press Search.
    if (!lastRequest && what.selected.size && places.length) $("emptyMsg").textContent = "Press Search to see the count.";
  }
  syncNext();
}
document.querySelectorAll(".tab[data-tab]").forEach((t) => t.onclick = () => setTab(t.dataset.tab));
/** #find, #database … #admin -> the tab (Back / Forward / refresh). */
const tabFromHash = () => { const h = location.hash.replace("#", "").split("/")[0]; return h === "admin" ? "activity" : h; };
window.addEventListener("popstate", () => { const t = tabFromHash() || "find"; if (t !== currentTab) setTab(t, true); });
window.addEventListener("hashchange", () => { const t = tabFromHash() || "find"; if (t !== currentTab) setTab(t, true); });
$("brandHome").onclick = (e) => { e.preventDefault(); setTab("find"); };
// The spending pill opens Admin → Spending (for the owner, who can change the limit).
$("spend").onclick = () => { if (me && me.role === "super_admin") { mem.set("adminSec", "spend"); setTab("activity"); } else toast("Spent this month out of the monthly budget. The owner can change the limit."); };
function adminSec(sec) {
  document.querySelectorAll("#activityView [data-sec]").forEach((el) => {
    if (el.tagName === "BUTTON") { el.classList.toggle("active", el.dataset.sec === sec); if (el.dataset.sec === sec) el.setAttribute("aria-current", "true"); else el.removeAttribute("aria-current"); }
    else el.classList.toggle("secoff", el.dataset.sec !== sec);
  });
  mem.set("adminSec", sec);
  // An old complaint next to a Save button doesn't follow you to another section.
  document.querySelectorAll("#activityView .hint.err").forEach((el) => { el.textContent = ""; el.className = "hint"; });
  // On phones the section row scrolls: keep the chosen one in view.
  const nav = $("adminNav"), on = nav.querySelector("button.active");
  if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - nav.offsetLeft - 24);
  stripFade(nav);
}
$("adminNav").onclick = (e) => { const b = e.target.closest("[data-sec]"); if (b) adminSec(b.dataset.sec); };
/** A card whose information couldn't load says so, with Try again (instead of staying empty). */
function cardFail(id, err, retry) {
  const card = $(id); if (!card) return null;
  let el = card.querySelector(".cardfail");
  if (!el) { el = document.createElement("div"); el.className = "callout warn cardfail"; const h = card.querySelector("h2"); if (h) h.after(el); else card.prepend(el); }
  el.innerHTML = "Couldn’t load this part: " + esc(err.message) + ' <button type="button" class="link">Try again</button>';
  el.querySelector("button").onclick = () => { el.remove(); retry(); };
  return null;
}
let defaultFilters = null;

// ---------------------------------------------------------------------------
// Signed-in user + Team (admins)
// ---------------------------------------------------------------------------
let me = null;
async function loadMe() {
  me = await api("/api/me");
  const initials = (me.name || "?").split(/ +/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
  $("me").innerHTML = '<span class="avatar">' + esc(initials) + '</span><span class="mename">' + esc(me.name || "Account") + "</span>";
  $("acctWho").innerHTML = esc(me.name || "") + "<br>" + (me.role === "super_admin" ? "Owner" : me.role === "admin" ? "Admin" : "Team member");
  $("acctBtn").setAttribute("aria-label", "Your account" + (me.name ? ": " + me.name : ""));
  $("acctBtn").title = me.name || "Your account";
  $("roleLabel").textContent = me.role === "super_admin" ? "Owner" : me.role === "admin" ? "Admin" : "Team";
  $("teamTab").hidden = me.role !== "admin" && me.role !== "super_admin";
  $("activityTab").hidden = me.role !== "super_admin";
  $("budgetSave").disabled = me.role !== "super_admin";
}
$("signOut").onclick = async () => { await postJson("/api/auth/logout", {}).catch(() => {}); location.href = "/login"; };
$("changePw").onclick = () => {
  $("acctMenu").hidden = true;
  ["pwCurrent", "pwNew", "pwNew2"].forEach((id) => { $(id).value = ""; $(id).type = "password"; });
  document.querySelectorAll("[data-pwshow]").forEach((b) => { b.textContent = "Show"; b.setAttribute("aria-label", "Show the password"); });
  $("pwMsg").textContent = ""; $("pwDialog").hidden = false; $("pwCurrent").focus();
};
// Show / Hide on each password box; the typing carries on where it was.
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pwshow]"); if (!b) return;
  const i = $(b.dataset.pwshow), show = i.type === "password";
  i.type = show ? "text" : "password"; b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-label", show ? "Hide the password" : "Show the password");
  i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (err) { /* fine */ }
});
$("acctBtn").onclick = (e) => { e.stopPropagation(); measureHeader(); const open = $("acctMenu").hidden; closeMenus(false); $("acctMenu").hidden = !open; $("acctBtn").setAttribute("aria-expanded", String(open)); };
document.addEventListener("click", (e) => { if (!e.target.closest("#acctMenu, #acctBtn")) { $("acctMenu").hidden = true; $("acctBtn").setAttribute("aria-expanded", "false"); } });
$("limitClose").onclick = () => { $("limitBanner").hidden = true; };
// Change password: an in-page form (the passwords stay hidden while typing).
const closePw = () => { $("pwDialog").hidden = true; };
// Both are real forms so the browser keeps them apart: the saved login belongs to the password form only,
// never to the search boxes. Neither form ever sends itself.
$("searchForm").onsubmit = (e) => e.preventDefault();
$("pwForm").onsubmit = (e) => { e.preventDefault(); $("pwSave").click(); };
$("pwClose").onclick = closePw; $("pwCancel").onclick = closePw;
$("pwSave").onclick = async () => {
  const current = $("pwCurrent").value, next = $("pwNew").value;
  const say = (t, bad) => { $("pwMsg").className = bad ? "hint err" : "hint"; $("pwMsg").textContent = t; };
  if (!current || !next) return say("Fill in your current and new password.", true);
  if (next.length < 10) return say("The new password needs at least 10 characters.", true);
  if (next !== $("pwNew2").value) return say("The two new passwords don’t match.", true);
  $("pwSave").disabled = true; say("Saving…");
  try { await postJson("/api/me/password", { current, next }); say("Password changed. Other devices were signed out."); setTimeout(closePw, 1500); }
  catch (err) { say(err.message, true); }
  finally { $("pwSave").disabled = false; }
};
/** "2026-09-25 18:02:11" (UTC) -> local date and time. */
// One date style everywhere: "Oct 5, 2026" for days, "Oct 5, 2026, 8:01 PM" for times.
const tsDate = (ts) => new Date(String(ts).replace(" ", "T") + (/[zZ]|[+-][0-9][0-9]:?[0-9][0-9]$/.test(String(ts)) ? "" : "Z"));
function fmtTime(ts) {
  if (!ts) return "";
  const d = tsDate(ts); if (isNaN(d)) return String(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
/** "2026-10-05" (a calendar day) -> "Oct 5, 2026". */
function fmtDay(day) { const [y, m, dd] = String(day || "").split("-").map(Number); return y && m && dd ? fmtDate(new Date(y, m - 1, dd)) : String(day || ""); }
function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => chars[b % chars.length]).join("");
}
let teamUsers = [];
async function loadTeam() {
  if (!$("tPassword").value) $("tPassword").value = tempPassword();
  const users = await api("/api/admin/users");
  teamUsers = users;
  const off = users.filter((u) => !u.active).length, showOff = $("tShowOff").checked;
  $("tOffWrap").hidden = !off;
  $("teamCount").textContent = num(users.length - off) + (users.length - off === 1 ? " person can sign in" : " people can sign in") + (off ? " · " + num(off) + " switched off" + (showOff ? "" : " (hidden)") : "");
  // An email shown only in part ("s•••@company.com") when the server keeps it private.
  const emailOf = (u) => u.emailHint || (/^[*•]+$/.test(String(u.email || "")) ? "hidden" : u.email || "");
  $("teamRows").innerHTML = users.filter((u) => u.active || showOff).map((u) => "<tr><td><b>" + esc(u.name || "") + '</b></td><td data-label="Email">' + esc(emailOf(u)) + '</td><td data-label="Role">' + (u.role === "super_admin" ? "Owner" : u.role === "admin" ? "Admin" : "Member") +
    '</td><td data-label="Status">' + (u.active ? '<span class="pill ok">Active</span>' : '<span class="pill">Switched off</span>') + (u.active && u.must_change_password ? ' <span class="pill warn">temporary password</span>' : "") +
    '</td><td data-label="Last sign-in">' + esc(u.last_login_at ? fmtTime(u.last_login_at) : "never") + '</td><td class="acts">' +
    (u.id === me.id ? '<span class="muted">you</span>' : u.role === "super_admin" ? '<span class="muted">owner</span>' : !u.active
      ? '<button type="button" class="ghost small" data-uact="on" data-uid="' + esc(u.id) + '">Switch on</button>'
      : '<button type="button" class="ghost small" data-uact="reset" data-uid="' + esc(u.id) + '">Reset password</button> ' +
        '<button type="button" class="ghost small" data-uact="' + (u.role === "admin" ? "member" : "admin") + '" data-uid="' + esc(u.id) + '">' + (u.role === "admin" ? "Make member" : "Make admin") + "</button> " +
        '<button type="button" class="ghost small danger" data-uact="off" data-uid="' + esc(u.id) + '">Switch off</button>') +
    "</td></tr>").join("") || '<tr><td colspan="6" class="muted">Nobody else yet. Add someone above.</td></tr>';
}
$("tShowOff").onchange = () => loadTeam().catch((err) => toast(err.message, "bad"));
// The "Added …" line goes once they start on the next person.
["tEmail", "tName"].forEach((id) => $(id).addEventListener("input", () => { if (!$("tMsg").classList.contains("err")) $("tMsg").textContent = ""; }));
$("tAdd").onclick = async () => {
  $("tMsg").className = "hint"; $("tMsg").textContent = "Adding…";
  try {
    const email = $("tEmail").value.trim(), password = $("tPassword").value;
    if (!/^[^ @]+@[^ @]+[.][^ @]+$/.test(email)) throw new Error("That email doesn’t look right. Check it and try again.");
    await postJson("/api/admin/users", { email, name: $("tName").value.trim(), password, role: $("tRole").value });
    const who = $("tName").value.trim() || email;
    say("tMsg", "Added " + who + ".");
    $("tEmail").value = ""; $("tName").value = ""; $("tPassword").value = tempPassword();
    const nl = String.fromCharCode(10), first = who.includes("@") ? "" : who.split(" ")[0];
    showCopy("Send this to " + who, "Hi" + (first ? " " + first : "") + ", you’re on the team in Lead Finder." + nl + "Sign in here: " + location.origin + "/login" + nl + "Email: " + email + nl +
      "Temporary password: " + password + nl + "You’ll choose your own password the first time you sign in.",
      "Copy this and send it to them. The password isn’t shown again.", true);
    loadTeam().catch(() => {}); loadTeam2().then(() => { pWhoOptions(); }).catch(() => {});
  } catch (err) { say("tMsg", err.message, true); }
};
const patchUser = (id, changes) => api("/api/admin/users/" + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes) });
$("teamRows").onclick = async (e) => {
  const b = e.target.closest("[data-uact]"); if (!b) return;
  const id = b.dataset.uid, act = b.dataset.uact;
  const u = teamUsers.find((x) => x.id === id) || {}, who = u.name || u.emailHint || "this person";
  try {
    if (act === "reset") {
      const pw = tempPassword();
      if (!(await ask("Reset " + who + "’s password?", who + " gets a new temporary password, is signed out, and chooses their own when they sign in.", "Reset password", { danger: true }))) return;
      await patchUser(id, { password: pw });
      await showCopy("New temporary password for " + who, pw, "Send it to them. They choose their own password when they sign in.");
    } else {
      // Role and on / off change at once, with Undo in the message.
      const changes = act === "off" || act === "on" ? { active: act === "on" } : { role: act };
      const undo = act === "off" || act === "on" ? { active: act !== "on" } : { role: act === "admin" ? "member" : "admin" };
      b.disabled = true;
      await patchUser(id, changes);
      const msg = act === "off" ? who + " is switched off and can’t sign in." : act === "on" ? who + " can sign in again."
        : act === "admin" ? who + " is an admin now (can manage the team)." : who + " is a member now.";
      toast(msg, "ok", { label: "Undo", run: async () => {
        try {
          await patchUser(id, undo);
          toast("Undone: " + (act === "off" ? who + " can sign in again." : act === "on" ? who + " is switched off again." : act === "admin" ? who + " is a member again." : who + " is an admin again."), "ok");
          loadTeam().catch(() => {}); loadTeam2().then(() => { pWhoOptions(); }).catch(() => {}); }
        catch (err) { toast(err.message, "bad"); }
      } });
    }
    loadTeam().catch(() => {}); loadTeam2().then(() => { pWhoOptions(); }).catch(() => {});
  } catch (err) { toast(err.message, "bad"); b.disabled = false; }
};

// ---------------------------------------------------------------------------
// Notifications (bell + Pull history), spend this month, Activity log + budget (super admin)
// ---------------------------------------------------------------------------
const ACTION_LABELS = {
  ai_helper_settings: "Changed the AI helper settings",
  signed_in: "Signed in", signed_out: "Signed out", sign_in_failed: "Failed sign-in", password_changed: "Changed password",
  team_member_added: "Added a team member", team_member_changed: "Changed a team member", pull_started: "Started collecting",
  counts_checked: "Checked how many exist", phone_checks_started: "Started phone checks", csv_downloaded: "Downloaded a CSV",
  notification_dismissed: "Dismissed a notification", maintenance_backfill: "Ran maintenance",
  pull_cancelled: "Stopped a search", pull_resumed: "Resumed a search", phone_checks_requested: "Asked for phone checks", google_details_started: "Asked for Google details", harvest_added: "Added to the daily free collection",
  api_key_created: "Made a connection key", dnc_added: "Added to do-not-contact", dnc_removed: "Took off do-not-contact", emails_verification_started: "Started email checks",
  form_link_changed: "Made a new website form link", leads_updated: "Changed stage / assignment", list_uploaded: "Uploaded a list", opener_templates_changed: "Changed the opener wording", ghl_columns_changed: "Changed the GoHighLevel download columns",
  saved_search_added: "Saved a search", saved_search_deleted: "Deleted a saved search", score_weights_changed: "Changed the score weights",
  store_account_status: "Changed a store customer", store_credits_changed: "Changed a customer’s credits", store_password_reset: "Reset a customer’s password",
  store_removal_request: "Handled a removal request", store_settings_changed: "Changed store settings", website_check_settings: "Changed website check settings",
  website_check_started: "Started website checks",
};
const FILTER_WORDS = { state: "state", city: "city", category: "type", industry: "industry", min_rating: "rating at least", max_rating: "rating at most", min_reviews: "reviews at least",
  max_reviews: "reviews at most", lead_status: "stage", assigned: "assigned to", phone_type: "phone type", website: "website", email: "email", score: "score", q: "name contains",
  status: "open / closed", verified: "verified", data_source: "data", added_from: "added from", added_to: "added to", near: "near", radius_miles: "miles", area: "drawn area" };
function ago(ts) {
  if (!ts) return "";
  const d = tsDate(ts), m = Math.round((Date.now() - d) / 60000);
  if (isNaN(m)) return String(ts);
  return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : fmtDate(d);
}
let notes = [];
function noteHtml(n) {
  return '<div class="note ' + esc(n.level) + '"><span class="dot"></span><div>' + esc(n.message) + '<div class="when">' + esc(ago(n.created_at)) +
    '</div></div><button type="button" class="ghost small" data-dismiss="' + n.id + '">Dismiss</button></div>';
}
async function loadNotifications() {
  try { notes = await api("/api/notifications"); } catch { return; }
  $("bellCount").hidden = !notes.length; $("bellCount").textContent = notes.length;
  $("bell").setAttribute("aria-label", notes.length ? "Notifications: " + notes.length + " need attention" : "Notifications");
  $("bellPanel").innerHTML = notes.length ? (notes.length > 1 ? '<div class="bellhead"><span>' + notes.length + ' need attention</span><button type="button" class="link small" data-dismiss-all>Dismiss all</button></div>' : "") + notes.map(noteHtml).join("")
    : '<div class="note"><div class="muted">All clear. Nothing needs attention.</div></div>';
}
$("bell").onclick = (e) => { e.stopPropagation(); measureHeader(); const open = $("bellPanel").hidden; closeMenus(false); $("bellPanel").hidden = !open; $("bell").setAttribute("aria-expanded", String(open)); };
document.addEventListener("click", async (e) => {
  const d = e.target.closest("[data-dismiss]");
  if (d) { await api("/api/notifications/" + d.dataset.dismiss + "/dismiss", { method: "POST" }).catch(() => {}); return loadNotifications(); }
  if (e.target.closest("[data-dismiss-all]")) {
    // One call when the server has it; otherwise one by one.
    try { await api("/api/notifications/dismiss-all", { method: "POST" }); }
    catch (err) { for (const n of notes) await api("/api/notifications/" + n.id + "/dismiss", { method: "POST" }).catch(() => {}); }
    return loadNotifications();
  }
  if (!e.target.closest(".bellwrap")) { if (!$("bellPanel").hidden) { $("bellPanel").hidden = true; $("bell").setAttribute("aria-expanded", "false"); } }
});

let spend = null;
async function loadSpend() {
  try { spend = await api("/api/budget"); } catch { return; }
  const share = spend.budget > 0 ? spend.spent / spend.budget : 1;
  $("spend").textContent = money(spend.spent) + " of " + money(spend.budget);
  $("spend").title = "Spent this month: " + money(spend.spent) + " of the " + money(spend.budget) + " monthly budget" + (me && me.role === "super_admin" ? ". Click to change the limit." : ".");
  $("spend").setAttribute("aria-label", "Spent this month: " + money(spend.spent) + " of " + money(spend.budget));
  $("spend").className = "spend" + (share >= 1 ? " bad" : share >= 0.8 ? " warn" : "");
  if ($("budgetNow")) $("budgetNow").textContent = "Spent this month: " + money(spend.spent) + " (collecting " + money(spend.pulls) + ", phone checks " + money(spend.phones) +
    ", counts " + money(spend.counts) + "), " + money(spend.left) + " left.";
  if ($("budgetInput") && document.activeElement !== $("budgetInput")) $("budgetInput").value = spend.budget;
}
// A complaint about the amount goes as soon as a usable amount is typed.
$("budgetInput").addEventListener("input", () => {
  const raw = $("budgetInput").value.trim();
  if ($("budgetMsg").classList.contains("err") && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0) say("budgetMsg", "");
});
$("budgetSave").onclick = async () => {
  say("budgetMsg", "Saving…");
  const raw = $("budgetInput").value.trim();
  if (raw === "" || !Number.isFinite(Number(raw))) { say("budgetMsg", "Type an amount in dollars, e.g. 25.", true); return; }
  if (Number(raw) === 0 && !(await ask("Set the limit to $0?", "Every Google search, count and paid phone check will be refused until it’s raised. Free data still works.", "Set to $0", { danger: true }))) { say("budgetMsg", ""); return; }
  try { await api("/api/budget", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: Number(raw) }) }); say("budgetMsg", "Saved."); loadSpend(); }
  catch (err) { say("budgetMsg", err.message, true); }
};

const size = (b) => b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
async function loadBackups() {
  const data = await api("/api/admin/backups").catch((err) => cardFail("backupCard", err, loadBackups));
  if (!data) return;
  $("backupRun").disabled = !data.enabled;
  // The newest finished backup is always named, whether nightly backups are on or not.
  const last = data.backups.find((b) => b.status === "done");
  const lastAt = data.lastGoodAt || (last && last.finished_at);
  const lastLine = lastAt ? "Last good backup: " + esc(fmtTime(lastAt)) + "." : "";
  $("backupNow").innerHTML = data.enabled ? '<span class="pill ok">On</span> ' + (lastLine || "No backup yet. The first one runs tonight.")
    : '<span class="pill warn">Switched off</span> ' + (lastLine ? lastLine + " Nothing new is copied until nightly backups are switched back on." : "Nightly backups are switched off, so nothing is copied yet.");
  $("backupHint").textContent = data.enabled
    ? "A copy of everything (businesses, searches, settings) is saved every night at about 3 am New York time and kept for " + data.keep + " nights. If something goes wrong, download one and send the file to your developer."
    : "Ask your developer to switch nightly backups on." + (data.backups.length ? " The backups below are kept and can still be downloaded." : "");
  const BK = { done: "Done", failed: "Failed", running: "Copying…", pending: "Waiting" };
  $("backupRows").innerHTML = data.backups.length ? data.backups.map((b) => '<tr><td title="' + esc(b.id) + '">' + esc(fmtTime(b.started_at) || b.id) + "</td><td>" +
    '<span class="pill ' + (b.status === "done" ? "ok" : b.status === "failed" ? "bad" : "warn") + '" title="' + esc(b.error || "") + '">' + esc(BK[b.status] || b.status) + "</span></td><td>" +
    Number(b.rows_copied || 0).toLocaleString() + "</td><td>" + (b.bytes ? size(b.bytes) : "") + "</td><td>" +
    (b.status === "done" ? '<a class="small" href="/api/admin/backups/' + encodeURIComponent(b.id) + '/sql">Download</a>' : "") + "</td></tr>").join("")
    : '<tr><td colspan="5" class="muted">No backups yet.</td></tr>';
}
$("backupRun").onclick = async () => {
  say("backupMsg", "Starting…");
  try { await postJson("/api/admin/backups/run", {}); say("backupMsg", "Started. It carries on in the background and usually takes a few minutes."); loadBackups(); }
  catch (err) { say("backupMsg", err.message, true); }
};

const HARVEST_STATUS = { done: "done", failed: "failed", running: "collecting", queued: "waiting", pending: "waiting", scraping: "collecting", ingesting: "saving",
  received: "saving", claimed: "starting", collecting: "collecting", stopped: "stopped", cancelled: "stopped" };
let harvestState = null;
async function loadHarvest() {
  const h = await api("/api/harvest").catch(() => null);
  if (!h) { $("harvestRows").innerHTML = '<tr><td colspan="3" class="muted">Only admins can see this list.</td></tr>'; return; }
  harvestState = h;
  if (document.activeElement !== $("harvestTarget")) $("harvestTarget").value = h.target;
  $("harvestOn").checked = h.enabled;
  $("harvestOn").disabled = $("harvestSave").disabled = me.role !== "super_admin";
  $("harvestNow").innerHTML = (h.enabled ? '<span class="pill ok">On</span> ' : '<span class="pill">Off</span> ') +
    num(h.items.length) + " on the list · " + num(h.due) + " due now" + (h.enabled ? "" : " (switch it on after go-live)");
  $("harvestRows").innerHTML = h.items.length ? h.items.map((i) => "<tr><td>" + esc(i.label) + "</td><td>" +
    (i.last_collected_at ? esc(ago(i.last_collected_at)) + (i.last_status && i.last_status !== "done" ? ' <span class="muted">(' + esc(HARVEST_STATUS[i.last_status] || String(i.last_status).replace(/_/g, " ")) + ")</span>" : "") : '<span class="muted">not yet</span>') +
    '</td><td><button type="button" class="ghost small danger" data-harvest-remove="' + esc(i.id) + '" data-label="' + esc(i.label) + '">Remove</button></td></tr>').join("")
    : '<tr><td colspan="3" class="muted">Nothing on the list yet.</td></tr>';
  harvestWarn();
}
/** The daily target can't be more than can be saved a day: say so, and how long what's waiting takes. */
let freeState = null;
function harvestWarn() {
  const limit = freeState ? Number(freeState.limit) || 0 : 0, target = Number($("harvestTarget").value) || 0;
  const waiting = freeState ? Number(freeState.waiting) || 0 : 0;
  const parts = [];
  if (limit > 0 && target > limit) parts.push("The daily target (" + num(target) + ") is more than can be saved a day (" + num(limit) + "). The rest waits for the next days.");
  if (limit > 0 && waiting > limit) parts.push("About " + num(Math.ceil(waiting / limit)) + " days to save the " + num(waiting) + " businesses waiting, at " + num(limit) + " a day.");
  $("harvestWarn").hidden = !parts.length; $("harvestWarn").textContent = parts.join(" ");
}
$("harvestTarget").addEventListener("input", harvestWarn);
$("harvestRows").onclick = async (e) => {
  const b = e.target.closest("[data-harvest-remove]"); if (!b) return;
  if (!(await ask("Take this off the daily collection?", "“" + (b.dataset.label || "This item") + "” stops being collected every day. Businesses already collected stay in your database.", "Take it off", { danger: true }))) return;
  await api("/api/harvest/" + b.dataset.harvestRemove, { method: "DELETE" }).catch((err) => toast(err.message, "bad"));
  loadHarvest();
};
$("harvestSave").onclick = async () => {
  say("harvestMsg", "Saving…");
  try {
    await api("/api/harvest/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: $("harvestOn").checked, target: Number($("harvestTarget").value) }) });
    say("harvestMsg", "Saved."); loadHarvest(); loadFree();
  } catch (err) { say("harvestMsg", err.message, true); }
};
async function loadSites() {
  const s = await api("/api/websites/status").catch((err) => cardFail("sitesCard", err, loadSites));
  if (!s) return;
  const seenMin = s.checkerSeenAt ? (Date.now() - new Date(s.checkerSeenAt.replace(" ", "T") + "Z")) / 60000 : null;
  $("sitesNow").innerHTML = (s.enabled ? '<span class="pill ok">On</span> ' : '<span class="pill">Off</span> ') +
    num(s.done) + " checked in total · " + num(s.checkedToday) + " today (limit " + num(s.limit) + ") · " + num(s.queued + s.checking) + " waiting" +
    (s.checkerSeenAt ? " · the checker last ran " + esc(ago(s.checkerSeenAt)) : "") +
    (seenMin != null && seenMin > 60 && s.queued ? ' <span class="pill warn">the website checker hasn’t run for over an hour</span>' : "") +
    (s.speedKey ? ' · <span class="pill ok">speed check on</span>' : ' · <span class="pill">speed check off (needs the free Google speed key)</span>');
  if (document.activeElement !== $("sitesLimit")) $("sitesLimit").value = s.limit;
  $("sitesOn").checked = s.enabled;
  $("sitesOn").disabled = $("sitesSave").disabled = me.role !== "super_admin";
  // Email verification.
  const ev = await api("/api/emails/status").catch(() => null);
  if (ev) {
    $("sitesNow").innerHTML += '<div style="margin-top:6px">Email verification: ' + (ev.enabled ? '<span class="pill ok">on</span>' : '<span class="pill">off (needs the email-checking service key)</span>') +
      " · " + num(ev.ok) + " valid, " + num(ev.risky) + " risky, " + num(ev.bad) + " would bounce (not delivered)" + (ev.queued ? " · " + num(ev.queued) + " waiting" : "") +
      (ev.credits != null ? " · " + num(ev.credits) + " credits left" : "") + (ev.problem ? ' <span class="pill bad" title="' + esc(ev.problem) + '">problem: ' + esc(ev.problem) + "</span>" : "") + "</div>";
  }
  // Owners from state registries.
  const reg = await api("/api/registry/status").catch(() => null);
  if (reg) {
    $("sitesNow").innerHTML += '<div style="margin-top:6px">Owner names known: <b>' + num(reg.ownersKnown) + "</b>" +
      (reg.states.length ? " · from state business records: " + reg.states.map((s) => esc(s.state) + " " + num(s.checked) + " of " + num(s.total) + " looked up, " + num(s.from_registry) + " owners found").join("; ") : "") +
      (reg.floridaLastRun ? " · Florida business records last read " + esc(ago(reg.floridaLastRun)) : "") +
      // A problem reading the state records: said plainly, and only while it's recent (a week).
      (reg.lastError && Date.now() - tsDate(reg.lastError.at) < 7 * 86400000 ? ' <span class="pill warn" title="' + esc(reg.lastError.message) + '">couldn’t read the state records ' + esc(ago(reg.lastError.at)) + "; it tries again by itself</span>" : "") + "</div>";
  }
}
// AI helper (Admin → Data collection): on / off, how many a day, and how it's doing.
async function loadAiHelper() {
  const s = await api("/api/ai-helper").catch((err) => cardFail("aiCard", err, loadAiHelper));
  if (!s) return;
  const set = s.keySet !== false;
  $("aiSetLine").hidden = !set;
  $("aiNow").innerHTML = !set ? '<span class="pill">Not set up</span> ' + AI_SETUP_HTML
    : (s.enabled ? '<span class="pill ok">On</span> ' : '<span class="pill">Off</span> ') + num(s.doneToday) + " read today (limit " + num(s.dailyLimit) + ") · " +
      num(s.waiting) + (s.waitingMore ? "+" : "") + " waiting" +
      (s.problem ? ' <span class="pill bad">' + esc(s.problem) + "</span>" : "") +
      (s.pausedUntil ? ' <span class="pill warn">paused until ' + esc(fmtTime(s.pausedUntil)) + "</span>" : "");
  if (document.activeElement !== $("aiLimit")) $("aiLimit").value = s.dailyLimit;
  $("aiOn").checked = s.switchedOn != null ? !!s.switchedOn : !!s.enabled;
  $("aiOn").disabled = $("aiSave").disabled = !canSpend();
}
$("aiSave").onclick = async () => {
  say("aiSaveMsg", "Saving…");
  try {
    await api("/api/ai-helper", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: $("aiOn").checked, dailyLimit: Number($("aiLimit").value) }) });
    say("aiSaveMsg", "Saved."); loadAiHelper(); nextDone.delete("ai_enable"); loadNextSteps();
  } catch (err) { say("aiSaveMsg", err.message, true); }
};
$("sitesSave").onclick = async () => {
  say("sitesMsg", "Saving…");
  try {
    await api("/api/websites/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: $("sitesOn").checked, limit: Number($("sitesLimit").value) }) });
    say("sitesMsg", "Saved."); loadSites();
  } catch (err) { say("sitesMsg", err.message, true); }
};
async function loadApi() {
  const keys = await api("/api/admin/api-keys").catch((err) => cardFail("apiCard", err, loadApi));
  if (!keys) return;
  $("keyRows").innerHTML = keys.length ? keys.map((k) => "<tr><td>" + esc(k.name) + ' <span class="muted">' + esc(k.prefix) + "…</span>" + (k.revoked_at ? ' <span class="pill bad">revoked</span>' : "") +
    "</td><td>" + (k.can_collect ? "yes" : "no") + "</td><td>" + (k.last_used_at ? esc(ago(k.last_used_at)) : '<span class="muted">never</span>') + "</td><td>" +
    (k.revoked_at ? "" : '<button type="button" class="ghost small danger" data-revoke="' + esc(k.id) + '">Turn off</button>') + "</td></tr>").join("")
    : '<tr><td colspan="4" class="muted">No keys yet.</td></tr>';
  const h = await api("/api/admin/webhooks").catch(() => null);
  if (!h) return;
  const EVENT_WORDS = { "search.finished": "search finished", "saved_search.new": "new businesses for a saved search", "list.uploaded": "list uploaded", "report.viewed": "report or demo opened", "form.submitted": "website form filled in" };
  $("hookRows").innerHTML = h.webhooks.length ? h.webhooks.map((w) => '<tr><td style="overflow-wrap:anywhere;white-space:normal">' + esc(w.url) + '</td><td style="white-space:normal">' + esc(String(w.events).split(",").map((x) => EVENT_WORDS[x.trim()] || x.trim()).join(", ")) + "</td><td>" +
    (w.last_sent_at ? esc(ago(w.last_sent_at)) : '<span class="muted">not yet</span>') + (w.last_status ? ' <span class="muted">(' + esc(w.last_status) + ")</span>" : "") + (w.waiting ? " · " + num(w.waiting) + " waiting" : "") + '</td><td class="nowrap">' +
    '<button type="button" class="ghost small" data-hook-test="' + esc(w.id) + '">Send a test</button> <button type="button" class="ghost small danger" data-hook-del="' + esc(w.id) + '">Delete</button></td></tr>').join("")
    : '<tr><td colspan="4" class="muted">No tools are told yet.</td></tr>';
}
$("keyAdd").onclick = async () => {
  try {
    const r = await postJson("/api/admin/api-keys", { name: $("keyName").value, canCollect: $("keyCollect").checked });
    $("keyName").value = ""; loadApi();
    showCopy("Your new connection key", r.key, "Copy it now: it isn’t shown again. Paste it into the other tool (developers: send it as the Authorization header, Bearer key).");
  } catch (err) { say("keyMsg", err.message, true); }
};
$("keyRows").onclick = async (e) => {
  const b = e.target.closest("[data-revoke]"); if (!b || !(await ask("Turn this key off?", "Tools using it stop working at once.", "Turn off", { danger: true }))) return;
  await api("/api/admin/api-keys/" + b.dataset.revoke, { method: "DELETE" }).catch((err) => toast(err.message, "bad")); loadApi();
};
$("hookAdd").onclick = async () => {
  try {
    const events = [...document.querySelectorAll(".hookEv")].filter((x) => x.checked).map((x) => x.value);
    const r = await postJson("/api/admin/webhooks", { url: $("hookUrl").value, events });
    $("hookUrl").value = ""; loadApi();
    showCopy("Secret for this connection", r.secret, "Copy it now: it isn’t shown again. Your developer uses it to check that calls really come from Lead Finder.");
  } catch (err) { say("hookMsg", err.message, true); }
};
$("hookRows").onclick = async (e) => {
  const t = e.target.closest("[data-hook-test]"), d = e.target.closest("[data-hook-del]");
  if (t) { const r = await postJson("/api/admin/webhooks/" + t.dataset.hookTest + "/test", {}).catch((err) => ({ note: err.message })); toast(r.note); setTimeout(loadApi, 70000); }
  if (d && (await ask("Delete this connection?", "That tool stops hearing about new events.", "Delete", { danger: true }))) { await api("/api/admin/webhooks/" + d.dataset.hookDel, { method: "DELETE" }).catch((err) => toast(err.message, "bad")); loadApi(); }
};
const WEIGHT_LABELS = {
  website: { loads: "Website loads", https: "Secure (https)", mobile: "Works on phones", form: "Contact form", booking: "Online booking", pixel: "Facebook ad tracking", gtag: "Google ad tracking", speed: "Speed (needs the Google key)" },
  gbp: { verified: "Google profile verified", phone: "Phone on Google", website: "Website on Google", hours: "Opening hours", description: "Description", photos: "Photos", reviews: "Number of reviews", rating: "Star rating", features: "Features listed" },
};
let weightDefaults = null;
function renderWeights(w) {
  const group = (key, title) => '<div style="margin-top:6px"><b>' + title + '</b><div class="line" style="flex-wrap:wrap">' +
    Object.entries(WEIGHT_LABELS[key]).map(([k, label]) => '<label class="muted">' + esc(label) + ' <input type="number" min="0" max="50" step="1" data-w="' + key + "." + k + '" value="' + esc(w[key][k]) + '" style="width:64px"></label>').join("") + "</div></div>";
  $("weightsForm").innerHTML = group("website", "Website") + group("gbp", "Google profile") +
    '<div style="margin-top:6px"><label class="muted">How much the website counts in the overall score <input type="number" min="0" max="100" step="5" id="wShare" value="' + esc(w.websiteShare) + '" style="width:64px"> % (the rest is the Google profile, when we have it)</label></div>';
  const su = !me || me.role !== "super_admin";
  document.querySelectorAll("#weightsForm input").forEach((i) => i.disabled = su);
  $("weightsSave").disabled = $("weightsReset").disabled = su;
}
async function loadWeightsUi() {
  const r = await api("/api/scoring/weights").catch((err) => cardFail("weightsCard", err, loadWeightsUi));
  if (!r) return;
  weightDefaults = r.defaults;
  renderWeights(r.weights);
}
async function saveWeightsUi(w) {
  say("weightsMsg", "Saving…");
  try {
    const r = await api("/api/scoring/weights", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(w) });
    renderWeights(r.weights); say("weightsMsg", r.note);
  } catch (err) { say("weightsMsg", err.message, true); }
}
$("weightsSave").onclick = () => {
  const w = { website: {}, gbp: {}, websiteShare: Number($("wShare").value) };
  document.querySelectorAll("#weightsForm [data-w]").forEach((i) => { const [g, k] = i.dataset.w.split("."); w[g][k] = Number(i.value); });
  saveWeightsUi(w);
};
// Same as the openers' "Back to the defaults": ask, fill in, save.
$("weightsReset").onclick = async () => { if (weightDefaults && (await ask("Back to the default weights?", "Every weight goes back to the default and is saved, and all businesses are scored again.", "Use the defaults"))) { renderWeights(weightDefaults); saveWeightsUi(weightDefaults); } };
async function loadAgency() {
  const a = await api("/api/agency").catch((err) => cardFail("agencyCard", err, loadAgency));
  if (!a) return;
  $("agName").value = a.name || ""; $("agPhone").value = a.phone || ""; $("agEmail").value = a.email || ""; $("agSite").value = a.website || ""; $("agBlurb").value = a.blurb || "";
  $("agWarn").hidden = !!String(a.name || "").trim();
}
$("agSave").onclick = async () => {
  try {
    await api("/api/agency", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: $("agName").value, phone: $("agPhone").value, email: $("agEmail").value, website: $("agSite").value, blurb: $("agBlurb").value }) });
    say("agMsg", "Saved."); loadAgency();
  } catch (err) { say("agMsg", err.message, true); }
};
let dncTyping;
async function loadDnc() {
  const d = await api("/api/dnc?search=" + encodeURIComponent($("dncSearch").value || "")).catch((err) => cardFail("dncCard", err, loadDnc));
  if (!d) return;
  $("dncCount").textContent = num(d.total) + " entries · " + num(d.businessesHidden) + " businesses hidden";
  const KIND_WORDS = { phone: "phone", email: "email", domain: "website", website: "website" };
  $("dncRows").innerHTML = d.results.length ? d.results.map((r) => "<tr><td>" + esc(r.display || (r.kind === "phone" ? phoneText(r.value) : r.value)) + ' <span class="muted">(' + esc(KIND_WORDS[r.kind] || r.kind) + ")</span>" + (r.note ? '<div class="cellnote muted">' + esc(r.note) + "</div>" : "") +
    "</td><td>" + esc(d.reasons[r.reason] || r.reason) + "</td><td>" + esc(ago(r.created_at)) + (r.added_by ? ' <span class="muted">by ' + esc(r.added_by) + "</span>" : "") + "</td><td>" +
    (me && me.role !== "member" ? '<button type="button" class="ghost small danger" data-dnc-del="' + esc(r.id) + '">Remove</button>' : "") + "</td></tr>").join("")
    : '<tr><td colspan="4" class="muted">Nothing on the list' + ($("dncSearch").value ? " matches" : " yet") + ".</td></tr>";
}
$("dncAdd").onclick = async () => {
  say("dncMsg", "Adding…");
  try {
    const r = await postJson("/api/dnc", { text: $("dncText").value, reason: $("dncReason").value, note: $("dncNote").value });
    say("dncMsg", "Added " + num(r.added) + " (" + num(r.phones) + " phones, " + num(r.emails) + " emails, " + num(r.domains) + " websites). " + num(r.businessesHidden) + " businesses are hidden now.");
    $("dncText").value = ""; loadDnc();
  } catch (err) { say("dncMsg", err.message, true); }
};
$("dncSearch").oninput = () => { clearTimeout(dncTyping); dncTyping = setTimeout(loadDnc, 300); };
$("dncRows").onclick = async (e) => {
  const b = e.target.closest("[data-dnc-del]"); if (!b || !(await ask("Take this off the do-not-contact list?", "Matching businesses show in lists and downloads again.", "Take it off", { danger: true }))) return;
  await api("/api/dnc/" + b.dataset.dncDel, { method: "DELETE" }).catch((err) => toast(err.message, "bad")); loadDnc();
};
async function loadFree() {
  loadAgency();
  loadGhlCols();
  loadDnc();
  loadHarvest();
  loadSites();
  loadApi();
  loadWeightsUi();
  const d = await api("/api/free/status").catch((err) => cardFail("freeCard", err, loadFree));
  if (!d) return;
  freeState = d; harvestWarn();
  const seenMin = d.collectorSeenAt ? (Date.now() - new Date(d.collectorSeenAt.replace(" ", "T") + "Z")) / 60000 : null;
  $("freeNow").innerHTML = (seenMin != null && seenMin < 30 ? '<span class="pill ok">Collector checked in ' + esc(ago(d.collectorSeenAt)) + "</span> "
      : '<span class="pill warn">' + (d.collectorSeenAt ? "Collector last checked in " + esc(ago(d.collectorSeenAt)) : "Collector hasn’t checked in yet") + "</span> ") +
    num(d.savedToday) + " saved today" + (d.leftToday != null ? " · " + num(d.leftToday) + " more allowed today" : "") + (d.waiting ? " · " + num(d.waiting) + " waiting to be saved" : "");
  if (document.activeElement !== $("freeLimit")) $("freeLimit").value = d.limit;
  $("freeLimitSave").disabled = me.role !== "super_admin";
  $("freeRows").innerHTML = d.imports.length ? d.imports.map((i) => {
    // A repeat of an earlier collection is marked as such (nothing new was saved from it).
    const dup = /^duplicate of/i.test(String(i.error || ""));
    return "<tr><td>" + esc(ago(i.created_at)) + (i.release ? ' <span class="muted">(map data from ' + esc(fmtDay(i.release.slice(0, 10))) + ")</span>" : "") + "</td><td>" +
    '<span class="pill ' + (dup ? "" : i.status === "done" ? "ok" : i.status === "failed" ? "bad" : "warn") + '" title="' + esc(i.error || "") + '">' +
    esc(dup ? "Repeat (skipped)" : { queued: "Waiting for the collector", claimed: "Starting", collecting: "Collecting", received: "Saving", done: "Done", failed: "Failed" }[i.status] || i.status) + "</span></td><td>" + (dup ? '<span class="muted">—</span>' : num(i.rows_received)) + "</td><td>" +
    (i.status === "failed" && !dup ? '<button type="button" class="ghost small" data-dispatch="' + esc(i.id) + '">Try again</button>' : "") + "</td></tr>" +
    (i.error ? '<tr class="noterow"><td colspan="4" class="hint" title="' + esc(i.error) + '">' + esc(plainImportError(i.error)) + "</td></tr>" : "");
  }).join("")
    : '<tr><td colspan="4" class="muted">No free collections yet.</td></tr>';
}
/** Collector notes in plain words ("Duplicate of 902699cd" -> the same as an earlier collection). */
function plainImportError(e) {
  const s = String(e || "");
  if (/^duplicate of/i.test(s)) return "Same as an earlier collection, so nothing new was saved.";
  return s;
}
$("freeRows").onclick = async (e) => {
  const b = e.target.closest("[data-dispatch]"); if (!b) return;
  b.disabled = true;
  try { const r = await postJson("/api/free/imports/" + b.dataset.dispatch + "/dispatch", {}); toast(r.ok ? (r.note || "Queued.") : r.error, r.ok ? "ok" : "bad"); } catch (err) { toast(err.message, "bad"); }
  loadFree();
};
$("freeLimitSave").onclick = async () => {
  say("freeMsg", "Saving…");
  try { await api("/api/free/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ dailyLimit: Number($("freeLimit").value) }) }); say("freeMsg", "Saved."); loadFree(); }
  catch (err) { say("freeMsg", err.message, true); }
};

let activityPage = 1, activityUsersLoaded = false;
function detailText(d) {
  if (!d || typeof d !== "object") return "";
  const parts = [];
  if (d.types) parts.push(d.types.join(", "));
  if (d.places) parts.push("in " + d.places.join(", "));
  if (d.searches) parts.push(d.searches + " search" + (d.searches > 1 ? "es" : ""));
  if (d.maxResults) parts.push("up to " + d.maxResults);
  if (d.estimatedCostUsd != null) parts.push("est. " + money(d.estimatedCostUsd));
  if (d.costUsd != null) parts.push(money(d.costUsd));
  if (d.checkPhones) parts.push("with phone checks");
  if (d.name) parts.push(d.name);
  if (d.role) parts.push("role: " + d.role);
  if (d.active != null) parts.push(d.active ? "switched on" : "switched off");
  if (d.undo) parts.push("undo");
  if (d.passwordReset) parts.push("password reset");
  if (d.reason) parts.push(d.reason);
  if (d.count != null) parts.push(num(d.count) + " number" + (d.count === 1 ? "" : "s"));
  if (d.recheck) parts.push("checked again");
  if (d.maxCostUsd != null) parts.push("up to " + money(d.maxCostUsd));
  if (d.filters) {
    const fl = Object.entries(d.filters).filter(([k]) => !["page", "sort", "dir", "search_id"].includes(k));
    const scoped = d.filters.search_id ? String(d.filters.search_id).split(", ").length : 0;
    parts.push((scoped ? "from " + scoped + " search" + (scoped > 1 ? "es" : "") + "; " : "") + (fl.length ? fl.map(([k, v]) => (FILTER_WORDS[k] || k.replace(/_/g, " ")) + ": " + (k === "area" ? "yes" : v)).join("; ") : "all businesses"));
  }
  return parts.join(" · ");
}
async function loadActivity() {
  if (!activityUsersLoaded) {
    const users = await api("/api/admin/users").catch(() => []);
    // Everyone who can act, the owner included (the owner's actions are recorded too).
    $("aUser").innerHTML = '<option value="">Everyone</option>' + users.map((u) => '<option value="' + esc(u.id) + '">' + esc(u.name || "Unnamed") + (u.role === "super_admin" ? " (owner)" : "") + "</option>").join("");
    activityUsersLoaded = true;
  }
  const p = new URLSearchParams({ page: activityPage });
  if ($("aUser").value) p.set("user", $("aUser").value);
  if ($("aAction").value) p.set("action", $("aAction").value);
  if ($("aFrom").value) p.set("from", $("aFrom").value);
  if ($("aTo").value) p.set("to", $("aTo").value);
  p.set("tzo", String(new Date().getTimezoneOffset())); // From / To are days on this computer’s clock
  const data = await api("/api/admin/audit?" + p);
  const current = $("aAction").value;
  $("aAction").innerHTML = '<option value="">Any</option>' + data.actions.map((a) => '<option value="' + esc(a) + '"' + (a === current ? " selected" : "") + ">" + esc(ACTION_LABELS[a] || a) + "</option>").join("");
  $("activityRows").innerHTML = data.results.length ? data.results.map((r) => '<tr><td class="muted">' + esc(fmtTime(r.at)) + "</td><td><b>" + esc(r.user_name || "Unnamed") +
    "</b></td><td>" + esc(ACTION_LABELS[r.action] || String(r.action).replace(/_/g, " ")) + '</td><td style="white-space:normal">' + esc(r.summary || detailText(r.details)) + "</td></tr>").join("")
    : '<tr><td colspan="4" class="empty-state">No activity yet.</td></tr>';
  const pages = Math.max(1, Math.ceil(data.total / 100));
  $("activityCount").textContent = data.total.toLocaleString() + " entries · page " + data.page + " of " + pages;
  $("aPrev").disabled = data.page <= 1; $("aNext").disabled = data.page >= pages;
}
["aUser", "aAction", "aFrom", "aTo"].forEach((id) => $(id).onchange = () => { activityPage = 1; loadActivity(); });
$("aPrev").onclick = () => { activityPage--; loadActivity(); };
$("aNext").onclick = () => { activityPage++; loadActivity(); };
setInterval(() => { loadNotifications(); loadSpend(); }, 60000);
(async () => {
  buildFilters();
  applySource();
  defaultFilters = { ...snapshot(), shown: false, scope: null, label: "" };
  measureHeader();
  try {
    await loadMe();
    measureHeader();
    // Opened at #database, #pipeline …: go straight there (otherwise the address says #find).
    const start = tabFromHash();
    if (start && start !== "find") setTab(start, true); else history.replaceState(null, "", "#find");
    loadNotifications(); loadSpend(); loadSaved(); loadTeam2();
    // Optional paid features show only when their key is set.
    api("/api/features").then((ft) => { features = ft || {}; $("aiLine").hidden = !ft.aiSearch; $("verifyBtn").hidden = !ft.emailVerify; }).catch(() => {});
    loadNextSteps();
    const [countries, categories] = await Promise.all([api("/api/geo/countries"), api("/api/categories")]);
    geo.countries = countries; tree = categories;
    whereCountry.refresh(); what.refresh();
    await restoreLastFind().catch(() => {});
    acWhat.render(); acWhere.render();
    measureHeader();
    // Searches I started that are still running (e.g. after reloading the page): follow them again.
    // Searches still going (not paused until tomorrow): follow them again.
    const mine = (await api("/api/searches?status=pending&status=scraping&status=ingesting&limit=50").catch(() => [])).filter(isRunning);
    const recent = mine.filter((s) => s.created_by === me.id && Date.now() - new Date(s.created_at.replace(" ", "T") + "Z") < 86400000);
    mine.forEach((s) => tracked.add(s.id));
    if (recent.length) {
      startedIds = recent.map((s) => s.id);
      pulls = mine;
      renderProgress();
      if (currentTab === "find") useScope(startedIds, recent.length === 1 ? recent[0].category + " in " + placeLabel(recent[0]) : recent.length + " searches still collecting");
    }
    phoneState = await api("/api/phones/status").catch(() => null);
    if (phoneState) setPhoneCost(phoneState.pricing);
    if (phoneState && phoneState.pending && !/paused|no_service/.test(phoneState.state)) phonesWatched = true;
    if (mine.length || phonesWatched) startPolling();
  } catch (err) { setFindMsg(err.message, true); }
})();
</script>
${THEME_SCRIPT}
</body>
</html>`;
