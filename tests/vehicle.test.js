'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../miniprogram/i18n');
const reference = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const { DRIVERS } = require('../miniprogram/data/reference');
const { parseLocalDateTime } = require('../miniprogram/domain/dates');
const {
  availableActions,
  carAvailability,
  createVehicleRequest,
  seatWarning,
  transition,
  validateVehicle,
} = require('../miniprogram/domain/vehicle');

const now = parseLocalDateTime('2026-10-24T09:20');
const driverOptions = { drivers: DRIVERS };

test.afterEach(() => i18n._resetForTests());

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
    ...driverOptions,
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
    role: 'driver', personId: 'p-zhao', now, ...driverOptions,
  });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.vehicle.status, 'rejected');
  assert.equal(rejected.vehicle.rejectReason, 'No capacity');

  const withdrawn = transition(pending, 'withdraw', {}, { role: 'admin', personId: 'p-zhou', now, ...driverOptions });
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.vehicle.status, 'withdrawn');
  assert.deepEqual(
    transition(pending, 'withdraw', {}, { role: 'admin', personId: 'p-lin', now, ...driverOptions }),
    { ok: false, code: 'permission.denied' },
  );
});

test('complete, reassign, and cancelDispatch follow the assigned transitions', () => {
  const assigned = seed().vehicles[2];
  const departure = parseLocalDateTime('2026-10-24T14:00');
  const complete = transition(assigned, 'complete', {}, { role: 'driver', personId: 'p-zhao', now: departure, ...driverOptions });
  assert.equal(complete.ok, true);
  assert.equal(complete.vehicle.status, 'done');
  assert.equal(complete.vehicle.completedAt, '2026-10-24T14:00');

  const reassigned = transition(assigned, 'reassign', { carId: 'gl8b' }, { role: 'driver', personId: 'p-zhao', now, ...driverOptions });
  assert.equal(reassigned.ok, true);
  assert.equal(reassigned.vehicle.status, 'assigned');
  assert.equal(reassigned.vehicle.carId, 'gl8b');

  const pending = transition(assigned, 'cancelDispatch', {}, { role: 'driver', personId: 'p-zhao', now, ...driverOptions });
  assert.equal(pending.ok, true);
  assert.equal(pending.vehicle.status, 'pending');
  assert.equal(pending.vehicle.carId, null);
  assert.equal(pending.vehicle.driverId, null);
});

test('car availability uses overlapping assigned windows and ignores exact edges', () => {
  const vehicles = [{ id: 'busy', status: 'assigned', carId: 'a6', date: '2026-10-24', time: '13:30' }];
  const beforeEdge = carAvailability(reference.CARS, vehicles, { date: '2026-10-24', time: '15:29' });
  const atEdge = carAvailability(reference.CARS, vehicles, { date: '2026-10-24', time: '15:30' });
  assert.equal(beforeEdge.find((item) => item.carId === 'a6').available, false);
  assert.equal(beforeEdge.find((item) => item.carId === 'a6').busyWith, 'busy');
  assert.equal(atEdge.find((item) => item.carId === 'a6').available, true);
  assert.equal(carAvailability(reference.CARS, vehicles, { date: '2026-10-25', time: '13:30' }).find((item) => item.carId === 'a6').available, true);
  assert.equal(carAvailability(reference.CARS, vehicles, { date: '2026-10-24', time: '13:30', excludeVehicleId: 'busy' }).find((item) => item.carId === 'a6').available, true);
});

test('seatWarning is non-blocking and reports capacity parameters', () => {
  assert.equal(seatWarning(reference.carById('a6'), 4), null);
  assert.deepEqual(seatWarning(reference.carById('a6'), 5), {
    code: 'vehicle.seats.exceeded',
    seats: 4,
    passengers: 5,
  });
});

