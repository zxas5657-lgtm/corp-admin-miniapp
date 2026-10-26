'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../miniprogram/data/seed');
const reference = require('../miniprogram/data/reference');
const clock = require('../miniprogram/domain/clock');
const { createStore } = require('../miniprogram/store');
const { createMemoryAdapter } = require('../miniprogram/store/adapter');
const { createLocalApi } = require('../miniprogram/store/local');
const { createRemoteApi } = require('../miniprogram/store/remote');
const authHandler = require('../cloudfunctions/auth/handler');
const directoryHandler = require('../cloudfunctions/directory/handler');
const prefsHandler = require('../cloudfunctions/prefs/handler');
const { createFakeDb } = require('./support/fake-db');

function makeClock() {
  let value = new Date('2026-10-24T01:20:00.000Z');
  return {
    now: () => new Date(value),
    set(valueAt) {
      value = new Date(valueAt);
    },
  };
}

function makeLocal(role, options) {
  const store =
    (options && options.store) ||
    createStore({
      adapter: (options && options.adapter) || createMemoryAdapter(),
      seed,
      clock,
    });
  return {
    store,
    api: createLocalApi({
      store,
      actor: reference.actorFor(role),
      clock: (options && options.clock) || clock,
      newId: options && options.newId,
    }),
  };
}

test('local whoami returns only the caller secretary support mapping', async () => {
  assert.deepEqual((await makeLocal('secretary').api.whoami()).supports, {
    'p-lin': ['p-chen'],
  });
  assert.deepEqual((await makeLocal('leader').api.whoami()).supports, {});
});

test('local visibility follows role needs to know rules', async () => {
  const leader = await makeLocal('leader').api.listItems({});
  assert.ok(leader.items.some((item) => item.leaderIds.includes('p-chen')));
  assert.equal(
    leader.items.some((item) => item.leaderIds.includes('p-wang')),
    false,
  );

  const secretary = await makeLocal('secretary').api.listItems({});
  assert.ok(secretary.items.length > 0);
  assert.equal(secretary.items.some((item) => item.id === 'm2'), true);
  assert.equal(secretary.items.some((item) => item.id === 'm3'), true);

  const receptionistApi = makeLocal('receptionist').api;
  const visits = await receptionistApi.listItems({});
  assert.equal(
    visits.items.every((item) => item.kind === 'visit'),
    true,
  );
  const slots = await receptionistApi.busySlots({
    leaderIds: ['p-chen'],
    from: '2026-10-27T00:00:00.000Z',
    to: '2026-10-28T00:00:00.000Z',
  });
  assert.ok(slots.slots.length > 0);
  assert.deepEqual(Object.keys(slots.slots[0]).sort(), ['endAt', 'startAt']);
});

test('local items support creation, following edits, confirmation, decline, and stale revisions', async () => {
  const secretary = makeLocal('secretary');
  const created = await secretary.api.createItem({
    kind: 'milestone',
    input: {
      title: 'Single milestone',
      allDay: true,
      date: '2026-11-20',
      leaderIds: ['p-chen'],
      important: true,
    },
    needsConfirm: true,
  });
  assert.equal(created.ok, true);

  const series = await secretary.api.createSeries({
    kind: 'milestone',
    input: {
      title: 'Weekly milestone',
      allDay: true,
      date: '2026-11-23',
      leaderIds: ['p-chen'],
      important: true,
    },
    until: '2026-12-07',
    needsConfirm: true,
  });
  assert.equal(series.ok, true);
  assert.equal(series.items.length, 3);
  const edited = await secretary.api.editItem({
    id: series.items[1].id,
    patch: { title: 'Changed weekly milestone' },
    expectedRev: 0,
    needsConfirm: true,
    changeNote: 'Updated timing',
    scope: 'following',
  });
  assert.equal(edited.ok, true);
  assert.equal(edited.items.length, 2);
  assert.deepEqual(
    await secretary.api.editItem({
      id: series.items[1].id,
      patch: { title: 'stale' },
      expectedRev: 0,
      needsConfirm: true,
      scope: 'one',
    }),
    { ok: false, code: 'item.alreadyChanged' },
  );

  const leader = makeLocal('leader', { store: secretary.store });
  const confirmed = await leader.api.confirmItem({ id: series.items[1].id, expectedRev: 1 });
  assert.equal(confirmed.ok, true);
  const declined = await leader.api.declineItem({
    id: series.items[2].id,
    reason: 'No longer needed',
  });
  assert.equal(declined.ok, true);
  const cancelled = await leader.api.cancelItem({ id: created.item.id, expectedRev: 0 });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.item.status, 'cancelled');
});

