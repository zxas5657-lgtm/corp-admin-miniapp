'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDb } = require('./support/fake-db');
const createHandler = require('../cloudfunctions/admin/handler');
const createAuth = require('../cloudfunctions/auth/handler');
const { hashCode } = require('../cloudfunctions/_lib/invite-code');

const at = new Date('2026-10-25T00:00:00.000Z');
const base = {
  employees: [
    {
      _id: 'admin',
      role: 'secretaryAdmin',
      status: 'active',
      active: true,
      sysAdmin: true,
    },
    { _id: 'leader', role: 'leader', status: 'active', active: true },
    { _id: 'secretary', role: 'secretary', status: 'active', active: true },
  ],
  bindings: [{ _id: 'openid-admin', employeeId: 'admin' }],
  supports: [],
};

function adminFixture() {
  return {
    employees: [
      {
        _id: 'admin',
        role: 'secretaryAdmin',
        status: 'active',
        active: true,
        sysAdmin: true,
      },
      {
        _id: 'secretaryAdmin',
        role: 'secretaryAdmin',
        status: 'active',
        active: true,
        sysAdmin: false,
      },
      { _id: 'leader', role: 'leader', status: 'active', active: true },
      { _id: 'leader2', role: 'leader', status: 'active', active: true },
      { _id: 'target', role: 'secretary', status: 'active', active: true },
      { _id: 'target2', role: 'leader', status: 'active', active: true },
    ],
    bindings: [
      { _id: 'openid-admin', employeeId: 'admin' },
      { _id: 'openid-secretary-admin', employeeId: 'secretaryAdmin' },
    ],
    supports: [],
  };
}

function adminHandler(db, randomInt = () => 0) {
  return createHandler({ db, now: () => at, randomInt });
}

test('admin issueInvite stores only the hash and re-issuing revokes the old invite', async () => {
  const db = createFakeDb(base);
  let randomCalls = 0;
  const handler = createHandler({
    db,
    now: () => at,
    randomInt: () => (randomCalls++ < 8 ? 0 : 1),
  });
  const first = await handler(
    { action: 'issueInvite', employeeId: 'secretary' },
    { openid: 'openid-admin' },
  );
  const second = await handler(
    { action: 'issueInvite', employeeId: 'secretary' },
    { openid: 'openid-admin' },
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.code, second.code);
  const dump = JSON.stringify(db._dump());
  assert.equal(dump.includes(first.code), false);
  assert.equal(db._dump().invites.filter((invite) => !invite.revokedAt).length, 1);
});

test('bootstrapInvite is available only before the first binding', async () => {
  const db = createFakeDb({
    employees: [{ _id: 'admin', role: 'leader', status: 'active', sysAdmin: true }],
    bindings: [],
  });
  const handler = createHandler({ db, now: () => at, randomInt: () => 0 });
  const issued = await handler(
    { action: 'bootstrapInvite', employeeId: 'admin', confirm: 'bootstrap' },
    {},
  );
  assert.equal(issued.ok, true);
  assert.deepEqual(
    db._dump().audit_log.map((entry) => ({
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
    })),
    [
      {
        action: 'invite.issue',
        entity: 'invite',
        entityId: hashCode(issued.code),
      },
    ],
  );
  assert.equal(JSON.stringify(db._dump().audit_log).includes(issued.code), false);
  await db.collection('bindings').add({ data: { _id: 'bound', employeeId: 'admin' } });
  assert.deepEqual(
    await handler({ action: 'bootstrapInvite', employeeId: 'admin', confirm: 'bootstrap' }, {}),
    { ok: false, code: 'permission.denied' },
  );
});

test('issueInvite refuses bound and disabled employees', async () => {
  const db = createFakeDb({
    ...base,
    employees: [
      ...base.employees,
      { _id: 'disabled', role: 'leader', status: 'disabled', active: false },
    ],
    bindings: [...base.bindings, { _id: 'openid-leader', employeeId: 'leader' }],
  });
  const handler = adminHandler(db);
  assert.deepEqual(
    await handler({ action: 'issueInvite', employeeId: 'leader' }, { openid: 'openid-admin' }),
    { ok: false, code: 'admin.alreadyBound' },
  );
  assert.deepEqual(
    await handler({ action: 'issueInvite', employeeId: 'disabled' }, { openid: 'openid-admin' }),
    { ok: false, code: 'auth.employeeDisabled' },
  );
});

