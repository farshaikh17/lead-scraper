// Emails for access requests, sent through Resend (the provider the store already uses).
// Off until RESEND_API_KEY is set and there's a sender: GBP_EMAIL_FROM, or the store's "Send emails from".
// The team also gets a line in the notification bell either way.

import { notify } from "../ops";
import { agencySettings } from "../report";
import { launchSettings, validEmailFrom } from "../store/launch";
import type { GbpEnv } from "./config";
import type { AccessRequest, LocationStatus, RequestLink } from "./db";

export async function senderAddress(env: GbpEnv): Promise<string> {
  if (!env.RESEND_API_KEY) return "";
  const own = String(env.GBP_EMAIL_FROM ?? "").trim();
  if (own) return validEmailFrom(own) ? own : "";
  const store = (await launchSettings(env.DB).catch(() => null))?.emailFrom ?? "";
  return validEmailFrom(store) ? store : "";
}

export const emailOn = async (env: GbpEnv) => !!(await senderAddress(env));

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Mail { to: string; subject: string; lines: string[]; items?: string[]; link?: { text: string; url: string } }

/** Plain, readable email (HTML and text versions). */
export function renderMail(m: Mail, brandName: string) {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1B2A3A;max-width:560px">
${brandName ? `<p style="font-size:18px;font-weight:bold;margin:0 0 16px">${esc(brandName)}</p>` : ""}
${m.lines.map((l) => `<p>${esc(l)}</p>`).join("")}
${m.items?.length ? `<ul>${m.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
${m.link ? `<p style="margin:24px 0"><a href="${esc(m.link.url)}" style="background:#1B2A3A;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(m.link.text)}</a></p>` : ""}</div>`;
  const text = [...m.lines, ...(m.items?.length ? ["", ...m.items.map((i) => `- ${i}`)] : []), ...(m.link ? ["", `${m.link.text}: ${m.link.url}`] : [])].join("\n");
  return { html, text };
}

async function send(env: GbpEnv, m: Mail, brandName: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const from = await senderAddress(env);
  if (!from || !m.to) return false;
  const { html, text } = renderMail(m, brandName);
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [m.to], subject: m.subject, html, text }),
  }).catch(() => null);
  if (!res || !res.ok) {
    console.error("gbp mail: resend error", res?.status ?? "unreachable");
    return false;
  }
  return true;
}

const LOC_WORDS: Record<LocationStatus, string> = { pending_invite: "invitation sent (accept it in Business Profile)", granted: "already shared", failed: "not shared" };

/** The two emails for a finished request (for the agency and for the client), and the bell line. */
export function buildMails(
  link: RequestLink, request: Pick<AccessRequest, "id" | "status" | "client_name" | "client_email" | "client_google_email">,
  rows: { title: string | null; status: LocationStatus; error_message: string | null }[], agencyEmail: string, origin: string, brandName: string,
) {
  const who = request.client_name || request.client_email || request.client_google_email || "A client";
  const ok = rows.filter((r) => r.status !== "failed").length;
  const items = rows.map((r) => `${r.title || "Business profile"}: ${LOC_WORDS[r.status]}${r.error_message ? ` (${r.error_message})` : ""}`);
  const dashboard = { text: "Open Client access", url: `${origin}/access` };
  const summary = request.status === "manual_pending"
    ? `${who} says they added ${link.agency_google_email} to their Business Profile by hand.`
    : request.status === "failed"
      ? `${who} tried to share their Business Profile through "${link.title}", but none of the invitations went through.`
      : `${who} shared ${ok} Business ${ok === 1 ? "Profile" : "Profiles"} through "${link.title}"${request.status === "partial" ? ` (${rows.length - ok} couldn't be shared)` : ""}.`;
  const agency: Mail | null = agencyEmail ? {
    to: agencyEmail,
    subject: request.status === "manual_pending" ? `Check Business Profile: ${who} added you by hand` : request.status === "failed" ? `Access request failed: ${who}` : `${who} shared Business Profile access`,
    lines: [
      summary,
      request.status === "manual_pending"
        ? `Look for Google's invitation email at ${link.agency_google_email} (or at business.google.com) and accept it, then check the request in Client access.`
        : ok ? `Google sent ${link.agency_google_email} an invitation for each one. Accept them (in the email from Google or at business.google.com), then mark them in Client access.` : "You can send the client the manual steps instead.",
      ...(request.client_google_email ? [`They signed in with Google as ${request.client_google_email}.`] : []),
    ],
    items, link: dashboard,
  } : null;
  const clientTo = request.status === "failed" ? "" : (request.client_email || request.client_google_email || "");
  const client: Mail | null = clientTo ? {
    to: clientTo,
    subject: brandName ? `Thanks, ${brandName} has your Business Profile request` : "Thanks, we have your Business Profile request",
    lines: [
      request.status === "manual_pending"
        ? `Thanks for adding ${link.agency_google_email} to your Business Profile. We'll accept the invitation and get started.`
        : `Thanks for sharing your Business Profile. Google has sent us an invitation for ${ok === 1 ? "it" : `${ok} profiles`}; we'll accept it and get started.`,
      "You can remove us at any time in Business Profile, under People and access.",
    ],
    items: request.status === "manual_pending" ? [] : items,
  } : null;
  return { agency, client, bell: summary };
}

/** Sends the emails and adds the bell line. Never throws (the client's page doesn't wait on it). */
export async function notifyFinished(env: GbpEnv, link: RequestLink, requestId: string, origin: string, fetcher: typeof fetch = fetch) {
  try {
    const request = await env.DB.prepare(`SELECT id, status, client_name, client_email, client_google_email FROM access_requests WHERE id = ?`)
      .bind(requestId).first<Pick<AccessRequest, "id" | "status" | "client_name" | "client_email" | "client_google_email">>();
    if (!request) return;
    const { results: rows } = await env.DB.prepare(`SELECT title, status, error_message FROM granted_locations WHERE request_id = ? ORDER BY id`)
      .bind(requestId).all<{ title: string | null; status: LocationStatus; error_message: string | null }>();
    const agency = await agencySettings(env);
    const m = buildMails(link, request, rows, link.notify_email || agency.email || "", origin, agency.name);
    await notify(env, { kind: "access", level: request.status === "failed" ? "warn" : "info", message: m.bell, dedupeKey: `access-${request.id}-${request.status}` });
    if (m.agency) await send(env, m.agency, agency.name, fetcher);
    if (m.client) await send(env, m.client, agency.name, fetcher);
  } catch (err) {
    console.error("gbp mail: notify failed", err instanceof Error ? err.message : "unknown");
  }
}