test('local notes, vehicles, arrival, preferences, and subscriber notifications work', async () => {
  const testClock = makeClock();
  const store = createStore({ adapter: createMemoryAdapter(), seed, clock: testClock });
  let notifications = 0;
  store.subscribe(() => notifications++);
  const leader = createLocalApi({ store, actor: reference.actorFor('leader'), clock: testClock });
  const secretary = createLocalApi({
    store,
    actor: reference.actorFor('secretary'),
    clock: testClock,
  });
  const dispatcher = createLocalApi({
    store,
    actor: reference.actorFor('secretary'),
    clock: testClock,
  });
  const driver = createLocalApi({ store, actor: reference.actorFor('driver'), clock: testClock });
  const receptionist = createLocalApi({
    store,
    actor: reference.actorFor('receptionist'),
    clock: testClock,
  });

  const note = await leader.createNote({ text: 'Please plan a client visit' });
  assert.equal(note.ok, true);
  assert.equal(
    (await secretary.listNotes()).notes.some((item) => item.id === note.note.id),
    true,
  );
  assert.equal((await secretary.convertNote({ id: note.note.id, itemIds: ['new-item'] })).ok, true);
  assert.equal((await secretary.closeNote({ id: note.note.id })).ok, true);

  const request = await secretary.requestVehicle({
    input: {
      reason: 'Client visit',
      destination: 'North Campus',
      date: '2026-10-24',
      time: '09:00',
      passengers: 2,
      forLeaderId: 'p-chen',
    },
  });
  assert.equal(request.ok, true);
  const dispatch = await dispatcher.dispatchVehicle({
    id: request.vehicle.id,
    carId: 'gl8a',
    driverId: 'p-zhao',
    expectedRev: 0,
  });
  assert.equal(dispatch.ok, true);
  testClock.set('2026-10-24T04:00:00.000Z');
  assert.equal((await driver.completeVehicle({ id: request.vehicle.id, expectedRev: 1 })).ok, true);

  const withdraw = await secretary.requestVehicle({
    input: {
      reason: 'Pending trip',
      destination: 'Office',
      date: '2026-10-30',
      time: '09:00',
      passengers: 1,
      forLeaderId: 'p-chen',
    },
  });
  assert.equal(
    (await secretary.withdrawVehicle({ id: withdraw.vehicle.id, expectedRev: 0 })).ok,
    true,
  );
  const reject = await secretary.requestVehicle({
    input: {
      reason: 'Rejected trip',
      destination: 'Office',
      date: '2026-10-31',
      time: '09:00',
      passengers: 1,
      forLeaderId: 'p-chen',
    },
  });
  assert.equal(
    (
      await dispatcher.rejectVehicle({
        id: reject.vehicle.id,
        reason: 'No vehicle available',
        expectedRev: 0,
      })
    ).ok,
    true,
  );

  const visit = await receptionist.markArrived({ id: 'vs1' });
  assert.equal(visit.ok, true);
  assert.equal(typeof visit.item.arrivedAt, 'string');
  assert.deepEqual(await leader.updatePrefs({ patch: { tz: 'No/SuchZone' } }), {
    ok: false,
    code: 'prefs.tzInvalid',
  });
  assert.equal((await leader.updatePrefs({ patch: { itemOffsetMin: 30 } })).ok, true);
  assert.ok(notifications >= 10);
});

function contractDb() {
  return createFakeDb({
    employees: [
      {
        _id: 'p-lin',
        name: { 'zh-CN': '甲', en: 'A' },
        title: { 'zh-CN': '员工', en: 'Staff' },
        role: 'secretary',
        active: true,
        status: 'active',
        dispatcher: true,
        sysAdmin: false,
      },
    ],
    bindings: [{ _id: 'open-p-lin', employeeId: 'p-lin' }],
    supports: [{ _id: 'p-lin', leaderIds: ['p-chen'] }],
    rooms: [{ _id: 'room', active: true, sort: 1 }],
    cars: [{ _id: 'car', active: true, sort: 1 }],
  });
}

