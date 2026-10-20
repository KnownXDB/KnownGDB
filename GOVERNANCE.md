# Governance

Initial author and maintainer: Mauricio Vuljevas (@mvuljevas).
Canonical repository: https://github.com/KnownXDB/KnownGDB.

KnownGDB is autonomous. No external consumer, provider or product determines its
model. These foundations do not define an official domain.

Original code and documentation are MIT-licensed, as stated in LICENSE. The
license does not grant rights to external trademarks, media or data. Assets and
data require their own provenance and distribution terms. Contributors retain
authorship. Do not present forks as the official service.

Structural decisions require an ADR. Permission, visibility, publication and
infrastructure configuration changes require explicit maintainer authorization.
Resetting Git does not authorize deleting Supabase or R2 data.

External contributions require maintainer review. Never represent self-review
as independent approval. While there is only one maintainer, verify CI and
record manual review; require independent review when a second maintainer joins.
Only authorized maintainers receive write access.

`develop` is the default branch and receives work through PRs and checks.
`main` receives stable promotions from `develop`, with test evidence for the
integrated commit. Merging and deployment are never automatic. See the
[Git workflow](docs/GIT-WORKFLOW.md) and [ADR 0002](docs/adr/0002-repository-governance.md).
Verify actual branch protections and their enforcement for administrators in GitHub.

Use English for repository content, including documentation, comments, issue and
PR text, labels and project metadata. Localized catalog data and proper names
retain their appropriate languages; they are not repository documentation.

Treat others respectfully, without harassment or discrimination. Do not publish
secrets, external content or private information as part of a contribution.
