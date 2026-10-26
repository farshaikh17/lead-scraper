# Releasing from GitHub

Every push to `main` that changes the app is released by GitHub Actions
(`.github/workflows/deploy.yml`): type-check and tests first, then the database updates in
`migrations/`, then the internal app and the store. If a check fails, nothing is released.
You can also start it by hand: GitHub → Actions → Deploy → Run workflow.

## One-time setup (about 5 minutes)

### 1. Make a Cloudflare API token

1. Sign in at dash.cloudflare.com → the person icon (top right) → **My Profile** → **API Tokens** →
   **Create Token**.
2. Next to **Edit Cloudflare Workers**, press **Use template**.
3. Under **Permissions**, add three more rows (**+ Add more**):
   - Account · **D1** · Edit
   - Account · **Queues** · Edit
   - Account · **Workers R2 Storage** · Read
4. **Account Resources**: include only your account. **Zone Resources**: All zones (or leave the
   template's choice).
5. **Continue to summary** → **Create Token**, and copy the token (it's shown once).

### 2. Give it to GitHub

github.com/farshaikh17/lead-scraper → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, twice:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | `024a5f4e0646920e7c4557bda6ed2075` |

Paste the token straight into GitHub; it never needs to go anywhere else.

### 3. Check it

GitHub → **Actions** → **Deploy** → **Run workflow**. A green tick means it released. A red cross
at "Check the Cloudflare secrets" means a secret is missing or misspelled.

## Notes

- The app's own keys (Apify, Gemini, MillionVerifier, …) are already stored in Cloudflare as Worker
  secrets; releasing from GitHub doesn't need them.
- `.dev.vars` on a computer is only for running the app locally; it is never uploaded.
- Database updates run once each: Cloudflare remembers which `migrations/` files were applied.
