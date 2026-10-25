# DATA_MODEL: CloudBase backend (Sprint 3)

Owner: lead. Written 2026-10-25 (S3-L0). Decisions behind this file are in `PLAN.md` §7. Rule 6 in `PROJECT_RULES.md` applies: no secrets and no real personal data in the repo.

## 1. Principles

1. **Every read and write goes through cloud functions.** Each collection's security rule is `{ "read": false, "write": false }` for clients. Functions use the server SDK, so permissions, validation and the state machines live in one place: the existing `domain/` code, shared with the functions.
2. **Identity comes from the server, never from the client.** A function gets the caller's `OPENID` from `cloud.getWXContext()`, looks it up in `bindings`, then loads the employee. Ids or roles sent by the client are ignored.
3. **Records keep the current shapes.** Meetings and vehicle requests keep the field names that `domain/` already uses (`DESIGN.md` §fields). Each document's `_id` is the domain `id`.
4. **Dates and times stay local strings.** `date` is `YYYY-MM-DD` and `time`/`start`/`end` are `HH:mm`, in the fixed zone Asia/Shanghai. Audit fields (`createdAt` and similar) are server timestamps (`db.serverDate()`), stored as Date.
5. **Nothing is hard-deleted.** Cancel, reject, withdraw and disable are state changes. That keeps history and audit intact.
6. **Each document carries a schema version `v` (start at 1)** and a `rev` integer for optimistic concurrency. A state change updates only where `rev` equals the value read, and stale writes return `vehicle.alreadyHandled` or `meeting.alreadyChanged`.
7. **Personal data is minimal.** Store name, job title, department and role. Do not store phone numbers, ID numbers or WeChat nicknames/avatars. The `openid` is stored only in `bindings`.
8. **Bilingual reference names** keep the `{ "zh-CN": "...", "en": "..." }` shape. User-entered text (titles, agenda, destination, notes, reasons) is stored as typed and never translated.

## 2. Environments

