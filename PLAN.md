# PLAN — corp-admin-miniapp

Owner: lead (Claude Code). Last updated: 2026-10-25.
Input: `CLAUDE_REVIEW.md` (P0/P1/P2 findings). This plan records the decisions that review asked for and orders the work.

## 1. Decisions

### 1.1 Platform
- **Build a native WeChat mini-program in plain JavaScript (CommonJS). No build step and no npm runtime dependencies.**
  - The prototype already proved the UI, and the product is a mini-program.
  - Plain JS means the code runs in WeChat DevTools and in plain Node with no bundler.
- **Freeze `prototype/` as a reference.** It is not ported to i18n and receives no new features.
- **v1 had no real backend** (local storage only). **From Sprint 3 this changes** (owner decision 2026-10-25, §7): the backend is WeChat CloudBase, sign-in is plain WeChat login plus admin-issued invite codes, and `PROJECT_RULES.md` rule 6 was revised to allow it. No secrets and no real personal data go in the repo.

### 1.2 What "backend" means in this team
v1 has no server, so **backend** means every layer below the UI that is free of the platform:
- `domain/`: rules, validation, derived state, permissions and the state machines.
- `i18n/` runtime: `t`, `tn`, the formatters and the locale store. Screen copy is excluded.
- `store/`: the storage adapter, the schema and migrations.
- `data/`: reference data and seed data.
- `tests/` and `scripts/`: the Node tests and checks.

**codex-exec** owns those layers. **cursor-exec** owns `pages/`, `components/`, `behaviors/`, the WXML/WXSS files, the `app.*` shell and the project config. When codex-exec adds a domain error code, it adds the matching zh and en keys in `error.*`. When cursor-exec adds screen copy, it adds the keys to both locale files.

### 1.3 Architecture

```text
project.config.json            miniprogramRoot = "miniprogram/"
package.json                   scripts only (npm test, npm run check); no dependencies
miniprogram/
  app.js app.json app.wxss     shell, tab bar, design tokens            (cursor)
  domain/                      pure logic; no wx, no DOM, no copy        (codex)
    clock.js dates.js meeting.js schedule.js vehicle.js permissions.js
  data/                        reference data (ids + {zh,en} names) and seed  (codex)
  i18n/                        index.js (t/tn/setLocale/onChange/fmt), zh-CN.js, en.js, glossary.md  (codex runtime; both edit keys)
  store/                       index.js (adapter: wx | memory), schema.js (version, migrate)  (codex)
  behaviors/i18n.js            page mixin: setData i18n, tab bar texts, nav title  (cursor)
  components/                  state, pill, cell, sheet, primary-button, week-strip  (cursor)
  pages/                       schedule, meetings, meeting-detail, meeting-form, vehicles, vehicle-detail, vehicle-form, me, visitors, daily  (cursor)
tests/                         node --test; domain, i18n and store       (codex)
scripts/check-i18n.js          key and {param} parity; CJK literal lint over domain/, pages/, components/, behaviors/  (codex)
```

Rules:
- **Data flows one way:** `store` → `domain` selectors → page `setData`. Pages never compute status or permissions themselves.
- **Records store ids only:** `roomId`, `organizerId`, `attendeeIds`, `carId`, `driverId`, `applicantId`. Names are resolved at render time.
- **Status is derived:** meeting status = `meetingStatus(meeting, now)`. The only stored meeting state is `cancelled`.
- **The clock is injected:** `clock.now()` returns the fixed demo instant (2026-10-24 09:20) in demo mode and the real time otherwise.
- **Cross-tab navigation goes through `store`:** "created → schedule at date/focus" passes through `store.ui` because `wx.switchTab` drops query strings.
- **The demo role switch sits behind `DEV_ROLE_SWITCH`.** All demo-only copy lives under `demo.*`.

### 1.4 i18n approach (from review §5)
- Two locales, `zh-CN` and `en`. Keys follow `area.object.variant`.
- Functions:
  - `t(key, params)` interpolates `{name}` placeholders.
  - `tn(key, n, params)` picks the `_one` or `_other` form.
  - `listJoin(items)` joins a list per locale.
  - `fmt.dayHeading(date)` formats a day heading per locale.
  - `localName(entity)` and `displayText(v)` pick the locale's name or text.
