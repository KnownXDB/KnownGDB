# Architecture

KnownGDB is an autonomous catalog, identity and asset product. Its architecture
prioritizes development speed and a stable API boundary. This revision defines
responsibilities; the applications are not implemented yet.

## Planned structure

```text
apps/
  web/             React + Vite: public experience
  admin/           React + Vite: independent administration
  api/             TypeScript: API on Cloudflare Workers
packages/
  contracts/       DTOs, validation and typed HTTP client
  ui/              Shared tokens and UI primitives
supabase/          Configuration, reviewed baseline and future migrations
docs/             Rules and decisions
```

Do not create empty packages or generic layers before they are needed. Shared
primitives and contracts avoid duplication; web and admin retain their own
navigation, features, entry points and deployments. Administrative code never
ships in the public bundle. npm workspaces simplifies installation and scripts.

## Development and hosting

Vite serves each frontend with HMR. A local proxy directs `/api` to the backend;
editing a screen does not require local HTTPS, Docker or a prior server rebuild.
The Worker runs using official Cloudflare tools. Supabase provides PostgreSQL
and Auth; R2 stores private files. Cloudflare hosts static frontends and the API;
GitHub hosts source code and checks.

Two explicit modes: interfaces using local design fixtures, or real integration
through the API. Fixtures do not simulate persistence or successful remote writes.
For integration, connect to an authorized development Supabase environment; for
isolated schema work, use the local CLI and its optional runtime. Never point
destructive operations at a shared database to speed up development.

Local builds and pushes do not imply deployment. Never deploy or migrate
production automatically. Verify real identifiers, domains and bindings when
connecting each environment; this documentation does not invent remote settings.

## Access boundary

Web, admin and external consumers access catalog and assets through `/api/v1`.
The backend uses the Supabase SDK for data access. Admin may use the official SDK
exclusively for Auth with publishable configuration; the API validates sessions
and permissions on every operation. The concrete session, CSRF, MFA and revocation
strategy requires an ADR and security review before implementation.

Privileged keys and R2 bindings remain server-side. Do not enable direct table
access as a shortcut. RLS and explicit grants complement backend authorization.
Files are served through the API or temporary permissions it issues after
checking access and publication status.

## Domain

- Game: stable internal ID; names and providers do not define identity.
- GameLocalization: titles, aliases and descriptions by language.
- Release: platform, edition, region and date with explicit precision.
- Organization and Genre: independent entities with relationships and translations.
- ExternalIdentity and IdentityDecision: source, evidence, confidence, review and
  result; matching names alone do not justify merging games.
- Assets: immutable file, editorial piece and assignment are separate concepts.
  Assignments specify Game or Release, role, languages, region, context and validity.
- Moderation, publication and validity are independent states.
- Access: collaboration, commercial plans and permissions are separate concepts.
- Audit: verifiable author, date, reason and sensitive changes.

Initial modules live within a small API. Separate processes and services only
when measured needs justify them. Do not copy the previous structure or build
internal frameworks for hypothetical future requirements.

## Visual direction

Web: visual catalog, prominent search, clear filters, asset galleries, canonical
details and considered editorial hierarchy. Admin: a premium work environment
with readable tables, clear forms, review flows and immediate feedback.
Both interfaces have their own identity, coherent tokens, accessibility and
responsive states. Do not use external brands, references or assets as product
identity. Visual design will take place during implementation.
