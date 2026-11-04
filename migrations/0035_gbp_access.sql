-- Google Business Profile access requests (src/access/): an agency shares a link, the client signs in
-- with Google and picks the profiles to share, and the agency's Google account is invited as a manager
-- (or owner). agency_id keeps every row to one agency; this app has one agency today ('main').

CREATE TABLE request_links (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL DEFAULT 'main',
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  welcome_text TEXT,
  access_level TEXT NOT NULL DEFAULT 'manager' CHECK (access_level IN ('manager', 'owner')),
  -- The Google account that gets invited to each profile.
  agency_google_email TEXT NOT NULL,
  -- Where the "a client shared access" emails go (empty: the agency email in Settings).
  notify_email TEXT,
  logo_url TEXT,
  brand_color TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX request_links_agency ON request_links (agency_id, created_at);

CREATE TABLE access_requests (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL DEFAULT 'main',
  link_id TEXT NOT NULL REFERENCES request_links (id) ON DELETE CASCADE,
  client_name TEXT,
  client_email TEXT,
  client_google_email TEXT,
  status TEXT NOT NULL DEFAULT 'opened' CHECK (status IN ('opened', 'authorized', 'granted', 'partial', 'failed', 'manual_pending')),
  error_message TEXT,
  -- The profiles Google listed for the client (JSON), so "Grant access" only accepts ones from this list.
  listing_json TEXT,
  mode TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX access_requests_agency ON access_requests (agency_id, status, created_at);
CREATE INDEX access_requests_link ON access_requests (link_id);

CREATE TABLE granted_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES access_requests (id) ON DELETE CASCADE,
  gbp_account_name TEXT NOT NULL,
  gbp_location_name TEXT NOT NULL,
  title TEXT,
  address TEXT,
  -- pending_invite: Google sent the invitation (the agency still has to accept it in Business Profile).
  status TEXT NOT NULL DEFAULT 'pending_invite' CHECK (status IN ('pending_invite', 'granted', 'failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (request_id, gbp_location_name)
);

-- Only while a client is choosing profiles: deleted when the grant finishes (and after an hour anyway).
CREATE TABLE oauth_tokens (
  request_id TEXT PRIMARY KEY REFERENCES access_requests (id) ON DELETE CASCADE,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
