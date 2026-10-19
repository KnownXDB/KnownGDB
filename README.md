# KnownGDB

**Known Games DataBase** is an independent canonical video game catalog,
identity service and curated asset platform.

## Status

Foundation reset. This repository contains product rules, governance, repository
checks and the architecture for a new implementation. There is no application
code, dependency installation, development server or deployment in this revision.

The existing Supabase database and Cloudflare R2 bucket remain in place. Resetting
this repository does not reset, migrate or delete their data. Before reconnecting,
inspect the existing schema, permissions and assets; do not replay old migrations
or assume the database is empty.

## Development direction

- Public web: React, Vite, TypeScript and Tailwind CSS.
- Administration: a separate React/Vite application with a premium interface.
- API: a small TypeScript service on Cloudflare Workers, developed locally.
- Database and authentication: Supabase, using its official tooling and SDK.
- Private immutable asset storage: Cloudflare R2.
- Source control and verification: GitHub.

Prioritize fast local development, independent frontend startup and short feedback
loops. Build and check locally, then push. Deployment is a separate explicit step.
Docker and a cloud deployment must not be prerequisites for frontend development.
An optional isolated local Supabase environment supports database work.

The API is the only external boundary for catalog and asset data. Administrative
authorization belongs on the server. Game identity is independent of releases,
consumers, distribution channels and external identifiers.

## Documentation

- [Roadmap](ROADMAP.md)
- [Architecture](docs/architecture/overview.md)
- [Local workflow](docs/LOCAL-DEVELOPMENT.md)
- [Product policies](docs/PRODUCT-PLAN.md)
- [Architecture decision](docs/adr/0001-local-first-foundations.md)
- [Agent instructions](AGENTS.md)
- [Security](SECURITY.md)
- [Governance](GOVERNANCE.md)
- [Contributing](CONTRIBUTING.md)
- [Git workflow and tracking](docs/GIT-WORKFLOW.md)

## License

Original code and documentation: [MIT](LICENSE), Mauricio Vuljevas.
This license does not grant rights to third-party data, media or trademarks.
