# DATA_MODEL: CloudBase backend (Sprint 3)

Owner: lead. Written 2026-10-25 (S3-L0), revised 2026-10-25 (S3-L0b) for the leader-first product definition. Decisions behind this file are in `PLAN.md` §7. Rule 6 in `PROJECT_RULES.md` applies: no secrets and no real personal data in the repo.

Items marked **(default, owner may change)** are lead proposals the owner accepted as defaults or has not ruled on yet.

## 0. Product north star (owner, 2026-10-25)

- **Primary users are company leaders.** They see their own week: regular and special meetings, travel / out-of-office, visitor arrangements and milestones, with reminders.
- **Admin staff maintain the data** on the leaders' behalf, and handle visitors and vehicles.
- **Low noise for leaders:** a leader sees only what concerns them; everything else reaches the people who act on it.

## 1. Principles

1. **Every read and write goes through cloud functions.** Each collection's security rule is `{ "read": false, "write": false }` for clients. Functions use the server SDK, so permissions, validation and the state machines live in one place: the `domain/` code, shared with the functions.
2. **Identity comes from the server, never from the client.** A function gets the caller's `OPENID` from `cloud.getWXContext()`, looks it up in `bindings`, then loads the employee. Ids or roles sent by the client are ignored.
3. **Visibility is need-to-know** (§4). A function never returns a record the caller may not see, and list queries are filtered on the server.
4. **Times are instants plus a zone** (§2). Replaces the v1 rule "local strings in Asia/Shanghai".
5. **Nothing is hard-deleted.** Cancel, reject, withdraw and disable are state changes. Two exceptions remove personal data, not business history: offboarding deletes the binding (§3.2), and a visitor's licence plate is cleared after the visit (§3.9).
6. **Each document carries a schema version `v` (start at 1)** and a `rev` integer for optimistic concurrency. A state change updates only where `rev` equals the value read; stale writes return `item.alreadyChanged` or `vehicle.alreadyHandled`.
7. **Personal data is minimal.** Employees: name, job title, department, role. Visitors: name, organisation, and a licence plate only when they drive in. No phone numbers, ID numbers or WeChat nicknames/avatars. The `openid` is stored only in `bindings`.
8. **Bilingual reference names** keep the `{ "zh-CN": "...", "en": "..." }` shape. User-entered text (titles, agenda, locations, notes, reasons, visitor names) is stored as typed and never translated.

## 2. Time model

- **Instants:** `startAt`, `endAt`, `departAt` and audit times are stored as Date (UTC). Conflict checks, reminders and ordering use instants.
- **Zone of the entry:** every itinerary item and vehicle request stores `tz`, an IANA zone name (for example `Asia/Shanghai`, `America/Los_Angeles`).
  - A leader entering their own item: their current zone.
  - A secretary entering for a leader: **that leader's current zone, editable on the form** (owner decision).
  - Others: their own current zone.
- **All-day items** (typically milestones) store `allDay: true` and `date` (`YYYY-MM-DD`) in `tz`, and no times.
- **Each user's current zone** is `reminder_prefs.tz`, refreshed from the phone on every app open. Digests and reminders are scheduled in this zone.
- **Display:** in the viewer's current zone. When the item's zone has a different offset at that instant, the item also shows its own local time (for example `14:00 PT · 次日 05:00 北京`). Week and day grouping use the viewer's zone.
- **Known limit:** if a traveling user does not open the app, their stored zone is stale and digests fire at the old local time. Opening the app fixes it.
- **Runtime check (S3-B0):** confirm `Intl` zone support on real iOS/Android WeChat. If it is missing, bundle a small offset/DST table for the zones in use.

## 3. Environments

| Env | Used by | Data |
| --- | --- | --- |
| `dev` | DevTools, `npm run screens`, the trial build (体验版) | fictional seed only (`data/seed.js`, `data/reference.js`) |
| `prod` | the released version | real data, imported through the CloudBase console |

