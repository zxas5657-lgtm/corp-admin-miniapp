# S3-B4 fix round (owner: codex-exec)

Lead review of S3-B4. I have run `npm run sync`. The full suite passes 206/206 here in all three zones; your two failures were sandbox-only. Same house rules, no git, no command approvals, never edit `shared/` copies.

## Code fixes
1. **No fallback requires.**
   - In `cloudfunctions/items/handler.js` and `cloudfunctions/vehicles/handler.js`, delete `shared()`, the `try { require('../../miniprogram/...') }` and `require('../_lib/...')` fallbacks, and the `resourceBusy` fallback.
   - Require only from `./shared/domain/...`, `./shared/lib/...` and `./shared/data/...`. A deployed function has neither `../_lib` nor `../../miniprogram`; a missing shared copy must fail loudly in tests (the drift test covers it).
   - Check `notes/handler.js` and every other handler for the same pattern.
2. **Remove the in-memory `dispatchLocks` Set** from the vehicles handler. It only works inside one process and means nothing across cloud instances. The lock docs bumped inside the transaction are the guard. Do not change the fake DB to simulate conflicts.
3. **Seats:** the seat check uses the stored `opened.passengers` only, never `event.passengers`. A client must not lower the passenger count at dispatch.
4. **Range queries instead of reading whole collections** (`fetchAll` stops at 1000 and would silently drop rows):
   - `items.list` and `items.busy` use `where(_.or([{ startAt: _.lt(end), endAt: _.gt(start) }, { allDay: true, date: _.and(_.gte(dayBefore), _.lte(dayAfter)) }]))` with Dates for the instants and `YYYY-MM-DD` strings for the dates, then filter exactly as now.
   - `busy` excludes cancelled items and all-day items.
   - `vehicles.list` uses `where({ departAt: _.and(_.gte(start), _.lt(end)) })`.
   - The dispatch busy check reads only `assigned` requests for that car, and for that driver, within ±1 day of `departAt`.
   - Make sure the fake DB supports exactly these shapes, adding small operator support plus a fake-db test if needed.
5. **Series confirm/decline parity with the domain.** `domain/confirm.js` `applyToSeries` leaves a future occurrence unchanged when it cannot be confirmed or declined (for example, cancelled). The server must do the same:
   - only the opened occurrence's failure aborts the transaction;
   - other occurrences that fail are skipped, not written and not audited;
   - better: call `confirmItem`/`declineItem` with `items` exactly as `local.js` does, and write the records whose `rev` changed.

## Missing tests (brief §6). Each needs real assertions, not just `ok: true`
- Every new handler (`items`, `notes`, `vehicles`):
  - an employee disabled after binding (set `status: 'disabled'`, keep the binding) → `auth.employeeDisabled`;
  - unbound → `auth.notBound`.
- **Items:**
  - **series rollback:** an `edit following` where a later occurrence's transaction write fails mid-way (stub `tx.collection('items').doc(id).set` to throw on the third) leaves every occurrence unchanged and writes no audit entry;
  - **all-day range:** an all-day item at the first or last day of the range is listed when `process.env.TZ` is `America/Los_Angeles`, and when the item `tz` is `America/Los_Angeles` while the viewer's range is in Shanghai, and the reverse. One test must fail if `dayBefore`/`dayAfter` padding is removed;
  - a series decline where one future occurrence is cancelled: the decline succeeds, that occurrence is untouched, and the others are declined;
  - a list with more than 100 items in range returns them all (paging), while items outside the range are not read (assert through a spy on `where` args or a count).
- **Vehicles:**
  - car busy: another `assigned` request for the same car 90 minutes later → `vehicle.car.busy`; 3 hours later → allowed;
  - driver busy, the same way;
  - inactive car → `vehicle.car.inactive`; disabled driver → `vehicle.driver.inactive`;
  - `event.passengers: 1` on a 5-passenger request to a 4-seat car → still `vehicle.seats.exceeded`;
  - reject without a reason → the domain's reason-required code; with a reason → `rejected`, with `rejectReason` stored;
  - the lock doc's `rev` increases by one per dispatch on the same car and day, and its id uses the request's `tz` day.
- **Notes:** a secretary not mapped to the leader cannot list, convert or close that leader's note.

## Reply with
Changed files, the test count before and after, the three-zone results (your sandbox's two known failures excepted), `npm run check`.
