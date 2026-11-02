# ADR 0014: Canonical catalog items and related products

Status: accepted; additive local migration implemented, remote migration pending explicit authorization.

## Context

One creative work can have a demo, a playtest, downloadable content, an
expansion, a remake, a remaster, an edition, a bundle or a soundtrack. These
records may have separate store pages, releases, dates, platforms and external
identifiers. A store identifier or a matching title must not replace the
canonical identity of the KnownGDB record.

The existing `catalog.games.id` UUID is already used by localization, asset,
audit and submission records. Changing or reusing it would break provenance and
historical references.

## Decision

Every registered catalog item receives one immutable UUID in `catalog.games.id`.
The UUID is the KnownGDB canonical identity, not a store identifier. Existing
rows remain base `game` items through a defaulted `item_type` column.

`item_type` distinguishes the identity represented by the row:

- `game`
- `demo`
- `playtest`
- `dlc`
- `expansion`
- `standalone_expansion`
- `remake`
- `remaster`
- `compilation`
- `edition`
- `bundle`
- `season_pass`
- `soundtrack`

Related items keep their own UUID and metadata. `catalog.game_relations` stores
the directed, evidence-backed relationship between a parent and child item.
The relation is not an identity merge. A demo, playtest or DLC therefore has
its own releases, store listings and external identifiers while retaining a
reviewed relation to the base game.

Relation rows require a source reference and confidence. They begin in review;
approved relations require a reviewer and review time. The database validates
the child type for typed relations such as `has_demo`, `has_playtest`,
`has_dlc`, `has_edition` and `has_soundtrack`. Bundles and compilations remain
open to multiple child item types.

The administrative create operation may select the item type. Existing item
types are immutable through the RPC surface; a correction requires an explicit
identity decision rather than an in-place mutation. Duplicate or split
decisions must preserve the original UUID, sources, assets and audit history.

## Consequences

- Store IDs can attach to the correct demo, DLC, edition or base game.
- The public model can show related products without presenting them as the
  original title.
- Existing asset paths and foreign keys remain valid.
- The current admin API remains compatible because omitted `item_type` defaults
  to `game`.
- Store listings, external identities and source observations remain separate
  additive work; this ADR defines their owner identity but does not invent a
  public API for every platform.

## Verification and rollout

The migration is replay-tested locally with existing rows, new demo/playtest
rows, valid relations, incompatible relation rejection, self-relation
rejection and immutable item types. It must be reviewed and integrated through a
PR before any remote migration is applied.