- The env id is chosen per build in `miniprogram/config.js`. It is not a secret.
- The demo clock and `DEV_ROLE_SWITCH` are off in `prod`.
- The local `wx`/memory adapters stay for Node tests and offline demo use.

## 4. Roles and visibility

### 4.1 Roles
One business role per person, plus two independent flags.

| Role | 中文 | What they do |
| --- | --- | --- |
| `leader` | 公司领导 | own itinerary: read, create, edit, confirm; leave notes for secretaries; request cars |
| `secretary` | 秘书 | itineraries of the leaders they support (`supports`) only; turn notes into items; request cars |
| `secretaryAdmin` | 秘书主管 | all leaders' itineraries; manage `supports`; request cars |
| `receptionist` | 前台 | visitor items; request cars |
| `receptionAdmin` | 前台主管 | all visitor items; request cars |
| `driver` | 司机 | assigned trips: complete them. Cannot request cars |

| Flag | Meaning |
| --- | --- |
| `dispatcher` | 派车管理员: final dispatch, reassign and reject of car requests. Usually a secretary or a reception admin. Granted by a sysAdmin. |
| `sysAdmin` | 系统管理员: invites, disabling employees, rooms and cars, employee records and flags. |

### 4.2 Itinerary visibility (`items`)
| Viewer | Sees | Edits |
| --- | --- | --- |
| leader | items where they are in `leaderIds`; never another leader's items | their own items |
| secretary | items whose `leaderIds` include a leader they support | same, see §5.2 |
| secretaryAdmin | all items with leaders | all items with leaders |
| receptionist / receptionAdmin | all `visit` items; for host leaders, busy/free slots only, no titles **(default, owner may change)** | visits they created / all visits |
| any employee | meetings where they are organizer or attendee | meetings they organize |
| driver | no itinerary items | — |

- A leader in a meeting with another leader sees that leader's name in the attendee list, and nothing else of theirs **(default, owner may change)**.
- A secretary who supports only one of several leaders on an item can see and edit it; each leader confirms for themselves **(default, owner may change)**.

### 4.3 Vehicle request visibility (`vehicle_requests`)
Anyone except drivers may request a car.

| Request | Visible to |
| --- | --- |
| for a leader (`forLeaderId` set: the requester is a leader, or a secretary requested for a supported leader) | that leader, that leader's mapped secretaries, secretary admins, dispatchers, the assigned driver, receptionists and reception admins |
| not for a leader | the requester, all secretaries and secretary admins, receptionists and reception admins, dispatchers, drivers. **Never leaders.** |

## 5. Collections

### 5.1 `employees`: the people directory and roles
| Field | Type | Notes |
| --- | --- | --- |
| `_id` | string | person id (`p-…`), referenced by `leaderIds`, `attendeeIds`, `organizerId`, `applicantId`, `driverId` |
| `name` | `{zh-CN, en}` | `en` may repeat pinyin |
| `title` | `{zh-CN, en}` | job title or department label shown under the name |
| `dept` | string | optional department key |
| `role` | `'leader' \| 'secretary' \| 'secretaryAdmin' \| 'receptionist' \| 'receptionAdmin' \| 'driver'` | exactly the `domain/permissions.js` keys (replaces v1 `admin` / `reception`) |
| `dispatcher` | boolean | §4.1 |
| `sysAdmin` | boolean | §4.1 |
| `status` | `'active' \| 'disabled'` | disabled people cannot sign in; their history stays, shown as "former employee" |
| `createdAt`, `updatedAt`, `disabledAt` | Date | |
| `v`, `rev` | int | |

Indexes: `status`, `role + status`, `dispatcher`. Drivers are employees with `role: 'driver'`; this replaces `DRIVERS` in `data/reference.js`.

### 5.2 `supports`: secretary → leaders
`_id` = secretary employee id, `leaderIds[]`, `updatedAt`, `updatedBy`, `v`, `rev`. One secretary serves many leaders; a leader may have several secretaries. Index: `leaderIds` (multikey). Edited by secretary admins and sysAdmins; every change writes `audit_log`.

