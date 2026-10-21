# Explicit Netlify testing deployment

Use the existing `knowngdb` project. The testing URLs are:

- Public web: https://knowngdb.netlify.app/
- Administration: https://knowngdb.netlify.app/admin/
- API health: https://knowngdb.netlify.app/api/v1/health

This is an externally accessible foundation test, not production certification.
Supabase and private R2 resources are preserved. Deployment does not publish asset
versions, execute migrations or create administrator accounts.

## Runtime configuration

Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET` and
`ACCOUNT_RECOVERY_URL` privately in the existing Netlify project for the production
deploy context. The canonical testing URL uses that Netlify context even though
the application is a testing environment. Use an independent random 32-byte
base64url session secret; never copy the local session secret into hosting.

The inspected plan cannot restrict environment variables to the Functions scope.
They retain the platform's default scopes. The project has no connected Git
repository or build hook. Do not connect continuous deployment. Build locally,
inspect output, then upload the prebuilt artifacts explicitly. Never run a remote
build with private environment configuration as a shortcut.

Vite uses `envDir: false`; private credentials must never use a `VITE_` prefix.
Only the API reads them. Inspect browser output for known secret values before
deployment; the function bundle references runtime environment values rather
than embedding credentials. Existing unused gateway/email integration variables
are not inputs to this application and were not exported into public source.

Recovery uses `https://knowngdb.netlify.app/?recovery=1`. The maintainer confirmed
adding that exact URL to Supabase's redirect allowlist while preserving local
URLs. A complete hosted email recovery flow still needs user acceptance.

## Build and deploy

Run `npm run check` and the repository policy/redacted secret scanner. The build
cleans `dist/site`, assembles the separate applications and prebundles the shared
API as `dist/functions/api.mjs`. Keep server output outside `dist/site`.

The explicit ESM entry and prebundle avoid a verified Windows packaging collision:
direct Netlify packaging of the workspace dependency generated duplicate function
archive paths and replaced the API handler with shared-contract exports.

With authenticated Netlify CLI 27.12.0, run this PowerShell command from the root:

```powershell
npx --yes netlify-cli@27.12.0 deploy --prod --no-build `
  --filter @knowngdb/web --site knowngdb `
  --dir (Resolve-Path dist/site).Path `
  --functions (Resolve-Path dist/functions).Path
```

The filter selects the CLI workspace without starting another development server;
the absolute artifact paths upload both interfaces and the shared API. Do not
combine `--context` with `--no-build`: this CLI rejects that combination.
Do not pass secrets as command-line flags or save CLI diagnostics in tracked files.
Netlify's source control, automatic previews and deployment hooks stay disconnected.

## Acceptance

Verify public/admin documents and their JavaScript/CSS, API health, published-game
search and public version history against the real hosted service. Confirm that
anonymous administrative requests are rejected and cross-origin writes fail.
Check security headers, response content types and browser console errors.

Exercise the public search in desktop/mobile browsers. Use the real administrator
account separately for sign-in, reload persistence, history and recovery. Do not
publish real assets or create hosted test users just to complete a smoke test.
Never describe controlled browser responses as real hosted authentication.

Keep screenshots, service inventories, environment exports and deploy logs outside
public source. Record successful deployment evidence and any acceptance limits;
remove obsolete failed test deploys only after the working deploy is verified.

## Verified 2026-10-20 acceptance

The retained deploy is `6ad80b0b3a9bb7097f485f04`, built from source commit
`28f513b`. Two defective packaging deploys and one superseded testing deploy
were removed after final verification; only the current working deploy remains.
The project has no connected repository and zero build hooks.

The working manual deploy passed real health/catalog reads, empty published
version history, anonymous administrative denial (401), cross-origin write
rejection (403), static CSP/nosniff headers and secret-value checks on all six
browser artifact files. Thirty-one local tests, nine-migration SQL replay,
type checking and independent builds passed.

Chrome/Playwright checked 1365x900 and 390x844: correct page identity, meaningful
content, no framework overlay, no horizontal overflow, public catalog search and
published-history empty state, anonymous admin and opening the recovery form.
There were no unexpected console or runtime errors. Four 401 console entries
were expected anonymous account/admin session probes across the two viewports.
Browser plugin was unavailable. No API mocks or synthetic hosted accounts were
used; no recovery email was sent and no asset was published.

The maintainer confirmed the recovery redirect allowlist. Hosted administrator
sign-in, reload persistence and the complete recovery email flow remain unverified.
The existing local web/admin/API environment continues running unchanged.
