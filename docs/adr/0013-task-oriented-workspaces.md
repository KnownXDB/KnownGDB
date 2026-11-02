# ADR 0013: Task-oriented MVP workspaces

Status: implemented locally. Real-account walkthrough remains pending; no hosted
deployment, database migration or storage change is included.

## Problem and scope

The foundation rendered account management, game creation, every metadata field,
uploads and asset moderation on a single page. Field ownership and action scope
were unclear. The MVP now uses dedicated views and progressive disclosure while
retaining existing API contracts and permission checks.

Tailwind was already installed and configured through the Vite plugin. Add exact
runtime dependencies `lucide-react` 1.61.0 and `simplebar-react` 3.3.2. Use named
icon imports, visible text labels and a keyboard-focusable SimpleBar content area.
The shared shell provides tokens, controls and navigation; application-specific
forms remain in their respective web/admin entry points.

## Views

Hash navigation keeps local development and the existing hosted SPA entry points
compatible without introducing a router dependency or new server rewrites.
Links support reload, browser history and opening a game in a separate tab.

| Application | View | Task |
| --- | --- | --- |
| Admin | `#/games` | Filter the administrative game list and choose a record |
| Admin | `#/games/new` | Create a canonical draft, then open its editor |
| Admin | `#/games/:id` | Edit Overview, Companies, Releases, Languages, Classification or Review & save |
| Admin | `#/games/:id/visibility` | Explicitly change game visibility with the existing confirmation |
| Admin | `#/uploads` | Submit a private original using the existing upload workflow |
| Admin | `#/moderation` | Select one version from the asset queue, then inspect/review/publish |
| Both | `#/account` | Sign in, recover an account and manage public profile/identity |
| Web | `#/browse` | Search the actual published catalog |
| Web | `#/games/:id/:language` | View assets or reviewed game information in separate sections |
| Web | `#/submit` | Submit an original without unrelated account/editor forms |

Account session logic stays mounted so hiding the account form does not discard
session restoration or revocation events. Recovery links retain their existing
fragment-consumption behavior and show the account view. Administration remains
gated by the verified role, including when opening a direct hash URL.

## Editing and preservation

All metadata sections share one controlled draft. Switching sections does not
unmount their inputs or reset the draft. Hidden fields remain part of API
validation. Native required-field checks identify the invalid control, reveal its
owning section and focus it before saving; a hidden fieldset must not be mistaken
for the offending control. The explicit API remains the authoritative validator.

Save and approval remain separate. Audit evidence and change reasons belong to
Review & save. Catalog-term creation is collapsed and available in the sections
that use those terms. The action bar identifies unsaved state and stays reachable
within the content scroller. Metadata and upload drafts warn before navigation or
reload discards them; confirmed departure can abort an in-flight upload, retaining
the existing reserved-original recovery behavior on the server.

Game visibility is a separate view. Moderation presents game titles and one
selected asset instead of showing every review/publication form simultaneously.
No fake statistics, copied assets, example catalog records or inert navigation
items are added to the product. Letter tiles are typographic game identifiers,
not replacement artwork or claims that official covers are available.

## Visual review

A two-surface concept established dark navy backgrounds, slate panels, cyan
actions, a 216 px desktop admin sidebar, clear section navigation and a simple
public results list. Compared the concept and rendered screenshots directly.

| Check | Implementation and intentional constraint |
| --- | --- |
| Navigation | Four administrative tasks in the sidebar; public navigation stays horizontal. Mobile admin navigation wraps to keep every action readable. |
| Field hierarchy | One metadata section is visible; localized title fields remain grouped. Game type and audit controls are retained because they are part of the existing model. |
| Typography | System sans, explicit 13–14 px controls, 26–44 px page headings, consistent label spacing. |
| Palette and surfaces | Navy canvas, slate borders/panels, cyan primary actions; no reference branding or media. |
| Actions | Sticky save bar; explicit Pending/Approved/Unsaved labels reflect actual state. Approval is shown only for an eligible saved pending revision. |
| Public results | Real catalog titles and counts; the test fixture has fewer rows than the concept, with no fabricated rows added to fill space. |
| Responsive | Desktop at 1365×900 and mobile at 390×900; fields stack, section tabs wrap and there is no document-level horizontal overflow. |

Browser plugin not available; Chrome/Playwright was used. Controlled-response
browser checks cover dedicated routes, field visibility, draft preservation,
cancelled dirty navigation, hidden-field validation, save/reload, a selected
moderation item, standalone uploads and public game sections. These checks do not
claim real account acceptance or publish any remote record. Existing API/domain,
database replay, security policy and build checks remain required.

## Deliberate limits

This is an information-architecture and readability pass. Advanced filtering,
bulk moderation, full artwork browsing, vocabulary merge tooling and a complete
design system are outside this slice. Existing catalog pagination and metadata
limits remain unchanged. Development processes started by the maintainer remain
under their terminal's control; no duplicate environment is started for QA.