### 5.3 `bindings`: WeChat account → employee
| Field | Type | Notes |
| --- | --- | --- |
| `_id` | string | the caller's `OPENID`, unique by construction |
| `employeeId` | string | |
| `inviteId` | string | the invite that created the binding |
| `boundAt` | Date | |

Indexes: `employeeId` (unique). Offboarding deletes the binding and sets the employee to `disabled`.

### 5.4 `invites`: admin-issued, one-time binding codes
| Field | Type | Notes |
| --- | --- | --- |
| `_id` | string | |
| `codeHash` | string | SHA-256 of the code. The plain code is shown to the issuer once and never stored. |
| `employeeId` | string | who the code is for |
| `createdBy` | string | the sysAdmin's employee id |
| `createdAt`, `expiresAt` | Date | default lifetime 7 days |
| `usedAt`, `usedBy` | Date, string | `usedBy` is the binding's openid |
| `revokedAt` | Date | |

`_id` equals `codeHash`: a `wx-server-sdk` transaction can only read documents by id, so redemption looks the invite up by its hash inside the transaction.

Indexes: `codeHash` (unique), `employeeId + usedAt`. Rules:
- An employee has at most one open invite; issuing a new one revokes the old one.
- Codes are 8 characters from an unambiguous alphabet (no 0/O/1/I).
- Redemption runs in a transaction: the invite is unused, unrevoked and unexpired; the employee is active and unbound; and the openid is unbound.

### 5.5 `rate_limits`
`_id` = openid. Fields: `count`, `windowStart` (Date). Invite redemption allows 5 failed attempts per hour per openid.

### 5.6 `rooms`
`_id` (slug), `name {zh-CN, en}`, `online` (boolean), `capacity` (int, optional), `active` (boolean), `sort` (int), `v`, `rev`. Index: `active + sort`.

### 5.7 `cars`
`_id` (slug), `plate`, `model {zh-CN, en}`, `kind {zh-CN, en}`, `seats` (int), `active` (boolean), `sort`, `v`, `rev`. Index: `active + sort`. A company car plate is vehicle data; real plates still live only in `prod`.

### 5.8 `items`: the itinerary (replaces `meetings`)
Common fields:

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | string | |
| `kind` | `'meeting' \| 'travel' \| 'stop' \| 'visit' \| 'milestone'` | `stop` exists only inside a trip |
| `title` | string | the brief line shown in the calendar (e.g. "Silicon Valley trip") |
| `startAt`, `endAt` | Date | may span days (travel). Absent when `allDay` |
| `allDay`, `date` | boolean, string | §2 |
| `tz` | string | §2 |
| `location` | string | free text; meetings may use `roomId` instead |
| `leaderIds[]` | string[] | leaders whose itinerary this is; may be empty for staff-only meetings |
| `important` | boolean | drives emphasis and default reminders |
| `parentId` | string | a trip's child (`stop`, `meeting`, `visit`); one level only |
| `seriesId` | string | weekly repeats are stored as separate occurrences sharing `seriesId` (no rule engine) |
| `notes` | string | detail text (agenda, itinerary detail) |
| `noteId` | string | the leader note it came from (§5.10) |
| `status` | `'active' \| 'cancelled'` | |
| `leaders[]` | array | per leader on the item, see below |
| `createdBy`, `updatedBy`, `cancelledBy` | string | employee ids |
| `createdAt`, `updatedAt`, `cancelledAt` | Date | |
| `v`, `rev` | int | |

Per-leader state, `leaders[]`: `{ leaderId, confirm, confirmedAt, declineReason, changedAt, changeNote, seenAt }`.
- `confirm`: `'pending' | 'confirmed' | 'declined' | 'none'`. `none` means "no confirmation required".
- **Leader creates or edits their own item:** `confirmed` for that leader. A leader editing a pending item confirms it **(default, owner may change)**.
- **Secretary creates an item:** the secretary chooses; the form defaults to "needs confirmation", so `pending` (owner decision).
- **Secretary changes an item** (including cancel): the secretary chooses. Needs confirmation → `pending`. Otherwise → `none`, with `changedAt` and `changeNote` set, and the leader sees an "updated" badge until `seenAt` is later than `changedAt` (owner decision).
- **Series:** confirming or declining one occurrence applies to all future occurrences of the series **(default, owner may change)**.
- Every secretary edit records its "needs confirmation" choice in `audit_log`.

