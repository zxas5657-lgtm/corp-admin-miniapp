# S3-B6b: item form view model; dispatch driver rows; car request "for leader" (owner: codex-exec)

Second view-model task of S3-F4. Product rules are already decided in `DESIGN.md` and `DATA_MODEL.md`; do not invent new ones. If a rule is missing, stop and ask the lead.

Read first: `DATA_MODEL.md` §2 (time model), §5.8 (items: common and kind-specific fields, `leaders[]`, secretary "needs confirmation" choice defaulting to on, series), §5.9 (vehicle requests, `forLeaderId`), §4.3; `miniprogram/domain/item.js` (`validateItem`, `createItem`, `createSeries`, `STOP_TYPES`, `VISITOR_TYPES`, `RECEPTION_LEVELS`), `domain/meeting.js`, `domain/confirm.js` (`changeItem`), `domain/vehicle.js` (`carAvailability`, driver availability), `store/local.js` (the exact payloads of `createItem`, `createSeries`, `editItem` with `scope`, `cancelItem`, `convertNote`, `busySlots`, `requestVehicle`), `viewmodels/meeting-form.js` and `viewmodels/vehicles.js` (patterns to follow), `data/zones.js`.

Do not run git. Do not edit `pages/`, `components/`, `utils/`, `scripts/screens.js`. Locale keys in proper UTF-8 Chinese. Never edit `cloudfunctions/*/shared/`; if you touch `domain/`, run `npm run sync`. Prettier as the repo uses.

## 1. `viewmodels/item-form.js`
One module for every kind a secretary or receptionist creates: `meeting`, `travel` (with stops), `visit`, `milestone`.
- `itemFormDefaults({ kind, actor, ctx, refs, now, viewerTz, date, leaderId, noteId, item, scope })` → the initial form state. New: date from `date`, zone = `viewerTz`, the leader preselected (`leaderId`, else the only supported leader), `needsConfirm: true` for secretaries (DATA_MODEL §5.8), `important` default per kind (milestone true). Edit (`item` given): fields from the item in **the item's own zone**; `scope` `this | following` offered only when the item has a `seriesId`. From a note (`noteId`): the note text as the notes field and its leader preselected.
- `itemFormOptions({ kind, actor, ctx, refs, viewerTz })` → the choice lists: leaders the actor may assign (supported leaders / all for admins / the host list for receptionists per §4), rooms, attendees, meeting categories (`regular | special`), stop types, visitor types, reception levels, transports, zone list (`data/zones.js`, the viewer zone first), weekly repeat counts (none, 2–12 weeks).
- `itemFormLabels(kind)` → localized labels, placeholders and section titles.
- `buildItemPayload(form, { mode: 'create' | 'edit', item })` → exactly what the API takes: `createItem { kind, input, needsConfirm, noteId? }`, `createSeries { kind, input, needsConfirm, weeks }` when a weekly repeat is chosen, `editItem { id, expectedRev, scope, patch, needsConfirm, changeNote }`, and for a note conversion the `convertNote` payload. Times go in as the domain expects (local date + time + `tz`).
- `itemFormErrors(form, context)` → `{ field: localizedMessage }` from `validateItem` / `validateMeeting` (map every domain error code you can produce; add tests).
- `itemConflictWarnings({ form, state, busy, refs, viewerTz })` → room and attendee warnings from the loaded items **and** from `busySlots` results (`busy`, hidden items the actor cannot see; show "busy" without the hidden title). Warnings never block (DATA_MODEL §5.8).
- Travel: `stops` editing helpers (`addStop`, `removeStop`, `moveStop` pure functions), depart first and return last enforced.

## 2. Vehicles (`viewmodels/vehicles.js`)
- `dispatchSheetView` gains driver rows: `drivers: [{ id, name, available, busyText, selected }]` using the domain's driver availability for the vehicle's departure, `selectedDriverId` input, and `confirmDisabled` also when no available driver is selected. Pass `viewerTz` through for any time text.
- `vehicleFormDefaults` / options: a "for leader" choice (`forLeaderId`) for leaders the actor may request for (a leader: themself only; secretaries: supported leaders; admins: all leaders; others: none). Include it in the request payload builder if one exists, otherwise add `buildVehicleRequest(form)`.

## 3. Tests
New `tests/viewmodels.item-form.test.js` and additions to the vehicles view-model tests: defaults per kind and role, edit defaults in the item's zone (an LA trip viewed from Shanghai), series scope offered only for series items, note conversion prefill, payloads for each API call (deep-equal), error mapping, conflict warnings from visible items and from busy slots (no hidden title), stop helpers, driver rows availability, for-leader options per role. Run with `TZ=America/Los_Angeles` and `TZ=Asia/Shanghai` too.

## Checks
`npm test`, `npm run check`. Report sandbox-only failures; the lead reruns them.

## Reply with
Files changed, the exported functions with a one-line description each, a JSON example of a default form and of each payload, the test count, and commands skipped because they needed escalation.
