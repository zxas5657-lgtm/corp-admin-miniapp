'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const devSeed = require('../cloudfunctions/devSeed/handler');
const createHandler = require('../cloudfunctions/vehicles/handler');
const { createFakeDb } = require('./support/fake-db');

async function setup() {
  const db = createFakeDb({
    bindings: [
      { _id: 'secretary', employeeId: 'p-lin' },
      { _id: 'leader', employeeId: 'p-chen' },
      { _id: 'driver', employeeId: 'p-zhao' },
    ],
  });
  await devSeed({ db, now: () => new Date('2027-01-06T00:00:00.000Z'), log() {} })(
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
      now: () => new Date('2027-01-06T00:00:00.000Z'),
      newId: () => `vehicle-${++counter}`,
      log() {},
    }),
  };
}

function input(date, passengers) {
  return {
    reason: 'Future trip',
    destination: 'Office',
    date,
    time: '09:00',
    passengers,
    forLeaderId: 'p-chen',
  };
}

test('vehicle visibility and forLeaderId rules follow the access matrix', async () => {
  const { handler } = await setup();
  const leader = await handler({ action: 'list' }, { openid: 'leader' });
  assert.equal(
    leader.vehicles.every((vehicle) => vehicle.forLeaderId === 'p-chen'),
    true,
  );
  const driver = await handler({ action: 'list' }, { openid: 'driver' });
  assert.equal(
    driver.vehicles.every((vehicle) => vehicle.driverId === 'p-zhao' || !vehicle.forLeaderId),
    true,
  );
  assert.deepEqual(
    await handler({ action: 'request', input: input('2027-02-01', 1) }, { openid: 'driver' }),
    { ok: false, code: 'permission.denied' },
  );
  assert.deepEqual(
    await handler(
      { action: 'request', input: { ...input('2027-02-02', 1), forLeaderId: 'p-wang' } },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'permission.denied' },
  );
});

