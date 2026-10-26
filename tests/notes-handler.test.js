'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const devSeed = require('../cloudfunctions/devSeed/handler');
const createHandler = require('../cloudfunctions/notes/handler');
const { createFakeDb } = require('./support/fake-db');

async function setup() {
  const db = createFakeDb({
    bindings: [
      { _id: 'leader', employeeId: 'p-chen' },
      { _id: 'secretary', employeeId: 'p-lin' },
      { _id: 'reception', employeeId: 'p-zhou' },
    ],
  });
  await devSeed({ db, now: () => new Date('2026-10-25T00:00:00.000Z'), log() {} })(
    {
      action: 'run',
      allowEnvs: ['dev'],
      confirm: 'seed-dev',
    },
    { env: 'dev' },
  );
  let counter = 0;
  return {
    db,
    handler: createHandler({
      db,
      now: () => new Date('2026-10-25T00:00:00.000Z'),
      newId: () => `note-${++counter}`,
      log() {},
    }),
  };
}

test('notes are visible to the leader and mapped secretary only', async () => {
  const { handler } = await setup();
  const created = await handler(
    { action: 'create', text: 'Please plan a visit' },
    { openid: 'leader' },
  );
  assert.equal(created.ok, true);
  assert.equal((await handler({ action: 'list' }, { openid: 'leader' })).notes.length, 2);
  assert.equal((await handler({ action: 'list' }, { openid: 'secretary' })).notes.length, 2);
  assert.equal((await handler({ action: 'list' }, { openid: 'reception' })).notes.length, 0);
});

test('notes require leaders to create and visible items to convert', async () => {
  const { handler } = await setup();
  assert.deepEqual(await handler({ action: 'create', text: 'No' }, { openid: 'secretary' }), {
    ok: false,
    code: 'permission.denied',
  });
  const created = await handler({ action: 'create', text: 'Convert this' }, { openid: 'leader' });
  assert.equal(created.ok, true);
  assert.deepEqual(
    await handler(
      {
        action: 'convert',
        id: created.note.id,
        itemIds: ['m6'],
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'item.notVisible' },
  );
  const converted = await handler(
    {
      action: 'convert',
      id: created.note.id,
      itemIds: ['m4'],
    },
    { openid: 'secretary' },
  );
  assert.equal(converted.ok, true);
  const closed = await handler({ action: 'close', id: created.note.id }, { openid: 'secretary' });
  assert.equal(closed.ok, true);
  const audits = await handler({ action: 'list' }, { openid: 'secretary' });
  assert.equal(audits.ok, true);
});

test('notes gate unknown, unbound, and unexpected failures', async () => {
  const { db, handler } = await setup();
  assert.deepEqual(await handler({ action: 'unknown' }, { openid: 'leader' }), {
    ok: false,
    code: 'action.unknown',
  });
  assert.deepEqual(await handler({ action: 'list' }, { openid: 'missing' }), {
    ok: false,
    code: 'auth.notBound',
  });
  await db
    .collection('employees')
    .doc('p-lin')
    .update({ data: { status: 'disabled' } });
  assert.deepEqual(await handler({ action: 'list' }, { openid: 'secretary' }), {
    ok: false,
    code: 'auth.employeeDisabled',
  });
});

test('an unmapped secretary cannot list, convert, or close a leader note', async () => {
  const { db, handler } = await setup();
  const created = await handler({ action: 'create', text: 'Private note' }, { openid: 'leader' });
  await db
    .collection('supports')
    .doc('p-lin')
    .update({ data: { leaderIds: [] } });
  assert.deepEqual(await handler({ action: 'list' }, { openid: 'secretary' }), {
    ok: true,
    notes: [],
  });
  assert.deepEqual(
    await handler(
      {
        action: 'convert',
        id: created.note.id,
        itemIds: ['m4'],
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'item.notVisible' },
  );
  assert.deepEqual(
    await handler(
      { action: 'close', id: created.note.id },
      {
        openid: 'secretary',
      },
    ),
    { ok: false, code: 'item.notVisible' },
  );
});