- Sentences are never built by concatenation.
- Domain functions return codes (`[{field, code}]`). The UI maps `error.<code>` through `t()`.
- Dates are formatted with locale templates, not `Intl`. Times are 24-hour `HH:mm`. The week starts on Monday in zh and on Sunday in en.
- **Default locale:** system or WeChat language, where `zh*` maps to `zh-CN` and everything else maps to `en`.
  - The choice persists under its own storage key, `corp-admin-locale`.
  - "Reset demo data" does not change it.
- **Locale change:** re-render the page, the tab bar (`wx.setTabBarItem`) and the nav title (`wx.setNavigationBarTitle`). No restart is needed.
- **Safeguards:**
  - The key-parity check and the CJK-literal lint run in `npm run check`.
  - A missing key shows the key and warns in dev, and falls back to zh-CN in prod.
  - A pseudo-locale (×1.4) is used for layout checks.

## 2. P0 fixes (all before MVP screen code)

| ID | Fix | Owner | Status |
| --- | --- | --- | --- |
| P0-1 | Docs allow and require bilingual UI (`PROJECT_RULES.md` rule 3, `DESIGN.md` §v1不做 / §下一步 / fonts / fields, `progress.md`, `README.md`) | lead | done 2026-10-24 |
| P0-2 | i18n seam (`t`/`tn`, locale files, ids in data, error codes) | codex | S1-B2, S1-B3 |
| P0-3 | Derived meeting status + injected clock | codex | S1-B4 |
| P0-4 | Platform decided (§1.1); pure `domain/` split | lead / codex | decided; S1-B1..B5 |
| P0-5 | MVP = meetings + schedule over `sources: [meetings, vehicles]`; vehicles read-only seed until the 用车闭环 sprint | lead | decided; in `progress.md` |

## 3. Sprint 1: foundations, then the meeting + schedule MVP

Order matters. B-tasks unblock F-tasks. **Every task passes the gates in §5 before the next dependent task starts.**

| # | Task | Owner | Depends on |
| --- | --- | --- | --- |
| S1-L0 | PLAN.md, P0-1 doc fixes, glossary seed | lead | — |
| S1-B1 | Scaffold: `package.json` (scripts only), folder skeleton, `tests/` harness (`node --test`), `scripts/check-i18n.js` | codex | — |
| S1-B2 | i18n runtime + `zh-CN.js` / `en.js` skeleton (tab, nav, role, status, error, state, date, me, a11y, demo) + `glossary.md` + tests | codex | B1 |
| S1-B3 | `domain/clock.js`, `domain/dates.js`; `data/reference.js` (rooms, people, cars with seats, drivers) and `data/seed.js` (id-based, `{zh,en}` demo text) + tests | codex | B2 |
| S1-B4 | `domain/meeting.js` (validate → codes, `meetingStatus`, cancel, room/attendee conflicts), `domain/permissions.js` (capability map), `domain/schedule.js` (`scheduleItems(date, sources)`), `domain/vehicle.js` (transition table only) + tests | codex | B3 |
| S1-B5 | `store/`: adapter (wx / memory), schema v2, `migrate()`, key `corp-admin-v2`, separate locale key, `save()` returns a result + tests | codex | B3 |
| S1-F1 | Mini-program shell: `project.config.json`, `app.*`, tab bar, design tokens (contrast fix `--ink-3` → `#6B7585` for text; Latin font fallbacks), `behaviors/i18n.js` | cursor | B2 |
| S1-F2 | Components: state (empty/error/loading/success), pill, cell (English-tolerant label width), sheet (focus handling), primary button + disabled reason | cursor | F1 |
| S1-F3 | Schedule page: fixed locale-aware week strip with prev/next and date picker; derived list; day headings; empty state; `focus` read once from store | cursor | F2, B4, B5 |
| S1-F4 | Meetings list + detail: date-sorted, status filter, "no data" vs "filtered" empty states, not-found, cancel (organizer), "view in schedule" | cursor | F2, B4, B5 |
| S1-F5 | Meeting form: pickers, inline per-field errors, mounted while submitting, storage-failure state, non-blocking room-conflict warning, dirty-leave guard | cursor | F4 |
| S1-F6 | Me page: language row + sheet, role switch behind `DEV_ROLE_SWITCH` (routes to role home), reset demo keeps locale; visitors/daily skeleton pages | cursor | F2 |
| S1-F7 | English layout pass + pseudo-locale; screenshot every screen and state in both locales | cursor + human (DevTools) | F3–F6 |
| S1-L1 | Review each task; final MVP acceptance against review §4 state table, in both locales | lead | all |