test('dispatch validates dispatcher, seats, inactive resources, and lock guarded revisions', async () => {
  const { db, handler } = await setup();
  const request = await handler(
    { action: 'request', input: input('2027-02-03', 5) },
    {
      openid: 'secretary',
    },
  );
  assert.equal(request.ok, true);
  assert.deepEqual(
    await handler(
      {
        action: 'dispatch',
        id: request.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-zhao',
        expectedRev: 0,
      },
      { openid: 'leader' },
    ),
    { ok: false, code: 'permission.denied' },
  );
  assert.deepEqual(
    await handler(
      {
        action: 'dispatch',
        id: request.vehicle.id,
        carId: 'a6',
        driverId: 'p-zhao',
        passengers: 1,
        expectedRev: 0,
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.seats.exceeded' },
  );
  await db
    .collection('cars')
    .doc('a6')
    .update({ data: { active: false } });
  assert.deepEqual(
    await handler(
      {
        action: 'dispatch',
        id: request.vehicle.id,
        carId: 'a6',
        driverId: 'p-zhao',
        expectedRev: 0,
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.car.inactive' },
  );
  await db
    .collection('cars')
    .doc('a6')
    .update({ data: { active: true } });
  await db
    .collection('employees')
    .doc('p-zhao')
    .update({ data: { status: 'disabled' } });
  assert.deepEqual(
    await handler(
      {
        action: 'dispatch',
        id: request.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-zhao',
        expectedRev: 0,
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.driver.inactive' },
  );
  await db
    .collection('employees')
    .doc('p-zhao')
    .update({ data: { status: 'active' } });
  const dispatched = await handler(
    {
      action: 'dispatch',
      id: request.vehicle.id,
      carId: 'gl8a',
      driverId: 'p-zhao',
      expectedRev: 0,
    },
    { openid: 'secretary' },
  );
  assert.equal(dispatched.ok, true);
  assert.equal(db._dump().locks.find((lock) => lock.resourceType === 'car').rev, 1);
  const second = await handler(
    { action: 'request', input: input('2027-02-03', 1) },
    {
      openid: 'secretary',
    },
  );
  await db
    .collection('vehicle_requests')
    .doc(second.vehicle.id)
    .update({
      data: { departAt: new Date('2027-02-03T04:00:00.000Z') },
    });
  assert.equal(
    (
      await handler(
        {
          action: 'dispatch',
          id: second.vehicle.id,
          carId: 'gl8a',
          driverId: 'p-zhao',
          expectedRev: 0,
        },
        { openid: 'secretary' },
      )
    ).ok,
    true,
  );
  const carLock = db._dump().locks.find((lock) => lock._id === 'car:gl8a:2027-02-03');
  assert.equal(carLock.rev, 2);
  assert.deepEqual(
    await handler(
      {
        action: 'dispatch',
        id: request.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-zhao',
        expectedRev: 0,
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.alreadyHandled' },
  );
});

test('vehicle transitions enforce assignees, reasons, and audit writes', async () => {
  const { db, handler } = await setup();
  const pending = await handler(
    { action: 'request', input: input('2027-02-10', 1) },
    {
      openid: 'secretary',
    },
  );
  assert.deepEqual(
    await handler(
      {
        action: 'reject',
        id: pending.vehicle.id,
        expectedRev: 0,
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.reject.reasonRequired' },
  );
  const rejected = await handler(
    {
      action: 'reject',
      id: pending.vehicle.id,
      reason: 'No car',
      expectedRev: 0,
    },
    { openid: 'secretary' },
  );
  assert.equal(rejected.ok, true);
  assert.equal(rejected.vehicle.status, 'rejected');
  assert.equal(rejected.vehicle.rejectReason, 'No car');
  const assigned = await handler(
    { action: 'request', input: input('2027-01-05', 1) },
    {
      openid: 'secretary',
    },
  );
  assert.equal(
    (
      await handler(
        {
          action: 'dispatch',
          id: assigned.vehicle.id,
          carId: 'a6',
          driverId: 'p-zhao',
          expectedRev: 0,
        },
        { openid: 'secretary' },
      )
    ).ok,
    true,
  );
  assert.deepEqual(
    await handler(
      { action: 'complete', id: assigned.vehicle.id, expectedRev: 1 },
      {
        openid: 'secretary',
      },
    ),
    { ok: false, code: 'permission.denied' },
  );
  const complete = await handler(
    { action: 'complete', id: assigned.vehicle.id, expectedRev: 1 },
    {
      openid: 'driver',
    },
  );
  assert.equal(complete.ok, true);
  const withdraw = await handler(
    { action: 'request', input: input('2027-02-12', 1) },
    {
      openid: 'secretary',
    },
  );
  assert.equal(
    (
      await handler(
        { action: 'withdraw', id: withdraw.vehicle.id, expectedRev: 0 },
        {
          openid: 'secretary',
        },
      )
    ).ok,
    true,
  );
  assert.equal(db._dump().audit_log.length >= 6, true);
});

test('vehicle handler gates unknown and unbound callers', async () => {
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

test('dispatch checks car and driver occupancy at the two-hour boundary', async () => {
  const { db, handler } = await setup();
  const request = await handler(
    { action: 'request', input: input('2027-03-01', 1) },
    {
      openid: 'secretary',
    },
  );
  await db.collection('vehicle_requests').add({
    data: {
      _id: 'car-busy',
      reason: 'Busy car',
      destination: 'Office',
      departAt: new Date('2027-03-01T02:30:00.000Z'),
      tz: 'Asia/Shanghai',
      passengers: 1,
      applicantId: 'p-lin',
      forLeaderId: 'p-chen',
      status: 'assigned',
      carId: 'gl8a',
      driverId: 'p-qian',
      rev: 1,
    },
  });
  assert.deepEqual(
    await handler(
      {
        action: 'dispatch',
        id: request.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-zhao',
        expectedRev: 0,
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.car.busy' },
  );
  await db
    .collection('vehicle_requests')
    .doc('car-busy')
    .update({
      data: { departAt: new Date('2027-03-01T04:00:00.000Z') },
    });
  assert.equal(
    (
      await handler(
        {
          action: 'dispatch',
          id: request.vehicle.id,
          carId: 'gl8a',
          driverId: 'p-zhao',
          expectedRev: 0,
        },
        { openid: 'secretary' },
      )
    ).ok,
    true,
  );

  const driverRequest = await handler(
    { action: 'request', input: input('2027-04-01', 1) },
    {
      openid: 'secretary',
    },
  );
  await db.collection('vehicle_requests').add({
    data: {
      _id: 'driver-busy',
      reason: 'Busy driver',
      destination: 'Office',
      departAt: new Date('2027-04-01T02:30:00.000Z'),
      tz: 'Asia/Shanghai',
      passengers: 1,
      applicantId: 'p-lin',
      forLeaderId: 'p-chen',
      status: 'assigned',
      carId: 'a6',
      driverId: 'p-zhao',
      rev: 1,
    },
  });
  assert.deepEqual(
    await handler(
      {
        action: 'dispatch',
        id: driverRequest.vehicle.id,
        carId: 'gl8b',
        driverId: 'p-zhao',
        expectedRev: 0,
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.driver.busy' },
  );
  await db
    .collection('vehicle_requests')
    .doc('driver-busy')
    .update({
      data: { departAt: new Date('2027-04-01T04:00:00.000Z') },
    });
  assert.equal(
    (
      await handler(
        {
          action: 'dispatch',
          id: driverRequest.vehicle.id,
          carId: 'gl8b',
          driverId: 'p-zhao',
          expectedRev: 0,
        },
        { openid: 'secretary' },
      )
    ).ok,
    true,
  );
});

test('reassign moves locks and cancel-dispatch releases them', async () => {
  const { db, handler } = await setup();
  const request = await handler(
    { action: 'request', input: input('2027-05-01', 1) },
    { openid: 'secretary' },
  );
  const dispatched = await handler(
    {
      action: 'dispatch',
      id: request.vehicle.id,
      carId: 'gl8a',
      driverId: 'p-zhao',
      expectedRev: 0,
    },
    { openid: 'secretary' },
  );
  assert.equal(dispatched.ok, true);
  const reassigned = await handler(
    {
      action: 'reassign',
      id: request.vehicle.id,
      carId: 'gl8b',
      driverId: 'p-qian',
      expectedRev: 1,
    },
    { openid: 'secretary' },
  );
  assert.equal(reassigned.ok, true);
  assert.equal(reassigned.vehicle.carId, 'gl8b');
  assert.equal(reassigned.vehicle.driverId, 'p-qian');
  const movedLocks = db._dump().locks;
  assert.equal(movedLocks.find((lock) => lock._id === 'car:gl8a:2027-05-01').rev, 2);
  assert.equal(movedLocks.find((lock) => lock._id === 'driver:p-zhao:2027-05-01').rev, 2);
  assert.equal(movedLocks.find((lock) => lock._id === 'car:gl8b:2027-05-01').rev, 1);
  assert.equal(movedLocks.find((lock) => lock._id === 'driver:p-qian:2027-05-01').rev, 1);
  assert.deepEqual(
    await handler(
      {
        action: 'reassign',
        id: request.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-zhao',
        expectedRev: 1,
      },
      { openid: 'leader' },
    ),
    { ok: false, code: 'permission.denied' },
  );

  const cancelled = await handler(
    { action: 'cancelDispatch', id: request.vehicle.id, expectedRev: 2 },
    { openid: 'secretary' },
  );
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.vehicle.status, 'pending');
  assert.equal(cancelled.vehicle.carId, null);
  assert.equal(cancelled.vehicle.driverId, null);
  const releasedLocks = db._dump().locks;
  assert.equal(releasedLocks.find((lock) => lock._id === 'car:gl8b:2027-05-01').rev, 2);
  assert.equal(releasedLocks.find((lock) => lock._id === 'driver:p-qian:2027-05-01').rev, 2);
  assert.deepEqual(
    await handler(
      { action: 'cancelDispatch', id: request.vehicle.id, expectedRev: 2 },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.alreadyHandled' },
  );
});

test('reassign rejects locked cars and drivers without changing the request', async () => {
  const { handler } = await setup();
  const first = await handler(
    { action: 'request', input: input('2027-06-01', 1) },
    { openid: 'secretary' },
  );
  const second = await handler(
    { action: 'request', input: input('2027-06-01', 1) },
    { openid: 'secretary' },
  );
  assert.equal(
    (
      await handler(
        {
          action: 'dispatch',
          id: first.vehicle.id,
          carId: 'gl8a',
          driverId: 'p-zhao',
          expectedRev: 0,
        },
        { openid: 'secretary' },
      )
    ).ok,
    true,
  );
  assert.equal(
    (
      await handler(
        {
          action: 'dispatch',
          id: second.vehicle.id,
          carId: 'gl8b',
          driverId: 'p-qian',
          expectedRev: 0,
        },
        { openid: 'secretary' },
      )
    ).ok,
    true,
  );
  assert.deepEqual(
    await handler(
      {
        action: 'reassign',
        id: first.vehicle.id,
        carId: 'gl8b',
        driverId: 'p-zhao',
        expectedRev: 1,
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.car.busy' },
  );
  assert.deepEqual(
    await handler(
      {
        action: 'reassign',
        id: first.vehicle.id,
        carId: 'gl8a',
        driverId: 'p-qian',
        expectedRev: 1,
      },
      { openid: 'secretary' },
    ),
    { ok: false, code: 'vehicle.driver.busy' },
  );
  const current = await handler({ action: 'get', id: first.vehicle.id }, { openid: 'secretary' });
  assert.equal(current.vehicle.carId, 'gl8a');
  assert.equal(current.vehicle.driverId, 'p-zhao');
  assert.equal(current.vehicle.rev, 1);
});
