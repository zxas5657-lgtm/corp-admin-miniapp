# CLAUDE_REVIEW — corp-admin-miniapp

Review date: 2026-10-24 (prototype "today"). Scope: `DESIGN.md`, `PROJECT_RULES.md`, `README.md`, `progress.md`, `REVIEW_PROMPT.txt`, `prototype/index.html`, `prototype/app.js` (1176 lines), `prototype/styles.css`.

I read everything but did not run the prototype in a browser, so behavioural claims come from reading the code. Line references are `file:line`.

**Headline.** The prototype is a clean, honest clickable spec. The meeting → schedule path works because the schedule is a derived view over `meetings` and `vehicles`, and that design should be kept. Four things will hurt the MVP unless fixed before coding:

1. The docs forbid English, which contradicts the product requirement.
2. Every user-facing string, and much of the persisted data, is a hard-coded Chinese literal.
3. Meeting status is stored, not derived from time.
4. All logic lives in one DOM-coupled file, and the platform (web page or native mini-program) is undecided.

---

## P0 — fix before writing MVP code

### P0-1. The project docs contradict the bilingual requirement

- **Problem.**
  - `DESIGN.md:275` lists "英文界面" under *v1 不做*.
  - `DESIGN.md:286` says "界面文案继续用中文".
  - `PROJECT_RULES.md:7` (rule 3) says "界面文案用中文… 都用中文".
  - `index.html:2` is `lang="zh-CN"` and `index.html:8` hard-codes the Chinese title.
  - An AI assistant or collaborator following these files will actively break the requirement.
- **Recommendation.** Before any code, update the docs. This review did not touch them, as instructed.
  - `PROJECT_RULES.md` rule 3 → "界面文案必须中英双语（zh-CN / en）。UI 代码里不得出现字面量文案，所有文案走 `t()`；新增文案时两个语言文件同时补齐。"
  - `DESIGN.md`:
    - Remove "英文界面" from *v1 不做* and "界面文案继续用中文" from *下一步*.
    - Add a *语言* section covering the switch location, the default-language rule and the glossary (see §5).
    - Add an "EN copy" column to the state table and the status-pill list.
  - `progress.md`: add "[ ] i18n 骨架（zh/en 文案文件 + 语言切换）" as a checklist item *before* "会议 + 日程 MVP".
  - `README.md`: mention the language switch.

### P0-2. There is no i18n seam: copy is inline, concatenated, and stored in the data

Details are in §5. In short:

- Copy is hard-coded in `app.js`, `index.html` (tab labels at `:64,:71,:81,:87`; aria-labels; `<title>`) and `styles.css` (none, which is good).
- Messages are built by concatenation and cannot be translated as-is:
  - `周${WEEKDAYS[...]}` (`app.js:297`)
  - `有 ${n} 条待派车…` (`app.js:592`)
  - `${n} 人`, `${n} 项`
  - `errors.join("；")` (`app.js:869`)
  - `attendees.join("、")` (`app.js:548`)
- **Persisted records store display strings.** Examples: `room: "3楼小会议室"`, `attendees: ["林晓雯", …]`, `organizer: "林晓雯"`, `driverName: "赵磊"`, and the role title `"总裁办公室"`. Switching language would leave rooms and people in Chinese forever, and any saved Chinese string becomes the join key.
- **Recommendation.** Do the following before screens are ported:
  - Store ids (`roomId`, `personId`, `carId`) and resolve localized names at render time.
  - Move all copy into locale files and expose a `t(key, params)` plus `tn(key, count, params)`.
  - Make validation return error *codes*, not sentences.
  - See §5 for the file layout and sample keys.

### P0-3. Meeting status is stored, never derived

- **Problem.**
  - `submitMeeting` writes `status: "upcoming"` (`app.js:933`) regardless of date or time.
  - A meeting created for 10月22日, or for today 09:00–09:30 at the demo time of 09:20, shows "待开始" forever.
  - Nothing ever moves `upcoming → ongoing → done`.
  - The only "进行中" meeting works because the seed hand-sets it to match `DEMO_TIME`.
  - Status is the core signal of the schedule screen, the list filters and the pill, so this will be the first visible bug in the MVP.
- **Recommendation.**
  - Remove `status` from the meeting record (drop it from the `DESIGN.md:260` field list).
  - Add a pure `meetingStatus(meeting, now)`.
  - Inject the clock: `clock.now()` returns the fixed demo instant in the prototype and the real time in the app. Today it is two constants: `TODAY`/`DEMO_TIME` in `app.js:7-8` and a literal `09:20` in `index.html:16`.
  - Decide how to treat past-dated creation: allow it (shown as 已结束) or block it with an error code `meeting.date.inPast`. I recommend allowing it and deriving the status.
  - Recompute on `onShow` and with a minute timer on the schedule page.

