# PLAN — corp-admin-miniapp

Owner: lead (Claude Code). Last updated: 2026-10-24.
Input: `CLAUDE_REVIEW.md` (P0/P1/P2 findings). This plan records the decisions that review asked for and orders the work.

## 1. Decisions

### 1.1 Platform
- **Build a native WeChat mini-program in plain JavaScript (CommonJS). No build step and no npm runtime dependencies.**
  - The prototype already proved the UI, and the product is a mini-program.
  - Plain JS means the code runs in WeChat DevTools and in plain Node with no bundler.
- **Freeze `prototype/` as a reference.** It is not ported to i18n and receives no new features.
- **v1 has no real backend.** This is unchanged from `PROJECT_RULES.md` rule 6: no cloud functions, no WeChat login, local storage only.

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
| S1-F7 | **waiting on human**: WeChat DevTools QR sign-in + service port (owner resting). English layout pass + screenshots in both locales | — |
| S2-F1 | in progress (cursor): vehicle list/detail/form, dispatch/reject sheets, role-aware badge, tappable vehicle cards + schedule scope | — |
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
