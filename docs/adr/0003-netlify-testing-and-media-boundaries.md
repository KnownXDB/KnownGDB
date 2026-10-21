# ADR 0003: Netlify testing and media boundaries

Date: 2026-10-19. Status: implemented; hosted read/browser acceptance verified on 2026-10-20.

The existing testing URL now serves web, admin and the shared API through an
explicit manual deployment. See [deployment acceptance and remaining Auth limits](../NETLIFY-TESTING.md).
The initial audit observations below describe the configuration before that deployment.

## Context

The maintainer requests a locally developed web/admin/API monorepo with a Netlify
URL for testing outside the local machine. Existing Supabase and R2 resources must
be inspected and preserved. The initial documentation placed API hosting on
Cloudflare Workers and deferred all multimedia.

## Decision

- Use the existing Netlify testing project rather than create a duplicate.
- Develop independent React/Vite web and admin applications against a shared local
  TypeScript API. A thin Netlify Functions adapter runs the same handlers remotely.
  This supersedes the previous Workers-only API hosting direction for testing.
- Preserve Cloudflare R2 as private asset storage and Supabase as PostgreSQL/Auth.
  Existing gateways are inspected before deciding whether to retain or replace them.
- Keep deployments explicit. No repository auto-build integration, automatic PR
  previews, main promotion or production-domain configuration is introduced.
- Model files, editorial assets, assignments, renditions, media references and
  moderation independently. Extend roles through typed categories, not arbitrary
  unvalidated uploads or game-table image columns.
- Use the maintainer-selected hybrid media model: external references and
  authorized original copies in R2. Preserve provenance and checksums when an
  original source is retired, delisted or deprecated. Source availability,
  preservation and public access are independent states.
- Sequence image search/upload/moderation before the video slice, but include
  both external trailers and preserved original playback in MVP acceptance.
  Define video validation, accepted codecs/containers, limits and range delivery
  before upload activation; derivatives never replace preserved originals.
- Do not infer an empty database from startup responses. Obtain a healthy schema
  inventory and reviewed baseline before applying any remote migration.

The healthy audit recovered the eight existing catalog tables and six migrations.
The next baseline must preserve these records; it is not a fresh empty-schema
installation. See the [foundation audit](../FOUNDATIONS-MVP.md).

## Consequences

Netlify Functions and local Node execution need adapter compatibility tests.
Large-file transfer must not depend on serverless request-size limits: choose a
validated upload path after inspecting the existing asset gateway and permissions.
Direct signed uploads require CORS, quarantine and sealing against late replacement.

This ADR records direction and constraints, not a deployed application, certified
schema, migration approval, storage-policy change or complete multimedia service.
