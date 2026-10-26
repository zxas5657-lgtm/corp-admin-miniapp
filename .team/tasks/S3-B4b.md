# S3-B4b: whoami returns the caller's supported leaders (owner: codex-exec)

Why: in remote mode the client view models still apply `domain/visibility.js` with `ctx.supports`. The client does not know a secretary's mapping, so it would hide every item the server returned. `whoami` (and `redeemInvite`, which returns the whoami payload) must include it.

Do not run git. Do not request approval for commands; skip them and list them. Never edit `shared/` copies; the lead runs `npm run sync`. House rules as before (UTF-8, no BOM, ≤ 100 columns, tests only go up, three zones, `npm run check`).

1. **`cloudfunctions/auth/handler.js`:**
   - the whoami payload gains `supports: { [personId]: leaderIds[] }`;
   - for a `secretary`, it holds their own `supports` doc's `leaderIds` (empty array if none);
   - for every other role it is `{}`; secretary admins see all leaders by role, so they don't need it;
   - the same applies to the `redeemInvite` success payload.
2. **`miniprogram/store/local.js`:** `whoami` returns the same shape from `reference.SUPPORTS`.
3. **Contract docs:** update the `whoami` comment in `store/contract.js`.
4. **Tests:**
   - `tests/auth.test.js`: a secretary with and without a supports doc; a leader gets `{}`; `redeemInvite` returns `supports`.
   - `tests/local-api.test.js`: the local whoami shape.
   - The parity test compares `supports` across local and remote.

Reply with the changed files, the test count before and after, and `npm run check`.
