'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDb } = require('./support/fake-db');

const functions = ['auth', 'directory', 'items', 'notes', 'vehicles', 'prefs', 'admin', 'devSeed'];
const makeHandler = (name, db, now) =>
  require(`../cloudfunctions/${name}/handler`)({ db, now, log() {} });
const base = {
  employees: [
    {
      _id: 'p1',
      name: { 'zh-CN': '甲', en: 'A' },
      title: { 'zh-CN': '职员', en: 'Staff' },
      role: 'leader',
      active: true,
      status: 'active',
      dispatcher: false,
      sysAdmin: false,
    },
    {
      _id: 'p2',
      name: { 'zh-CN': '乙', en: 'B' },
      title: { 'zh-CN': '秘书', en: 'Secretary' },
      role: 'secretary',
      active: true,
      status: 'active',
      dispatcher: true,
      sysAdmin: false,
    },
  ],
  bindings: [
    { _id: 'open-p1', employeeId: 'p1' },
    { _id: 'open-p2', employeeId: 'p2' },
  ],
  rooms: [{ _id: 'room', active: true, sort: 1, name: { 'zh-CN': '室', en: 'Room' } }],
  cars: [{ _id: 'car', active: true, sort: 1, seats: 4 }],
  supports: [],
};
const now = () => new Date('2026-10-25T00:00:00.000Z');

test('every function has an unknown-action router', async () => {
  for (const name of functions) {
    const result = await makeHandler(
      name,
      createFakeDb(base),
      now,
    )({ action: 'unknown' }, { openid: 'open-p1', env: 'dev' });
    assert.deepEqual(result, { ok: false, code: 'action.unknown' }, name);
  }
});

test('auth reports unbound, disabled, and bound callers', async () => {
  const db = createFakeDb(base);
  const handler = makeHandler('auth', db, now);
  assert.deepEqual(await handler({ action: 'whoami' }, { openid: 'missing' }), {
    ok: true,
    bound: false,
  });
  assert.deepEqual(await handler({ action: 'whoami' }, { openid: 'open-p1' }), {
    ok: true,
    bound: true,
    employee: {
      id: 'p1',
      name: { 'zh-CN': '甲', en: 'A' },
      title: { 'zh-CN': '职员', en: 'Staff' },
      role: 'leader',
    },
    dispatcher: false,
    sysAdmin: false,
  });
  await db
    .collection('employees')
    .doc('p1')
    .update({ data: { active: false } });
  assert.deepEqual(await handler({ action: 'whoami' }, { openid: 'open-p1' }), {
    ok: false,
    code: 'auth.employeeDisabled',
  });
});

test('directory is gated and whitelists employee fields', async () => {
  const db = createFakeDb(base);
  const handler = makeHandler('directory', db, now);
  assert.deepEqual(await handler({ action: 'list' }, { openid: 'missing' }), {
    ok: false,
    code: 'auth.notBound',
  });
  const result = await handler({ action: 'list' }, { openid: 'open-p1' });
  assert.deepEqual(Object.keys(result.employees[0]).sort(), ['id', 'name', 'role', 'title']);
});

test('prefs applies the whitelist and validates zones', async () => {
  const db = createFakeDb(base);
  const handler = makeHandler('prefs', db, now);
  assert.deepEqual(await handler({ action: 'get' }, { openid: 'missing' }), {
    ok: false,
    code: 'auth.notBound',
  });
  const initial = await handler({ action: 'get' }, { openid: 'open-p1' });
  assert.equal(initial.prefs.itemOffsetMin, 15);
  assert.deepEqual(
    await handler({ action: 'update', patch: { tz: 'Not/AZone' } }, { openid: 'open-p1' }),
    { ok: false, code: 'prefs.tzInvalid' },
  );
  const updated = await handler(
    { action: 'update', patch: { digestOn: false, injected: true } },
    { openid: 'open-p1' },
  );
  assert.equal(updated.prefs.digestOn, false);
  assert.equal(Object.hasOwn(updated.prefs, 'injected'), false);
});

test('dev seed gates environment and writes only seed collections', async () => {
  const db = createFakeDb({
    bindings: [{ _id: 'keep' }],
    invites: [{ _id: 'keep' }],
    rooms: [{ _id: 'old' }],
  });
  const handler = makeHandler('devSeed', db, now);
  assert.deepEqual(await handler({ action: 'run', allowEnvs: ['dev'] }, { env: 'dev' }), {
    ok: false,
    code: 'seed.notDev',
  });
  assert.deepEqual(
    await handler({ action: 'run', allowEnvs: ['prod'], confirm: 'seed-dev' }, { env: 'dev' }),
    { ok: false, code: 'seed.notDev' },
  );
  const result = await handler(
    { action: 'run', allowEnvs: ['dev'], confirm: 'seed-dev' },
    { env: 'dev' },
  );
  assert.deepEqual(result.counts, {
    rooms: 4,
    cars: 3,
    employees: 10,
    supports: 1,
    items: 12,
    vehicle_requests: 5,
    leader_notes: 1,
  });
  assert.equal(db._dump().bindings.length, 1);
  assert.equal(db._dump().invites.length, 1);
});

