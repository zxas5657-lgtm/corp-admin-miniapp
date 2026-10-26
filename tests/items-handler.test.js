'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const devSeed = require('../cloudfunctions/devSeed/handler');
const createHandler = require('../cloudfunctions/items/handler');
const { createFakeDb } = require('./support/fake-db');

const ROLE_OPENIDS = {
  leader: 'open-p-chen',
  secretary: 'open-p-lin',
  secretaryAdmin: 'open-p-he',
  receptionist: 'open-p-zhou',
  receptionAdmin: 'open-p-guo',
  driver: 'open-p-zhao',
};

async function setup() {
  const db = createFakeDb({
    bindings: Object.entries(ROLE_OPENIDS).map(([role, openid]) => ({
      _id: openid,
      employeeId: role === 'leader' ? 'p-chen' : openid.replace('open-', ''),
    })),
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
  const handler = createHandler({
    db,
    now: () => new Date('2026-10-25T00:00:00.000Z'),
    newId: () => `test-${++counter}`,
    log() {},
  });
  return { db, handler };
}

test('items visibility follows every seed role', async () => {
  const { handler } = await setup();
  const lists = {};
  for (const [role, openid] of Object.entries(ROLE_OPENIDS)) {
    lists[role] = (await handler({ action: 'list' }, { openid })).items;
  }
  assert.equal(
    lists.leader.some((item) => item.leaderIds.includes('p-chen')),
    true,
  );
  assert.equal(
    lists.leader.some((item) => item.leaderIds.includes('p-wang')),
    false,
  );
  assert.equal(
    lists.secretary.every(
      (item) =>
        item.leaderIds.includes('p-chen') ||
        (item.kind === 'meeting' && item.attendeeIds.includes('p-lin')),
    ),
    true,
  );
  assert.equal(
    lists.secretaryAdmin.every((item) => item.leaderIds.length > 0),
    true,
  );
  assert.equal(
    lists.receptionist.every((item) => item.kind === 'visit'),
    true,
  );
  assert.equal(
    lists.receptionAdmin.every((item) => item.kind === 'visit'),
    true,
  );
  assert.equal(lists.driver.length, 0);
});

test('invisible and missing item ids return the same item.notVisible result', async () => {
  const { handler } = await setup();
  for (const action of ['get', 'edit', 'confirm']) {
    const payload = { action, id: 'm6' };
    if (action === 'edit')
      Object.assign(payload, { patch: { title: 'hidden' }, needsConfirm: true });
    assert.deepEqual(await handler(payload, { openid: ROLE_OPENIDS.leader }), {
      ok: false,
      code: 'item.notVisible',
    });
    payload.id = 'does-not-exist';
    assert.deepEqual(await handler(payload, { openid: ROLE_OPENIDS.leader }), {
      ok: false,
      code: 'item.notVisible',
    });
  }
});

test('item create, series edits, stale revisions, and audit are transactional', async () => {
  const { db, handler } = await setup();
  const created = await handler(
    {
      action: 'create',
      kind: 'milestone',
      input: {
        title: 'One milestone',
        allDay: true,
        date: '2027-01-04',
        leaderIds: ['p-chen'],
      },
      needsConfirm: true,
    },
    { openid: ROLE_OPENIDS.secretary },
  );
  assert.equal(created.ok, true);
  const invalid = await handler(
    { action: 'create', kind: 'milestone', input: {} },
    {
      openid: ROLE_OPENIDS.secretary,
    },
  );
  assert.equal(invalid.code, 'item.title.required');
  const series = await handler(
    {
      action: 'createSeries',
      kind: 'milestone',
      input: {
        title: 'Weekly milestone',
        allDay: true,
        date: '2027-01-04',
        leaderIds: ['p-chen'],
      },
      until: '2027-01-18',
      needsConfirm: true,
    },
    { openid: ROLE_OPENIDS.secretary },
  );
  assert.equal(series.items.length, 3);
  assert.equal(new Set(series.items.map((item) => item.seriesId)).size, 1);
  const moved = await handler(
    {
      action: 'edit',
      id: series.items[1].id,
      patch: { date: '2027-01-06' },
      expectedRev: 0,
      needsConfirm: true,
      scope: 'following',
    },
    { openid: ROLE_OPENIDS.secretary },
  );
  assert.deepEqual(
    moved.items.map((item) => item.date),
    ['2027-01-06', '2027-01-13'],
  );
  assert.deepEqual(
    await handler(
      {
        action: 'edit',
        id: series.items[1].id,
        patch: { title: 'stale' },
        expectedRev: 0,
        needsConfirm: true,
      },
      { openid: ROLE_OPENIDS.secretary },
    ),
    { ok: false, code: 'item.alreadyChanged' },
  );
  const audits = db._dump().audit_log.filter((entry) => entry.action === 'item.update');
  assert.equal(
    audits.every((entry) => entry.needsConfirm === true),
    true,
  );
});

test('pickup visits create a linked request in one transaction', async () => {
  const { db, handler } = await setup();
  const result = await handler(
    {
      action: 'create',
      kind: 'visit',
      input: {
        title: 'Visitor',
        date: '2027-01-05',
        start: '09:00',
        end: '10:00',
        leaderIds: ['p-chen'],
        visitorName: 'A visitor',
        org: 'Org',
        headcount: 2,
        purpose: 'Review',
        visitorType: 'customer',
        receptionLevel: 'A',
        transport: 'pickup',
      },
    },
    { openid: ROLE_OPENIDS.receptionist },
  );
  assert.equal(result.ok, true);
  const requests = db
    ._dump()
    .vehicle_requests.filter((request) => request.itemId === result.item.id);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].itemId, result.item.id);
  assert.deepEqual(requests[0].reason, { 'zh-CN': '接送访客', en: 'Visitor pickup' });
  assert.equal(requests[0].passengers, 2);
  assert.equal(requests[0].forLeaderId, null);
  assert.equal(requests[0].destination.en, '');
  assert.equal(result.item.vehicleRequestId, requests[0]._id);
});

