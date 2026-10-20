# Foundations and MVP execution plan

Status: executable local foundation plus implementation plan and bounded
infrastructure audit, not a completed MVP. The infrastructure table below records
the initial audit snapshot; subsequent changes are listed separately.
Initial audit: 2026-10-19. Implementation status updated 2026-10-20.
All repository and interface copy is English.

## Implemented foundation slice

- Independent React/Vite/Tailwind web and admin development workspaces and builds.
- Shared TypeScript API with health, role taxonomy, published catalog search and
  server-verified administrative session introspection.
- Email/password accounts, recovery, public contributor names and encrypted
  HttpOnly sessions with backend renewal and one-request account restoration.
- Domain rules for canonical R2 keys, languages, temporal selection and credit.
- Additive database migration with immutable collections/versions, registered
  public profiles, audit events and the verified existing Super Admin role.
- Existing title, six legacy database assets and all R2 objects preserved.
- Netlify cleanup removed 19 old deploys; zero remain and the site URL is retained.
- Formatting, types, repository/API/domain tests and independent builds pass.

Real published-catalog reads and browser search were verified. The maintainer
confirmed real password recovery, Super Admin sign-in and session persistence.
Automated browser checks use isolated Auth responses and do not create cloud users.
The isolated database bootstrap also passed real local Auth/REST and browser mail
flows; disposable acceptance accounts were removed and that stack was stopped.
[Storage reconciliation](STORAGE-RECONCILIATION.md) verified all seven originals:
six registered assets and one retained expired incomplete upload. Publishing
forms, upload finalization and the finished premium interfaces remain future
feature slices. The subsequent authorized legacy import created six verified
copies and private versions/mappings while preserving all original objects and
legacy rows. Version publication and API read integration remain pending.

## Product outcome

A contributor can search for a canonical game, inspect approved assets, submit
an original file with provenance and rights, and see the submission status.
An authorized moderator can review it, record a decision and publish an approved
assignment. External consumers retrieve only published catalog data and eligible
assets through the versioned API.

Reference images provided in chat inform search prominence, browsing density and
navigation only. Do not copy their identity, copy, catalog, imagery or references
into repository content or the product.

## Verified infrastructure

| Resource | Observed state | Consequence |
| --- | --- | --- |
| Netlify project `knowngdb` | Existing project; no connected repository or published deploy | Reuse it; do not create a duplicate or enable automatic Git builds |
| `https://knowngdb.netlify.app` | `/`, `/admin/` and `/api/v1/health` return 404 | A project URL exists; no running preview has been demonstrated |
| Supabase | Restored from inactive to ACTIVE_HEALTHY | Schema inspection completed after recovery; data preserved |
| Application schema | 8 catalog tables, 6 migrations and 1 game after recovery | Evolve the existing schema; do not replay or replace its baseline |
| R2 `knowngdb` | 7 objects, approximately 4.21 MB; public development URL disabled; no custom domains | Preserve existing objects and private access |
| R2 browser CORS | No configuration exists | Required only if selecting direct browser uploads; configure explicit allowed origins then |
| Existing asset gateway | Unauthenticated `/health` request returned 403 | Does not prove object access, upload or download contracts work |

Netlify retains private configuration for database access and an asset gateway.
Only configuration names, scopes and connection metadata were inspected for the
audit; no secret values belong in this document or logs. Database and signing
secrets currently include build scope; review function-only scoping before using
them in the new build. No deployment, migration, record edit, bucket-policy change
or object deletion was performed in this audit. Project restoration was requested
solely to make the database available for inspection.

Startup queries temporarily returned empty schema/migration results; those results
were discarded after recovery. The healthy inventory confirms games,
game_localizations, assets, asset_uploads, audit_events, admin_members,
admin_allowlist and login_windows. All eight tables have RLS enabled. Neither
anon nor authenticated has catalog schema usage or table grants in the inspected
inventory; service_role has explicitly scoped data privileges. RLS-without-policy
advisories are consistent with that backend-only boundary, not evidence that
public browser access should be granted. Application authorization still needs
negative integration tests. A separate Auth advisory remains for review before
enabling real administrative sign-in; no Auth settings were changed.

### Existing model strengths and gaps

The six retained migrations already establish stable game IDs, localizations,
source references, confidence, moderation, publication, language classification,
asset checksums, validity periods, upload intents and an audit trail. Constraints
require review metadata for approval and rights evidence for published assets.

The model is incomplete for the requested MVP:

- No organization, developer/publisher relationship, release, platform, genre or
  external identity tables were found in the recovered application schema.
- Localizations currently have one description, without separate short/long fields.
- The current assets table combines file, editorial metadata and assignment.
- Asset roles are constrained to header, capsule, hero, logo, icon and client_icon.
- Accepted MIME types are PNG, JPEG and ICO; current file size is capped at
  16 MiB, and image dimensions are limited to 8192 per side. These are existing
  constraints, not newly chosen video limits. Do not simply remove them globally.