test('validateVehicle checks fields in form order and create trims text', () => {
  assert.deepEqual(validateVehicle({
    reason: '',
    destination: '',
    date: '2026-02-30',
    time: '24:00',
    passengers: 7,
    note: 'x'.repeat(201),
  }), [
    { field: 'reason', code: 'vehicle.reason.required' },
    { field: 'destination', code: 'vehicle.destination.required' },
    { field: 'date', code: 'vehicle.date.required' },
    { field: 'time', code: 'vehicle.time.required' },
    { field: 'passengers', code: 'vehicle.passengers.range' },
    { field: 'note', code: 'vehicle.note.tooLong' },
  ]);
  assert.deepEqual(validateVehicle({
    reason: 'x'.repeat(41),
    destination: 'x'.repeat(61),
    date: '2026-10-24',
    time: '09:00',
    passengers: 1,
    note: '',
  }), [
    { field: 'reason', code: 'vehicle.reason.tooLong' },
    { field: 'destination', code: 'vehicle.destination.tooLong' },
  ]);
  assert.deepEqual(validateVehicle({ reason: '  Reason ', destination: '  Place ', date: '2026-10-24', time: '09:00', passengers: 1, note: '  Note ' }), []);
  assert.deepEqual(createVehicleRequest({ reason: '  Reason ', destination: '  Place ', date: '2026-10-24', time: '09:00', passengers: 1, note: '  Note ' }, {
    id: 'v-new', applicantId: 'p-lin', now,
  }), {
    id: 'v-new', reason: 'Reason', destination: 'Place', date: '2026-10-24', time: '09:00', passengers: 1,
    applicantId: 'p-lin', note: 'Note', status: 'pending', carId: null, driverId: null, rejectReason: '',
    createdAt: '2026-10-24T09:20', dispatchedAt: null, dispatchedBy: null, completedAt: null,
  });
});

test('completion is guarded before departure and busy cars cannot be dispatched', () => {
  const assigned = { ...seed().vehicles[2], date: '2026-10-27', time: '09:20' };
  assert.deepEqual(transition(assigned, 'complete', {}, { role: 'driver', personId: 'p-zhao', now, ...driverOptions }), {
    ok: false,
    code: 'vehicle.complete.beforeDeparture',
  });
  const pending = seed().vehicles[3];
  const result = transition(pending, 'dispatch', { carId: 'a6' }, {
    role: 'driver', personId: 'p-zhao', now, vehicles: [{ id: 'other', status: 'assigned', carId: 'a6', date: pending.date, time: pending.time }], cars: reference.CARS, ...driverOptions,
  });
  assert.deepEqual(result, { ok: false, code: 'vehicle.car.busy' });
});

test('new vehicle codes resolve in both locales', () => {
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    assert.equal(i18n.t('error.vehicle.seats.exceeded', { seats: 4, passengers: 5 }).includes('{'), false);
    assert.equal(i18n.t('error.vehicle.complete.beforeDeparture').includes('{'), false);
    assert.equal(i18n.t('error.vehicle.car.busy').includes('{'), false);
    assert.equal(i18n.t('error.vehicle.reason.tooLong').includes('{'), false);
    assert.equal(i18n.t('error.vehicle.destination.tooLong').includes('{'), false);
    assert.equal(i18n.t('error.vehicle.note.tooLong').includes('{'), false);
  }
});

test('stale states, missing capabilities, and missing cars return codes', () => {
  const pending = seed().vehicles[3];
  assert.deepEqual(
    transition(pending, 'dispatch', { carId: 'gl8a' }, { role: 'admin', personId: 'p-lin', now, ...driverOptions }),
    { ok: false, code: 'permission.denied' },
  );
  assert.deepEqual(
    transition(pending, 'dispatch', {}, { role: 'driver', personId: 'p-zhao', now, ...driverOptions }),
    { ok: false, code: 'vehicle.car.required' },
  );
  assert.deepEqual(
    transition({ ...pending, status: 'done' }, 'dispatch', { carId: 'gl8a' }, { role: 'driver', personId: 'p-zhao', now, ...driverOptions }),
    { ok: false, code: 'vehicle.alreadyHandled' },
  );
});
