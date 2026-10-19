# Contributing

Write repository content in English, including documentation, code comments,
issues, PRs, labels and project metadata. Proper names and localized catalog
content retain their appropriate languages.

Read README.md, ROADMAP.md, AGENTS.md and the relevant architecture first.
Read SECURITY.md and GOVERNANCE.md before auth, CI or permission work.

Use small, reversible changes, neutral branch and feature names, signed commits
and an ADR for structural decisions. Do not add dependencies without explaining
their purpose and operational cost. Do not invent project IDs or production data.

Start work from `develop` using the [Git workflow](docs/GIT-WORKFLOW.md). Enable
the versioned local hooks, pass repository policy and secret scanning before push,
and open a PR assigned to `@mvuljevas`. Add its linked issue to the repository
project. Application checks will be introduced with the workspace. For foundation
changes, verify links, UTF-8/LF, consistency, tests and staged content. Run all
applicable checks before declaring a change complete.

Do not commit credentials, binaries, database dumps or browser test output.
Product data and assets require provenance and distribution rights. External
clients access domain data through the API.
