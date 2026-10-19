# Local development

Status: agreed workflow, implementation pending. This revision has no
`package.json` or application scripts; do not run commands from the previous base.

## Target workflow

1. Clone and install using the versioned lockfile.
2. Start web or admin independently with Vite and HMR.
3. Design with clearly identified local fixtures, without infrastructure.
4. For integration, start the local API and configure development Supabase access.
5. Test permissions, contracts and errors against real integrations.
6. Run formatting, linting, types, relevant tests and builds.
7. Create a signed commit and push; verify CI for the exact commit.
8. Deploy explicitly when appropriate.

## Supabase and R2

Before connecting, verify the actual project and bucket without exposing secrets.
Inspect the existing schema, migration history and policies. Do not recreate
tables, users or files. Establish a reviewed baseline and test future migrations
in an isolated environment before applying them to a shared one.

Privileged variables belong only to the API; never prefix secret keys for Vite
exposure. Examples contain empty values. Private configuration, local data and
generated outputs remain ignored. Official SDK and CLI tools replace custom
infrastructure orchestration.

Local Supabase may require Docker; this does not restrict frontend development.
Local R2 keeps data outside Git and does not modify the remote bucket.
