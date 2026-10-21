# ADR 0010: Verified original image delivery

Date: 2026-10-20. Status: implemented; local automated and real storage reads verified.

Tracking: [issue 35](https://github.com/KnownXDB/KnownGDB/issues/35).

## Decision

Serve original images through the shared API, keeping R2 private. Public routes
are `/api/v1/asset-versions/:id/preview` and `/download`. Administrative equivalents
add `/admin` after `/api/v1`. Accept GET and HEAD, canonical version UUIDs and no
query parameters. Never accept an object key, bucket, source URL or actor from
the client. No signed storage URLs, bucket policy changes or CORS changes are used.

Public delivery requires a published game, an approved and published version,
verified storage, rights evidence and a nonfuture creation date. Unknown and
ineligible versions return the same 404 without contacting storage. These are
historical version routes, not current seasonal presentation selection: an
earlier published version remains available until made private or otherwise
ineligible. Validity and context remain metadata rather than retention policy.

Administrative delivery reuses verified identity, confirmed email, current active
membership and active Auth session checks. Moderators and Super Admin can inspect
private, storage-verified versions, including versions awaiting review. Reading
an original never approves or publishes it. Cookie access retains same-origin,
CSRF and hosted HTTPS protections.

Use separate bucket-scoped Object Read only credentials named
`R2_READ_ACCESS_KEY_ID` and `R2_READ_SECRET_ACCESS_KEY`, plus `R2_ACCOUNT_ID` and
`R2_BUCKET`, in the ignored local API environment. Never reuse operator import
credentials, expose a Vite-prefixed secret or include credential values in source.
The runtime adapter issues GetObject only. Hosted configuration and deployment
remain separate explicit operations; this implementation does not deploy itself.

## Integrity and transport

This slice supports PNG, JPEG and ICO originals up to 16 MiB. Reconstruct the
canonical key from immutable version metadata. Reject mismatched keys, unsupported
formats, unsafe sizes, incorrect storage lengths/types/signatures and SHA-256
mismatches. Read the bounded original and verify it completely before releasing
any bytes. Abort stalled reads after 15 seconds; close the storage body/client.

GET responses stream the verified bytes, using a neutral UUID filename and a
server-selected image MIME type. Preview is inline; download is an attachment.
All responses prohibit caching. Original responses also use nosniff, a sandboxed
CSP, same-origin resource policy, frame denial and no-referrer policy. Every
request rechecks authorization rather than relying on a long-lived public cache.

Support a single byte range for GET, including suffix/open-ended ranges, with
206/416 and Content-Range. A mismatched If-Range falls back to the full response.
HEAD returns catalog representation metadata without an R2 body read; it ignores
Range and is not a fresh proof of storage availability. Download ranges still
read and hash the complete bounded image before slicing. This deliberately
trades repeated reads for integrity in this small-image slice.

The local Node adapter pipes Response bodies with backpressure rather than
buffering them a second time. The existing Netlify ESM adapter supports streaming;
its documented 20 MB streamed-response ceiling informed the lower image bound.
See [Netlify Functions limits](https://docs.netlify.com/build/functions/configuration/).

Large images, video transfer/playback, thumbnails, quotas and optimized range
retrieval remain separate work. Do not lift the bound to bypass a hosting limit.
The hybrid trailer/preservation product requirement remains in the roadmap.

## Validation and limits

API tests cover public/private visibility, active administrative sessions,
moderator reads, canonical ownership, corruption, types, size limits, byte ranges,
If-Range, HEAD, query rejection and storage errors. A loopback S3 integration test
verifies GetObject-only behavior and length validation. Existing publication
authorization tests pass against the shared administrative verifier.

Read-only acceptance fetched six real originals (3,589,653 total bytes), matched
all six database hashes and confirmed all six public routes remain inaccessible.
No storage writes, publication changes, migrations or hosted test accounts were
used. Browser checks cover desktop/mobile private preview, byte-exact download,
401 feedback and moderator controls, with controlled administrative responses and
a real verified original. Real public search/history reads remain separate.
Browser plugin was unavailable; Chrome/Playwright was used. The maintainer
confirmed private preview and a correctly opening original download through
their real local administrative session. Hosted delivery remains unverified
and is not deployed by this feature.
