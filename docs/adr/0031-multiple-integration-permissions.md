# ADR 0031: Multiple integration permissions

A Super Admin may issue one integration credential with either or both explicitly
selected permissions: `identity:resolve` and `intake:text`. Existing credentials
retain their original permissions. Each operation checks its required permission,
expiration and revocation; the existing per-credential request quota is shared.
Issuance and revocation remain audited. Future permissions require explicit
authorization and are not implicitly granted to existing credentials.

This change does not grant catalog write or publication access. Hosted migration
and acceptance require separate authorization.
