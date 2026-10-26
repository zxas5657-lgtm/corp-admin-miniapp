# S3-F1a: app shell for sign-in: binding, blocked state, role tab sets, demo vs production switches (owner: cursor-exec)

S3-F1 is split. **F1a (this task)** is the shell: auth flow, bind screen, blocked screen, role-specific tab bar, and the switches that separate the local demo from real (cloud) builds. **F1b (next)** moves the pages to the async data API with loading, network-error and retry states. Here, pages keep reading the synchronous store as today.

Read first:
- `DESIGN.md`: 信息架构 (the tab set per role), the tab bar and state-view sections, 设计系统 v2 (paper screens).
- `DATA_MODEL.md` §3 and §6 (auth codes).
- `PLAN.md` §7.
- `miniprogram/store/api.js`, `store/contract.js`, `store/remote.js` (the async API: `whoami`, `redeemInvite`; results `{ ok, ... }` or `{ ok: false, code }`).
- `miniprogram/config.js`, `domain/clock.js`, `app.js`, `app.json`, `custom-tab-bar/`, `utils/session.js`, `pages/me/`, `components/state-view/`.
- `scripts/screens.js`.

Do not run git. Do not edit `miniprogram/domain/`, `store/`, `data/`, `i18n/index.js`, `cloudfunctions/` or the `tests/` that cover them (codex owns those). You may add locale keys to `i18n/zh-CN.js` and `i18n/en.js` in proper UTF-8 Chinese, plus new tests for your own `utils/`.

## 1. Environment switches: new `utils/env.js`
- `envVersion()`: `wx.getAccountInfoSync().miniProgram.envVersion` (`develop` | `trial` | `release`), defaulting to `develop` when unavailable (Node, automator).
- `dataMode()`: `'remote'` on `release`, regardless of config. Otherwise `config.DATA_MODE`.
- `isDemo()`: `dataMode() === 'local'`.
- `cloudEnv()`: replace `CLOUD_ENV` in `config.js` with `CLOUD_ENVS: { dev: '', prod: '' }`, commented "env ids go here; not secrets (DATA_MODEL §3)". Use `prod` on `release` and `dev` otherwise. An empty string means "not configured".
- The role switch on Me and the `__dev` hooks appear only when `isDemo() && DEV_ROLE_SWITCH`.
- `app.js` calls `clock.setDemoMode(isDemo())`, so remote builds use the real clock and the device zone.
- **Remote mode only:** `app.js` calls `wx.cloud.init({ env: cloudEnv(), traceUser: false })` once. If `cloudEnv()` is empty, skip init; the auth flow then shows the "not configured" state (§2).
- `getApi()` must receive the mode from `dataMode()`; pass it as `getApi({ mode: dataMode() })` from the first caller in `app.js`.

## 2. Auth flow: new `utils/auth.js`
- `bootstrap()` → Promise of `{ state, me }`, where `state` is one of:
  - `'bound'`;
  - `'unbound'`;
  - `'disabled'`;
  - `'offline'` (`network.failed` or any other failure);
  - `'unconfigured'` (remote mode with an empty `cloudEnv()`).
- It calls `getApi().whoami()` and caches `me`: `{ personId, role, dispatcher, sysAdmin, employee }`. In local mode, whoami is always bound and the role comes from the store's demo role.
- `utils/session.js`:
  - remote mode: the actor comes from the cached `me`, with `ctx.supports` from `me.supports`. The `supports` field arrives in S3-B4b; until then use `{}`.
  - local mode: unchanged.
- **Routing:**
  - `app.js` runs `bootstrap()` on launch, then `wx.reLaunch` to the role's home tab when bound;
  - unbound → `/pages/bind/index`; disabled → `/pages/blocked/index`; offline or unconfigured → `/pages/blocked/index?state=offline|unconfigured`, with a retry button that reruns `bootstrap()`.
  - Avoid a flash of the old home page: the first page in `app.json` stays `pages/schedule/index`, but each tab page shows a neutral loading state until `bootstrap()` has resolved (a module-level promise in `utils/auth.js` that pages await).
- **Lost auth:** `createRemoteApi`'s `onAuthLost` (wired through `getApi`) sends the user to bind (`auth.notBound`) or blocked (`auth.employeeDisabled`) with `reLaunch`, once.

