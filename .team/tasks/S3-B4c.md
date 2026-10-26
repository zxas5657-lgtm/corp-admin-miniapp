# S3-B4c: local/cloud parity for secretary lists; reassign and cancelDispatch API methods (owner: codex-exec)

Two gaps found while moving the pages onto the async API (S3-F1b). Both are parity or backend gaps. The product rules are already in `miniprogram/domain/`; do not change them.

Read first: `PROJECT_RULES.md`, `DATA_MODEL.md` §5.9 (locks) and §6 (error codes), `cloudfunctions/README.md`, `miniprogram/store/contract.js`, `store/local.js`, `store/remote.js`, `cloudfunctions/items/handler.js`, `cloudfunctions/vehicles/handler.js`, `miniprogram/domain/vehicle.js`, `domain/visibility.js`, and the parity tests (`tests/*parity*`).

Do not run git. Do not edit `pages/`, `components/`, `utils/` or `scripts/screens.js` (cursor owns those). Never edit `cloudfunctions/*/shared/` by hand; run `npm run sync`. Handlers require only `./shared/...`.

## 1. Local `listItems` must match the cloud list
`store/local.js` `visibleRange()` keeps, for a secretary, only items whose `leaderIds` include a supported leader. The cloud `items.list` uses `visibleItems(actor, records, context)`, which also keeps items the secretary organizes (seed `m2`, `m3` have no `leaderIds`). Make local use the same `visibleItems` rule (with the same context) for every role, so both lists return the same rows. Extend the parity tests: a secretary sees `m2`/`m3` from both APIs over the same window; a receptionist and a leader are unchanged.

## 2. New contract methods `reassignVehicle` and `cancelDispatchVehicle`
`domain/vehicle.js` already has the `reassign` (assigned → assigned, new car and/or driver) and `cancelDispatch` (assigned → pending) transitions, gated by `vehicle.dispatch`. The cloud function and the contract do not.
- `store/contract.js`: add `{ method: 'reassignVehicle', fn: 'vehicles', action: 'reassign' }` and `{ method: 'cancelDispatchVehicle', fn: 'vehicles', action: 'cancelDispatch' }`.
- `cloudfunctions/vehicles/handler.js`: add both actions. Payload `{ id, expectedRev, carId?, driverId? }` for reassign, `{ id, expectedRev }` for cancelDispatch. Reuse `dispatch`'s transaction shape:
  - **reassign:** in one transaction, release the old `locks/car:<id>:<date>` and `driver:<id>:<date>` docs that this vehicle holds, take the new ones (same conflict codes as dispatch), and write the vehicle with `rev + 1`. Reassigning to the same car and driver is a no-op success or the domain's error; follow the domain.
  - **cancelDispatch:** release the locks this vehicle holds and write it back to `pending` with `rev + 1`.
  - `expectedRev` mismatch → `vehicle.alreadyHandled` (as dispatch does). Write an audit entry like dispatch.
- `store/local.js`: implement both through the same domain transition the local `dispatchVehicle` uses.
- `store/remote.js`/`wire.js`: whatever the contract table needs (probably nothing).
- Update `cloudfunctions/README.md` and `DATA_MODEL.md` §5.9 if lock handling text changes.

## 3. Tests
- Handler tests with the fake DB: reassign moves both locks (the old car and driver are free again; the new ones are taken); reassign onto a locked car or driver fails with the dispatch conflict code and changes nothing; cancelDispatch frees both locks and sets `pending`; stale `expectedRev` → `vehicle.alreadyHandled`; non-dispatcher → `permission.denied`.
- Parity: both methods give the same result from the local and remote APIs.
- Run `npm run sync`, then `npm test` and `npm run check`. If your sandbox fails the temp-dir or shared-copy tests, say so; the lead reruns them.

## 4. Style
UTF-8 without BOM, real Chinese characters (no `\u` escapes), ≤ 100 columns, the repo's Prettier style (single quotes, trailing commas).

## Reply with
Files changed, the test count, any commands you skipped because they needed escalation, and anything in the domain that did not fit.
