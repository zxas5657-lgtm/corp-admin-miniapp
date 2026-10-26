# S3-F3b: the leader's week view on the canvas surface (owner: cursor-exec)

The leader's 行程 tab becomes the week view described in `DESIGN.md`. The data comes from the new view model `viewmodels/week.js` `leaderWeekView()` (S3-B5, committed `089876c`). Secretaries and other roles keep today's schedule page unchanged.

Read first:
- `DESIGN.md` "领导的一周（内容）" (lines 31–37) and all of "设计系统 v2" (lines 39–198): the canvas surface, glass cards, custom navigation, segmented pill, overview tiles, item rows, markers (canvas column), the primary and secondary buttons, motion, WeChat limits.
- `miniprogram/viewmodels/week.js` and `tests/viewmodels.week.test.js` (the exact output shape).
- Your F1b data layer (`utils/data.js`: `loadDirectory`, `loadRange`, `weekWindow`, `write`, `onChange`, gates), `utils/shell.js`, `utils/season.js`, the custom tab bar, `pages/schedule/`.

Do not run git. Do not edit `miniprogram/domain/`, `store/`, `data/`, `viewmodels/`, `i18n/index.js`, `cloudfunctions/` or their tests; if the view model lacks something, stop and tell the lead exactly what. Locale keys in `i18n/zh-CN.js` / `en.js` (proper UTF-8 Chinese).

## 1. Where it lives
- For the `leader` role the 行程 tab renders the week view (either a new page `pages/week/index` that `tabsFor(leader)` points to, or a leader branch inside `pages/schedule`; prefer the new page and keep `pages/schedule` for staff). Update `utils/tabs.js` and its test accordingly; `homeUrl(leader)` goes there.
- Canvas surface: the static three-stop seasonal gradient fixed behind the page (`--canvas-a` → `--canvas-b` → `--canvas-c`), white text, glass cards without blur. The tab bar on this page is the dark-glass variant (blur only on the fixed bar, with the `@supports` fallback from DESIGN).
- Custom navigation (`navigationStyle: custom`): avatar + name pill on the left, the capsule button space on the right (`wx.getMenuButtonBoundingClientRect()` and safe area), then the big title and `rangeLabel`.

## 2. Content
- Segmented pill 今天 / 本周 (`mode`). Week strip to change week and a date picker to jump (reuse the schedule page's logic); changing week reloads `loadRange(weekWindow(...))`.
- Overview tiles (2 columns, up to 4) from `overview`; tapping a tile sets `filter`, tapping it again clears it.
- Day groups from `days`: a heading per day; merged empty rows show their `label`.
- Item rows: time column (monospace digits) + title + "type icon · place", markers on the right (canvas styles: pending highlight pill, updated dot + text, important outline pill + 600 title, cancelled strike-through and 60% opacity). `zoneLine` as a small line under the time when present.
- Tap a row to expand it in place (height + opacity transition, 0.3 s) showing `detail`; tap again to collapse. Expanding an item that shows `updated` calls `write('markSeen', { id, expectedRev })` once and the marker disappears after the reload.
- Confirm / decline: rows with `canConfirm` show a white 确认 / Confirm button and a glass 有疑问 / Question button. Confirm → `write('confirmItem', { id, expectedRev })`. Question opens a paper bottom sheet with a required reason (`item.decline.reasonRequired` on empty) → `write('declineItem', { id, expectedRev, reason })`. Disable both while a write runs; rev conflicts reload with the F1b notice; other errors use `error.<code>`.

## 3. Rough note to the secretary (the leader ＋)
Replace the F1a "coming soon" toast: the centre ＋ opens a paper sheet with one textarea (max 200 characters, counter), placeholder like 「下周想去趟深圳」, and a send button → `write('createNote', { text })`. Errors `note.text.required`, `note.text.tooLong`, network. On success close the sheet and show a short toast 已发给秘书 / Sent to your secretary.

## 4. States and motion
- Loading (first load), network / server error with Retry, empty week (all days empty → one friendly line) — via `state-view` on the canvas (white text variant).
- Entry animation per DESIGN (fade + 16px rise, 0.6 s, 60 ms stagger, first 8 elements, only on first show and week change, never on setData refresh). No transform animations on ancestors of the blurred tab bar.

## 5. Screens (`scripts/screens.js`)
Keep all 142 runs passing (update paths if the leader's home moved). Add, both locales, as the leader: the week (autumn), the week in spring and winter, today mode, a tile filter active, an expanded trip with stops and an in-trip meeting, an item with pending + confirm buttons, the question sheet with the reason error, an `updated` item, a cancelled item, the note sheet (empty and with text), loading, network error, and a cross-zone item showing `zoneLine` (leader viewing from America/Los_Angeles; use the existing demo hooks for zone and data, or add a demo-only one). Look at the screenshots yourself for contrast on glass (DESIGN line 85–86 limits).

## 6. Checks
`npm test` (once; the lead runs three zones), `npm run check`, `npm run screens`. No `\u` escapes, no BOM, ≤ 100 columns in JS, no secrets. Do not leave helper scripts in the repo.

## Reply with
Files added and changed, where the leader home lives, how markSeen / confirm / decline / createNote are wired, the screens totals, contrast concerns, anything missing from the view model, and open questions (product questions go to the lead; do not invent product rules).