## 3. Bind page: new `pages/bind/index` (paper style)
- The title and a short explanation in both locales: "Enter the 8-character code from your administrator" / 请输入管理员给你的 8 位邀请码.
- One input that accepts spaces and dashes, uppercases as the user types, and has a maximum of 8 alphanumeric characters (display grouped `ABCD-2345`).
- A primary button, disabled until 8 characters are entered.
- **On submit:** `getApi().redeemInvite({ code })`, with a submitting state (button disabled, spinner).
  - On success: store `me` and `reLaunch` to the role's home tab.
  - Errors, shown inline under the input using `error.*` keys: `auth.inviteInvalid`, `auth.inviteExpired`, `auth.tooManyAttempts` (also disable the button with the reason), `auth.alreadyBound` (then rerun `bootstrap()`), `network.failed` (with a retry), anything else → `server.error`.
- A footer line: "Don't have a code? Ask your administrator." in both locales.
- In local (demo) mode the page is reachable but explains that the demo needs no code, with a button back home.

## 4. Blocked page: new `pages/blocked/index`
Uses `state-view`:
- `disabled`: "This account has been disabled. Contact your administrator." No actions.
- `offline`: the network-error copy and a Retry button.
- `unconfigured`: "The service is not set up yet." Developer-facing, shown only in non-release builds; in release it shows the offline copy.

## 5. Role tab sets
Follow `DESIGN.md` 信息架构:

| role | tabs |
| --- | --- |
| leader | 行程 (schedule) · ＋ · 我的 (me) |
| secretary, secretaryAdmin | 行程 (schedule) · 待办 (todo) · 用车 (vehicles) · 我的 (me) |
| receptionist, receptionAdmin | 来访 (visitors) · 用车 (vehicles) · 我的 (me) |
| driver | 任务 (vehicles, labelled 任务/Trips) · 我的 (me) |

- **`app.json` `tabBar.list`** has exactly these 5 pages: `schedule`, `todo`, `visitors`, `vehicles`, `me`. `meetings` stops being a tab page (it stays a normal page). Link to it from Me ("我的会议 / My meetings") and from the schedule header if there is a natural spot; tell the lead what you chose.
- **New `pages/todo/index`:** a placeholder for the secretary inbox (S3-F4). It shows an empty `state-view` that says the notes inbox and pending confirmations will appear here.
- **New `utils/tabs.js`:** `tabsFor(actor)` → `[{ key, url, labelKey, icon }]` plus `homeUrl(actor)`, with a Node test in `tests/tabs.test.js`.
- **`custom-tab-bar`:**
  - renders `tabsFor(actor)`;
  - the selected index is found by the current page's route, not a fixed number; update `setSelected`/`setBadge` callers to use keys;
  - the dispatcher badge stays on `vehicles`.
- **Leader ＋:** a 44px round button in the centre (DESIGN.md 次按钮). Tapping it shows a toast "Coming soon" / 即将上线 (key `common.comingSoon`). S3-F3 replaces it with the note sheet.
- **Each tab page guards itself:** if the current role has no such tab (for example a deep link), it `reLaunch`es to `homeUrl`.
- **Demo role switch on Me:** after switching, `reLaunch` to that role's `homeUrl` (DESIGN.md: drivers go to 用车/任务, others to 行程, receptionists to 来访).

## 6. Screens (`scripts/screens.js`, yours)
Keep all 70 existing runs passing; update their paths if a page stopped being a tab page. Add scenarios in both locales:
- leader, secretary, receptionist and driver home pages showing their tab sets (with the leader ＋);
- the todo placeholder;
- the bind page: empty, a code typed in, each of the inline errors (`inviteInvalid`, `inviteExpired`, `tooManyAttempts`, `network.failed`), and submitting;
- the blocked page: `disabled`, `offline`, `unconfigured`.

Drive the bind and blocked states in demo mode through a dev-only hook (for example `__dev.setAuthStub({ whoami, redeemInvite })`), never by changing the config. Run the suite and report the totals. Close DevTools automation when done (`cli.bat close --project <root>` if it hangs).

## 7. Checks
- `npm test` (all three zones are run by the lead; run it once yourself), `npm run check`, `npm run screens`.
- No `\u` escapes, no BOM, no minified files, ≤ 100 columns. No secrets or env ids.

## Reply with
Files added and changed, where "My meetings" lives now, the screens totals, and any open questions (product questions go to the lead; do not invent product rules).