test('confirm, decline, seen, cancel, busy, and all-day range behavior are filtered', async () => {
  const { handler } = await setup();
  const confirmed = await handler(
    { action: 'confirm', id: 'm4' },
    {
      openid: ROLE_OPENIDS.leader,
    },
  );
  assert.equal(confirmed.ok, true);
  const declined = await handler(
    { action: 'decline', id: 'm4', reason: 'Schedule changed' },
    {
      openid: ROLE_OPENIDS.leader,
    },
  );
  assert.equal(declined.ok, true);
  const seen = await handler({ action: 'seen', id: 'm4' }, { openid: ROLE_OPENIDS.leader });
  assert.equal(seen.ok, true);
  const busy = await handler(
    {
      action: 'busy',
      leaderIds: ['p-chen'],
      from: '2026-10-26T00:00:00.000Z',
      to: '2026-10-27T00:00:00.000Z',
    },
    { openid: ROLE_OPENIDS.receptionist },
  );
  assert.deepEqual(Object.keys(busy.slots[0]).sort(), ['endAt', 'startAt']);
  const allDay = await handler(
    {
      action: 'list',
      from: '2026-10-29T16:00:00.000Z',
      to: '2026-10-30T16:00:00.000Z',
    },
    { openid: ROLE_OPENIDS.leader },
  );
  assert.equal(
    allDay.items.some((item) => item.id === 'ms1'),
    true,
  );
});

test('every item handler is gated and hides handler errors', async () => {
  const { db, handler } = await setup();
  assert.deepEqual(await handler({ action: 'list' }, { openid: 'missing' }), {
    ok: false,
    code: 'auth.notBound',
  });
  assert.deepEqual(await handler({ action: 'list' }, { openid: ROLE_OPENIDS.driver }), {
    ok: true,
    items: [],
  });
  await db
    .collection('employees')
    .doc('p-lin')
    .update({ data: { status: 'disabled' } });
  assert.deepEqual(await handler({ action: 'list' }, { openid: ROLE_OPENIDS.secretary }), {
    ok: false,
    code: 'auth.employeeDisabled',
  });
  assert.deepEqual(await handler({ action: 'list' }, { openid: 'unbound' }), {
    ok: false,
    code: 'auth.notBound',
  });
});

test('following edits roll back every occurrence and audit when a write fails', async () => {
  const { db, handler } = await setup();
  const series = await handler(
    {
      action: 'createSeries',
      kind: 'milestone',
      input: {
        title: 'Rollback series',
        allDay: true,
        date: '2027-03-01',
        leaderIds: ['p-chen'],
      },
      until: '2027-03-15',
      needsConfirm: true,
    },
    { openid: ROLE_OPENIDS.secretary },
  );
  const before = db._dump();
  const originalRun = db.runTransaction.bind(db);
  let itemWrites = 0;
  db.runTransaction = (callback) =>
    originalRun((tx) => {
      const originalCollection = tx.collection.bind(tx);
      tx.collection = (name) => {
        const collection = originalCollection(name);
        if (name !== 'items') return collection;
        const originalDoc = collection.doc.bind(collection);
        return {
          ...collection,
          doc(id) {
            const document = originalDoc(id);
            return {
              ...document,
              set: async (value) => {
                itemWrites += 1;
                if (itemWrites === 3) throw new Error('injected item write failure');
                return document.set(value);
              },
            };
          },
        };
      };
      return callback(tx);
    });
  const result = await handler(
    {
      action: 'edit',
      id: series.items[0].id,
      patch: { title: 'Should roll back' },
      expectedRev: 0,
      needsConfirm: true,
      scope: 'following',
    },
    { openid: ROLE_OPENIDS.secretary },
  );
  assert.deepEqual(result, { ok: false, code: 'server.error' });
  assert.deepEqual(db._dump().items, before.items);
  assert.deepEqual(db._dump().audit_log, before.audit_log);
});