| Env | Used by | Data |
| --- | --- | --- |
| `dev` | DevTools, `npm run screens`, the trial build (体验版) | fictional seed only (today's `data/seed.js` and `data/reference.js`) |
| `prod` | the released version | real data, imported through the CloudBase console |

- The env id is chosen per build in `miniprogram/config.js`. It is not a secret.
- The demo clock and `DEV_ROLE_SWITCH` are off in `prod`.
- The local `wx`/memory adapters stay for Node tests and offline demo use.

## 3. Collections

### 3.1 `employees`: the people directory and roles
| Field | Type | Notes |
| --- | --- | --- |
| `_id` | string | person id (`p-…`), referenced by `organizerId`, `attendeeIds`, `applicantId`, `driverId` |
| `name` | `{zh-CN, en}` | `en` may repeat pinyin |
| `title` | `{zh-CN, en}` | job title or department label shown under the name |
| `dept` | string | optional department key, for later filters |
| `role` | `'leader' \| 'admin' \| 'driver' \| 'reception'` | business role, exactly the `domain/permissions.js` keys. One role per person in v1. |
| `sysAdmin` | boolean | system administrator: issues invites, disables employees, edits rooms and cars. Separate from the business role `admin` (行政专员). |
| `status` | `'active' \| 'disabled'` | disabled people cannot sign in; their history stays, shown as "former employee" |
| `createdAt`, `updatedAt`, `disabledAt` | Date | |
| `v`, `rev` | int | |

Indexes: `status`, `role + status`.
Drivers are employees with `role: 'driver'`; this replaces `DRIVERS` in `data/reference.js`.

### 3.2 `bindings`: WeChat account → employee
| Field | Type | Notes |
| --- | --- | --- |
| `_id` | string | the caller's `OPENID`, unique by construction |
| `employeeId` | string | |
| `inviteId` | string | the invite that created the binding |
| `boundAt` | Date | |

Indexes: `employeeId` (unique), so one WeChat account maps to one employee and back.
Offboarding deletes the binding and sets the employee to `disabled`. This is the only delete in the model, and it removes personal linkage, not business history.

### 3.3 `invites`: admin-issued, one-time binding codes
| Field | Type | Notes |
| --- | --- | --- |
| `_id` | string | |
| `codeHash` | string | SHA-256 of the code. The plain code is shown to the sysAdmin once and never stored. |
| `employeeId` | string | who the code is for |
| `createdBy` | string | the sysAdmin's employee id |
| `createdAt`, `expiresAt` | Date | default lifetime 7 days |
| `usedAt`, `usedBy` | Date, string | `usedBy` is the binding's openid |
| `revokedAt` | Date | |

Indexes: `codeHash` (unique), `employeeId + usedAt`.
Rules:
- An employee has at most one open invite; issuing a new one revokes the old one.
- Codes are 8 characters from an unambiguous alphabet (no 0/O/1/I).
- Redemption runs in a transaction: the invite is unused, unrevoked and unexpired; the employee is active and unbound; and the openid is unbound.

### 3.4 `rate_limits`
`_id` = openid. Fields: `count`, `windowStart` (Date). Invite redemption allows 5 failed attempts per hour per openid.

### 3.5 `rooms`
`_id` (slug), `name {zh-CN, en}`, `online` (boolean), `capacity` (int, optional), `active` (boolean), `sort` (int), `v`, `rev`. Index: `active + sort`.

### 3.6 `cars`
`_id` (slug), `plate`, `model {zh-CN, en}`, `kind {zh-CN, en}`, `seats` (int), `active` (boolean), `sort`, `v`, `rev`. Index: `active + sort`.
A plate is vehicle data, not personal data. Real plates still live only in `prod`, imported through the console, not in the repo.

### 3.7 `meetings`
Fields as today: `title`, `date`, `start`, `end`, `roomId`, `attendeeIds[]`, `organizerId`, `agenda`, `cancelled`, `createdAt`. New fields: `createdBy`, `cancelledAt`, `cancelledBy`, `updatedAt`, `v`, `rev`.
Status is still derived (`meetingStatus(meeting, now)`) and never stored.
Indexes:
- `date + start`: lists and the schedule.
- `roomId + date`: room-conflict check.
- `attendeeIds + date` (multikey): attendee conflicts and "my schedule".
- `organizerId + date`.

### 3.8 `vehicle_requests`
Fields as today: `reason`, `destination`, `date`, `time`, `passengers`, `applicantId`, `note`, `status` (`pending | assigned | done | rejected | withdrawn`, the S2-B1 state machine), `carId`, `driverId`, `rejectReason`, `createdAt`, `dispatchedAt`, `dispatchedBy`, `completedAt`. New fields: `v` and `rev`.
Indexes:
- `status + date`: the driver's to-handle list and the badge.
- `applicantId + date`: "my requests".
- `carId + date`: car availability.
- `driverId + date`.

### 3.9 `audit_log` (append-only)
`_id`, `at` (Date), `actorId`, `action` (for example `vehicle.dispatch`, `invite.issue`, `employee.disable`), `entity`, `entityId`, `changes` (the changed field names and the new values of status-like fields only, never free text).
Indexes: `entity + entityId + at`, `actorId + at`.
Retention: proposed 1 year (owner to confirm).

## 4. Access rules (who may do what, enforced in functions)

| Action | Allowed for | Server checks |
| --- | --- | --- |
| `auth.whoami` | anyone | returns `{bound:false}` or `{employee, role, sysAdmin}` |
| `auth.redeemInvite(code)` | unbound callers | §3.3 rules, rate limit |
| directory: rooms, cars, active employees (id, name, title, role) | bound | |
| meetings: list or get | bound | v1 parity: every employee sees all meetings. `schedule.viewAll` keeps the "all/mine" scope for leaders. |
| meetings: create | `can(role, 'meeting.create')` | domain validation; room and attendee conflicts are returned as warnings and do not block (as today) |
| meetings: cancel | organizer, with `meeting.cancelOwn` | not started, not already cancelled, `rev` match |
| vehicles: list | bound | scopes as today: requesters see their own; drivers see all plus the to-handle list |
| vehicles: request | `vehicle.request` | domain validation |
| vehicles: dispatch, reject, complete, reassign | `vehicle.dispatch` / `vehicle.reject` / `vehicle.complete` | transaction: state transition, car availability and seats re-checked on the server, `rev` match |
| vehicles: withdraw | the applicant | only while `pending` |
| admin: issue or revoke an invite, disable an employee, upsert an employee/room/car | `sysAdmin` | every call writes `audit_log` |

Error codes reuse the existing `error.*` keys. New codes need keys in both locales:
- `auth.notBound`
- `auth.inviteInvalid`
- `auth.inviteExpired`
- `auth.tooManyAttempts`
- `auth.employeeDisabled`
- `meeting.alreadyChanged`
- `network.failed`

## 5. Bootstrap (no secrets on any machine)

1. The owner enables CloudBase on AppID `wxe62caebd6c66e685` and creates the `dev` and `prod` envs.
2. In the console, create the collections from §3, set every security rule to deny clients, and add the indexes.
3. Import the first employee record with `sysAdmin: true`, through the console. That person redeems an invite created from the console's function test page.
4. Everyone else is invited from the app. A minimal sysAdmin screen comes in Sprint 3 or 4; until then the console's function test page is enough.
5. `dev` is seeded from the repo's fictional data with a one-off seed function. `prod` is never seeded from the repo.

## 6. Open items (owner)

- The pilot list: names, titles, roles, one sysAdmin. Plus the real rooms and cars. These are needed before S3-L1 and are imported into `prod` only.
- Who has access to the mini-program and CloudBase console.
- The account owner type (enterprise or personal), and who does the 小程序备案 filing.
- Whether meetings stay visible to all employees (v1 parity) or only to organizer and attendees, plus leaders.
- Audit log retention (proposed: 1 year).
