# S3-B0b-1 review: fixes required (owner: codex-exec)

Lead review of your S3-B0b-1 changes. The code direction is fine; two blocking problems.

## 1. Test coverage was removed (blocking)
`git diff --stat -- tests` shows 1331 deletions and 87 insertions across 14 test files; the suite went from 96 to 75 tests while the brief asked to *keep their intent and add tests*. Examples: `viewmodels.vehicles.test.js` 4 → 0 tests, `store.test.js` 10 → 6, `vehicle.test.js` 10 → 6, `viewmodels.form.test.js` 5 → 2, and none of the required new tests exist.

Fix:
- Restore every removed test case (see `git show HEAD:tests/<file>`; read-only git is fine for this) and port it to the new shapes: items with ISO instants, actors instead of role/personId, `viewerTz`, `{ items, vehicles, notes }` state, dispatch with `driverId`. Each original assertion keeps its intent; drop one only if the behaviour no longer exists, and list those in your reply with the reason.
- Add the tests the brief required:
  - new `tests/visibility.test.js`: a matrix over all six demo roles × the seed items and vehicles, including: a leader never sees another leader's item; leaders never see non-leader car requests; a leader sees their own leader request; a secretary sees supported leaders' items and not p-wang's m6; a secretaryAdmin sees all leaders' items and all leaders' car requests; a driver sees a leader request only when assigned to it; `canEditItem` cases.
  - migration v2 → v3 from a literal v2 fixture (copy the old seed shape), checking instants, `notes`, `leaderIds`, `leaders[]`, `forLeaderId`, and that malformed records are dropped and counted.
  - `createMeeting` leader/confirm rules (leader actor vs secretary actor, `needsConfirm` true/false); `cancelMeeting` marks other leaders pending/none with `changedAt`.
  - dispatch: flag required; `driverId` required when several drivers; sole-driver default; complete only by the assigned driver.
  - schedule: a meeting late in the evening in Shanghai lands on a different day for a Los Angeles viewer; a multi-day span.
- Target: the test count goes **up** from 96, never down.

## 2. Visibility bug (blocking)
In `domain/visibility.js` `leaderCheck`, secretaries and secretary admins return early on the leader check, so they cannot see meetings they organize or attend when no leader is on them (Lin's own m2 and m3 disappear). Brief §3: "anyone: organizer or attendee". Make organizer/attendee visibility apply to every role, then add the role-specific leader rules. Cover it in the visibility tests.

## Done when
- `npm test` passes with the machine zone, `TZ=America/Los_Angeles` and `TZ=Asia/Shanghai`; `npm run check` passes.
- Same file scope as before (no pages/components/utils/app). Do not run git commands that change anything.

Reply with: per-file test counts before (HEAD) → after, any dropped assertion with its reason, and the three test summaries.