- No trailer, source-availability or preservation-record model exists yet.

Retain current IDs, rights/provenance and review history while evolving the model.
Reconcile database asset records against the seven R2 objects before adopting or
removing anything. No object-by-object reconciliation or authenticated asset
transfer was completed by this metadata audit.

## Monorepo and local workflow

```text
apps/
  web/             Public React + Vite application
  admin/           Independent React + Vite administration application
  api/             Runtime-independent request handlers and domain services
packages/
  contracts/       Request/response schemas and typed client
  ui/              Shared tokens and primitives when actually needed
netlify/
  functions/       Thin hosting adapter for the same API handlers
supabase/          Reviewed baseline, migrations and deterministic local seeds
```

Use TypeScript, Tailwind and npm workspaces. Keep frontend development independent
of database startup. A single root development command starts both Vite servers
and the API; separate commands start each application. Each frontend proxies
`/api` to the same local API. Share actual domain services between local Node
execution and the Netlify adapter; do not maintain two backend implementations.

Two explicit data modes: clearly identified design fixtures, and real integration
with an isolated local or authorized remote development database. Fixtures cannot
claim successful remote persistence. Docker is optional for local Supabase and
must not be required to edit either frontend. Local uploaded files remain ignored.

Target commands, not yet implemented: `dev`, `dev:web`, `dev:admin`, `dev:api`,
`check`, `test` and `build`. No build-before-edit orchestration, forced local TLS,
deployment prerequisite or infrastructure-specific frontend code.

## Catalog model

| Entity | Responsibility |
| --- | --- |
| Game | Stable canonical identity, slug, lifecycle and publication state |
| GameLocalization | Locale, official title, alternate names, short and long descriptions |
| Organization | Studio, publisher or other organization identity; do not duplicate per role |
| GameOrganization / ReleaseOrganization | Many-to-many role assignments with evidence and appropriate scope |
| Release | Platform, edition, region, dates and known date precision |
| Platform | Independent platform taxonomy |
| Genre / GameGenre | Localizable many-to-many classification |
| ExternalIdentity | Source, namespace, external identifier and provenance |
| Source / Evidence | Source URL or record, observation date, rights and confidence |
| IdentityDecision | Audited correction, merge or split with reviewer and reason |

The first catalog slice needs title, aliases, localized short/long descriptions,
developer/publisher relationships, genres and releases. More metadata can include
series/franchises, themes, game modes, player perspectives, supported languages,
accessibility features, age ratings, official links and platform-specific system
requirements. Model them as typed relationships with source and scope when added,
not mandatory blank fields or an unrestricted JSON metadata bucket.

Do not derive identity from a title, store listing or release. A studio may be a
developer and publisher; a game may have several of each. Release dates with only
a known year must retain that precision instead of inventing a month or day.

## Assets and media

Keep the semantic role independent of file format, provenance and rendition.

| Group | Roles or categories | Initial treatment |
| --- | --- | --- |
| Library artwork | header, capsule, hero, logo, icon, client_icon | First upload and moderation slice |
| Screenshots | in_game_image | Explicit screenshot category; ordering, caption and release association |
| Promotional images | store_image, promotional_artwork | Distinguish promotional material from captured gameplay |
| Additional images | concept_art, key_art, character_art, packaging | Typed categories added as validation and editorial rules are defined |
| Trailers | external reference and preserved original, type, language, source and rights | Hybrid external playback and authorized hosted originals in R2 |
| Later media | gameplay videos, manuals, press kits, audio | Separate validated capabilities; not arbitrary initial file uploads |

The six established reference dimensions remain guidance, not hard upload gates.
Preserve original bytes. Derived previews never replace or masquerade as originals.
ICO support for client_icon preserves embedded images; untrusted formats are not
enabled simply because a new role exists in the taxonomy.

Separate these responsibilities:

- AssetFile: immutable object identity, checksum, size, detected MIME type,
  dimensions, original filename for display, storage location and ingestion state.
- Asset: editorial identity, category, author/credit, source, license/rights,
  official/community provenance and original/derivative classification.
- AssetAssignment: exactly one Game or Release target, role, languages or Global,
  region, ordering, preferred selection, context and validity interval.
- AssetRendition: explicit derivative of a source file, transformation and technical
  metadata; a different rendition is not a new game or a new moderation decision.
- Submission / ModerationDecision: submitter, review state, reviewer, time, reason
  and audit trail. Publication state is separate from review and validity.
- MediaReference: trusted source URL, media kind, title, language, rights, region,
  duration when known and moderation state; no automatic download or publication.
- PreservationRecord: source observation/retrieval times, availability checks,
  preservation reason, rights evidence and relation between an external reference
  and a checksummed preserved file. Source availability is independent of access.

