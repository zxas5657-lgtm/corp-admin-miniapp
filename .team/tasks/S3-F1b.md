# S3-F1b: pages on the async data API: loading, network error, retry, writes through the API (owner: cursor-exec)

F1a (committed `f5c8080`) built the shell. This task moves every page from reading and writing the synchronous store (`getStore()`) to the async API (`getApi()`), so the same pages work in local (demo) mode and remote (cloud) mode. No new product features and no visual redesign (that is S3-F3).

Read first:
- `PLAN.md` §7, `DESIGN.md` state-view section (loading / empty / error), `DATA_MODEL.md` §6 (error codes).
- `miniprogram/store/contract.js` (method list), `store/api.js`, `store/local.js`, `store/remote.js`, `store/wire.js`.
- `cloudfunctions/directory/handler.js` (the `directory` payload: `rooms`, `cars`, `employees`).
- `miniprogram/viewmodels/*.js`: every view model takes `state` (`{ items, vehicles }`) and an optional `refs` (`roomById`, `personById`, `carById`; defaults to `data/reference`).
- Your F1a files: `utils/auth.js`, `utils/session.js`, `utils/shell.js`, `utils/env.js`.

Do not run git. Do not edit `miniprogram/domain/`, `store/`, `data/`, `viewmodels/`, `i18n/index.js`, `cloudfunctions/` or the tests that cover them (codex owns those). If one of them blocks you, stop and tell the lead exactly what you need. You may add locale keys to `i18n/zh-CN.js` and `i18n/en.js` (proper UTF-8 Chinese) and tests for your own `utils/`.

## 1. Client data layer: new `utils/data.js`
One module that pages use instead of `getStore()` for domain data:
- `api()`: `getApi({ mode: dataMode(), onAuthLost })` (reuse what `utils/auth.js` does; one place only).
- `loadDirectory()` → `{ ok, refs }` or `{ ok: false, code }`. Calls `directory` once per session and caches it. `refs` has `roomById`, `personById`, `carById` built from the payload, the same shape the view models expect. In local mode it may simply return `data/reference`.
- `loadRange({ from, to })` → `{ ok, state: { items, vehicles } }` or `{ ok: false, code }`: `listItems` and `listVehicles` in parallel for the window. Choose windows that cover what each page shows (schedule: the visible week strip; meetings list: its current range; vehicles: its current scope's range). Keep the last good result per page so a background refresh does not blank the screen.
- `write(method, payload)` → the API result unchanged, then invalidates cached ranges so the next load refetches. Writes that carry an item or vehicle pass its `rev` as `expectedRev`.
- `onChange(fn)` → unsubscribe. Fires after any successful write (replaces `getStore().subscribe` for domain data).
- Errors: never throw. A rejected promise or `{ ok: false }` becomes `{ ok: false, code }`; unknown codes stay as they are for the page to map.
- UI-only state (selected date, pending focus, locale, demo role) stays in `getStore().ui` / existing utils. Do not move it.

**Demo role switch:** `getApi()` is a singleton whose local actor is fixed when created. When the demo role changes, call `resetApi()` (from `store/api.js`) and clear the data-layer caches before reLaunching, so the new role sees its own data. Add a test for this.

## 2. Pages
Convert every page that reads or writes domain data: `schedule`, `meetings`, `meeting-detail`, `meeting-form`, `vehicles`, `vehicle-detail`, `vehicle-form`, `visitors`, `me` (and `utils/badge.js`).
- **Reads:** on show (after `prepareTab` / `auth.ready()`), call `loadDirectory()` and `loadRange()`, then build the view with `state` and `refs` from the data layer and `actor`, `viewerTz` and `ctx` from `session()`.
- **Three states** via `state-view`:
  - *loading*: first load only, no previous data. Later refreshes keep the old view while loading.
  - *error*: `network.failed` → the network copy with a Retry button; other codes → `server.error` copy with Retry. Retry reruns the load.
  - *empty*: as today.
- **Stale responses:** if the user changes date or scope while a load is in flight, ignore the older response (a per-page request counter is enough).
- **Writes:** every create/edit/cancel/confirm/decline/request/dispatch/reject/complete/withdraw goes through `write()` with the matching contract method. While a write is in flight its button is disabled (no double submit). Failures show inline or as a toast using `error.<code>` keys; `item.alreadyChanged` / `vehicle.alreadyHandled` (the rev conflicts) show "This was changed by someone else; reloaded" and reloads. Success keeps today's behaviour (banners, focus, navigation).
- **meeting-form conflicts:** keep using the loaded items for that date for now. Hidden-conflict checks via `busySlots` are S3-F4; leave a short comment and tell the lead.
- `getStore().load()` / `resetDemo()` stay only for the demo reset button (local mode).
- No page imports `data/reference` directly after this task (it comes through `refs`), except demo-only code paths.

## 3. Screens (`scripts/screens.js`)
Keep all 100 existing runs passing. Add scenarios in both locales, driven by a dev-only hook in demo mode (for example `__dev.setApiStub({ <method>: { pending: true } | { ok: false, code } })`, cleared between scenarios; never by changing config):
- schedule loading (first load pending);
- schedule network error with Retry;
- vehicles server error;
- a write failure: meeting cancel returning `network.failed`, and the rev-conflict message;
- vehicle-form submitting (button disabled).
Run the suite and report the totals. Close DevTools automation when done.

## 4. Tests
Node tests for `utils/data.js` with a fake API: directory caching and refs lookups; range load success/failure mapping; a thrown API call becomes `{ ok: false, code: 'network.failed' }`; writes invalidate the cache and fire `onChange`; stale-response guard if it lives in the util; the role-switch reset.

## 5. Checks
- `npm test` (run it once; the lead runs three zones), `npm run check`, `npm run screens`.
- No `\u` escapes, no BOM, no minified files, ≤ 100 columns. No secrets or env ids.

## Reply with
Files added and changed; the load windows you chose per page; how each error code is shown; the screens totals; anything you needed from codex-owned files; open questions (product questions go to the lead; do not invent product rules).
