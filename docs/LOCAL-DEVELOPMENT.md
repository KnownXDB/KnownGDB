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
admin screen intentionally does not simulate an authenticated session or expose
editing/upload forms before their authorized API flow is implemented.

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
