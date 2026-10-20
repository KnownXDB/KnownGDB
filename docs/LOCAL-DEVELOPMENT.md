# Local development

## Requirements

Use Node.js 22.12 or newer and npm. Install the pinned workspace dependencies with
`npm ci --ignore-scripts`. Docker is not needed for either frontend or the local API.

## Start

Run `npm run dev` from the repository root:

- Public web: http://127.0.0.1:5173/
- Administration: http://127.0.0.1:5174/admin/
- API health: http://127.0.0.1:8787/api/v1/health

Start independently with `npm run dev:web`, `npm run dev:admin` and
`npm run dev:api`. Both Vite applications proxy `/api` to port 8787. Changes use
HMR; there is no server build prerequisite. Stop the combined process with Ctrl+C.

These are executable development workspaces, not the finished premium product.
The public screen searches published games when the backend is configured. The
admin screen verifies administrative membership after sign-in. Both applications
support a public contributor name; upload and moderation forms remain pending.

## Contributor accounts

Use an existing confirmed Supabase email/password account to sign in through
either workspace. Public registration follows the project's existing confirmation
and email-delivery configuration. It does not grant administrative membership.
Choose a public display name after sign-in and select **Save public profile**.
The name becomes the credit label for personal assets; it is not a unique handle.

Run `npm run setup:session` once to generate a private key in the ignored `.env`,
then restart the API. Sign-in sets an encrypted HttpOnly cookie that survives
reloads for up to seven days, with backend token renewal. Sign out expires the
cookie and requests remote session revocation. Local frontends on the same host
share the cookie; different hostnames use separate sessions.
Do not share passwords or tokens with the agent. To verify with a real account,
sign in manually, save your chosen name, reload, sign in again and confirm it
persisted. Confirm the admin screen reports your actual role. No test profile
or account is created automatically. See [session design](adr/0005-account-session-boundary.md)
and [persistent sessions](adr/0006-persistent-account-sessions.md)
for production requirements and the access-token revocation limitation.

### Password recovery

Set `ACCOUNT_RECOVERY_URL` in the ignored root `.env` to the exact frontend
callback, such as `http://127.0.0.1:5173/?recovery=1`. If using another local port,
use that port consistently. Restart the API. Add that exact URL to Supabase Auth
URL Configuration > Redirect URLs without replacing existing URLs or Site URL.
Do not use wildcard redirects. A missing allowlist entry can send users to the
configured Site URL instead of the local recovery screen.

Select **Forgot password?**, enter your existing account email, and select
**Send recovery email**. Open the email link on this machine while the local
frontend and API are running. Enter matching new passwords, then sign in normally.
Invalid/expired links offer another recovery request. SMTP and rate limits use
the project's existing settings. Delivery and the real password change require
manual acceptance; automated checks do not send emails or change hosted passwords.

## Private database connection

Copy `.env.example` to `.env`. It is ignored by Git. Set `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` locally. Use a real server secret from the project's
Settings > API Keys, never a publishable key or a placeholder. Do not paste keys
in chat or prefix server secrets with `VITE_`. Restart the API after changing `.env`.
The combined launcher filters infrastructure credentials from frontend processes;
Vite does not load the root `.env`. Neither frontend imports the privileged SDK.

Without configuration, health still works and catalog reads return a clear 503.
Invalid remote credentials also fail closed. A configured flag does not prove a
successful database connection. The browser never queries catalog tables directly.

The existing Netlify environment configuration did not authenticate the inspected
catalog request; it is not automatically exported or copied into this checkout.
The official Supabase CLI needs its own authenticated session if used for project
management. The connected Supabase tool session does not imply a CLI session.

## Checks and builds

`npm run check` runs format verification, type checks, source-policy/API/domain
unit tests and both production builds. `npm run build` assembles `dist/site`,
with the admin application under `admin/`. Generated output remains ignored.
CI performs the same checks without production credentials. No command here
publishes, deploys or applies remote migrations automatically.

## Database and storage

The existing catalog was extended with immutable asset versions, public contributor
profiles, publication identities and a guarded Super Admin designation. The
existing game, six legacy asset rows and all R2 originals were preserved.

See [migration scope](../supabase/README.md) before isolated database work. The
older remote baseline must be recovered before claiming complete local Supabase
bootstrap support; do not run a database reset. R2 uploads and reconciliation of
the seven existing objects remain separate work. No cloud data is needed to edit
or build the frontends or run the local API policy tests.