test('directory and prefs refuse disabled employees', async () => {
  const db = createFakeDb(base);
  await db
    .collection('employees')
    .doc('p1')
    .update({ data: { active: false } });
  for (const [name, action] of [
    ['directory', 'list'],
    ['prefs', 'get'],
    ['prefs', 'update'],
  ]) {
    const result = await makeHandler(name, db, now)({ action, patch: {} }, { openid: 'open-p1' });
    assert.deepEqual(result, { ok: false, code: 'auth.employeeDisabled' }, `${name}.${action}`);
  }
});

test('directory omits disabled employees and inactive rooms', async () => {
  const db = createFakeDb({
    ...base,
    employees: [...base.employees, { ...base.employees[1], _id: 'p3', active: false }],
    rooms: [...base.rooms, { _id: 'closed', active: false, sort: 2 }],
  });
  const result = await makeHandler('directory', db, now)({ action: 'list' }, { openid: 'open-p1' });
  assert.deepEqual(
    result.employees.map((employee) => employee.id),
    ['p1', 'p2'],
  );
  assert.deepEqual(
    result.rooms.map((room) => room._id),
    ['room'],
  );
});

test('prefs defaults to the company zone and validates every field', async () => {
  const db = createFakeDb(base);
  const handler = makeHandler('prefs', db, now);
  const context = { openid: 'open-p1' };
  const initial = await handler({ action: 'get' }, context);
  assert.equal(initial.prefs.tz, 'Asia/Shanghai');
  assert.deepEqual(initial.prefs.digestTimes, ['08:00', '18:00']);
  for (const patch of [
    { itemOffsetMin: -5 },
    { itemOffsetMin: 1.5 },
    { itemRemindersOn: 'yes' },
    { digestOn: 1 },
    { digestTimes: ['25:00'] },
    { digestTimes: '08:00' },
  ]) {
    assert.deepEqual(
      await handler({ action: 'update', patch }, context),
      { ok: false, code: 'prefs.invalid' },
      JSON.stringify(patch),
    );
  }
  const clientStamp = new Date('2020-01-01T00:00:00.000Z');
  const moved = await handler(
    { action: 'update', patch: { tz: 'America/Los_Angeles', tzUpdatedAt: clientStamp } },
    context,
  );
  assert.equal(moved.prefs.tz, 'America/Los_Angeles');
  assert.equal(moved.prefs.tzUpdatedAt.toISOString(), now().toISOString());
  assert.equal(moved.prefs.rev, 1);
  const stored = db._dump().reminder_prefs[0];
  assert.equal(stored._id, 'p1');
  assert.equal(stored.tz, 'America/Los_Angeles');
  const again = await handler({ action: 'update', patch: { itemOffsetMin: 30 } }, context);
  assert.equal(again.prefs.rev, 2);
  assert.equal(again.prefs.tz, 'America/Los_Angeles');
});

test('dev seed can run twice and replaces earlier rows', async () => {
  const db = createFakeDb({ rooms: [{ _id: 'old' }] });
  const handler = makeHandler('devSeed', db, now);
  const event = { action: 'run', allowEnvs: ['dev'], confirm: 'seed-dev' };
  assert.equal((await handler(event, { env: 'dev' })).ok, true);
  const second = await handler(event, { env: 'dev' });
  assert.equal(second.ok, true);
  const dump = db._dump();
  assert.equal(dump.rooms.length, second.counts.rooms);
  assert.equal(
    dump.rooms.some((room) => room._id === 'old'),
    false,
  );
  assert.equal(dump.items.length, 12);
  const trip = dump.items.find((item) => item._id === 't1');
  assert.ok(trip.startAt instanceof Date);
  assert.deepEqual(trip.title, { 'zh-CN': '深圳客户拜访', en: 'Shenzhen client visits' });
  assert.equal(dump.employees.find((employee) => employee._id === 'p-lin').dispatcher, true);
});

test('caller treats SDK missing-document errors as unbound', async () => {
  const { isMissing } = require('../cloudfunctions/_lib/caller');
  assert.equal(isMissing({ errMsg: 'document.get:fail document with _id x does not exist' }), true);
  assert.equal(isMissing(new Error('network down')), false);
  const db = createFakeDb(base);
  const sdkLike = {
    ...db,
    collection(name) {
      const collection = db.collection(name);
      return {
        ...collection,
        doc: (id) => ({
          ...collection.doc(id),
          get: async () => {
            const error = new Error('document.get:fail document with _id x does not exist');
            error.errCode = -502004;
            throw error;
          },
        }),
      };
    },
  };
  const result = await makeHandler('auth', sdkLike, now)({ action: 'whoami' }, { openid: 'x' });
  assert.deepEqual(result, { ok: true, bound: false });
});

test('handler errors return server.error without leaking messages', async () => {
  const handler = makeHandler(
    'auth',
    {
      collection() {
        throw new Error('secret');
      },
    },
    now,
  );
  assert.deepEqual(await handler({ action: 'whoami' }, { openid: 'x' }), {
    ok: false,
    code: 'server.error',
  });
});
