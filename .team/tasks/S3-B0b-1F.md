# S3-B0b-1F: adapt pages, utils, app and screens to the B0b-1 API (owner: cursor-exec)

codex-exec has just changed the backend layers (S3-B0b-1). The app is currently broken until the callers below are updated. Read first: `DATA_MODEL.md` §4 (roles and visibility), `PLAN.md` §7.1b, and the new code in `miniprogram/domain/` (`clock.js`, `permissions.js`, `visibility.js`, `meeting.js`, `vehicle.js`, `roles.js`, `schedule.js`), `miniprogram/store/index.js`, `miniprogram/data/reference.js` and `miniprogram/viewmodels/`. Do not change those layers; if one is wrong or missing something, stop and tell the lead.

This task keeps the **current UI** (design system v2 comes later in S3-F3). Only adapt call sites, plus the dispatch driver choice and the role list.

## What changed (from codex's API list)
- Roles are now `leader`, `secretary`, `secretaryAdmin`, `receptionist`, `receptionAdmin`, `driver` (`reference.ROLE_ORDER`, `reference.ROLES`). `admin`/`reception` are gone; the default demo role is `secretary`. Flags `dispatcher` (Lin) and `sysAdmin` (He) live on people.
- Build per page: `const actor = reference.actorFor(store.getRole()); const viewerTz = clock.viewerZone(); const ctx = { supports: reference.SUPPORTS, isLeader: reference.isLeader };` Put this in one small helper (e.g. `utils/session.js`) and use it everywhere instead of `ROLES[role]` / `personId`.
- Store: state is `{ items, vehicles, notes }`; `addMeeting`/`updateMeeting` are removed → `addItem` / `updateItem`. Meetings are items with ISO `startAt`/`endAt`, `notes` (was `agenda`), `status: 'active' | 'cancelled'`.
- View models take `{ state, actor, now, viewerTz, refs, ctx, ... }` instead of `role`/`personId`; their outputs are unchanged.
- `can(actor, cap)` accepts the actor.
- Meeting form: `createMeeting(form, { id, actor, now, tz: viewerTz, isLeader: reference.isLeader, needsConfirm: true })` first, then `findConflicts(record, state.items, reference)`, then `store.addItem(record)`.
- Meeting detail: `cancelMeeting(item, { actor, now, ctx })` returns `{ ok, item }` → `store.updateItem(result.item)`.
- Vehicle form: `createVehicleRequest(form, { id, actor, now, tz: viewerTz })`. Drivers cannot request.
- Vehicle detail: `transition(vehicle, action, payload, { actor, now, cars, vehicles: state.vehicles, drivers: reference.DRIVERS })`; dispatch/reassign payload is `{ carId, driverId }`. `availableActions(vehicle, actor)`.
- Roles helpers: `vehicleScopes(actor)`, `filterVehiclesByScope(vehicles, scope, { actor })`, `vehicleBadgeCount(actor, vehicles)` (pass only the actor-visible vehicles), `scheduleScopes(actor)`, `filterScheduleByScope(items, scope, { actor })`.

## Work
1. Update every caller in `miniprogram/pages/`, `miniprogram/components/`, `miniprogram/utils/` (incl. `utils/badge.js`) and `miniprogram/app.js` (dev hook: replace `addMeeting` with `addItem`; add `updateItem`). Grep for `ROLES[`, `personId`, `.meetings`, `addMeeting`, `updateMeeting`, `agenda`, `.date`/`.time` on vehicles, `.start`/`.end` on meetings, `role ===`, `'admin'`, `'reception'` and fix each.
2. **Dispatch sheet: choose a driver.** There are now two drivers (赵磊, 钱涛). In the dispatch/reassign sheet add a driver row under the car list (same chip/selection pattern as the cars), required, preselected when there is exactly one driver. Confirm stays disabled until car and driver are chosen. New copy in both locales (e.g. `vehicle.dispatch.driverLabel` 司机 / Driver; reuse `vehicle.driver.required` for the error).
3. The dispatch buttons now follow the `dispatcher` flag (Lin, the secretary), not the driver role. The driver sees "Mark complete" only on trips assigned to them.
4. Me page: the role switch lists the six roles with the new `role.<id>.label/hint` keys (already in both locales). Switching to driver opens Vehicles; everyone else opens Schedule.
5. **`scripts/screens.js`:** update to the new shapes and roles: roles `admin` → `secretary`, `reception` → `receptionist`; `SHOT_MEETING` and `BUSY_VEHICLE` in the v3 item / vehicle shapes (ISO instants for 2026-10-24 11:00–12:00 and 2026-10-27 09:20 Asia/Shanghai, `notes`, `status`, `leaderIds`, `leaders`, `forLeaderId`, `driverId`, etc. — copy field lists from `data/seed.js`); dev hook `addItem`. Keep the existing scenarios and ids where they still make sense, renaming `admin`/`reception` in ids and titles. Add scenarios (both locales):
   - Schedule 2026-10-26 as leader (陈启明): sees m4 but not m6.
   - Schedule 2026-10-26 as secretaryAdmin (何静): sees m6.
   - Vehicles as leader: sees only his own request v5.
   - Dispatch sheet as secretary on v4 with the driver row visible.
   - Vehicles as driver (赵磊): to-do shows trips assigned to him.
6. Run `npm test`, `npm run check`, then `npm run screens`. All scenarios must pass in both locales. If every scenario times out, the DevTools session is wedged: run `& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' close --project <repo root>` and retry once.

## Done when
- No caller uses removed APIs; `npm test` and `npm run check` pass; `npm run screens` passes in both locales.
- You change only `pages/`, `components/`, `utils/`, `app.*`, `i18n/` (append keys only, re-read first) and `scripts/screens.js`. Do not touch `project.config.json`. Do not run git.

Reply with the files changed, the screens summary (pass/fail per scenario count, both locales), the new keys, and anything in the backend layers you think is wrong.