### P0-4. Logic, data, formatting and rendering are one DOM-coupled file, and the platform is undecided

- **Problem.**
  - `app.js` mixes seed data, permissions, date maths, validation, `innerHTML` string templates, hash routing and event delegation.
  - `progress.md:9` and `DESIGN.md:279` say "小程序或本地页面都可以", so the target is not decided.
  - If the MVP is a native WeChat mini-program, several prototype assumptions do not port:
    - **`wx.switchTab` ignores query strings.** The "create meeting → land on the schedule at `?date=…&focus=…`" flow (`app.js:938`) cannot be a URL. Pass `selectedDate` and `focusId` through a shared store or `getApp().globalData`.
    - **Tab bar text and nav titles are static config.** `app.json` `tabBar.list[].text` and `navigationBarTitleText` cannot follow the locale. You must call `wx.setTabBarItem` and `wx.setNavigationBarTitle` on `onLoad`, `onShow` and language change.
    - **WXML cannot call functions.** `t()` has to run in page JS (`setData({ i18n: … })`) or in a Behavior.
    - `<select>` and `input[type=date|time]` become `<picker>`.
    - `FormData`, `:scope`, `location.hash` and `innerHTML` do not exist there.
- **Recommendation.**
  - Decide now. My recommendation is a native mini-program project (plain JS or TS) with the pure modules below, because the prototype already proved the UI.
  - Create a platform-free `domain/` folder:
    - `meeting.js` (create, validate, status)
    - `vehicle.js` (state machine)
    - `schedule.js` (`scheduleItems(date)` selector)
    - `permissions.js`
    - `dates.js`
  - Add `i18n/`, `store/` and `pages/`.
  - `store/` is a storage adapter: `wx.getStorageSync` in the app, `localStorage` in the web prototype.
  - Unit-test `domain/` with plain Node, with no WeChat tooling.

### P0-5. The milestone boundary is ambiguous

- **Problem.**
  - `progress.md` splits "会议 + 日程 MVP" from "用车闭环".
  - `DESIGN.md:11-14` says the MVP must demo *both* lines.
  - The schedule view already merges vehicles.
  - A sprint plan needs one answer.
- **Recommendation.** Define the MVP as: the meeting flow plus a schedule built from a list of item sources. The vehicle source is registered but is read-only seed data until the 用车闭环 milestone, and `scheduleItems` takes `sources: [meetings, vehicles]` so adding vehicles later is not a rewrite. Write this into `progress.md`.

---

## P1 — fix during the MVP sprint

### P1-1. Permissions are `state.role === …` checks, and the demo role switcher is fused into the product

- **Problem.**
  - `canCreateMeeting`, `canRequestVehicle` and `canDispatch` (`app.js:304-314`) hard-code role ids.
  - `DRIVER_NAME = "赵磊"` (`app.js:10`) is used as *the* driver for any dispatch, coupling the role to a person.
  - The role switcher is a real tab-bar page (我的).
  - Product copy leaks the demo mechanism:
    - "可在 我的 切换身份" (`app.js:594,639`)
    - "演示时刻 09:20…" (`app.js:536`)
    - "可能已经被恢复演示数据清掉了" (`app.js:534,662`)
  - These strings would ship to users.
- **Recommendation.**
  - Replace the checks with a capability map in `domain/permissions.js`. For example, `ROLE_CAPS = { admin: ['meeting.create','vehicle.request'], driver: ['vehicle.dispatch','vehicle.complete'], … }` and `can(role, cap)`. Adding a role or splitting 司机 / 车管 then needs no code hunt.
  - Keep `vehicle.dispatch` and `vehicle.complete` as separate capabilities even though one role holds both. In real fleets the dispatcher and the driver usually differ.
  - Replace `DRIVER_NAME` with `drivers[]`. Dispatch records `dispatchedBy` (the current user) and `driverId` (default: the current user if they are a driver).
  - Move the role switcher behind a `DEV_ROLE_SWITCH` flag. In the web prototype, put it in a panel *outside* the phone frame so it is available on every screen.
  - Put all demo-only strings in a `demo.*` key namespace so they can be stripped.

### P1-2. Role-specific IA: same landing page and same badge for everyone

