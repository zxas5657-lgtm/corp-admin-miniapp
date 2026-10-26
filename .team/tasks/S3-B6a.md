# S3-B6a: staff week view and the secretary 待办 inbox view model (owner: codex-exec)

S3-F4 (secretary and reception tools) is split into view-model tasks (codex: B6a, B6b) and page tasks (cursor: F4a, F4b). This is B6a. Product rules are already decided in `DESIGN.md` and `DATA_MODEL.md`; do not invent new ones. If a rule is missing, stop and ask the lead.

Read first: `DESIGN.md` 信息架构 (lines 18–29: secretaries' 行程 can switch between the leaders they support; 待办 holds leader notes, items awaiting confirmation and items sent back), `DATA_MODEL.md` §4 (roles and visibility), §5.8 (`leaders[]` confirm states, secretary changes), §5.10 (`leader_notes`), `miniprogram/viewmodels/week.js` and its tests (S3-B5), `domain/visibility.js`, `domain/permissions.js` (`canEditItem` and friends), `domain/notes.js`, `domain/roles.js`, `data/reference.js` (`SUPPORTS`).

Do not run git. Do not edit `pages/`, `components/`, `utils/`, `scripts/screens.js` (cursor owns those). Locale keys in `i18n/zh-CN.js` / `en.js` in proper UTF-8 Chinese, no `\u` escapes. Never edit `cloudfunctions/*/shared/`; if you touch `domain/`, run `npm run sync`. Format with the repo's Prettier settings (single quotes, trailing commas, print width 100).

## 1. `leaderWeekView` staff mode (`viewmodels/week.js`)
New optional input `leaderId`. When the actor is a `secretary` or `secretaryAdmin`:
- `leaders`: the switcher list `[{ id, name, active }]`: the secretary's supported leaders (`ctx.supports[actor.personId]`), or every leader for `secretaryAdmin`, in reference order. `leaderId` picks the active one; default the first. No leaders → `leaders: []` and an `emptyReason` key the page can show ("no supported leaders").
- The days show **the active leader's itinerary** (items whose `leaderIds` include that leader and that the actor may see, plus vehicle requests `forLeaderId` that leader), using the same grouping, markers, detail and zone line as the leader's own view. Markers come from **that leader's** entry in `leaders[]`.
- Staff-only additions per item: `declined` marker with `declineReason` when that leader's entry is `declined`; `canEdit` (domain `canEditItem`), `canCancel`; `canConfirm` / `canDecline` stay false for staff.
- Leaders' own view is unchanged (keep all S3-B5 tests passing). Other roles get `leaders: []` and today's behaviour.
- Add `rowKey` (`<id>:<date>`) to every item row: a trip spanning two days appears on two rows, and the page needs a unique key so expanding one row does not expand the other.

## 2. `viewmodels/todo.js`: `todoView(config)`
Inputs as the other view models: `{ state: { items, vehicles, notes }, refs, now, actor, viewerTz, ctx }`. For `secretary` (supported leaders only) and `secretaryAdmin` (all leaders); other roles get an empty view with a reason.
Sections, each `{ key, title, count, rows }`, in this order, hidden when empty unless all are empty (then one `empty` block):
1. `notes`: open leader notes (`status: 'open'`) visible to the actor (`noteVisibleTo`), newest first. Row: `id`, leader name, text, relative created time, `canConvert`, `canClose`.
2. `pending`: active items where some leader's entry is `pending`, soonest first. Row: `id`, leader name(s) still pending, title, time label (viewer zone), type icon key, `rowKey`.
3. `declined` (被退回): active items where some leader's entry is `declined`. Row: as pending plus `declineReason` and `canEdit`.
Also `badgeCount` = open notes + declined (what needs the secretary's action), for the 待办 tab badge.

## 3. Tests
`tests/viewmodels.week.test.js`: staff mode for a secretary (supported leader only; switching leaders; an unsupported leader id falls back to the first supported), a secretaryAdmin (all leaders), the `declined` marker and reason, `canEdit` true for staff and false for a leader on another leader's item, `rowKey` uniqueness for a two-day trip.
`tests/viewmodels.todo.test.js`: each section and its ordering, visibility (a secretary does not see notes or items of a leader they do not support), `badgeCount`, empty states, both locales. Run the suite also with `TZ=America/Los_Angeles` and `TZ=Asia/Shanghai`.

## Checks
`npm test`, `npm run check`. If your sandbox fails the temp-dir or shared-copy tests, say so; the lead reruns them.

## Reply with
Files changed, the output shapes (short JSON examples for one staff week item and one row per todo section), the test count, and commands skipped because they needed escalation.
