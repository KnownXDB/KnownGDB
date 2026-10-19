# ADR 0001: foundations for local development

Date: 2026-10-13. Status: accepted by the maintainer during the reset.

## Context

The previous approach does not support the desired workflow. Interface development
depends on too much infrastructure and coordination. The priority is normal local
iteration, validation and then push.

Foundations, rules and platforms remain: GitHub, Supabase and Cloudflare.
The existing database and R2 bucket are not disposable. This reset covers
foundation documentation and a clean repository; it does not include interface
implementation, remote service changes or data migration.

## Decision

1. Remove previous code and configuration; start a history without parents on
   the temporary `foundations` branch, with a recoverable external backup.
2. React + Vite + TypeScript + Tailwind for separate web and admin applications.
3. A small npm workspace; share contracts and UI only when needed.
4. TypeScript API on Cloudflare Workers; Supabase for PostgreSQL/Auth and private
   R2 for files. The API remains the data boundary for consumers.
5. Independent frontend startup; HMR, API proxy and explicit fixtures. Docker
   is optional for a local database, never a frontend prerequisite.
6. Establish the Supabase baseline from reviewed actual state before introducing
   new migrations. No implicit remote reset.
7. Verify locally and on GitHub; keep deployment separate and explicit.
8. Distinct premium design for both surfaces; speed does not remove security,
   provenance, moderation, canonical identity or accessibility requirements.

## Consequences

Compatibility with the previous implementation is not preserved. The foundation
commit contains no runnable applications. Capabilities return in small, verifiable
phases. Hosting and CI configuration will be created for the new base without
carrying over tools or dependencies from the retired approach.

Rewriting Git does not erase copies, forks, PR references or objects retained by
the provider. It is not a secret-revocation mechanism. Remote protections may
prevent history replacement and require maintainer intervention; they are not
disabled as a side effect of the local reset.
