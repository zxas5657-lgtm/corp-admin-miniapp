'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDb } = require('./support/fake-db');
const createAdmin = require('../cloudfunctions/admin/handler');
const createAuth = require('../cloudfunctions/auth/handler');
const createDirectory = require('../cloudfunctions/directory/handler');
const { hashCode } = require('../cloudfunctions/_lib/invite-code');

const at = new Date('2026-10-25T00:00:00.000Z');

function invite(employeeId, code = 'BBBBBBBB', fields = {}) {
  return {
    _id: hashCode(code),
    codeHash: hashCode(code),
    employeeId,
    createdBy: 'admin',
    createdAt: at,
    expiresAt: new Date(at.getTime() + 7 * 24 * 60 * 60 * 1000),
    v: 1,
    rev: 0,
    ...fields,
  };
}

test('redeeming an invite binds the caller and returns whoami data', async () => {
  const now = () => new Date('2026-10-25T00:00:00.000Z');
  const db = createFakeDb({
    employees: [
      { _id: 'admin', role: 'secretaryAdmin', active: true, status: 'active', sysAdmin: true },
      { _id: 'leader', role: 'leader', active: true, status: 'active' },
    ],
    bindings: [{ _id: 'oa', employeeId: 'admin' }],
  });
  const issue = await createAdmin({ db, now, randomInt: () => 0 })(
    { action: 'issueInvite', employeeId: 'leader' },
    { openid: 'oa' },
  );
  const auth = createAuth({ db, now });
  const result = await auth({ action: 'redeemInvite', code: issue.code }, { openid: 'ol' });
  assert.equal(result.ok, true);
  assert.equal(result.bound, true);
  assert.equal(result.employee.id, 'leader');
  assert.deepEqual(result.supports, {});
  assert.equal((await auth({ action: 'whoami' }, { openid: 'ol' })).bound, true);
});

test('whoami returns a secretary support mapping and an empty mapping when absent', async () => {
  const db = createFakeDb({
    employees: [
      { _id: 'secretary', role: 'secretary', active: true, status: 'active' },
      { _id: 'leader', role: 'leader', active: true, status: 'active' },
    ],
    bindings: [
      { _id: 'secretary-openid', employeeId: 'secretary' },
      { _id: 'leader-openid', employeeId: 'leader' },
    ],
    supports: [{ _id: 'secretary', leaderIds: ['leader'] }],
  });
  const auth = createAuth({ db, now: () => at });
  assert.deepEqual((await auth({ action: 'whoami' }, { openid: 'secretary-openid' })).supports, {
    secretary: ['leader'],
  });
  await db.collection('supports').doc('secretary').remove();
  assert.deepEqual((await auth({ action: 'whoami' }, { openid: 'secretary-openid' })).supports, {
    secretary: [],
  });
  assert.deepEqual((await auth({ action: 'whoami' }, { openid: 'leader-openid' })).supports, {});
});

test('redeemInvite returns the secretary support mapping', async () => {
  const db = createFakeDb({
    employees: [
      { _id: 'admin', role: 'secretaryAdmin', active: true, status: 'active', sysAdmin: true },
      { _id: 'secretary', role: 'secretary', active: true, status: 'active' },
    ],
    bindings: [{ _id: 'admin-openid', employeeId: 'admin' }],
    supports: [{ _id: 'secretary', leaderIds: ['leader'] }],
  });
  const issue = await createAdmin({ db, now: () => at, randomInt: () => 0 })(
    { action: 'issueInvite', employeeId: 'secretary' },
    { openid: 'admin-openid' },
  );
  const result = await createAuth({ db, now: () => at })(
    { action: 'redeemInvite', code: issue.code },
    { openid: 'secretary-openid' },
  );
  assert.deepEqual(result.supports, { secretary: ['leader'] });
});

test('redeemInvite rate limits five failed attempts and resets after an hour', async () => {
  let time = new Date('2026-10-25T00:00:00.000Z');
  const now = () => time;
  const db = createFakeDb({
    employees: [{ _id: 'leader', role: 'leader', active: true, status: 'active' }],
    invites: [],
  });
  const auth = createAuth({ db, now });
  for (let count = 0; count < 5; count += 1) {
    assert.deepEqual(await auth({ action: 'redeemInvite', code: 'AAAAAAAA' }, { openid: 'ol' }), {
      ok: false,
      code: 'auth.inviteInvalid',
    });
  }
  assert.deepEqual(await auth({ action: 'redeemInvite', code: 'AAAAAAAA' }, { openid: 'ol' }), {
    ok: false,
    code: 'auth.tooManyAttempts',
  });
  time = new Date(time.getTime() + 60 * 60 * 1000);
  assert.deepEqual(await auth({ action: 'redeemInvite', code: 'AAAAAAAA' }, { openid: 'ol' }), {
    ok: false,
    code: 'auth.inviteInvalid',
  });
});

