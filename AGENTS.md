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
- Unless the user requests a different stopping point, finish each implementation
  task by reviewing its diff, signing logical commits, running applicable checks,
  pushing the work branch and opening a PR assigned to `@mvuljevas` into
  `develop`. This closeout has standing maintainer authorization.
- Wait for required CI and reviews, then merge the verified PR head into
  `develop` with branch protections enforced. Verify the integrated commit,
  remove merged task branches and leave the worktree clean on `develop`.
  Preserve unrelated local work. Report any blocker that requires a maintainer.
- Promotion to `main`, deployment, release, package publication and remote data
  migrations require separate explicit authorization.
- Keep commits signed and do not bypass branch protections or suppress scanners.
- Preserve canonical game identity, provenance, confidence and moderation rules.
- Keep external catalog/assets access behind the API; no privileged browser keys.
- Use UTF-8 without BOM and LF. Keep structural decisions in docs/adr/.
- Read SECURITY.md and GOVERNANCE.md before security, workflow or permission work.
- Run applicable checks and state any limits of verification.

## Suggesting the next logical step

When reporting progress or completing work, suggest the next logical step using
this priority order:

1. The feature currently in development: identify the next concrete action needed
   to complete its agreed scope, validation or acceptance criteria.
2. Relevant open issues.
3. Documented technical debt.
4. The roadmap.

Once a feature meets its scope and acceptance criteria, consider it complete.
Do not loop over completed work, repeat successful checks without new evidence,
or invent additional requirements to keep the feature in development.

Suggest an improvement to a completed feature only when there is a concrete,
valid reason, such as performance, design, architecture, scalability or
accessibility. Explain the problem or opportunity and the expected benefit;
distinguish optional improvements from requirements for completion. Otherwise,
close the feature and select the next step from open issues, technical debt,
then the roadmap, in that order.

Check the relevant current sources before naming a specific issue, debt item or
roadmap task. Do not invent backlog items or claim an unverified priority. Keep
the recommendation concise and actionable; if no justified next step exists,
say the work is complete without manufacturing one.

A recommendation does not authorize starting a new feature, expanding scope,
publishing, deploying or changing remote infrastructure. Follow the user's
authorization and existing workflow rules before taking those actions.
