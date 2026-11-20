# ADR 0024: Administrative external identity lookup

Status: implemented locally; integration and real-service acceptance pending.

Administrative users need to inspect external identifier associations before
performing catalog work. An identifier does not become a canonical UUID and
matching names do not establish identity. Existing associations can conflict
across catalog items and may have different regional or evidence states.

`POST /api/v1/admin/identities/resolve` accepts 1 to 20 identifiers with
`provider`, `namespace`, `kind` and `value`. It requires the existing verified
administrative session, uses the existing JSON body limit and performs no write.
The result for each identifier is `not_found`, `matched`, `review` or `conflict`.
A match requires one distinct game and verified, non-conflicting evidence;
multiple games, explicitly conflicted evidence or a truncated result are
conflicts. Unverified evidence requires review. Rejected records are ignored.
The lookup considers all regions and locales, and therefore fails closed when
those scopes produce ambiguous evidence. It does not create a service key,
authorize ingestion, or publish content. Existing database permissions and
moderation boundaries remain unchanged.

The server bounds query results and does not expose database errors. An absent
schema or failed lookup returns unavailable rather than an empty result.
Operational testing must verify real session access and regional evidence against
an isolated configured environment; unit and repository tests do not establish
hosted acceptance. Future machine access requires a separately designed scoped
credential and transactionally safe write path.
