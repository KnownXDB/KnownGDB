# ADR 0005: Contributor authentication and public profiles

## Decision

The initial in-memory sign-in transport below is superseded by
[ADR 0006](0006-persistent-account-sessions.md). Recovery-link handling remains applicable.

Both independent frontends use same-origin API endpoints for email/password
sign-in. Registration follows the existing Supabase email-confirmation policy;
the API never creates confirmed accounts with administrative privileges.
Redirect allowlist and email delivery settings remain explicit operator steps.

Normal sign-in keeps only the access token in component memory, never persistent
storage or URLs. No refresh token is returned by the sign-in API. Reload and token expiration require
sign-in again. Independent web/admin tabs have independent sessions. Transport
uses bearer authorization, JSON bodies and no ambient authentication cookies.
Writes reject cross-origin browser requests; the local adapter preserves the
frontend host through Vite's proxy. Hosted use requires HTTPS.

Every profile operation verifies the token with Supabase Auth and requires a
confirmed email. The server derives ownership from the verified user ID and
accepts only a display name. Neither roles nor author IDs are client-writable.
Public profile responses contain only the display name, never email addresses.
Names are public credit labels, not unique handles or proof of official identity.
Official/platform credit remains a separate administrator permission.

Sign-out requests local-session revocation and immediately clears browser state.
Supabase access tokens can remain valid until their expiry after revocation;
this slice does not claim immediate stolen-token invalidation. Account writes
change only the caller's public name or authenticated password. Production moderation
and publication require MFA and stronger session-revocation checks before release.

Supabase's existing Auth rate limits remain authoritative. The local API does not
implement a distributed abuse-control layer; hosted authentication must receive
an explicit abuse-control review before deployment. Request bodies are bounded
to 4 KiB locally and validated again in the shared handler.

## Validation boundary

Automated contract tests use an isolated HTTP Auth/database stub to verify
ownership, mass-assignment rejection and validation. They do not prove a hosted
user can sign in. Existing-account sign-in and profile persistence require a
manual authenticated check without sharing credentials with the agent. No test
accounts, email messages or remote profiles are created automatically.

## Password recovery

The recovery request uses Supabase's email delivery and a single server-configured
`ACCOUNT_RECOVERY_URL`. The client cannot supply redirects or target user IDs.
The redirect must be HTTPS, except loopback HTTP for local development, and must
be explicitly allowlisted in Supabase Auth. Valid requests return a generic
message without disclosing account existence; delivery failures and rate limits
remain visible as sanitized errors.

The existing implicit Auth link delivers a recovery session in a URL fragment.
The shared UI consumes it on module load, removes the fragment with replaceState
and retains the access/refresh tokens only in memory for password submission.
Fragments are not sent in HTTP requests. Reloading after consumption requires a
new recovery link. Recovery tokens never enter local storage, logs or API responses.
Do not capture real recovery URLs in screenshots, analytics or diagnostics.

The password endpoint verifies identity, establishes that user's SDK session,
and calls `updateUser`, never administrative password replacement. It accepts
only the new password and recovery refresh token, with the access token in the
Authorization header. An authenticated user session can change its own password;
the client-side recovery marker is not treated as server authorization. Successful
updates request global refresh-session revocation and require normal sign-in.
Existing access-token expiry limitations still apply. Secure password change or
MFA requirements imposed by Auth remain enforced upstream.