### Sprint 1 status (updated by lead)

| Task | State | Commit |
| --- | --- | --- |
| S1-L0 | done | `bf8a693` |
| S1-B1 | done, reviewed | `bb63324` |
| S1-B2 | done, reviewed | `27d0fa2` |
| S1-F1 | done, reviewed (+ r1 fixes: pages → `Component()`) | `58066a0`, `8ce3bbf` |
| S1-B3 | done, reviewed | `80d3f37` |
| S1-B4 | done, reviewed | `2e5d451` |
| S1-F2 | done, reviewed (+ r1 event-name fix `84c327f`) | `6a14067` |
| S1-B5 | done, reviewed (+ B4 fixes) | `10d0282` |
| S1-B6 | done, reviewed. **Added task**: view models for schedule and meetings | `21527cc` |
| S1-F6 | done, reviewed | `e3c3f09` |
| S1-F3 | done, reviewed | `9e0d5b6` |
| S1-F4/F5 | done, reviewed | `f68b565` |
| S1-F7 | Phase A done (7d08797): `npm run screens` captures 30 scenarios in zh-CN and en and writes `screenshots/index.html`. Phase B ran with the owner's AppID: 60/60 shots. The pass found two crashes that the Node tests could not see, both fixed by the lead (d0d02a8: directory `require('../i18n')`; the next commit: `getStorageSync` returns `''` for a missing key). The UI findings are in **S1-F8** (cursor). | — |
| S1-F8 | **Done** (1fe1ef5). Fixes from the screenshot pass: tab bar covering sheets (P1), page gutters dropped by `constant()` in the padding shorthand (P1), plus P2/P3 polish. Verified by re-running `npm run screens`: 60/60, reviewed in both locales. | cursor |
| S2-F1 | done, reviewed: vehicle list/detail/form, dispatch/reject sheets, role-aware badge, tappable vehicle cards + schedule scope | `4a4a488` |
| S2-F2 | done, reviewed: polish (dead code, 44px targets, spacing tokens) + README/progress/DESIGN catch-up | `c8ea5d2` |
| S1-F9 | done, lead-verified. The complete-before-departure refusal shows once (`c77ca9f`). Left-edge screenshot slivers are a DevTools capture artifact, with no app change: a recoloured and shifted button showed the sliver as a copy of the button's own pixels, pinned at x=0 and 143px above it. The filtered-empty meetings action now clears the filter instead of duplicating "New meeting". `npm run screens` 60/60. | see log |

**Sprint 1 and Sprint 2 are code complete and verified in WeChat DevTools** (`npm run screens`, 30 scenarios × zh-CN/en, reviewed by the lead). S1-L1 and S2-L1 acceptance against review §4 is covered by that pass: schedule empty/error/success, meetings no-data vs filtered, role-disabled create with reason, not-found, form inline errors/conflict/dirty-leave, vehicle role scopes, dispatch busy/seat/reject errors, refused actions, Me sheets, skeleton pages. Loading states are not applicable while storage is synchronous.
| lead | zh-CN.js un-escaped to literal UTF-8 (`b14c1fb`); `npm run check` now rejects `\uXXXX` in locale files (`2459965`) | — |
| S2-B1 | done, reviewed (pulled forward while codex was free; + B6 fixes) | `0c5936c` |
| S2-B2 | done, reviewed: vehicle view models + schedule scope | see log |

Decision log (cont.):
- 2026-10-24: codex-exec is idle on purpose after S2-B2. Its Codex 5h quota is about 31% left, and the remaining backend need is reactive (view-model gaps found by F4/F5, Sprint 2 fixes).
- Backlog idea (not scheduled): split the locale files per namespace so the two executors stop editing the same two files. So far the collisions have been handled by append-only rules plus lead diff checks.

Decision log (lead, while the owner is resting):
- 2026-10-24: added S1-B6 so that screen logic is Node-testable and cursor's pages stay thin. F6 moves ahead of F3–F5.
- 2026-10-24: the GitHub push is deferred; it needs no decision until a push is wanted.

## 4. Sprint 2: 用车闭环 (queued)

