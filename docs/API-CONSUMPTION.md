# API consumption

## Account and key

Open the public web application's account view and choose **Create account**.
Confirm the email if requested, then sign in. In **API keys**, enter a descriptive
name and choose **Create API key**. Copy the key immediately; it cannot be
retrieved later. Store it in your server's secret configuration.

Keys have the `catalog:read` scope and expire after 90 days. They grant no account,
administrative, upload or moderation permissions. To rotate, create a replacement,
update the consuming service, verify a successful request, then revoke the old
key in the account view. Revocation applies to subsequent authorization checks;
already authorized requests may finish.

## Read the catalog

Replace the origin with the actual deployed API origin. Local development uses
`http://127.0.0.1:8787`. Production requires HTTPS.

```sh
curl --fail-with-body \
  -H "Authorization: Bearer ${KNOWNGDB_API_KEY}" \
  "http://127.0.0.1:8787/api/v1/consumer/games?q=title"
```

```js
const url = new URL('/api/v1/consumer/games', process.env.KNOWNGDB_API_ORIGIN);
url.searchParams.set('q', 'title');
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${process.env.KNOWNGDB_API_KEY}` },
});
if (!response.ok) throw new Error(`KnownGDB returned ${response.status}`);
const { games } = await response.json();
```

The response is `{ "games": [] }` or an array of published, approved localized
summaries with `id`, `title`, `language` and `itemType`. IDs are immutable KnownGDB
UUIDs. Search is optional, limited to 120 characters and returns at most 50 rows.
Pagination and complete catalog export are outside this endpoint's scope.

Errors use `{ "error": "message" }`: `400` invalid search, `401` missing,
expired or revoked key, `403` insecure transport, `405` unsupported method,
`503` unavailable configuration or dependency. Retry temporary service failures
with bounded exponential backoff. Never put keys in URLs, browser bundles or logs.

## Account API

The same-origin account UI uses encrypted HttpOnly cookies. JSON writes must carry
the same-origin `Origin` header when authenticated by cookie.

| Route | Method | JSON body | Result |
| --- | --- | --- | --- |
| `/api/v1/account/signup` | POST | `email`, `password` | authenticated session or `confirmationRequired` |
| `/api/v1/account/login` | POST | `email`, `password` | authenticated session |
| `/api/v1/account/api-keys` | GET | none | `keys` metadata, never hashes or secrets |
| `/api/v1/account/api-keys` | POST | `name` | `id`, `name`, `prefix`, `scope`, `expiresAt`, one-time `key` |
| `/api/v1/account/api-keys` | DELETE | `id` | idempotent `revoked: true`, restricted to the owner |

## Activation and acceptance

Apply the additive `account_api_keys` migration to the intended environment only
with explicit authorization. Configure private Supabase credentials, session
encryption, email delivery and permitted Auth redirect URLs. Run `npm run check`.
Then verify real registration, confirmation, sign-in, reload, key creation,
catalog consumption, revocation and sign-out against the deployed environment.

This implementation does not establish production acceptance by itself. Hosted
rate limiting, email delivery and existing session/MFA limitations must be verified
before production promotion. Consumption keys currently use the existing public
catalog projection; public browsing continues to use `/api/v1/games`.
