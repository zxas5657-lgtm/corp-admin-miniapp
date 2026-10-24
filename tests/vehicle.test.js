'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { seed } = require('../miniprogram/data/seed');
const { parseLocalDateTime } = require('../miniprogram/domain/dates');
const { availableActions, transition } = require('../miniprogram/domain/vehicle');

const now = parseLocalDateTime('2026-10-24T09:20');

test('availableActions combines transition and capability rules', () => {
  const pending = seed().vehicles[3];
  const assigned = seed().vehicles[2];
  assert.deepEqual(availableActions(pending, 'admin', 'p-zhou'), ['withdraw']);
  assert.deepEqual(availableActions(pending, 'driver', 'p-zhao'), ['dispatch', 'reject']);
  assert.deepEqual(availableActions(assigned, 'driver', 'p-zhao'), ['complete', 'reassign', 'cancelDispatch']);
  assert.deepEqual(availableActions({ ...pending, status: 'done' }, 'driver', 'p-zhao'), []);
});

test('dispatch sets the car, driver, and dispatch audit fields', () => {
  const source = seed().vehicles[3];
  const result = transition(source, 'dispatch', { carId: 'gl8a' }, {
    role: 'driver',
    personId: 'p-zhao',
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(result.vehicle.status, 'assigned');
  assert.equal(result.vehicle.carId, 'gl8a');
  assert.equal(result.vehicle.driverId, 'p-zhao');
  assert.equal(result.vehicle.dispatchedAt, '2026-10-24T09:20');
  assert.equal(result.vehicle.dispatchedBy, 'p-zhao');
  assert.equal(source.status, 'pending');
});

test('reject and withdraw enforce their payload and ownership rules', () => {
  const pending = seed().vehicles[3];
  assert.deepEqual(
    transition(pending, 'reject', {}, { role: 'driver', personId: 'p-zhao', now }),
    { ok: false, code: 'vehicle.reject.reasonRequired' },
  );
  const rejected = transition(pending, 'reject', { reason: '  No capacity  ' }, {
    role: 'driver', personId: 'p-zhao', now,
  });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.vehicle.status, 'rejected');
  assert.equal(rejected.vehicle.rejectReason, 'No capacity');

  const withdrawn = transition(pending, 'withdraw', {}, { role: 'admin', personId: 'p-zhou', now });
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.vehicle.status, 'withdrawn');
  assert.deepEqual(
    transition(pending, 'withdraw', {}, { role: 'admin', personId: 'p-lin', now }),
    { ok: false, code: 'permission.denied' },
  );
});

test('complete, reassign, and cancelDispatch follow the assigned transitions', () => {
  const assigned = seed().vehicles[2];
  const complete = transition(assigned, 'complete', {}, { role: 'driver', personId: 'p-zhao', now });
  assert.equal(complete.ok, true);
  assert.equal(complete.vehicle.status, 'done');
  assert.equal(complete.vehicle.completedAt, '2026-10-24T09:20');

  const reassigned = transition(assigned, 'reassign', { carId: 'gl8b' }, { role: 'driver', personId: 'p-zhao', now });
  assert.equal(reassigned.ok, true);
  assert.equal(reassigned.vehicle.status, 'assigned');
  assert.equal(reassigned.vehicle.carId, 'gl8b');

  const pending = transition(assigned, 'cancelDispatch', {}, { role: 'driver', personId: 'p-zhao', now });
  assert.equal(pending.ok, true);
  assert.equal(pending.vehicle.status, 'pending');
  assert.equal(pending.vehicle.carId, null);
  assert.equal(pending.vehicle.driverId, null);
});

test('stale states, missing capabilities, and missing cars return codes', () => {
  const pending = seed().vehicles[3];
  assert.deepEqual(
    transition(pending, 'dispatch', { carId: 'gl8a' }, { role: 'admin', personId: 'p-lin', now }),
    { ok: false, code: 'permission.denied' },
  );
  assert.deepEqual(
    transition(pending, 'dispatch', {}, { role: 'driver', personId: 'p-zhao', now }),
    { ok: false, code: 'vehicle.car.required' },
  );
  assert.deepEqual(
    transition({ ...pending, status: 'done' }, 'dispatch', { carId: 'gl8a' }, { role: 'driver', personId: 'p-zhao', now }),
    { ok: false, code: 'vehicle.alreadyHandled' },
  );
});