| # | Task | Owner |
| --- | --- | --- |
| S2-B1 | Full vehicle state machine: reject (reason required), reassign, withdraw, completion guard, derived car availability, seat check, audit timestamps, `vehicle.alreadyHandled` | codex |
| S2-B2 | Role-aware selectors: badge count, list scopes (all / mine / to-handle), role home tab | codex |
| S2-F1 | Vehicle list (segmented scope), detail (step bar + audit), request form, dispatch/reject/complete sheets | cursor |
| S2-F2 | Role-aware IA: badge, landing tab, visitors/daily entry card on Me | cursor |
| S2-L1 | Review + acceptance in both locales | lead |

P2 items (contrast details, touch targets, spacing scale, toast vs. banner rule, attendee search) are folded into the F-tasks where cheap. The rest wait for a polish pass.

## 5. Quality gates (lead reviews every task)

1. `npm test` and `npm run check` pass. Run with Node 24, which is already installed. No installs are needed.
2. `domain/`, `pages/`, `components/` and `behaviors/` contain no CJK literals and no sentence concatenation.
3. Every new key exists in both locales with the same `{params}`.
4. `domain/` and `store/` do not touch `wx`, the DOM or copy. Pages do not compute status or permissions.
5. Every screen has empty, loading, error and success coverage per the review §4 table.
6. The design matches `DESIGN.md` tokens, holds up in English and at 320 px width, and has 44 px touch targets.
7. `progress.md` is updated after each completed task (rule 5).

## 6. Blockers / owner decisions needed

- ~~git is not installed.~~ Resolved 2026-10-24 with owner approval.
  - Git 2.56.0 is installed and the repo is on branch `main`.
  - Commits: `9861f32` is the baseline (the original ZIP); `bf8a693` holds the docs and the plan.
  - **Commit rule:** the lead commits each task after it passes review, one task per commit. Executors do not commit.
  - The GitHub remote is approved but not connected yet.
- WeChat DevTools: installed 2026-10-24. The CLI is `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`.
  - **Human step before S1-F7:** sign in once with a WeChat QR scan, and turn on Settings → Security → Service port so the CLI can open and screenshot the project.
- Standing authorization: the liaison may approve Sprint 1 tool and runtime installs on this machine. Anything destructive, paid or outside this project still needs a status-update ask first.
- ~~cursor-exec is not logged in.~~ Resolved 2026-10-24: logged in and trusted. S1-F1 is delegated. It codes against the i18n contract in `.team/tasks/S1-B2.md` while codex builds the runtime.
- Sprint 3 owner inputs, still open: see §7.4.

## 7. Sprint 3: go-live foundations (CloudBase, WeChat login, invite binding)

### 7.1 Decisions (owner, 2026-10-25)
- **Platform: plain WeChat (普通微信), not WeCom.** WeCom was chosen and then reversed the same day.
- **Backend: WeChat CloudBase (云开发).** It is paid and the owner approved it. Cloud functions read the caller's openid from the server context, so no AppSecret is handled anywhere.
- **Employee binding: admin-issued one-time invite codes.** First sign-in asks for the code; it binds the openid to an employee record, and the role comes from that record. Leavers are disabled by an admin, which removes the binding and keeps their history.
- **`PROJECT_RULES.md` rule 6 revised:** a real backend and WeChat login are allowed; no secrets or real personal data in the repo; real data enters `prod` through the CloudBase console only.
- **Data model:** `DATA_MODEL.md`. Every read and write goes through cloud functions; clients get no direct database access; `domain/` is shared with the functions so the rules exist once.

