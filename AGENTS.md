# Repository work rules

- Use English for source, comments, documentation, issues, PRs, labels and project
  metadata. Preserve proper names and intentionally localized catalog content.

- Public repository: review tracked content and run local policy and redacted
  secret scanning before any push. Never publish secrets or private diagnostics.
- Do not commit generated output, dependencies, binaries, media or database dumps.
- Use neutral project names. Mention external parties only when explicitly
  necessary for a real dependency or integration; do not record inspirations.
- Read README.md and relevant product/architecture documents before work.
- Start from `develop` in a short-lived work branch. Follow docs/GIT-WORKFLOW.md.
- Changes integrate by PR into `develop`; promote to `main` only after testing
  the integrated commit and explicitly deciding it is stable.
- PRs belong to `@mvuljevas`; link tracked issues and validation evidence.
- Never auto-merge, deploy, release, publish or migrate remote data. Remote
  actions require explicit user authorization for the task.
- Keep commits signed and do not bypass branch protections or suppress scanners.
- Preserve canonical game identity, provenance, confidence and moderation rules.
- Keep external catalog/assets access behind the API; no privileged browser keys.
- Use UTF-8 without BOM and LF. Keep structural decisions in docs/adr/.
- Read SECURITY.md and GOVERNANCE.md before security, workflow or permission work.
- Run applicable checks and state any limits of verification.