Global means no linguistic text, not an unknown language or a region. A piece can
have multiple actual languages. API filters expose the effective role, language,
provenance and original/derivative status; expired assignments use a deterministic
eligible fallback. Preserve previous IDs and audit corrections.

### Hybrid preservation

The maintainer selected a hybrid model: external references plus authorized
preserved originals in R2, including trailers. Source retirement, delisting or
deprecation must not automatically delete a preserved file or its provenance.
Use source availability states such as available, unavailable and unknown
separately from retained, review-pending, published, restricted and withdrawn.

Record when and where content was obtained, checksum, original technical metadata,
credit and distribution/preservation rights. Rights review governs whether the
copy may be publicly served, retained privately or must be removed. A delisted
game is not automatically public-domain content. Do not auto-ingest arbitrary
URLs: a reviewed ingestion path needs source validation, SSRF protection, transfer
limits and explicit rights evidence.

For the first video slice, preserve accepted originals and provide authenticated
uploads, moderation and range-capable playback/download for approved originals.
Define an explicit container/codec/size/duration allowlist before enabling uploads.
Do not advertise arbitrary video compatibility or silently transcode originals.
Keep derived playback renditions separate when processing is introduced. No
background deletion policy may treat a source disappearing as an orphaned asset.

## R2 ingestion boundary

Storage stays private. The API authorizes upload intent, assigns unpredictable
object identifiers and enforces contributor permissions and limits. Direct browser
uploads, if selected, use short-lived, operation-scoped permissions and explicit
CORS origins. Account or storage credentials never reach the browser.

Uploads land in quarantine. Backend validation checks actual file signature,
decoding, format, byte/pixel limits and checksum, not just supplied MIME type.
Finalization seals an immutable original separate from an upload key that might
still have an unexpired write permission. Pending content is visible only to its
authorized contributor and reviewers; the public API never exposes it.

Moderation verifies the game association, language, source, rights and editorial
quality. An official source is not automatic redistribution permission. Rejected
or withdrawn files cannot become public through a signed download shortcut.
Serving approved content requires checking publication and validity as well.

Do not rename, adopt, delete or garbage-collect the existing seven objects without
matching them to verified database records and ownership. Prefixes alone are not
authorization. Recoverable cleanup and abuse limits are part of the upload design.

## Public MVP

- Asset-first search by game title/alias; URL-persisted query and filters.
- Browse and game detail with role, language, provenance and format filters.
- Original download and explicitly identified preview renditions.
- Individual sign-in and authenticated submission with rights/source declaration.
- Contributor submission status, validation errors and moderation feedback.
- Trailer playback from an eligible external source or approved preserved copy,
  with visible source, credit, preservation state and availability fallback.
- Empty, loading, error, keyboard and responsive states; no invented catalog counts.

## Administration MVP

Admin is a separate frontend; backend authorization is enforced on every operation.
The first capabilities are catalog/localization editing, organization relationships,
release editing, a moderation queue, authorized file previews, approve/reject
decisions with reasons, explicit publication and audit history.

Define individual sessions, live authorization, CSRF/origin protections where
applicable, revocation and MFA policy before implementing administrative writes.
No shared default administrator password or browser-side role check substitutes
for permission enforcement. Local UI fixtures do not count as authenticated QA.

## Delivery sequence and acceptance

1. Infrastructure readiness: verify healthy Supabase, full schema/migration
   inventory, RLS and grants; reconcile existing objects. Preserve evidence privately
   when it could contain credentials or personal data. No remote reset.
2. Executable workspace: clean install; independently start web/admin/API; verify
   HMR, local API proxy, checks and independent builds. Update CI with real
   application checks without weakening repository safeguards.
3. Schema baseline: review model against recovered state; generate a migration
   with official tooling, validate in isolation and review before remote application.
4. Catalog vertical slice: real public reads plus authorized catalog edits, with
   denied unauthorized access and no unpublished data leakage.
5. Asset vertical slice: authenticated upload, quarantine validation, moderation,
   explicit publication and original retrieval with provenance. Test unauthorized
   access, invalid files, duplicates, expiry and replacement attempts.
6. Hybrid video/preservation slice: approved external references and retained R2
   originals, file/codec validation, range playback, source-loss fallback and
   separate rights/access states. Test an unavailable source without deleting the
   preserved file; verify restricted copies are not publicly retrievable.
7. Netlify testing deploy: explicitly build and deploy the tested candidate to the
   existing project; verify public, admin and API URLs from outside the local
   machine. No automatic Git builds or deployment workflow.

PRs integrate into develop, including successful integration checks. Promotion to
main, a public preview deployment and remote migrations are separate deliberate
operations. Do not report this plan or an existing hosting URL as an implemented MVP.