### 7.1b Product definition (owner, 2026-10-25; S3-L0b)
The north star changed from "admin self-service" to **leader itinerary first, admin tools second, low noise for leaders**. Full model in `DATA_MODEL.md` §0, §2, §4, §5.8.
- **Leaders** see their own week: regular and special meetings, travel / out-of-office, visitors, milestones. Brief line in the calendar, expandable to detail (departure, stops and clients, return, meetings inside a trip). Leaders can create and edit their own items and leave rough notes for secretaries.
- **Roles:** leader, secretary, secretaryAdmin, receptionist, receptionAdmin, driver; plus the flags `dispatcher` (派车管理员, final dispatch; usually a secretary or reception admin) and `sysAdmin`.
- **Secretaries** serve one or more leaders (`supports`) and see and edit only those leaders' itineraries. Secretary admins see all leaders. Leaders never see each other's itineraries.
- **Confirmation is secretary-judged:** on each create or change, the secretary chooses "needs leader confirmation" (→ pending) or not (→ updated, no confirmation; the leader still sees an "updated" badge). New items default to "needs confirmation". Leader-created items are confirmed.
- **Time zone = the user's local zone.** Items store an instant plus their own zone; a secretary entering for a leader defaults to that leader's current zone, editable.
- **Vehicles:** anyone except drivers may request. Requests for a leader are visible only to that leader, their mapped secretaries, secretary admins, dispatchers, the assigned driver and reception. Other requests are visible to secretaries, secretary admins, reception, dispatchers and drivers, never to leaders.
- **Visitors** (no ID or phone numbers): name, organisation, headcount, host leader, time, purpose, transport (self-drive with plate, or pickup/drop-off), visitor type (government / customer / internal / partner), reception level (A / B / C).
- **Reminders:** per item, default 15 minutes before, user-adjustable; itinerary digest at 08:00 and 18:00 local, user-adjustable.
- **Channel:** plain WeChat one-off subscribe messages, limits accepted; WeCom is not reopened. Stronger notifications later.
- Supplies and other daily-admin work stay deferred (post-launch).

### 7.2 Backend / frontend split in Sprint 3
- codex: the time model and role/item domain, `cloudfunctions/` (new top-level folder; `project.config.json` gets `cloudfunctionRoot`), shared `domain/` packaging, the remote store adapter, and tests.
- cursor: the leader week view, item forms, secretary tools, the sign-in/binding screen, async loading/error/retry states, the privacy consent flow, and the production-build switches.
- The local adapters stay, so `npm test` and the offline demo keep working without the network.

### 7.3 Tasks

| # | Task | Owner | Depends on | Status |
| --- | --- | --- | --- | --- |
| S3-L0 | Decisions into PLAN.md, rule 6 revised, data model (`DATA_MODEL.md`) | lead | — | **done** |
| S3-L0b | Leader-first product definition: `DATA_MODEL.md` rewrite, §7.1b, `DESIGN.md` direction | lead | S3-L0 | **done** |
| S3-B0 | Time-zone toolkit `domain/tz.js` (brief `.team/tasks/S3-B0.md`): offsets via `Intl` with a bundled zone-table fallback (US/EU/AU DST rules), zoned ↔ instant conversion incl. DST gaps/overlaps, day keys and multi-day spans, overlap, dual-zone data, meteorological season, device zone, a `probe()` for the real-phone check; tests independent of the machine zone. Pure module: consumers are switched in B0b | codex | S3-L0b | **done** (real-phone `probe()` run still due, at S3-L1 at the latest) |
| S3-B0b-1 | Foundation (brief `.team/tasks/S3-B0b-1.md`): six roles + `dispatcher`/`sysAdmin` flags; `supports`-based visibility for items and vehicle requests; clock/viewer zone, schedule, meetings and vehicles switched to instants via `tz.js`; meetings stored as `items`; store v3 migration (date/time strings → instants in Asia/Shanghai); seed rewritten for the new roles; view-model outputs unchanged | codex | B0 | **done** |
| S3-B0b-1F | Pages, components and utils adapted to the B0b-1 API (actor, viewer zone, `items`, dispatch with driver choice); screenshot pass. Committed together with B0b-1 so the app never breaks on a commit | cursor | B0b-1 | **done** (follow-ups for F4: build the dispatch driver rows in the view model; pass `viewerTz` to `dispatchSheetView`) |
| S3-B0b-2 | New item kinds (travel with stop children, visit, milestone, all-day), weekly series, per-leader confirm/decline/seen state machine incl. secretary-judged changes, leader notes, reception visibility of visits and leaders' busy/free; pure domain + store + tests | codex | B0b-1 | **done** (pages still list meetings only; the new kinds reach the UI in S3-F3 and S3-F4) |
| S3-B1 | CloudBase project wiring: `cloudfunctionRoot`, function skeletons (`auth`, `directory`, `items`, `notes`, `vehicles`, `prefs`, `admin`), shared `domain/`, a dev seed function, a collections/index/rules checklist matching `DATA_MODEL.md`, and Node tests for handlers with a fake DB | codex | B0b | **done** (real actions: `auth.whoami`, `directory.list`, `prefs.get/update`, `devSeed.run`; shared code is copied by `npm run sync` and guarded by a drift test; nothing deployed until the owner creates the `dev` env. For B2/B4: `directory.list` reads employees in one page of 100, enough for the pilot) |
| S3-B2 | `auth`: whoami, invite redemption (transaction, hash, expiry, rate limit), disabled-employee handling; `admin`: issue/revoke invite, disable employee, flags, `supports`; audit log | codex | B1 | not started |
| S3-B3 | Remote store adapter: async API, server error codes mapped to `error.*`, server ids; local adapters kept for tests and the demo | codex | B1 | not started |
| S3-B4 | `items`, `notes` and `vehicles` handlers: server-side visibility filtering, create/edit/cancel with `needsConfirm`, confirm/decline/seen, series, visits (pickup → linked car request, arrived), dispatcher-only dispatch, `rev` concurrency, car availability and seats in transactions | codex | B1, B3 | not started |
| S3-F3 | Design system v2 first (`DESIGN.md`: seasonal tokens, season switching and the Me → Appearance setting, shared components migrated, screens re-run). Then the leader week view: whole week grouped by day, brief lines that expand to detail, important emphasis, pending / updated markers, confirm and decline, rough-note entry; dual-zone time labels | cursor | B0b | not started |
| S3-F4 | Secretary and reception tools: leader switcher (supported leaders only), notes inbox, item forms (meeting incl. category and weekly repeat, trip with stops, visit, milestone) with the zone field and the "needs confirmation" switch; meeting edit/reschedule; car request "for leader" | cursor | B0b | not started |
| S3-F1 | Bind screen (invite code entry and its errors), not-bound and disabled states; loading/network-error/retry on every page; role-specific tab sets; production build hides the role switch and the demo clock | cursor | B2, B3 | not started |
| S3-F2 | Privacy consent flow and a privacy-policy page in both locales (what is stored: employee name, title, department, role, the openid binding; visitor name, organisation and plate entered by staff, plate cleared after the visit) | cursor | — | not started |
| S3-L1 | Screenshot pass against `dev`; trial build (体验版) on iOS and Android with the pilot group | lead + owner | all | not started |