Kind-specific fields:
- **meeting:** `category` (`regular | special`), `roomId`, `attendeeIds[]`, `organizerId`. Room and attendee conflicts remain warnings that do not block (as v1). Status (upcoming / ongoing / done) stays derived from time.
- **travel:** the parent shows the brief line; detail lives in children. `stop` children carry `stopType` (`depart | stop | return`), `location`, `client` (free text) and times; meetings and visits during the trip are children too.
- **visit:** `visitorName`, `org`, `headcount` (int), `purpose`, `visitorType` (`government | customer | internal | partner`), `receptionLevel` (`A | B | C`, a label only in v1 **(default, owner may change)**), `transport` (`selfDrive | pickup`), `plate` (required when `selfDrive`), `plateClearAfter` (Date), `vehicleRequestId` (set when `pickup`: a linked car request is created **(default, owner may change)**), `arrivedAt`. The host leader is `leaderIds[0]`.
- **milestone:** usually `allDay`.

Indexes: `leaderIds + startAt` (multikey), `attendeeIds + startAt` (multikey), `kind + startAt`, `roomId + startAt`, `parentId`, `seriesId`, `status + plateClearAfter`.

### 5.9 `vehicle_requests`
Fields as v1: `reason`, `destination`, `passengers`, `applicantId`, `note`, `status` (`pending | assigned | done | rejected | withdrawn`), `carId`, `driverId`, `rejectReason`, `createdAt`, `dispatchedAt`, `dispatchedBy`, `completedAt`. Changed: `date` + `time` become `departAt` + `tz`. New: `forLeaderId` (§4.3), `itemId` (a linked trip or visit), `v`, `rev`.
- Dispatch, reassign and reject: `dispatcher` only. Complete: the assigned driver **(default, owner may change)**. Withdraw: the applicant while `pending`.

Indexes: `status + departAt`, `applicantId + departAt`, `forLeaderId + departAt`, `carId + departAt`, `driverId + departAt`.

