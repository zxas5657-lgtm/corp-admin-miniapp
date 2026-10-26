# CloudBase functions setup

Run `npm run sync` before uploading any function. The command copies the domain rules, seed data,
and shared server helpers into each deployable function. `cloudfunctions/_lib` is a source-only
helper directory; it is not a deployable function.

## Collections

Create these collections in CloudBase. Every collection has the security rule:
`{ "read": false, "write": false }` (deny all client reads and writes).

| Collection           | Indexes                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `employees`          | `status`; `role + status`; `dispatcher`                                                                                                  |
| `supports`           | `leaderIds` (multikey)                                                                                                                   |
| `bindings`           | `employeeId` (unique)                                                                                                                    |
| `invites`            | `codeHash` (unique); `employeeId + usedAt`                                                                                               |
| `rate_limits`        | `_id`                                                                                                                                    |
| `rooms`              | `active + sort`                                                                                                                          |
| `cars`               | `active + sort`                                                                                                                          |
| `items`              | `leaderIds + startAt`; `attendeeIds + startAt`; `kind + startAt`; `roomId + startAt`; `parentId`; `seriesId`; `status + plateClearAfter` |
| `vehicle_requests`   | `status + departAt`; `applicantId + departAt`; `forLeaderId + departAt`; `carId + departAt`; `driverId + departAt`                       |
| `leader_notes`       | `leaderId + createdAt`; `status + createdAt`                                                                                             |
| `reminder_prefs`     | `_id`                                                                                                                                    |
| `reminder_overrides` | `employeeId + itemId`                                                                                                                    |
| `subscriptions`      | `_id`                                                                                                                                    |
| `notification_jobs`  | `status + dueAt`                                                                                                                         |
| `audit_log`          | `entity + entityId + at`; `actorId + at`                                                                                                 |
| `locks`              | none (dispatch race guard, read and written by id only)                                                                                  |

## Upload

Upload `auth`, `directory`, `items`, `notes`, `vehicles`, `prefs`, `admin`, and `devSeed`.
Do not upload `_lib`; it only supplies the single source for the generated `shared/lib` copies.

The console test page can run the fictional development seed with:

```json
{
  "action": "run",
  "allowEnvs": ["<dev env id>"],
  "confirm": "seed-dev"
}
```

Never run `devSeed` in `prod`. Production data is real data and is imported through the CloudBase
console only.

## First sysAdmin bootstrap

1. Import the first active employee with `sysAdmin: true` through the CloudBase console.
2. On the console function test page, call `admin` with
   `{ "action": "bootstrapInvite", "employeeId": "<that id>", "confirm": "bootstrap" }`.
   (The normal `issueInvite` does not work here: console calls carry no openid, so it returns
   `auth.notBound`.) The bootstrap action is allowed only while `bindings` is empty and the
   target is an active sysAdmin.
3. Give the returned code to that employee; they redeem it in the app. Once any binding exists,
   the bootstrap action refuses further calls and all later invites come from the app.