Quality gates for Sprint 3, on top of §5:
- No secret, token or real personal data in any commit (lead checks every diff).
- Clients never write to a collection directly.
- Every function derives identity from the openid, never from client input.
- Every state change is covered by a handler test, including a stale-`rev` case.
- Every list handler has a visibility test per role, including "leader never sees another leader's items" and "leaders never see non-leader car requests".
- Time tests cover at least Asia/Shanghai and America/Los_Angeles, including a DST change and an item crossing midnight in the viewer's zone.

### 7.4 Owner inputs still open
- Pilot list: names, titles, roles, flags, the secretary↔leader mapping, and one sysAdmin; plus the real rooms and cars. Needed before S3-L1, imported into `prod` only.
- Who has access to the mini-program admin console and the CloudBase console (to create envs, collections and rules).
- Account owner type (enterprise or personal) and who does the 小程序备案 filing.
- Audit log retention: 1 year proposed. Visitor plate retention: 30 days proposed.
- ~~Meeting visibility~~: resolved by §7.1b (need-to-know, `DATA_MODEL.md` §4).
- ~~Design direction questions~~: resolved 2026-10-25. `DESIGN.md` 设计系统 v2: soft glass on a dark canvas for leaders, light paper for work screens; seasonal brand colours (per-user auto by season in the user's local zone, personal override incl. brand blue `#093F9C`); leader tabs 行程 · ＋ · 我的.
- Defaults the owner may still change (`DATA_MODEL.md`, marked "owner may change"): reception sees leaders' busy/free only; leaders see co-attending leaders' names; a secretary supporting one of several leaders on an item may edit it; a leader editing a pending item confirms it; series confirm applies to future occurrences; driver completes, dispatcher dispatches/rejects; pickup visits create a linked car request; reception level is a label only.

### 7.5 Sprint 4 (proposed, after S3)
- S4-B1 notifications on a timer trigger, in this priority: confirmation requests and same-day changes; digests (08:00 / 18:00 local); per-item reminders (default 15 min); visitor arrived; car assigned / dispatched / rejected. Subscribe prompt on app open, remaining allowances tracked per template. Needs the owner's template choice.
- S4-F1 reminder settings (offset, digest times, on/off) and per-item override; a reception "today's visitors" view.
- S4-B2 / S4-F2 minimal sysAdmin screen: invites, disable, flags, `supports`, rooms and cars.
- S4-L1 production env: monitoring, logs, backups, release and rollback steps.
