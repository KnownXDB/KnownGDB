# Architecture

KnownGDB is an autonomous catalog, identity and asset product. Its architecture
prioritizes development speed and a stable API boundary. This revision defines
responsibilities. The executable web/admin/API foundation is implemented; full
product interfaces and ingestion remain pending. Version metadata history and
explicit Super Admin publication are implemented; see
[ADR 0009](../adr/0009-explicit-version-publication.md).

## Workspace structure

Web and admin now use [dedicated task views](../adr/0013-task-oriented-workspaces.md)
instead of rendering every form simultaneously. The game editor preserves one
draft across its sections; game visibility and asset moderation remain separate
actions using the existing API.

```text
apps/
  web/             React + Vite: public experience
  admin/           React + Vite: independent administration
  api/             Shared TypeScript API handlers
packages/
  contracts/       Shared domain types and role taxonomy
  ui/              Account/recovery components and shared workspace styling
supabase/          Recovered migrations, local stack configuration and SQL tests
netlify/           Thin Functions adapter for external testing
docs/             Rules and decisions
```

Do not create empty packages or generic layers before they are needed. Shared
primitives and contracts avoid duplication; web and admin retain their own
navigation, features, entry points and deployments. Administrative code never
ships in the public bundle. npm workspaces simplifies installation and scripts.

## Development and hosting

Vite serves each frontend with HMR. A local proxy directs `/api` to the backend;
editing a screen does not require local HTTPS, Docker or a prior server rebuild.
Local Node execution and a thin Netlify Functions adapter use the same API
handlers. Supabase provides PostgreSQL and Auth; Cloudflare R2 stores private
files. Netlify hosts explicitly deployed web/admin/API testing builds; GitHub
hosts source code and checks. See
[ADR 0003](../adr/0003-netlify-testing-and-media-boundaries.md).

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
The backend uses the Supabase SDK for data and Auth. Both frontends use same-origin
API requests; normal Auth tokens stay inside encrypted HttpOnly cookies. The API
validates identity and current administrative membership. See
[ADR 0006](../adr/0006-persistent-account-sessions.md) for expiry, renewal, CSRF,
recovery and remaining revocation/MFA requirements before production.

Privileged keys and R2 bindings remain server-side. Do not enable direct table
access as a shortcut. RLS and explicit grants complement backend authorization.
Files are served through the API or temporary permissions it issues after
checking access and publication status.

## Domain

- Catalog item: immutable internal ID; names and providers do not define identity.
  Item types include game, demo, playtest, DLC, expansion, remake, remaster,
  edition, bundle, season pass and soundtrack. Related products keep their own
  IDs and are connected by reviewed directed relations.
- GameLocalization: titles, aliases and descriptions by language.
- Release: platform, edition, region and date with explicit precision.
- Organization and Genre: independent entities with relationships and translations.
- ExternalIdentity and IdentityDecision: source, evidence, confidence, review and
  result; matching names alone do not justify merging games.
- StoreListing and StoreOffer: storefront page, edition or purchasable offer
  attached to the correct catalog item and release; a store ID never replaces
  the KnownGDB identity.
- Official store connectors construct provider URLs server-side and preserve
  Store ID, Xbox Title ID, service configuration ID and other namespaces as
  separate reviewed external identities.
- Epic Store slugs, namespaces, catalog item IDs and offer IDs are likewise
  separate provider identities; missing page evidence is not inferred.
- EA publisher series and game slugs remain separate from EA product codes,
  account identifiers and any future app catalog namespace.
- Ubisoft regional Store slugs, product IDs and SKUs remain separate identities;
  activation keys and account values are never used as catalog identity.
- PlayStation Concept IDs and regional Product IDs remain separate identities;
  editions, DLC and bundles require their own reviewed product observations.
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
