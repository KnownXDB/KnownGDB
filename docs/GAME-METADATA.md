# Game metadata model

Status: full inventory with a first editor slice implemented locally. Overview,
localized text/aliases, company credits, releases, supported languages and
classification now have schema, contracts, API and editor coverage. The additive
migration is applied; real-account acceptance remains pending. Other inventory fields
remain planned. See [ADR 0012](adr/0012-reviewed-game-metadata.md) for exact scope,
review boundaries and activation. Preserve existing IDs, assets and history.

## Ownership and scope

One canonical game may have multiple releases, localized descriptions, company
credits, platform assignments and asset versions. A season, language, new cover,
store delisting or publisher change does not create a new canonical game.
Remakes, remasters, expansions and editions require explicit relationship and
identity review; do not infer identity from title similarity.

| Scope | Fields and relationships |
| --- | --- |
| Identity | Immutable UUID, stable slug with redirect history, primary title, original title, localized titles, aliases and abbreviations with language/region, game type |
| Description | Localized short summary and long description; optional localized storyline; source and review per localization |
| Classification | Multiple genres, themes, keywords/tags, player perspectives and gameplay modes; controlled terms with stable IDs |
| Organizations | Multiple developers, publishers, porting studios, supporting studios and distributors; organization UUID, credited role and applicable release/region/time range |
| Relationships | Franchise, series, parent game and typed links for sequel, prequel, expansion, DLC, remake, remaster, standalone expansion, compilation membership and edition |
| Releases | Release UUID, platform, edition, region, announced date and precision, actual release date and precision, release lifecycle, availability and distribution channel |
| Language support | Language tag plus separate interface, subtitles and audio support; applicability to release/platform/region; unknown support distinct from unsupported |
| Multiplayer | Single-player, local/online multiplayer, local/online co-op, split-screen, competitive modes, minimum/maximum player counts per mode, cross-play and cross-save applicability |
| Technology | Engine and version when known, controller support, supported input methods, VR/AR support, online/account requirements and platform-specific system requirements |
| Accessibility | Individual verified features, applicable release/platform, source and review; do not derive accessibility from controller or subtitle support alone |
| Ratings | Rating authority, territory, category, descriptors, interactive elements, release applicability and source; distinguish audience rating from review score |
| Links and identities | Official website, official support/community links, store URLs, store/external catalog identifiers with namespace and applicable release; reviewed identity matches |
| Availability | Announced, early access, released, cancelled, delisted or service-ended as separate release/availability facts; event dates and source; catalog publication remains independent |
| Assets | Existing collections and immutable versions: role, official/community provenance, credit, languages, context, original timestamp, validity, rights and verified storage; optional release assignment later |
| Editorial governance | Draft/published/withdrawn, contributor, sources, confidence, review state, reviewer, change reason, revision, timestamps and preserved audit history |

## Dates and uncertainty

Do not require a fabricated complete date. Store date precision explicitly:
unknown, year, month or day. For year-only evidence, preserve the year rather than
inventing January 1. Announced dates can change; retain their sourced history and
keep them separate from actual release dates. A quarter or release window can be
represented explicitly without converting it into a fictitious day.

The displayed first release year is derived from reviewed actual releases. If
only a year is known, display that precision. An unreleased game may have no
actual release year. Do not use the current year as a default.

## Data rules

- Unknown is not false, zero, an empty translation or a negative claim. Optional
  fields remain absent until supported by evidence.
- Keep title language, supported game languages and asset languages independent.
  Global artwork is not evidence of language support.
- Use normalized relations for organizations, releases, platforms, genres and
  language support. Avoid comma-separated names and opaque metadata JSON as the
  source of truth for searchable core fields.
- A release belongs to exactly one canonical game. Use explicit joins for
  multi-platform listings; never let a store ID replace the canonical UUID.
- Developer and publisher credits may vary by release, region and time. Preserve
  former credits rather than replacing history with the latest company name.
- Platform is distinct from store, operating system requirements and input method.
  Genre is distinct from theme, mode and user tag.
- Metadata edits create reviewed revisions. Editing a published game must not
  expose unreviewed replacement text or silently reapprove unrelated fields.
- Sources need scope, capture time, confidence and review. Conflicting evidence
  requires review; never silently overwrite or auto-merge identities.
- Keep original asset paths UUID-based. Renaming games or changing descriptive
  metadata must not rename, overwrite or delete R2 originals.
- Commercial prices, transient player counts and external review scores are
  outside the first metadata slice. They require separate source, freshness and
  licensing decisions before ingestion.

## Admin editor sequence

Keep quick draft creation available. Follow it with a dedicated game editor:

1. Overview: identity, titles, aliases, short/long descriptions and game type.
2. Credits: organization selection/creation and developer/publisher roles.
3. Releases: platforms, regions, date precision, release status and availability.
4. Languages: interface, audio and subtitle support with release scope.
5. Classification: genres, themes, perspectives and modes.
6. Relationships and links: franchise, series, related games, official URLs and
   reviewed external identifiers.
7. Advanced: multiplayer limits, technology, requirements, accessibility and
   audience ratings.
8. Assets and history: existing upload/review/publication flow and metadata audit.

Drafts need only a title, its language and a source. Publishing requires reviewed
identity and primary description/title evidence; do not block unreleased,
historical or sparsely documented games merely because optional facts are unknown.
Show missing information separately from actual publication blockers.

## Delivery and acceptance

Implement Overview, Credits, Releases, Languages and Classification as the first
metadata slice, with schema, shared contracts, API validation and edit forms
together. Additional sections follow without widening the initial draft form.
Use additive, locally replay-tested migrations. Remote migration, push and
deployment remain separate explicitly authorized actions.

Verify multiple developers/publishers, platform-specific release dates,
year-only/unknown dates, unreleased titles, language capability differences,
source conflicts, stale edits, permissions and reviewed public projection.
Existing game UUIDs, asset keys, checksums, publication states and prior audit
events must remain unchanged by schema activation. Keep real-service acceptance
separate from disposable database and controlled browser evidence.
