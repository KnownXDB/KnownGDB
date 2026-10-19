# Roadmap

Status: foundations. The previous implementation has been removed from the
working tree. This document describes future work, not available capabilities.

## 0. Foundations

- [x] Preserve autonomy, domain policies, security, governance and licensing.
- [x] Record an architecture focused on local development.
- [x] Separate web, admin, API and platform responsibilities.
- [x] Remove the previous implementation, dependencies and configuration.

## 1. Local workspace

- React + Vite + TypeScript + Tailwind for independent web and admin applications.
- npm workspaces with small shared contracts and components.
- Simple commands for development, formatting, linting, types, tests and builds.
- Direct HMR; no Docker, local certificates or prior backend build required
  for frontend development.
- Local API with a Vite proxy; explicit, deterministic design fixtures.
- [x] Repository hygiene and secret-scanning CI, without implicit deployment.
- [x] Protected branch workflow, PR assignment and a tracking project.
- Application CI (lint, types, tests and builds) when implementing the workspace.
- Acceptance: a clean installation starts both interfaces independently,
  reflects edits through HMR and builds each application separately.

## 2. Infrastructure connection

- Inspect existing Supabase schema, migrations, Auth, RLS and permissions.
- Establish a baseline without recreating or overwriting remote data.
- Configure local access to an authorized Supabase development environment.
- Provide an official CLI option for isolated local database work.
- Worker with private R2 storage and local asset storage for development.
- Document private variables, bindings and manual Cloudflare deployment.
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
- Individual sessions, API authorization and auditing.
- Catalog, translations, releases, identity, assets and moderation.
- Real forms and operations with validation and feedback.
- Verified MFA, revocation and recovery before production use.

## 5. Publication and evolution

- Versioned API, access, plans, scopes, quotas and abuse controls.
- Validate backups, recovery, rights and policies before publication.
- Explicit, observable and recoverable deployments.
- Dedicated search, asynchronous jobs and multimedia when evidence justifies
  their operational cost.