test('series decline skips cancelled future occurrences', async () => {
  const { db, handler } = await setup();
  const series = await handler(
    {
      action: 'createSeries',
      kind: 'milestone',
      input: {
        title: 'Decline series',
        allDay: true,
        date: '2027-04-01',
        leaderIds: ['p-chen'],
      },
      until: '2027-04-15',
      needsConfirm: true,
    },
    { openid: ROLE_OPENIDS.secretary },
  );
  const cancelled = series.items[1];
  const cancelledBefore = db._dump().items.find((item) => item._id === cancelled.id);
  await db
    .collection('items')
    .doc(cancelled.id)
    .update({ data: { status: 'cancelled' } });
  const result = await handler(
    {
      action: 'decline',
      id: series.items[0].id,
      reason: 'No longer needed',
    },
    { openid: ROLE_OPENIDS.leader },
  );
  assert.equal(result.ok, true);
  const records = db._dump().items.filter((item) => item.seriesId === series.items[0].seriesId);
  assert.equal(
    records.find((item) => item._id === series.items[0].id).leaders[0].confirm,
    'declined',
  );
  assert.equal(
    records.find((item) => item._id === series.items[2].id).leaders[0].confirm,
    'declined',
  );
  assert.equal(records.find((item) => item._id === cancelled.id).status, 'cancelled');
  assert.deepEqual(
    records.find((item) => item._id === cancelled.id).leaders,
    cancelledBefore.leaders,
  );
});

test('item list uses padded range queries and pages all matching rows', async () => {
  const { db, handler } = await setup();
  const itemWhere = [];
  const originalCollection = db.collection.bind(db);
  db.collection = (name) => {
    const collection = originalCollection(name);
    if (name !== 'items') return collection;
    return {
      ...collection,
      where(query) {
        itemWhere.push(query);
        return collection.where(query);
      },
    };
  };
  for (let index = 0; index < 120; index += 1) {
    await db.collection('items').add({
      data: {
        _id: `range-${index}`,
        kind: 'milestone',
        title: 'Range item',
        allDay: true,
        date: '2027-05-10',
        tz: 'Asia/Shanghai',
        leaderIds: ['p-chen'],
        leaders: [],
        status: 'active',
        rev: 0,
      },
    });
  }
  await db.collection('items').add({
    data: {
      _id: 'outside-range',
      kind: 'milestone',
      title: 'Outside',
      allDay: true,
      date: '2027-06-10',
      tz: 'Asia/Shanghai',
      leaderIds: ['p-chen'],
      leaders: [],
      status: 'active',
      rev: 0,
    },
  });
  const result = await handler(
    {
      action: 'list',
      from: '2027-05-09T16:00:00.000Z',
      to: '2027-05-10T16:00:00.000Z',
    },
    { openid: ROLE_OPENIDS.leader },
  );
  assert.equal(result.items.filter((item) => item.id.startsWith('range-')).length, 120);
  assert.equal(
    result.items.some((item) => item.id === 'outside-range'),
    false,
  );
  assert.equal(itemWhere[0].__fakeCommand, 'or');
  const allDay = itemWhere[0].value.find((clause) => clause.allDay === true);
  assert.equal(allDay.date.value[0].value, '2027-05-08');
  assert.equal(allDay.date.value[1].value, '2027-05-11');
});

test('all-day items cross viewer and item zones at both range edges', async () => {
  const { handler } = await setup();
  const first = await handler(
    {
      action: 'create',
      kind: 'milestone',
      input: {
        title: 'Los Angeles day',
        allDay: true,
        date: '2027-06-01',
        tz: 'America/Los_Angeles',
        leaderIds: ['p-chen'],
      },
    },
    { openid: ROLE_OPENIDS.secretary },
  );
  const last = await handler(
    {
      action: 'create',
      kind: 'milestone',
      input: {
        title: 'Shanghai day',
        allDay: true,
        date: '2027-06-02',
        tz: 'Asia/Shanghai',
        leaderIds: ['p-chen'],
      },
    },
    { openid: ROLE_OPENIDS.secretary },
  );
  const laRange = await handler(
    {
      action: 'list',
      from: '2027-06-01T07:00:00.000Z',
      to: '2027-06-02T07:00:00.000Z',
    },
    { openid: ROLE_OPENIDS.leader },
  );
  const shanghaiRange = await handler(
    {
      action: 'list',
      from: '2027-06-01T16:00:00.000Z',
      to: '2027-06-02T16:00:00.000Z',
    },
    { openid: ROLE_OPENIDS.leader },
  );
  assert.equal(
    laRange.items.some((item) => item.id === first.item.id),
    true,
  );
  assert.equal(
    shanghaiRange.items.some((item) => item.id === last.item.id),
    true,
  );
});
