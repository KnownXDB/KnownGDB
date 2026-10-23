# KnownGDB

**Known Games DataBase** is an independent canonical video game catalog,
identity service and curated asset platform.

## Status

Executable local foundation: independent React/Vite web and admin applications,
a shared TypeScript API, domain-policy tests and a Netlify Functions adapter.
Search can read the existing published catalog when private API configuration is
provided. Email/password sign-in, registration and an editable public contributor
name are implemented through the API. Paginated version history and explicit
Super Admin publication/withdrawal with audit reasons are implemented. See
[publication boundaries](docs/adr/0009-explicit-version-publication.md).
Local image previews and original downloads use verified private R2 reads through
the API; see [delivery boundaries](docs/adr/0010-verified-original-image-delivery.md)
for formats, limits and acceptance scope. Hosted read-only delivery was accepted
on 2026-10-21. Image submission/revision forms and explicit moderation are now
implemented locally; their additive migration and real-service acceptance remain
pending. See [submission acceptance](docs/ASSET-SUBMISSION-ACCEPTANCE.md). Premium
product interfaces and video transport remain planned. This is not the complete MVP.

The existing Supabase database and private Cloudflare R2 bucket remain in place.
An additive history/credit migration preserves the existing game and six legacy
asset rows and designates the verified existing administrator as Super Admin.
R2 originals have not been moved, overwritten or deleted. The seven-object
inventory is [reconciled](docs/STORAGE-RECONCILIATION.md): six registered originals
and one retained incomplete upload. Six verified copies are now linked to private
versions; legacy originals and published rows remain unchanged. See the
[import acceptance](docs/LEGACY-IMPORT-RUNBOOK.md).
Earlier schema migrations are recovered
for local replay; never replay them against or reset the existing remote database.

## Local development

With Node.js 22.12+ installed, run `npm ci --ignore-scripts`, then `npm run dev`.
Web runs at `http://127.0.0.1:5173/`, admin at
`http://127.0.0.1:5174/admin/` and API at `http://127.0.0.1:8787/api/v1/health`.
Frontend edits use HMR without a backend build or Docker. Run each separately
with `npm run dev:web`, `npm run dev:admin` or `npm run dev:api`.

For real catalog reads, copy `.env.example` to ignored `.env` and configure the
private API credentials locally. Run `npm run setup:session` for persistent
HttpOnly account sessions. Never use a Vite-prefixed secret. Restart the
API after changing its environment. `npm run check` runs formatting, types,
tests and builds. See [local setup](docs/LOCAL-DEVELOPMENT.md).

`npm run db:test` verifies migration replay on disposable PostgreSQL without
Docker. Full Supabase Auth/API/mail startup uses `npm run db:start` and requires
a Docker-compatible runtime. See [database scope](supabase/README.md) for
provenance, the local replay adaptation and full-stack validation limits.
After starting the stack, run `npm run db:configure:local` and `npm run dev:local`
for isolated web/admin/API development. Hosted `.env` settings remain unchanged.

## Development direction

- Public web: React, Vite, TypeScript and Tailwind CSS.
- Administration: a separate React/Vite application with a premium interface.
- API: shared TypeScript handlers developed locally, with a Netlify Functions
  adapter for explicitly deployed external testing.
- Database and authentication: Supabase, using its official tooling and SDK.
- Private immutable asset storage: Cloudflare R2.
- Source control and verification: GitHub.

Prioritize fast local development, independent frontend startup and short feedback
loops. Build and check locally, then push. Deployment is a separate explicit step.
Docker and a cloud deployment must not be prerequisites for frontend development.
An optional isolated local Supabase environment supports database work.

The API is the only external boundary for catalog and asset data. Administrative
authorization belongs on the server. Game identity is independent of releases,
consumers, distribution channels and external identifiers.

## Documentation

- [External Netlify testing](docs/NETLIFY-TESTING.md)
- [Roadmap](ROADMAP.md)
- [Architecture](docs/architecture/overview.md)
- [Local workflow](docs/LOCAL-DEVELOPMENT.md)
- [Product policies](docs/PRODUCT-PLAN.md)
- [Architecture decision](docs/adr/0001-local-first-foundations.md)
- [Agent instructions](AGENTS.md)
- [Security](SECURITY.md)
- [Governance](GOVERNANCE.md)
- [Contributing](CONTRIBUTING.md)
- [Git workflow and tracking](docs/GIT-WORKFLOW.md)
- [Foundations audit and MVP execution plan](docs/FOUNDATIONS-MVP.md)
- [Netlify testing decision](docs/adr/0003-netlify-testing-and-media-boundaries.md)

## License

Original code and documentation: [MIT](LICENSE), Mauricio Vuljevas.
This license does not grant rights to third-party data, media or trademarks.
