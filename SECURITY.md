# Security Policy

## Reporting

Report vulnerabilities privately through the canonical repository's security
reporting channel when available. Verify its availability before use. Never
publish secrets, personal information or exploitable details in public issues,
pull requests, logs or screenshots. No security email is designated.

## Required controls

- Individual accounts, least privilege, server authorization, MFA and revocable
  sessions before production administration.
- No shared administrator passwords or invented credentials.
- Separate API consumption keys from administrative permissions; store key hashes
  and show originals only when issued.
- Secrets in private environment configuration; never in source, fixtures,
  frontend variables, bundles, URLs, logs or artifacts.
- Public Auth configuration is not authorization. Validate identity and membership
  server-side; do not trust user-editable metadata for roles.
- Enable RLS and explicit grants where applicable. Privileged database access
  must not bypass application permission checks.
- Design session transport, expiration, revocation, CSRF and origin protections
  before implementing authentication. Cookie sessions require Secure, HttpOnly
  and appropriate SameSite protections in hosted environments.
- R2 remains private; access depends on API authorization and moderation state.
- Separate local/development, staging and production configuration. Never reset
  shared data as part of normal local setup.

## Source and operations

Review staged content before publication. Ignore files do not protect already
tracked secrets. Redact diagnostics. Rotate exposed credentials first; rewriting
history does not revoke credentials or erase existing copies.

CI must run with minimal permissions, without production secrets for external
contributions. Do not execute untrusted code with privileged workflow contexts.
Pin workflow actions to reviewed commit SHAs. Production deployment requires an
explicit step and protected environment.

## Status

This revision contains foundations and repository CI only. Local hooks and CI
check source hygiene and run a pinned secret scanner with redacted diagnostics.
Platform secret scanning and push protection complement review; none guarantees
that every secret is detected. Authentication, authorization and deployment are
not implemented. Existing hosted infrastructure has not been
changed or recertified by this repository reset. No production release is supported.
