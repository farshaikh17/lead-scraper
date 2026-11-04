// Emails for access requests, sent through Resend (the provider the store already uses).
// Off until RESEND_API_KEY is set and there's a sender: GBP_EMAIL_FROM, or the store's "Send emails from".

import { launchSettings, validEmailFrom } from "../store/launch";
import type { GbpEnv } from "./config";

export async function senderAddress(env: GbpEnv): Promise<string> {
  if (!env.RESEND_API_KEY) return "";
  const own = String(env.GBP_EMAIL_FROM ?? "").trim();
  if (own) return validEmailFrom(own) ? own : "";
  const store = (await launchSettings(env.DB).catch(() => null))?.emailFrom ?? "";
  return validEmailFrom(store) ? store : "";
}

export const emailOn = async (env: GbpEnv) => !!(await senderAddress(env));
