// Talking to Google Business Profile (or pretending to, in mock mode).
//
// From Google's reference (checked 2026-11-03):
//   accounts.list            GET  https://mybusinessaccountmanagement.googleapis.com/v1/accounts          (pageSize max 20)
//   accounts.locations.list  GET  https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations
//                                 (readMask required, pageSize max 100)
//   locations.admins.create  POST https://mybusinessaccountmanagement.googleapis.com/v1/{location}/admins
//                                 body { admin: "<email>", role: "MANAGER" | "OWNER" }
// admins.create *invites* the person: they get access only after accepting, so a successful call is
// "pending_invite" (Admin.pendingInvitation = true), not "granted". Until Google approves the Cloud
// project for the Business Profile APIs its quota is 0 requests a minute, so calls are refused.

import type { AccessLevel, LocationStatus } from "./db";

export interface GbpLocation { name: string; title: string; address: string }
export interface GbpAccount { name: string; accountName: string; type: string; locations: GbpLocation[] }
export interface InviteResult { status: LocationStatus; error?: string }

/** Google refused because the project isn't approved / the API isn't switched on: use the manual guide. */
export class NotApprovedError extends Error {}
/** Any other problem reading from Google (shown to the client in plain words). */
export class GoogleError extends Error {
  constructor(message: string, public httpStatus = 0) {
    super(message);
  }
}

export interface GbpProvider {
  listAccounts(): Promise<GbpAccount[]>;
  invite(locationName: string, email: string, level: AccessLevel): Promise<InviteResult>;
}

export const roleFor = (level: AccessLevel) => (level === "owner" ? "OWNER" : "MANAGER");

// --- Mock mode: sample profiles, and a sample of each kind of result -----------------------------

export const MOCK_GOOGLE_EMAIL = "sample.client@example.com";

export const MOCK_ACCOUNTS: GbpAccount[] = [
  {
    name: "accounts/1000001", accountName: "Sample Bakery (personal account)", type: "PERSONAL",
    locations: [
      { name: "locations/2000001", title: "Sample Bakery – Main Street", address: "12 Main St, Springfield, IL 62701" },
      { name: "locations/2000002", title: "Sample Bakery – Riverside (already shared)", address: "88 River Rd, Springfield, IL 62702" },
    ],
  },
  {
    name: "accounts/1000002", accountName: "Sample Group (business account)", type: "LOCATION_GROUP",
    locations: [
      { name: "locations/2000003", title: "Sample Catering", address: "5 Market Sq, Springfield, IL 62703" },
      { name: "locations/2000004", title: "Sample Pop-up (fails in test mode)", address: "" },
    ],
  },
];

export const mockProvider: GbpProvider = {
  async listAccounts() {
    return structuredClone(MOCK_ACCOUNTS);
  },
  async invite(locationName) {
    if (locationName === "locations/2000002") return { status: "granted" };
    if (locationName === "locations/2000004") return { status: "failed", error: "Google refused this one (a sample failure in test mode)." };
    return { status: "pending_invite" };
  },
};