test('revokeInvite reports the number of open invites', async () => {
  const db = createFakeDb({
    ...base,
    invites: [
      { _id: 'open-1', employeeId: 'leader' },
      { _id: 'open-2', employeeId: 'leader' },
      { _id: 'used', employeeId: 'leader', usedAt: at },
      { _id: 'revoked', employeeId: 'leader', revokedAt: at },
    ],
  });
  const result = await adminHandler(db)(
    { action: 'revokeInvite', employeeId: 'leader' },
    { openid: 'openid-admin' },
  );
  assert.deepEqual(result, { ok: true, revoked: 2 });
  assert.equal(db._dump().invites.filter((invite) => invite.revokedAt === undefined).length, 1);
});

test('disableEmployee removes bindings and revokes open invites', async () => {
  const db = createFakeDb({
    ...base,
    employees: [
      ...base.employees,
      { _id: 'target2', role: 'leader', status: 'active', active: true },
    ],
    bindings: [...base.bindings, { _id: 'openid-target', employeeId: 'target2' }],
    invites: [{ _id: 'open', employeeId: 'target2' }],
  });
  const result = await adminHandler(db)(
    { action: 'disableEmployee', employeeId: 'target2' },
    { openid: 'openid-admin' },
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(
    db._dump().bindings.some((binding) => binding.employeeId === 'target2'),
    false,
  );
  assert.equal(db._dump().invites[0].revokedAt instanceof Date, true);
  assert.equal(
    db._dump().employees.find((employee) => employee._id === 'target2').status,
    'disabled',
  );
  assert.deepEqual(
    await createAuth({ db, now: () => at })({ action: 'whoami' }, { openid: 'openid-target' }),
    { ok: true, bound: false },
  );
});

test('disableEmployee rejects self and setFlags protects the last sysAdmin', async () => {
  const db = createFakeDb({
    ...adminFixture(),
    employees: [
      ...adminFixture().employees,
      { _id: 'admin2', role: 'secretaryAdmin', status: 'active', active: true, sysAdmin: true },
    ],
    bindings: [...adminFixture().bindings, { _id: 'openid-admin2', employeeId: 'admin2' }],
  });
  const handler = adminHandler(db);
  assert.deepEqual(
    await handler({ action: 'disableEmployee', employeeId: 'admin' }, { openid: 'openid-admin' }),
    { ok: false, code: 'admin.cannotDisableSelf' },
  );
  assert.equal(
    (
      await handler(
        { action: 'setFlags', employeeId: 'admin', sysAdmin: false },
        { openid: 'openid-admin' },
      )
    ).ok,
    true,
  );
  assert.deepEqual(
    await handler(
      { action: 'setFlags', employeeId: 'admin2', sysAdmin: false },
      { openid: 'openid-admin2' },
    ),
    { ok: false, code: 'admin.lastSysAdmin' },
  );
});

test('setFlags validates boolean flag values', async () => {
  const db = createFakeDb(adminFixture());
  const handler = adminHandler(db);
  for (const event of [{ dispatcher: 'yes' }, { sysAdmin: 1 }, {}]) {
    assert.deepEqual(
      await handler(
        { action: 'setFlags', employeeId: 'target', ...event },
        {
          openid: 'openid-admin',
        },
      ),
      { ok: false, code: 'admin.invalid' },
    );
  }
});

test('updateSupports validates the secretary, leaders, duplicates, and active status', async () => {
  const fixture = adminFixture();
  fixture.employees.push({
    _id: 'disabled-leader',
    role: 'leader',
    status: 'disabled',
    active: false,
  });
  const db = createFakeDb(fixture);
  const handler = adminHandler(db);
  const invalid = [
    { secretaryId: 'leader', leaderIds: [] },
    { secretaryId: 'target', leaderIds: ['leader', 'leader'] },
    { secretaryId: 'target', leaderIds: ['missing'] },
    { secretaryId: 'target', leaderIds: ['disabled-leader'] },
  ];
  for (const event of invalid) {
    assert.deepEqual(
      await handler({ action: 'updateSupports', ...event }, { openid: 'openid-admin' }),
      {
        ok: false,
        code: event.secretaryId === 'leader' ? 'supports.notSecretary' : 'supports.leaderInvalid',
      },
    );
  }
  assert.deepEqual(
    await handler(
      { action: 'updateSupports', secretaryId: 'target', leaderIds: [] },
      { openid: 'openid-admin' },
    ),
    { ok: true, secretaryId: 'target', leaderIds: [] },
  );
});

test('a secretaryAdmin may update supports but cannot issue invites', async () => {
  const db = createFakeDb(adminFixture());
  const handler = adminHandler(db);
  assert.deepEqual(
    await handler(
      { action: 'updateSupports', secretaryId: 'target', leaderIds: ['leader'] },
      { openid: 'openid-secretary-admin' },
    ),
    { ok: true, secretaryId: 'target', leaderIds: ['leader'] },
  );
  assert.deepEqual(
    await handler(
      { action: 'issueInvite', employeeId: 'target' },
      { openid: 'openid-secretary-admin' },
    ),
    { ok: false, code: 'permission.denied' },
  );
});

test('a non-sysAdmin is denied for every caller-gated admin action', async () => {
  const db = createFakeDb({
    ...adminFixture(),
    bindings: [...adminFixture().bindings, { _id: 'openid-leader', employeeId: 'leader' }],
  });
  const handler = adminHandler(db);
  const events = [
    { action: 'issueInvite', employeeId: 'target' },
    { action: 'revokeInvite', employeeId: 'target' },
    { action: 'disableEmployee', employeeId: 'target' },
    { action: 'setFlags', employeeId: 'target', dispatcher: true },
    { action: 'updateSupports', secretaryId: 'target', leaderIds: [] },
  ];
  for (const event of events) {
    assert.deepEqual(
      await handler(event, { openid: 'openid-leader' }),
      { ok: false, code: 'permission.denied' },
      event.action,
    );
  }
});

test('every admin and redemption write has one audit entry with no plain code', async () => {
  const db = createFakeDb({
    ...adminFixture(),
    employees: [
      ...adminFixture().employees,
      { _id: 'redeem', role: 'leader', status: 'active', active: true },
    ],
    bindings: [...adminFixture().bindings, { _id: 'openid-target2', employeeId: 'target2' }],
    invites: [
      { _id: 'open-target2', employeeId: 'target2' },
      {
        _id: hashCode('PPPPPPPP'),
        codeHash: hashCode('PPPPPPPP'),
        employeeId: 'redeem',
        createdBy: 'admin',
        createdAt: at,
        expiresAt: new Date(at.getTime() + 86400000),
      },
    ],
  });
  let randomCalls = 0;
  const handler = adminHandler(db, () => (randomCalls++ < 8 ? 0 : 1));
  const issued = await handler(
    { action: 'issueInvite', employeeId: 'target' },
    { openid: 'openid-admin' },
  );
  await handler({ action: 'revokeInvite', employeeId: 'target' }, { openid: 'openid-admin' });
  await handler({ action: 'disableEmployee', employeeId: 'target2' }, { openid: 'openid-admin' });
  await handler(
    { action: 'setFlags', employeeId: 'leader', dispatcher: true },
    { openid: 'openid-admin' },
  );
  await handler(
    { action: 'updateSupports', secretaryId: 'target', leaderIds: ['leader'] },
    { openid: 'openid-admin' },
  );
  const redeemed = await createAuth({ db, now: () => at })(
    { action: 'redeemInvite', code: 'PPPPPPPP' },
    { openid: 'openid-target' },
  );
  assert.equal(issued.ok, true);
  assert.equal(redeemed.ok, true);
  const audits = db._dump().audit_log;
  const expected = [
    ['invite.issue', 'invite', hashCode(issued.code)],
    ['invite.revoke', 'employee', 'target'],
    ['employee.disable', 'employee', 'target2'],
    ['employee.flags', 'employee', 'leader'],
    ['supports.update', 'supports', 'target'],
    ['invite.redeem', 'invite', hashCode('PPPPPPPP')],
  ];
  for (const [action, entity, entityId] of expected) {
    assert.equal(
      audits.filter(
        (entry) =>
          entry.action === action && entry.entity === entity && entry.entityId === entityId,
      ).length,
      1,
      action,
    );
  }
  for (const code of [issued.code, 'PPPPPPPP']) {
    assert.equal(JSON.stringify(audits).includes(code), false);
  }
});
