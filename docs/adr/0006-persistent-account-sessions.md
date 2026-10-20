# ADR 0006: Persistent account sessions

## Decision

This supersedes the in-memory sign-in transport in ADR 0005. Password recovery
continues to consume its short-lived email-link fragment separately.

Normal sign-in returns only an authenticated flag. The API encrypts access and
refresh tokens with AES-256-GCM using a private 32-byte base64url `SESSION_SECRET`.
A fresh nonce protects each cookie. The cookie is HttpOnly, host-only, Path=/ and
SameSite=Strict. HTTPS uses Secure and the `__Host-` prefix; loopback development
uses a separate local cookie name without Secure. Local host ports share cookies,
so the two development frontends can share an account session. Different hosts
have independent cookies. Do not run untrusted applications on the same local host.

Cookies expire at an absolute seven-day deadline. The API renews upstream access
within sixty seconds of expiry using the refresh token and rotates the encrypted
cookie without extending that deadline. Concurrent renewals share an in-flight
promise per session within a server process. Separate instances rely on the
upstream refresh-token reuse protections; production concurrency still needs
hosted validation. No session database migration or Auth configuration change
is required. Invalid, tampered or expired cookies fail closed and are removed.
Temporary upstream failures preserve the cookie for retry.

The frontend restores `/api/v1/account/session` on mount and checks it every minute.
That single request verifies identity once and fetches profile and active role in
parallel. It returns only public profile fields and the verified role. Restoration
does not chain separate profile and administrative session requests. A static,
accessible placeholder reserves account space during the initial network check.
Profile and administrative operations still verify the current identity through
Supabase Auth; role membership is read from the database on the server. Tokens
are not returned to normal application JavaScript or persistent browser storage.
Tab notifications contain only a session-change signal. Periodic checks leave
unsaved profile edits intact.

Cookie-authenticated writes require an exact Origin match. Cross-site Fetch
Metadata and mismatched Origins are rejected for authenticated routes. Writes
also require JSON. No CORS credentials are enabled. Hosted adapters must preserve
the real HTTPS request URL; forwarded headers are not trusted as origin evidence.

Sign-out requests upstream revocation and expires the local cookie. Password
recovery updates also clear it. Revocation of refresh sessions does not invalidate
already issued access tokens immediately; this retains the limitation documented
in ADR 0005. Stolen-cookie replay until access-token expiry and stronger production
administration controls remain outside this local transport slice. Production
administration still requires MFA and explicit hosted security acceptance.

## Operations and verification

Run `npm run setup:session` to create the key only in an ignored, untracked `.env`.
It never prints or overwrites an existing key. Restart the API after configuration.
The same private key must survive API restarts and be shared by deployed instances.
Rotating it invalidates existing cookies. Do not expose it through Vite, publish
it, or reuse a public example value. Hosted configuration remains an explicit
deployment step. Missing keys prevent persistent sign-in.

Tests cover cookie confidentiality/integrity, flags, restoration, refresh, CSRF,
expiry and sign-out using isolated Auth responses. Browser validation exercises
real HttpOnly cookie handling through the actual API with an isolated Auth server.
It does not create cloud users or replace manual acceptance of a real account.
