# Roadmap

Status: executable local foundation. Checked items are implemented and locally
verified; unchecked items remain planned. This is not a production-ready MVP.

## 0. Foundations

- [x] Preserve autonomy, domain policies, security, governance and licensing.
- [x] Record an architecture focused on local development.
- [x] Separate web, admin, API and platform responsibilities.
- [x] Remove the previous implementation, dependencies and configuration.

## 1. Local workspace

- [x] React + Vite + TypeScript + Tailwind for independent web and admin applications.
- [x] npm workspaces with small shared contracts and components.
- [x] Commands for development, formatting, source policy, types, tests and builds.
- [x] Direct HMR; no Docker, local certificates or prior backend build required
  for frontend development.
- [x] Local API with a Vite proxy and real published-catalog search.
- [ ] Explicit deterministic design fixtures for future premium screens.
- [x] Repository hygiene and secret-scanning CI, without implicit deployment.
- [x] Protected branch workflow, PR assignment and a tracking project.
- [x] Application CI for formatting, source policy, types, tests and builds.
- Acceptance: a clean installation starts both interfaces independently,
  reflects edits through HMR and builds each application separately.

## 2. Infrastructure connection

- [x] Inspect existing Supabase schema, migrations, Auth, RLS and permissions.
- [x] Recover the six earlier schema migrations and verify their provenance.
- [x] Replay all seven migrations and verify guards/RLS in disposable PostgreSQL.
- [x] Configure private local API access to the existing Supabase catalog.
- [x] Complete isolated database startup using the official CLI and reviewed baseline.
- [x] Shared local TypeScript API and Netlify Functions testing adapter.
- [x] Preserve private R2 storage and ignore local asset/runtime data.
- [x] Reconcile the seven existing R2 objects with legacy database asset rows.
  See [read-only findings](docs/STORAGE-RECONCILIATION.md): six registered originals
  and one retained expired incomplete upload; all seven body hashes verified.
- [ ] Review and implement legacy-to-version backfill while preserving originals,
  credit, language metadata, review evidence and historical timestamps.
- [ ] Reuse the existing Netlify testing project; verify explicitly deployed web,
  admin and API URLs without enabling automatic repository builds.
- [x] Document private runtime variables and storage permission boundaries.
- Acceptance: real API reads with verified permissions; negative authorization
  tests; no privileged credentials in frontend bundles.

## 3. Public experience

- Define tokens, typography, navigation, density and responsive states.
- Asset-focused visual catalog: search, filters, galleries and detail views.
- Distinguish Game, releases, languages, provenance and publication status.
- Empty, loading and error states; verified accessibility, keyboard use and contrast.
- Premium design with its own identity and authorized content.

## 4. Administration

- Distinct premium design, navigation and build independent of the public web.
- [x] Individual sign-in, email recovery, persistent HttpOnly sessions and server role checks.
- [x] Contributor public names and immutable asset history/credit schema.
- [ ] Administrative operation auditing and complete publication/moderation workflows.
- Catalog, translations, releases, identity, assets and moderation.
- Real forms and operations with validation and feedback.
- Hybrid trailer references and approved preserved R2 originals, with source
  availability independent of retention, rights and public access.
- Video allowlist validation and range-capable original playback/download;
  preservation must survive source retirement without losing provenance.
- Verified MFA, revocation and recovery before production use.

## 5. Publication and evolution

- Versioned API, access, plans, scopes, quotas and abuse controls.
- Validate backups, recovery, rights and policies before publication.
- Explicit, observable and recoverable deployments.
- Dedicated search, asynchronous jobs and multimedia when evidence justifies
  their operational cost.