test('the shared contract scenarios run through local and in-process remote APIs', async () => {
  const local = makeLocal('secretary').api;
  const db = contractDb();
  const now = () => new Date('2026-10-25T00:00:00.000Z');
  const handlers = {
    auth: authHandler({ db, now, log() {} }),
    directory: directoryHandler({ db, now, log() {} }),
    prefs: prefsHandler({ db, now, log() {} }),
  };
  const remote = createRemoteApi({
    call: (fn, event) => handlers[fn](event, { openid: 'open-p-lin' }),
  });
  const localWhoami = await local.whoami();
  const remoteWhoami = await remote.whoami();
  assert.equal(localWhoami.ok, true);
  assert.equal(remoteWhoami.ok, true);
  assert.deepEqual(remoteWhoami.supports, localWhoami.supports);
  for (const api of [local, remote]) {
    const directory = await api.directory();
    assert.equal(directory.ok, true);
    assert.ok(directory.rooms.length > 0);
    assert.equal((await api.getPrefs()).ok, true);
    assert.equal((await api.updatePrefs({ patch: { itemOffsetMin: 20 } })).ok, true);
  }
});

test('items notes and vehicles contract actions stay usable through local and remote APIs', async () => {
  const localStore = createStore({ adapter: createMemoryAdapter(), seed, clock });
  const local = {
    leader: createLocalApi({ store: localStore, actor: reference.actorFor('leader'), clock }),
    secretary: createLocalApi({ store: localStore, actor: reference.actorFor('secretary'), clock }),
    receptionist: createLocalApi({
      store: localStore,
      actor: reference.actorFor('receptionist'),
      clock,
    }),
    driver: createLocalApi({ store: localStore, actor: reference.actorFor('driver'), clock }),
  };
  const db = createFakeDb({
    bindings: [
      { _id: 'open-p-chen', employeeId: 'p-chen' },
      { _id: 'open-p-lin', employeeId: 'p-lin' },
      { _id: 'open-p-zhou', employeeId: 'p-zhou' },
      { _id: 'open-p-zhao', employeeId: 'p-zhao' },
    ],
  });
  const devSeed = require('../cloudfunctions/devSeed/handler');
  await devSeed({ db, now: () => new Date('2026-10-25T00:00:00.000Z'), log() {} })(
    {
      action: 'run',
      allowEnvs: ['dev'],
      confirm: 'seed-dev',
    },
    { env: 'dev' },
  );
  const items = require('../cloudfunctions/items/handler')({
    db,
    now: () => new Date('2026-10-25T00:00:00.000Z'),
    newId: (() => {
      let value = 0;
      return () => `remote-item-${++value}`;
    })(),
    log() {},
  });
  const notes = require('../cloudfunctions/notes/handler')({
    db,
    now: () => new Date('2026-10-25T00:00:00.000Z'),
    newId: (() => {
      let value = 0;
      return () => `remote-note-${++value}`;
    })(),
    log() {},
  });
  const vehicles = require('../cloudfunctions/vehicles/handler')({
    db,
    now: () => new Date('2026-10-25T00:00:00.000Z'),
    newId: (() => {
      let value = 0;
      return () => `remote-vehicle-${++value}`;
    })(),
    log() {},
  });
  const remote = {
    leader: createRemoteApi({
      call: (fn, event) => ({ items, notes, vehicles })[fn](event, { openid: 'open-p-chen' }),
    }),
    secretary: createRemoteApi({
      call: (fn, event) => ({ items, notes, vehicles })[fn](event, { openid: 'open-p-lin' }),
    }),
    receptionist: createRemoteApi({
      call: (fn, event) => ({ items, notes, vehicles })[fn](event, { openid: 'open-p-zhou' }),
    }),
    driver: createRemoteApi({
      call: (fn, event) => ({ items, notes, vehicles })[fn](event, { openid: 'open-p-zhao' }),
    }),
  };
  assert.equal((await local.leader.listItems({})).ok, true);
  assert.equal((await remote.leader.listItems({})).ok, true);
  const parityWindow = {
    from: '2026-10-01T00:00:00.000Z',
    to: '2026-11-01T00:00:00.000Z',
  };
  const localSecretaryItems = await local.secretary.listItems(parityWindow);
  const remoteSecretaryItems = await remote.secretary.listItems(parityWindow);
  assert.equal(localSecretaryItems.items.some((item) => item.id === 'm2'), true);
  assert.equal(localSecretaryItems.items.some((item) => item.id === 'm3'), true);
  assert.equal(remoteSecretaryItems.items.some((item) => item.id === 'm2'), true);
  assert.equal(remoteSecretaryItems.items.some((item) => item.id === 'm3'), true);
  const localLeaderItems = await local.leader.listItems(parityWindow);
  const remoteLeaderItems = await remote.leader.listItems(parityWindow);
  assert.deepEqual(
    localLeaderItems.items.map((item) => item.id).sort(),
    remoteLeaderItems.items.map((item) => item.id).sort(),
  );
  assert.equal(localLeaderItems.items.some((item) => ['m2', 'm3'].includes(item.id)), false);
  assert.equal(remoteLeaderItems.items.some((item) => ['m2', 'm3'].includes(item.id)), false);
  const localReceptionistItems = await local.receptionist.listItems(parityWindow);
  const remoteReceptionistItems = await remote.receptionist.listItems(parityWindow);
  assert.deepEqual(
    localReceptionistItems.items.map((item) => item.id).sort(),
    remoteReceptionistItems.items.map((item) => item.id).sort(),
  );
  assert.equal(localReceptionistItems.items.every((item) => item.kind === 'visit'), true);
  assert.equal(remoteReceptionistItems.items.every((item) => item.kind === 'visit'), true);
  const itemInput = {
    title: 'Parity milestone',
    allDay: true,
    date: '2027-01-20',
    leaderIds: ['p-chen'],
  };
  const localCreated = await local.leader.createItem({ kind: 'milestone', input: itemInput });
  const remoteCreated = await remote.leader.createItem({ kind: 'milestone', input: itemInput });
  assert.equal(localCreated.ok, true);
  assert.equal(remoteCreated.ok, true);
  const seriesInput = { ...itemInput, title: 'Parity series', date: '2027-01-21' };
  assert.equal(
    (
      await local.leader.createSeries({
        kind: 'milestone',
        input: seriesInput,
        until: '2027-02-04',
      })
    ).items.length,
    3,
  );
  assert.equal(
    (
      await remote.leader.createSeries({
        kind: 'milestone',
        input: seriesInput,
        until: '2027-02-04',
      })
    ).items.length,
    3,
  );
  assert.equal(
    (
      await local.leader.editItem({
        id: localCreated.item.id,
        patch: { title: 'Edited parity' },
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await remote.leader.editItem({
        id: remoteCreated.item.id,
        patch: { title: 'Edited parity' },
      })
    ).ok,
    true,
  );
  for (const api of [local.leader, remote.leader]) {
    assert.equal((await api.confirmItem({ id: 'm4' })).ok, true);
    assert.equal((await api.declineItem({ id: 'm4', reason: 'Changed plan' })).ok, true);
    assert.equal((await api.markSeen({ id: 'm4' })).ok, true);
  }
  assert.equal((await local.leader.cancelItem({ id: localCreated.item.id })).ok, true);
  assert.equal((await remote.leader.cancelItem({ id: remoteCreated.item.id })).ok, true);
  const localNote = await local.leader.createNote({ text: 'Parity note' });
  const remoteNote = await remote.leader.createNote({ text: 'Parity note' });
  assert.equal(localNote.ok, true);
  assert.equal(remoteNote.ok, true);
  assert.equal(
    (await local.secretary.convertNote({ id: localNote.note.id, itemIds: ['m4'] })).ok,
    true,
  );
  assert.equal(
    (await remote.secretary.convertNote({ id: remoteNote.note.id, itemIds: ['m4'] })).ok,
    true,
  );
  assert.equal((await local.secretary.closeNote({ id: localNote.note.id })).ok, true);
  assert.equal((await remote.secretary.closeNote({ id: remoteNote.note.id })).ok, true);
  const vehicleInput = {
    reason: 'Parity trip',
    destination: 'Office',
    date: '2026-10-24',
    time: '03:00',
    passengers: 1,
    forLeaderId: 'p-chen',
  };
  const localVehicle = await local.leader.requestVehicle({ input: vehicleInput });
  const remoteVehicle = await remote.leader.requestVehicle({ input: vehicleInput });
  assert.equal(localVehicle.ok, true);
  assert.equal(remoteVehicle.ok, true);
  assert.equal(
    (
      await local.secretary.dispatchVehicle({
        id: localVehicle.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-zhao',
        expectedRev: 0,
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await remote.secretary.dispatchVehicle({
        id: remoteVehicle.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-zhao',
        expectedRev: 0,
      })
    ).ok,
    true,
  );
  assert.equal(
    (await local.driver.completeVehicle({ id: localVehicle.vehicle.id, expectedRev: 1 })).ok,
    true,
  );
  assert.equal(
    (await remote.driver.completeVehicle({ id: remoteVehicle.vehicle.id, expectedRev: 1 })).ok,
    true,
  );
  const localReassignRequest = await local.leader.requestVehicle({ input: vehicleInput });
  const remoteReassignRequest = await remote.leader.requestVehicle({ input: vehicleInput });
  assert.equal(
    (
      await local.secretary.dispatchVehicle({
        id: localReassignRequest.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-zhao',
        expectedRev: 0,
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await remote.secretary.dispatchVehicle({
        id: remoteReassignRequest.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-zhao',
        expectedRev: 0,
      })
    ).ok,
    true,
  );
  const localReassigned = await local.secretary.reassignVehicle({
    id: localReassignRequest.vehicle.id,
    carId: 'gl8b',
    driverId: 'p-qian',
    expectedRev: 1,
  });
  const remoteReassigned = await remote.secretary.reassignVehicle({
    id: remoteReassignRequest.vehicle.id,
    carId: 'gl8b',
    driverId: 'p-qian',
    expectedRev: 1,
  });
  assert.equal(localReassigned.ok, true);
  assert.equal(remoteReassigned.ok, true);
  assert.equal(localReassigned.vehicle.carId, remoteReassigned.vehicle.carId);
  assert.equal(localReassigned.vehicle.driverId, remoteReassigned.vehicle.driverId);
  const localCancelled = await local.secretary.cancelDispatchVehicle({
    id: localReassignRequest.vehicle.id,
    expectedRev: 2,
  });
  const remoteCancelled = await remote.secretary.cancelDispatchVehicle({
    id: remoteReassignRequest.vehicle.id,
    expectedRev: 2,
  });
  assert.equal(localCancelled.ok, true);
  assert.equal(remoteCancelled.ok, true);
  assert.equal(localCancelled.vehicle.status, remoteCancelled.vehicle.status);
  assert.equal(localCancelled.vehicle.status, 'pending');
  const visitInput = {
    title: 'Parity visitor',
    date: '2027-01-22',
    start: '09:00',
    end: '10:00',
    leaderIds: ['p-chen'],
    visitorName: 'Guest',
    org: 'Org',
    headcount: 1,
    purpose: 'Review',
    visitorType: 'customer',
    receptionLevel: 'A',
    transport: 'pickup',
  };
  const localVisit = await local.receptionist.createItem({ kind: 'visit', input: visitInput });
  const remoteVisit = await remote.receptionist.createItem({ kind: 'visit', input: visitInput });
  assert.equal(localVisit.ok, true);
  assert.equal(remoteVisit.ok, true);
  assert.equal(localVisit.item.vehicleRequestId !== undefined, true);
  assert.equal(remoteVisit.item.vehicleRequestId !== undefined, true);
});

test('following edits keep each occurrence on its own week and skip other revisions', async () => {
  const secretary = makeLocal('secretary');
  const series = await secretary.api.createSeries({
    kind: 'milestone',
    input: {
      title: 'Weekly review',
      allDay: true,
      date: '2026-11-23',
      leaderIds: ['p-chen'],
    },
    until: '2026-12-07',
    needsConfirm: true,
  });
  const [, second, third] = series.items;
  const leader = makeLocal('leader', { store: secretary.store });
  assert.equal((await leader.api.confirmItem({ id: third.id })).ok, true);
  const moved = await secretary.api.editItem({
    id: second.id,
    patch: { date: '2026-12-01' },
    expectedRev: second.rev,
    needsConfirm: true,
    scope: 'following',
  });
  assert.equal(moved.ok, true);
  assert.deepEqual(
    moved.items.map((item) => item.date),
    ['2026-12-01', '2026-12-08'],
  );
});

test('local directory exposes the same employee fields as the cloud function', async () => {
  const result = await makeLocal('secretary').api.directory();
  for (const employee of result.employees)
    assert.deepEqual(Object.keys(employee).sort(), ['id', 'name', 'role', 'title']);
});

test('local prefs ignore client timestamps and unknown fields', async () => {
  const { api } = makeLocal('leader');
  const result = await api.updatePrefs({
    patch: { digestOn: false, tzUpdatedAt: '2020-01-01T00:00:00.000Z', rev: 99, injected: 1 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.prefs.digestOn, false);
  assert.equal(result.prefs.rev, 1);
  assert.notEqual(result.prefs.tzUpdatedAt, '2020-01-01T00:00:00.000Z');
  assert.equal(Object.hasOwn(result.prefs, 'injected'), false);
});