**Dispatch race guard, `locks`:** a transaction cannot query, so a car's or driver's availability is checked before the dispatch transaction. Inside the transaction, dispatch bumps `locks/car:<carId>:<YYYY-MM-DD>` and `locks/driver:<driverId>:<YYYY-MM-DD>` (the departure day in the request's `tz`) with `rev + 1`. Reassign bumps the old and new car and driver lock docs in the same transaction; cancel-dispatch bumps the old lock docs to release them. Two concurrent changes for the same car or driver on the same day write the same lock doc, so CloudBase lets only one transaction commit. Fields: `resourceType`, `resourceId`, `date`, `rev`, `updatedAt`. Rule: deny all clients. No index needed.

### 5.10 `leader_notes`: rough requests from a leader
`_id`, `leaderId`, `text`, `status` (`open | converted | closed`), `itemIds[]`, `handledBy`, `createdAt`, `handledAt`, `v`, `rev`. Visible to the leader, their mapped secretaries and secretary admins. A secretary converts a note into one or more items; those reach the leader through confirmation.

### 5.11 `reminder_prefs`: per user
`_id` = employee id. `tz`, `tzUpdatedAt`, `itemOffsetMin` (default 15), `itemRemindersOn` (default true), `digestTimes` (default `['08:00', '18:00']`, in `tz`), `digestOn` (default true), `v`, `rev`. Per-item overrides live in `reminder_overrides`: `_id` = `<employeeId>:<itemId>`, `offsetMin` (or `null` for off).

### 5.12 `subscriptions`: remaining one-off subscribe allowances
`_id` = `<employeeId>:<templateKey>`, `remaining` (int), `updatedAt`. Incremented when the user accepts a subscribe prompt; decremented per send. Plain WeChat one-off subscriptions are the accepted channel (owner decision); a send with no allowance left is recorded as `skipped`.

### 5.13 `notification_jobs`
`_id`, `type` (`confirm.request | item.changed | digest | item.reminder | visit.arrived | vehicle.assigned | vehicle.dispatched | vehicle.rejected`), `employeeId`, `dueAt`, `refs` (ids only, never free text), `status` (`queued | sent | skipped | failed`), `attempts`, `sentAt`. Index: `status + dueAt`. A timer-triggered function sends due jobs. Rescheduling or cancelling an item replaces its queued jobs.

### 5.14 `audit_log` (append-only)
`_id`, `at` (Date), `actorId`, `action` (for example `item.update`, `item.confirm`, `vehicle.dispatch`, `invite.issue`, `supports.update`), `entity`, `entityId`, `changes` (changed field names and new values of status-like fields only, never free text), `needsConfirm` (secretary edits). Indexes: `entity + entityId + at`, `actorId + at`. Retention: proposed 1 year (owner to confirm).

## 6. Access rules (enforced in functions)

| Action | Allowed for | Server checks |
| --- | --- | --- |
| `auth.whoami` | anyone | `{bound:false}` or `{employee, role, dispatcher, sysAdmin}` |
| `auth.redeemInvite(code)` | unbound callers | §5.4 rules, rate limit |
| directory: rooms, cars, active employees (id, name, title, role) | bound | |
| items: list / get | bound | §4.2, filtered on the server |
| items: create / edit / cancel | §4.2 "Edits" column | domain validation; secretary must send `needsConfirm`; `rev` match |
| items: confirm / decline / mark seen | the leader concerned | own `leaders[]` entry only |
| visits: mark arrived | receptionist, receptionAdmin | queues `visit.arrived` to the host leader |
| notes: create | leader | |
| notes: list / convert / close | the leader (own); mapped secretaries; secretary admins | |
| vehicles: list / get | §4.3 | filtered on the server |
| vehicles: request | every role except `driver` | `forLeaderId` only for self (leader) or a supported leader (secretary) |
| vehicles: dispatch, reassign, reject | `dispatcher` | transaction: state transition, car availability and seats re-checked, `rev` match |
| vehicles: complete | the assigned driver | |
| vehicles: withdraw | the applicant | only while `pending` |
| prefs: read / update; subscriptions: record accepted prompt | self | `tz` must be a valid IANA name |
| supports: update | secretaryAdmin, sysAdmin | audit |
| admin: invites, disable, employee/room/car upsert, flags | sysAdmin | audit |

New error codes (keys in both locales): `auth.notBound`, `auth.inviteInvalid`, `auth.inviteExpired`, `auth.tooManyAttempts`, `auth.employeeDisabled`, `item.alreadyChanged`, `item.notVisible`, `visit.plateRequired`, `network.failed`.

## 7. Bootstrap (no secrets on any machine)

1. The owner enables CloudBase on AppID `wxe62caebd6c66e685` and creates the `dev` and `prod` envs.
2. In the console, create the collections from §5, set every security rule to deny clients, and add the indexes.
3. Import the first employee record with `sysAdmin: true` through the console. That person redeems an invite created from the console's function test page.
4. Everyone else is invited from the app. The minimal sysAdmin screen comes in Sprint 4; until then the console's function test page is enough.
5. `dev` is seeded from the repo's fictional data with a one-off seed function. `prod` is never seeded from the repo.
6. A daily timer function clears visitor plates past `plateClearAfter` (default: 30 days after the visit, **owner may change**).

## 8. Open items (owner)

- The pilot list: names, titles, roles, flags, secretary↔leader mapping, one sysAdmin. Plus the real rooms and cars. Needed before S3-L1, imported into `prod` only.
- Who has access to the mini-program and CloudBase console.
- The account owner type (enterprise or personal), and who does the 小程序备案 filing.
- Audit log retention (proposed: 1 year) and visitor plate retention (proposed: 30 days).
- The privacy policy (S3-F2) must also cover visitor data entered by staff.