- **Problem.**
  - A 司机/车管 user lands on 日程 and must switch to 用车.
  - The red badge on 用车 (`app.js:791-794`) shows the pending count to every role, including 行政专员 and 前台, who cannot act on it.
  - After switching role, the user stays on 我的 with no cue that the behaviour changed.
  - Lists have no ownership scope. A requester cannot filter to "我申请的", and the fleet user cannot filter to "待我处理".
  - 领导 and 行政专员 are behaviourally identical (only the hint text differs), and 前台's main job (visitors) is unavailable and buried two taps deep.
- **Recommendation.**
  - Keep the four tab names (DESIGN requires it), but:
    - Make the badge role-aware: the pending count for fleet, and nothing or "my requests that changed" for requesters.
    - After a role switch, route to the role's home tab (fleet → 用车).
    - Add a segmented control to the 用车 list ("全部 / 我的 / 待处理"). Default to "待处理" for fleet and "我的" for requesters.
    - Add the same control to the schedule ("全部 / 我参与的").
  - Either give 领导 one real difference (for example, schedule defaults to "全部") or merge the role in the demo.
  - Surface 来访接待 / 行政日常 as a visible card on 我的, not only menu rows.

### P1-3. The meeting lifecycle has no way to fix a mistake

- **Problem.**
  - `DESIGN.md:152-154` and `:270` exclude edit, reschedule and cancel.
  - A specialist who mistypes a room or time has no recovery path except "恢复演示数据", which wipes everything.
  - Admins reschedule constantly, so the MVP will feel broken in a demo.
