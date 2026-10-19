# Product policies

These rules define agreed scope, not implemented capabilities.

## Initial assets

| Role | Reference dimensions (not mandatory) | Purpose |
| --- | --- | --- |
| header | 920 × 430 | Horizontal card |
| capsule | 600 × 900 | Vertical cover |
| hero | 3840 × 1240 | Panoramic background |
| logo | Dominant visible-content dimension of 1280 | Brand mark, preferably transparent |
| icon | 32 × 32 | Small representation |
| client_icon | 256 × 256 | Application or shortcut |

JPEG or PNG is accepted for any role; PNG supports transparency. Dimensions,
aspect ratios, transparency and the absence of margins are recommendations,
not upload requirements. Preserve original bytes and dimensions without upscaling,
cropping or conversion. ICO is accepted as an original client_icon, preserving
all embedded images without requiring a specific resolution. Its metadata
describes the embedded image with the largest area. Review technical limits
before implementing ingestion, without changing existing originals.
WebP, video and animation are outside the first phase.

## Context and history

Files are immutable and checksummed. Assignments specify game or release,
language, region and validity period. Events and seasons do not change Game.id.
Keep a base asset and deterministic fallback after expiration. The API declares
the effective language and context.

Global means language-neutral content without linguistic text. It is neither
a region nor an unknown language. Classify each piece as Global or by its actual
languages; EN, ES and localized variants belong to the same Game. No role is
Global by default. Contributors select languages or Global; moderation verifies
that selection.

The API and web prioritize approved official originals with distribution rights.
Separate official/community provenance from original/derivative classification.
Do not present normalized images as originals or automatically publish sources
with incompatible terms. Verify the model, filters and fallback when implementing
this contract.

## Moderation

Validate file signatures, decoding, format, byte and pixel limits, and exact
duplicates. Dimensions and transparency are editorial guidance. Review legibility,
composition, sharpness, subject correspondence, watermarks and distribution rights.
Express editorial quality through observable criteria rather than subjective labels.

States: submitted, in_review, approved, rejected and withdrawn; publication and
validity remain separate. Record reviewer, date and reason. Changing bytes requires
a new review. Pending or rejected content is never public. Official provenance
does not imply permission to redistribute.

## Administration

Manage information, translations, organizations, genres, releases, sources,
assets and decisions. Audit merges and corrections. Separate catalog, moderation
and access permissions. Record author, date and reason for sensitive changes.

## API plans

Collaboration role, commercial plan and permissions are separate concepts.
Public access has baseline caps; contributors and partners have configurable
higher caps. Premium partners have no commercial quota but retain operational
concurrency, size and abuse controls to protect availability.

Manage requests per interval, bursts, quotas, concurrency and transfer. Aggregate
usage by organization, separate file downloads from metadata access, allow temporary
exceptions and record changes. The panel issues, rotates and revokes scoped keys,
shows metrics and assigns plans. Do not set figures without estimation and
measurement. Decide on a shared cross-instance mechanism before scaling.

## Future multimedia

Original trailers, photographs and videos require provenance, rights, language,
duration and technical metadata. Developer submissions precede community
multimedia contributions. Do not implement transcoding or distribution yet.

## Repository language and public quality

Use English for code, comments, README, documentation, issue and PR text, labels,
and project metadata. This supersedes the earlier bilingual documentation plan.
The catalog continues to support localized game information and assets; English
repository content does not restrict supported catalog languages or proper names.
A versioned source will feed the wiki. Do not publish reference binaries or
content without documented rights.