test('redeemInvite rejects reused, revoked, expired, disabled, bound, and already-bound cases', async () => {
  const cases = [
    {
      name: 'reused',
      invite: invite('employee', 'BBBBBBBB', { usedAt: at, usedBy: 'old' }),
      employee: { _id: 'employee', role: 'leader', active: true, status: 'active' },
      code: 'BBBBBBBB',
      expected: 'auth.inviteInvalid',
    },
    {
      name: 'revoked',
      invite: invite('employee', 'CCCCCCCC', { revokedAt: at }),
      employee: { _id: 'employee', role: 'leader', active: true, status: 'active' },
      code: 'CCCCCCCC',
      expected: 'auth.inviteInvalid',
    },
    {
      name: 'expired',
      invite: invite('employee', 'DDDDDDDD', {
        expiresAt: new Date(at.getTime() - 1),
      }),
      employee: { _id: 'employee', role: 'leader', active: true, status: 'active' },
      code: 'DDDDDDDD',
      expected: 'auth.inviteExpired',
    },
    {
      name: 'disabled employee',
      invite: invite('employee', 'EEEEEEEE'),
      employee: { _id: 'employee', role: 'leader', active: false, status: 'disabled' },
      code: 'EEEEEEEE',
      expected: 'auth.employeeDisabled',
    },
    {
      name: 'caller already bound',
      invite: invite('employee', 'GGGGGGGG'),
      employee: { _id: 'employee', role: 'leader', active: true, status: 'active' },
      code: 'GGGGGGGG',
      bindings: [{ _id: 'caller', employeeId: 'other' }],
      openid: 'caller',
      expected: 'auth.alreadyBound',
    },
    {
      name: 'employee bound elsewhere',
      invite: invite('employee', 'HHHHHHHH'),
      employee: { _id: 'employee', role: 'leader', active: true, status: 'active' },
      code: 'HHHHHHHH',
      bindings: [{ _id: 'other-openid', employeeId: 'employee' }],
      expected: 'auth.inviteInvalid',
    },
  ];
  for (const scenario of cases) {
    const db = createFakeDb({
      employees: [scenario.employee],
      invites: [scenario.invite],
      bindings: scenario.bindings || [],
    });
    const result = await createAuth({ db, now: () => at })(
      { action: 'redeemInvite', code: scenario.code },
      { openid: scenario.openid || 'caller' },
    );
    assert.deepEqual(result, { ok: false, code: scenario.expected }, scenario.name);
  }
});

test('a valid code is blocked after five failures, then works after the window and clears rate limits', async () => {
  let time = at;
  const db = createFakeDb({
    employees: [{ _id: 'employee', role: 'leader', active: true, status: 'active' }],
    invites: [invite('employee', 'JJJJJJJJ')],
  });
  const auth = createAuth({ db, now: () => time });
  for (let count = 0; count < 5; count += 1) {
    assert.deepEqual(
      await auth({ action: 'redeemInvite', code: 'not-valid' }, { openid: 'caller' }),
      { ok: false, code: 'auth.inviteInvalid' },
    );
  }
  assert.deepEqual(await auth({ action: 'redeemInvite', code: 'JJJJJJJJ' }, { openid: 'caller' }), {
    ok: false,
    code: 'auth.tooManyAttempts',
  });
  time = new Date(at.getTime() + 60 * 60 * 1000 + 1);
  const success = await auth({ action: 'redeemInvite', code: 'JJJJJJJJ' }, { openid: 'caller' });
  assert.equal(success.ok, true);
  assert.deepEqual(db._dump().rate_limits, []);
});

test('a transaction write failure rolls back the binding and invite changes', async () => {
  const db = createFakeDb({
    employees: [{ _id: 'employee', role: 'leader', active: true, status: 'active' }],
    invites: [invite('employee', 'KKKKKKKK')],
  });
  const runTransaction = db.runTransaction.bind(db);
  db.runTransaction = (callback) =>
    runTransaction((tx) => {
      const originalCollection = tx.collection.bind(tx);
      const wrapped = {
        ...tx,
        collection(name) {
          const collection = originalCollection(name);
          if (name !== 'invites') return collection;
          return {
            ...collection,
            doc(id) {
              const ref = collection.doc(id);
              return {
                ...ref,
                update: async () => {
                  throw new Error('forced transaction failure');
                },
              };
            },
          };
        },
      };
      return callback(wrapped);
    });
  const result = await createAuth({ db, now: () => at })(
    { action: 'redeemInvite', code: 'KKKKKKKK' },
    { openid: 'caller' },
  );
  assert.deepEqual(result, { ok: false, code: 'server.error' });
  assert.deepEqual(db._dump().bindings, []);
  assert.equal(db._dump().invites[0].usedAt, undefined);
});

test('disabled employees are rejected by whoami and directory while their binding remains', async () => {
  const db = createFakeDb({
    employees: [{ _id: 'employee', role: 'leader', active: false, status: 'disabled' }],
    bindings: [{ _id: 'caller', employeeId: 'employee' }],
  });
  assert.deepEqual(
    await createAuth({ db, now: () => at })({ action: 'whoami' }, { openid: 'caller' }),
    { ok: false, code: 'auth.employeeDisabled' },
  );
  assert.deepEqual(await createDirectory({ db })({ action: 'list' }, { openid: 'caller' }), {
    ok: false,
    code: 'auth.employeeDisabled',
  });
});