- **Recommendation.**
  - Minimum viable: **cancel** (soft state `cancelled`, kept in the list and hidden from the schedule's active view or shown struck through) and **edit before start**.
  - If you defer both, state it explicitly in `DESIGN.md` and add an organizer-only "删除" for not-yet-started meetings.
  - Add the corresponding i18n keys now (`meeting.status.cancelled`, `meeting.action.cancel`, the confirm sheet).

### P1-4. No conflict signal on rooms or attendees

- **Problem.**
  - Room conflict detection is out of scope (`DESIGN.md:270`).
  - The top real-world failure for "meeting + schedule" is double-booking 5楼董事会会议室, and attendees can overlap too.
  - Nothing warns the creator.
- **Recommendation.**
  - Add a **non-blocking warning** at submit: "该会议室 10:00–11:00 已有「周经营例会」" / "The room is already booked 10:00–11:00 by 'Weekly Ops Review'", with "仍然提交 / Submit anyway".
  - It is a pure function over `meetings`, cheap to build and cheap to test.
  - Online meetings (`线上会议`) are exempt.

### P1-5. The vehicle flow has holes between the states

The state machine as built is `pending → assigned → done`, plus `rejected` that exists only in seed data.

- **No reject action.** `rejected` can never be reached. `rejectReason` is read but never written. Add "驳回" to the dispatch sheet with a required reason (error code `vehicle.reject.reasonRequired`).
- **No undo or reassign.** A wrong car pick on `pending → assigned` is permanent (`app.js:1074-1076`). Add "改派" (assigned → assigned) or cancel-dispatch, and allow the applicant to withdraw a pending request.
- **Completion has no guard.** A request for 10月27日 can be marked 已完成 today. Warn or block when `now < departure`.
- **Car availability is a hard-coded flag.** `busy: true` on 京A·F3308 (`app.js:46`) is not derived from any record, and 京A·E1902 is already assigned to v3 yet shows "空闲".
  - Derive `busy` from overlapping assigned trips (assume a default 2 h window) and show it as a warning or block.
  - Today the "使用中" label is misleading, not just simplified.
- **No capacity check.** passengers = 6 can be dispatched onto a 4-seat sedan. Add `seats` to `CARS` and warn.
- **No audit trail.** Add `createdAt`, `dispatchedAt`, `completedAt`, `dispatchedBy`. Show them under the step bar.
- **No re-apply from a rejected request.** Add "重新申请" with prefilled fields (P2).
- **Stale-state conflicts are silent.** If the request is no longer pending when the driver confirms, the sheet just closes and re-renders (`app.js:1069-1073`). Use an error code `vehicle.alreadyHandled` and show it, because a backend will make this common.
- Put the transition rules in one table in `domain/vehicle.js` and generate the UI action list from it.

### P1-6. Meeting ↔ schedule interaction

What works: the schedule is derived, so a new meeting appears automatically, and `?date&focus` highlighting is a good affordance. Gaps:

- **Navigation by week is awkward.**
  - The 7-day strip is always centered on the selected day (`app.js:442`), so every tap shifts the whole strip under the finger, and "today" can scroll off.
  - There is no prev/next week and no month jump.
  - Use a fixed week (with a locale-aware first day: Monday in zh, Sunday in en) with swipe or arrows, plus a date-picker shortcut.
- **`focus` is sticky.**
  - It stays in the URL (`app.js:938`), so returning to the schedule from a detail page re-scrolls and replays the highlight animation (`app.js:798`).
  - Clear it with `history.replaceState` after the first render, or store it in memory.
- **The schedule's empty-state copy contradicts behaviour.**
  - It says "已派出的车辆会列在这里" (`app.js:464`), but *pending* vehicles also appear. `DESIGN.md` excludes only 已驳回.
  - Reword: "新建的会议和有效的用车申请会列在这里".
- **No path from a meeting to its day.** Add "在日程中查看" on meeting detail.
- **No link from meeting to vehicle** (for example, visitor prep meeting → airport pickup). Offer "为该会议申请用车" with prefill (P2).
- **The meetings list sorts by status first, then date** (`app.js:503-507`), but groups headers by date.
  - A mixed status set produces repeated or out-of-order date headers. For example, a done meeting and an upcoming meeting on the same date appear separated.
  - Sort by date/time and use the filter for status.
- **Single list for all users.** Everyone sees every meeting. Decide the visibility rule (everyone, or only participants and organizer) and capture it in the permissions module even if v1 shows all.

### P1-7. Forms: state coverage gaps (see also §4)

- **Errors are one aggregated bar** (`app.js:861-871`), joined with "；". There is no per-field highlight, `aria-invalid`, or focus on the first bad field. Return `[{field, code}]` from the validators and render inline.
- **The loading state destroys the form** (`app.js:873-881` replaces `form.innerHTML`). When submit can fail (it can: storage quota, a future backend), the user loses everything they typed. Keep the form mounted; disable fields and show the progress bar.
- **`save()` swallows storage errors** (`app.js:242-248`). With `wx.setStorageSync` this will throw sometimes. Return a result, and show a retry error state. Never navigate to a "success" screen when the write failed.
- **No dirty-leave confirmation** when going back from a half-filled form.
- **There is no global error boundary.** A malformed stored record (for example a missing `start`) throws in `localeCompare` and leaves a blank screen. Wrap render in try/catch and show a generic "出错了 / Something went wrong" state with a retry and a reset option.
- **There is no schema migration.** `load()` returns `seed()` whenever `version !== 1` (`app.js:227-229`), silently deleting user data on the next schema change. Write `migrate(from, to)` steps now and use a new storage key for the MVP (not `corp-admin-prototype-v1`).
- **The artificial 700 ms delay** (`app.js:897`) should be demo-only. The design says "约半秒".

### P1-8. English layout will break the current CSS

- **Labels.** `.cell label, .cell .k { width: 72px }` (`styles.css:591-597`) fits 3 CJK characters. English labels such as "Destination", "Departure date" and "Attendees" overflow or wrap badly. Use `min-width: 72px; max-width: 45%` with wrapping, or stack the label above the value for long labels.
- **Pills.** They have a fixed height and `white-space` is not set, so "Awaiting dispatch" will wrap or overflow. Allow a longer max-width and keep `nowrap` with ellipsis.
- **Tab and filter labels.** Verify "Meetings" and "In progress" at 11–13 px on a 320 px screen.
- **Role rows.** "Driver / Fleet" plus the English title needs two lines.
- **Fonts.** The stack (`styles.css:42`) is CJK-first. Add `system-ui, -apple-system, "Segoe UI", Roboto` for Latin, and mirror it in `DESIGN.md:70`.
- **Verification.** Add a pseudo-locale (`zh` text padded ×1.4) to catch overflow before translation is done.

### P1-9. Process: not a git repo, and rule 4 cannot be followed

- **Problem.**
  - `progress.md:4` has "项目文件夹与私有仓库" unchecked, and the working directory is not a git repository.
  - `PROJECT_RULES.md` rule 4 ("一个功能一次提交") cannot be followed.
- **Recommendation.** `git init` and make a baseline commit before the sprint, so each i18n and domain change is reviewable.

---

## P2 — polish and later

- **Contrast.**
  - `--ink-3 #8B95A5` on white is about 3.0 : 1, below the 4.5 : 1 needed for small text.
  - It is used for meaningful copy, not only placeholders: `.section-label`, `.sub`, `.count`, `.fine` (the *reason a button is disabled*), skeleton descriptions and tab labels.
  - Placeholders `#b0b8c4` are about 2 : 1, and the disabled button (`#C5CED8` with white text) is about 1.7 : 1.
  - Darken `--ink-3` to about `#6B7585` for text, and keep the light value for icons and borders only. Reflect this in `DESIGN.md:51`.
- **Touch targets.** Filter chips and attendee chips are 32 px (`styles.css:555-564,654-661`). Aim for ≥ 44 px of hit area.
- **Design-doc spacing is self-contradictory.** `DESIGN.md:89` says only 4/8/12/16/24/32, but the same section specifies 10 and 14, and the CSS uses 2, 6, 10, 14, 18, 36. Either widen the scale (add 2/6/10/14) or fix the CSS.
- **Sheet accessibility.** `sheet.focus()` is called on open (`app.js:846`), but there is no focus trap and no focus restore on close.
- **Navigation back.** `history.length > 1 ? history.back()` (`app.js:1170`) can leave the app when a user deep-links into a detail page in a tab that already had history. Prefer an explicit `parentHash()` when there is no in-app previous route. (This disappears in a native mini-program, where `navigateBack` is scoped to the app.)
- **Attendee picker.** Six hard-coded chips will not scale. Plan a searchable picker over a contacts source, and keep ids in the model.
- **IDs.** `` `m${Date.now().toString(36)}` `` is fine locally. Use a uuid or a generator when a backend arrives.
- **Unknown-status fallback.** `pill()` falls back to the literal "未知" (`app.js:334`). Localize it and log the unknown status.
- **Duplicate toast/banner mechanisms.** Success is shown either as a banner (meeting, request) or a toast (dispatch, complete, role switch). Pick one rule: a banner when navigating to a new page, a toast when staying.
- **DESIGN.md vs. prototype nits.** The step bar's current-step semantics (the "now" step is the *awaited* step) and the list-grouping description are fine, but worth one sentence in `DESIGN.md`.

---

## 2. Alignment gaps between DESIGN.md and the prototype (summary)

Mostly aligned (colors, type scale, components, flows, copy for the listed states). Gaps:

| # | DESIGN says | Prototype does | Priority |
| --- | --- | --- | --- |
| 1 | No English; Chinese copy only (`:275,:286`) | Matches the doc, but both conflict with the product requirement | P0 |
| 2 | Meeting field `status` stored (`:260`) | Stored and never updated; wrong for new/past meetings | P0 |
| 3 | Badge on 用车 "有待派车时" | Shown to every role | P1 |
| 4 | Schedule excludes only 已驳回 | Empty copy says "已派出" only | P1 |
| 5 | Meetings "按日期分组" | Sorted by status first, so date groups can repeat | P1 |
| 6 | 已驳回 listed as a state | No action reaches it | P1 |
| 7 | "约半秒" loading | 700 ms fixed timer | P2 |
| 8 | Spacing only 4/8/12/16/24/32 | 2/6/10/14/18/36 used, and DESIGN itself uses 10/14 | P2 |
| 9 | 三级文字 for "占位、未选中的标签" | Used for meaningful copy; fails contrast | P2 |
| 10 | Font stack in `DESIGN.md:70` | CSS has a longer stack; Latin fallbacks missing in both | P1 |
| 11 | "原型里的今天固定为 10月24日" | Duplicated in `index.html:16` and `app.js:7-8` | P2 |

---

## 4. Empty / loading / error / success coverage

| Surface | Empty | Loading | Error | Success | Gaps |
| --- | --- | --- | --- | --- | --- |
| Schedule | ✅ (25 日) | ❌ | ❌ | ✅ banner | Empty copy wrong (above). No load-failure state. Needs a skeleton once storage is async (`wx.getStorage`). |
| Meetings list | ⚠️ filter-empty only | ❌ | ❌ | – | Empty copy always says "新建一场会议" even for roles that cannot create it, and even when there are no meetings at all (needs two variants: *no data* vs *filtered*). |
| Meeting detail | ✅ not-found | ❌ | – | – | Not-found copy mentions demo reset (leaks the demo). Add a "cancelled" variant. |
| Meeting form | – | ✅ (form destroyed) | ⚠️ one aggregated bar | ✅ banner on schedule | See P1-7. No storage-failure, no dirty-leave, no room-conflict warning. |
| Vehicles list | ⚠️ only when zero records | ❌ | ❌ | – | Empty copy "提交后会进入待派车" is wrong for fleet (should read "暂无待派申请"). No filtered-empty once "全部/我的/待处理" exists. |
| Vehicle detail | ✅ not-found | ❌ | – | ✅ banner/pill | Pending/assigned notes show demo-only text. |
| Vehicle form | – | ✅ | ⚠️ aggregated | ✅ banner | Same as the meeting form. |
| Dispatch/complete sheets | – | ❌ | ⚠️ only "no car selected" | ✅ toast | Stale state is silent. No reject path/reason errors. No "car no longer available" error. |
| 我的 | – | – | – | ✅ toast | Language-switch success/failure not yet defined. |
| Skeleton pages | ✅ ("未开放") | – | – | – | Fine. |
| Global | ❌ | ❌ | ❌ | – | No error boundary, no offline, no storage-full state. Define them now as keys even if v1 rarely triggers them. |

Recommendation for a consistent model: define four reusable components with i18n props (`<State kind="empty|error|loading|success" titleKey bodyKey actionKey>`) and one error-code → message-key map. Every state in the table above then needs only two keys (title, body) per locale.

---

## 5. Bilingual (zh / en) readiness

### 5.1 What is missing today

| Area | Where | Status |
| --- | --- | --- |
| Static HTML copy: `<title>`, meta description, caption, tab labels, aria-labels, noscript | `index.html:2,7,8,13,37,58,64,71,81,87,92,98` | Hard-coded zh; `lang` fixed |
| All screen copy, buttons, hints, empty/error/success text | `app.js` throughout (a rough count is 150+ literals) | Hard-coded zh |
| Enums: role labels/hints/titles, meeting & vehicle status labels, filters, skeleton rows | `app.js:13-88` | Labels inside constants, with no key indirection |
| Reference data: rooms, people, cars, driver | `app.js:41-47,10` | zh strings used as ids |
| Seed demo records | `app.js:95-220` | zh only; ids and display text mixed |
| Date/time/number formatting | `formatDay` (`:295`), `WEEKDAYS` (`:11`), `${n} 人` | zh templates |
| Pluralization / grammar | "1 person / 2 people", "1 item / 2 items" | Not modeled |
| Joiners and punctuation | "、", "；", "–" | zh-specific |
| Validation messages | `submitMeeting`, `submitVehicle` | Sentences, not codes |
| Persistence | `localStorage` blob | Stores display strings; no `locale` key |
| Layout | `styles.css` fixed label width, pill sizing, fonts | Not tolerant of ~1.3–1.5× longer English |
| Docs | `DESIGN.md`, `PROJECT_RULES.md` | Forbid English |

### 5.2 Concrete structure (do before MVP coding)

```text
i18n/
  index.js          // t(), tn(), setLocale(), getLocale(), onChange(), fmt helpers
  zh-CN.js          // source of truth for keys
  en.js             // must have the same keys (test enforces it)
  glossary.md       // agreed translations for domain terms
domain/             // no strings at all, only ids and error codes
store/              // storage adapter; keeps `locale` in a separate key from data
```

**Key naming: `area.object.variant`, lowercase camel segments, stable ids.**

```js
// i18n/zh-CN.js
module.exports = {
  tab: { schedule: '日程', meetings: '会议', vehicles: '用车', me: '我的' },
  nav: { back: '返回', scheduleTitle: '日程', meetingNew: '新建会议', meetingDetail: '会议详情',
         vehicleNew: '申请用车', vehicleDetail: '用车详情', visitors: '来访接待', daily: '行政日常' },
  role: {
    leader:    { label: '领导',      hint: '可查看全部安排，可以建会，也可以申请用车。' },
    admin:     { label: '行政专员',  hint: '可以建会、申请用车，并跟进当天的日程。' },
    driver:    { label: '司机/车管', hint: '看待派的申请，分派车辆，行程结束后标记完成。' },
    reception: { label: '前台/接待', hint: '可查看日程和会议，也可以为接待申请用车。' },
  },
  status: {
    meeting: { upcoming: '待开始', ongoing: '进行中', done: '已结束', cancelled: '已取消' },
    vehicle: { pending: '待派车', assigned: '已派车', done: '已完成', rejected: '已驳回' },
    unknown: '未知',
  },
  schedule: {
    emptyTitle: '这天没有安排',
    emptyBody: '新建的会议和有效的用车申请会列在这里。',
    count_other: '{n} 项',
    backToToday: '回到今天',
  },
  meeting: {
    form: { title: '会议主题', date: '日期', start: '开始', end: '结束', room: '会议室',
            attendees: '参会人', agenda: '议程（选填）', submit: '提交' },
    created: '会议已创建，并已写入这一天的日程',
  },
  vehicle: { /* … */ },
  error: {                                   // keyed by domain error codes
    'meeting.title.required': '请填写会议主题',
    'meeting.time.endBeforeStart': '结束时间需晚于开始时间',
    'meeting.attendees.required': '请选择至少一位参会人',
    'vehicle.passengers.range': '乘车人数请填 1 到 6 人',
    'vehicle.alreadyHandled': '该申请已被处理，请刷新',
    'storage.writeFailed': '保存失败，请重试',
  },
  state: { loading: '加载中…', submitting: '提交中…', genericError: '出错了，请重试', retry: '重试' },
  me: { language: '语言 / Language', reset: '恢复演示数据' },
  a11y: { weekPicker: '选择日期', filterMeetings: '筛选会议', closeSheet: '关闭弹层' },
  demo: { /* strings stripped in production builds */ },
  date: { dayHeading: '{m}月{d}日 周{w}', weekdayShort: ['日','一','二','三','四','五','六'] },
};
// i18n/en.js
module.exports = {
  tab: { schedule: 'Schedule', meetings: 'Meetings', vehicles: 'Vehicles', me: 'Me' },
  role: { admin: { label: 'Admin Specialist', hint: '…' }, driver: { label: 'Driver / Fleet', hint: '…' }, /* … */ },
  status: { vehicle: { pending: 'Awaiting dispatch', assigned: 'Dispatched', done: 'Completed', rejected: 'Rejected' }, /* … */ },
  schedule: { count_one: '{n} item', count_other: '{n} items' },
  date: { dayHeading: '{wd}, {mon} {d}', /* month and weekday name arrays */ },
  /* … same key set … */
};
```

**Rules.**

1. `t(key, params)` interpolates `{name}`. `tn(key, n, params)` picks `key_one` / `key_other` (en) or `key_other` only (zh), using `Intl.PluralRules` if the target base library has it, otherwise a tiny `n === 1` rule.
2. **No string concatenation for sentences.** Compose with a single template and named params (`'已分派给{driver}'` / `'Assigned to {driver}'`). Word order differs per language.
3. **Domain returns codes, not text.** `validateMeeting()` returns `[{ field: 'title', code: 'meeting.title.required' }]`, and the UI maps `error.<code>` through `t()`.
4. **Reference data carries ids and names per locale.**
   ```js
   ROOMS  = [{ id: 'f3-small', name: { zh: '3楼小会议室', en: '3F Small Meeting Room' } }, …]
   PEOPLE = [{ id: 'p-chen', name: { zh: '陈启明', en: 'Chen Qiming' }, titleKey: 'person.chen.title' }, …]
   CARS   = [{ id: 'gl8a', plate: '京A·D8821', model: { zh: '别克 GL8', en: 'Buick GL8' }, seats: 6 }, …]
   ```
   Records store only `roomId`, `organizerId`, `attendeeIds`, `carId`, `driverId`. A `localName(entity)` helper returns the current locale's name.
5. **User-entered text** (title, agenda, destination, note, reject reason) is **not translated**. Show it as typed. Seed demo records may carry `{zh,en}` objects, and a `displayText(v)` helper returns `v` if string, otherwise `v[locale]`.
6. **Dates and times.**
   - Prefer format templates in the locale files (`date.dayHeading`, month and weekday name arrays) over `Intl`, which is inconsistent across WeChat base-library versions and platforms.
   - If you use `Intl.DateTimeFormat`, verify it on your minimum base library and keep the template path as a fallback.
   - Times stay 24-hour `HH:mm` in both locales. Use `–` for ranges.
   - The first day of the week is a locale setting.
7. **Lists.** `listJoin(items)` → zh "、", en ", " with "and" for ≥ 3 if needed.
8. **Static config.** Re-apply `tabBar` text (`wx.setTabBarItem`), the page title (`wx.setNavigationBarTitle`) and the `<html lang>` / `document.title` (web) on every `onShow` and on language change.

### 5.3 Language switch

- **Location.** 我的 → a row labelled bilingually ("语言 / Language") that is always readable in either language. Tapping it opens the existing bottom-sheet pattern with the options **简体中文 / English** (and optionally "跟随系统 / Follow system").
- **Default.** On first run, read the system or WeChat language (`wx.getAppBaseInfo().language`, falling back to `wx.getSystemInfoSync().language`; `navigator.language` on the web). Map `zh*` → `zh-CN`, anything else → `en`. Do not prompt at launch.
- **Persistence.** A separate storage key `corp-admin-locale`. "恢复演示数据" must **not** reset it. If that is intended, change the reset copy to say so.
- **Apply immediately.** On change: `setLocale()` → notify subscribers → re-render the current page → refresh tab bar texts and nav title → set `document.documentElement.lang`. Do not require a restart. Keep scroll position and form input (keep forms mounted, as in P1-7).
- **Roles.** Show role labels in the current locale only. Do not show both languages side by side, apart from the language row itself.

### 5.4 Glossary to agree before translating (starter)

| 中文 | English | Note |
| --- | --- | --- |
| 日程 / 会议 / 用车 / 我的 | Schedule / Meetings / Vehicles / Me | Tab labels must stay short (≤ 9 chars) |
| 领导 | Executive | Alternative: Leadership |
| 行政专员 | Admin Specialist | |
| 司机/车管 | Driver / Fleet | If split later: Driver, Fleet Manager |
| 前台/接待 | Front Desk / Reception | |
| 待开始 / 进行中 / 已结束 | Upcoming / In progress / Ended | |
| 待派车 / 已派车 / 已完成 / 已驳回 | Awaiting dispatch / Dispatched / Completed / Rejected | |
| 派车 / 去派车 / 标记完成 | Dispatch / Dispatch vehicle / Mark as completed | |
| 申请用车 | Request a vehicle | |
| 来访接待 / 行政日常 | Visitor reception / Daily admin | Skeleton pages, also bilingual |
| 未开放 | Not available yet | |
| 恢复演示数据 | Reset demo data | |

### 5.5 Safeguards

- **Key-parity test.** A Node script fails the build if `en.js` and `zh-CN.js` have different key sets, or if a `{param}` appears in one and not the other.
- **Literal-CJK lint.** A `grep` for `[一-鿿]` over `domain/` and `pages/` must find nothing. Only `i18n/zh-CN.js`, seed data and the glossary may contain CJK.
- **Missing key behaviour.** In dev, render the key and warn. In prod, fall back to zh-CN and never show a blank.
- **Pseudo-locale** (text ×1.4) for layout checks.
- **Screenshot both locales** for every screen and state in §4 before calling the MVP done.

---

## 6. What to change first for the meeting + schedule MVP

1. Fix the docs (P0-1) and decide the platform (P0-4). Both are cheap and everything else depends on them.
2. Create `i18n/`, `domain/` and `store/`, and move the prototype's meeting and schedule logic into them with ids instead of display strings (P0-2, P0-4).
3. Derive meeting status from an injectable clock (P0-3).
4. Build the schedule selector over sources (meetings active, vehicles read-only seed) (P0-5).
5. Build the meeting form with code-based, per-field errors, a non-destructive submitting state and a failure path (P1-7), plus the non-blocking room-conflict warning (P1-4).
6. Add cancel, or edit before start, for meetings (P1-3).
7. Fix the week strip and the `focus` handling (P1-6). On mini-program, route the "created → schedule at date" flow through a shared store, not the URL.
8. Add the language switch row in 我的 and the CSS changes for English (P1-8), and check every screen in both locales.

Vehicle-flow fixes (P1-5) and the role-aware IA (P1-1, P1-2) belong to the 用车闭环 milestone, but the capability map and the state-machine table should be written now, because the schedule's permissions and statuses depend on them.

---

## Ordered action list for the next coding sprint

1. `git init` and make a baseline commit (P1-9).
2. Edit `PROJECT_RULES.md` rule 3, `DESIGN.md:275,:286` and `progress.md` for bilingual (P0-1).
3. Decide the platform: native mini-program with pure `domain/` modules (P0-4). Write the decision in `progress.md`.
4. Agree the glossary (§5.4) and create `i18n/zh-CN.js` and `i18n/en.js` with the key skeleton, plus `t()`, `tn()`, `setLocale()` and the key-parity test.
5. Convert reference data to ids with `{zh,en}` names, and make seed data locale-aware (§5.2 rule 4–5).
6. Extract `domain/meeting.js` (validation with codes, derived status with an injected clock), `domain/schedule.js` and `domain/permissions.js` (capability map). Cover them with Node unit tests.
7. Build the storage adapter with a schema version, `migrate()`, a new key, and a separate `locale` key.
8. Build the schedule page: fixed week strip with navigation, the derived list, localized day headings, role-aware empty state and a shared store for `selectedDate` / `focusId`.
9. Build the meeting list and detail pages: date-sorted, with "no data" versus "filtered" empty states and a not-found state. Add cancel or edit (P1-3).
10. Build the meeting form: inline per-field errors, form stays mounted while submitting, storage-failure state, room-conflict warning, dirty-leave guard.
11. Add the language row and sheet in 我的, apply the locale to tab bar, nav title and `lang` immediately, and make "恢复演示数据" leave the locale alone.
12. Fix the English layout issues (label widths, pills, fonts), run the pseudo-locale, and screenshot every screen and state in both languages.
13. Update `progress.md` and commit per feature. Queue P1-5 (vehicle state machine, reject, reassign, derived availability) and P1-2 (role-aware badge and landing) for the 用车闭环 sprint.
