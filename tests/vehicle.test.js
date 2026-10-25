'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const { actorFor } = ref;
const tz = require('../miniprogram/domain/tz');
const {
  availableActions,
  carAvailability,
  createVehicleRequest,
  seatWarning,
  transition,
  validateVehicle,
} = require('../miniprogram/domain/vehicle');
const now = new Date('2026-10-24T01:20:00Z');
const iso = (d, t) => tz.fromZoned(d, t, 'Asia/Shanghai').toISOString();
test('actors control vehicle actions and drivers are chosen explicitly', () => {
  const d = seed();
  const pending = d.vehicles.find((x) => x.id === 'v4');
  assert.deepEqual(availableActions(pending, actorFor('secretary')), ['dispatch', 'reject']);
  assert.deepEqual(availableActions(pending, actorFor('receptionist')), ['withdraw']);
  assert.deepEqual(
    availableActions(
      d.vehicles.find((x) => x.id === 'v3'),
      actorFor('driver'),
    ),
    ['complete'],
  );
  const result = transition(
    pending,
    'dispatch',
    { carId: 'gl8a', driverId: 'p-qian' },
    {
      actor: actorFor('secretary'),
      now,
      cars: ref.CARS,
      vehicles: d.vehicles,
      drivers: ref.DRIVERS,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.vehicle.driverId, 'p-qian');
  assert.equal(result.vehicle.dispatchedBy, 'p-lin');
  assert.equal(result.vehicle.dispatchedAt, '2026-10-24T01:20:00.000Z');
});
test('dispatch requires flag and driver choice, reject needs reason, withdraw is applicant only', () => {
  const pending = seed().vehicles.find((x) => x.id === 'v4');
  assert.deepEqual(
    transition(
      pending,
      'dispatch',
      { carId: 'gl8a', driverId: 'p-zhao' },
      { actor: actorFor('receptionist'), now, drivers: ref.DRIVERS },
    ),
    { ok: false, code: 'permission.denied' },
  );
  assert.deepEqual(
    transition(
      pending,
      'dispatch',
      { carId: 'gl8a' },
      { actor: actorFor('secretary'), now, drivers: ref.DRIVERS },
    ),
    { ok: false, code: 'vehicle.driver.required' },
  );
  assert.deepEqual(transition(pending, 'reject', {}, { actor: actorFor('secretary'), now }), {
    ok: false,
    code: 'vehicle.reject.reasonRequired',
  });
  assert.equal(
    transition(pending, 'reject', { reason: 'full' }, { actor: actorFor('secretary'), now }).vehicle
      .status,
    'rejected',
  );
  assert.equal(
    transition(pending, 'withdraw', {}, { actor: actorFor('secretary'), now }).code,
    'permission.denied',
  );
  assert.equal(
    transition(pending, 'withdraw', {}, { actor: actorFor('receptionist'), now }).ok,
    true,
  );
});
test('driver completion and instant car availability honor boundaries', () => {
  const d = seed();
  const assigned = d.vehicles.find((x) => x.id === 'v3');
  assert.deepEqual(transition(assigned, 'complete', {}, { actor: actorFor('driver'), now }), {
    ok: false,
    code: 'vehicle.complete.beforeDeparture',
  });
  const done = transition(
    assigned,
    'complete',
    {},
    { actor: actorFor('driver'), now: new Date('2026-10-24T06:00:00Z') },
  );
  assert.equal(done.ok, true);
  const busy = {
    id: 'busy',
    status: 'assigned',
    carId: 'a6',
    departAt: iso('2026-10-24', '13:30'),
  };
  const before = carAvailability(ref.CARS, [busy], { departAt: iso('2026-10-24', '15:29') });
  const edge = carAvailability(ref.CARS, [busy], { departAt: iso('2026-10-24', '15:30') });
  assert.equal(before.find((x) => x.carId === 'a6').available, false);
  assert.equal(edge.find((x) => x.carId === 'a6').available, true);
});
test('vehicle request uses instant fields and permissions', () => {
  const input = {
    reason: '  Reason ',
    destination: ' Place ',
    date: '2026-10-28',
    time: '08:30',
    passengers: 2,
    note: ' Note ',
  };
  const v = createVehicleRequest(input, {
    id: 'v-new',
    actor: actorFor('leader'),
    now,
    tz: 'Asia/Shanghai',
  });
  assert.equal(v.applicantId, 'p-chen');
  assert.equal(v.forLeaderId, 'p-chen');
  assert.equal(v.departAt, '2026-10-28T00:30:00.000Z');
  assert.equal(v.createdAt, '2026-10-24T01:20:00.000Z');
  assert.equal(
    createVehicleRequest(input, { id: 'bad', actor: actorFor('driver'), now }).code,
    'permission.denied',
  );
});
test('validation and seat warnings retain form contracts', () => {
  assert.equal(
    validateVehicle({
      reason: '',
      destination: '',
      date: 'bad',
      time: 'bad',
      passengers: 7,
      note: 'x'.repeat(201),
    }).length,
    6,
  );
  assert.deepEqual(seatWarning(ref.carById('a6'), 5), {
    code: 'vehicle.seats.exceeded',
    seats: 4,
    passengers: 5,
  });
});
test('busy car and stale transitions return explicit codes', () => {
  const d = seed();
  const p = d.vehicles.find((x) => x.id === 'v4');
  const busy = { id: 'other', status: 'assigned', carId: 'a6', departAt: p.departAt };
  assert.deepEqual(
    transition(
      p,
      'dispatch',
      { carId: 'a6', driverId: 'p-zhao' },
      { actor: actorFor('secretary'), now, cars: ref.CARS, vehicles: [busy], drivers: ref.DRIVERS },
    ),
    { ok: false, code: 'vehicle.car.busy' },
  );
  assert.deepEqual(
    transition(
      { ...p, status: 'done' },
      'dispatch',
      { carId: 'a6', driverId: 'p-zhao' },
      { actor: actorFor('secretary'), now, drivers: ref.DRIVERS },
    ),
    { ok: false, code: 'vehicle.alreadyHandled' },
  );
});

test('complete reassign and cancelDispatch follow assigned transitions', () => {
  const assigned = seed().vehicles.find((x) => x.id === 'v3');
  const dispatcher = actorFor('secretary');
  const done = transition(
    assigned,
    'complete',
    {},
    { actor: actorFor('driver'), now: new Date('2026-10-24T06:00:00Z') },
  );
  assert.equal(done.ok, true);
  const reassigned = transition(
    assigned,
    'reassign',
    { carId: 'gl8b', driverId: 'p-qian' },
    { actor: dispatcher, now, cars: ref.CARS, vehicles: seed().vehicles, drivers: ref.DRIVERS },
  );
  assert.equal(reassigned.ok, true);
  assert.equal(reassigned.vehicle.carId, 'gl8b');
  const pending = transition(assigned, 'cancelDispatch', {}, { actor: dispatcher, now });
  assert.equal(pending.ok, true);
  assert.equal(pending.vehicle.status, 'pending');
  assert.equal(pending.vehicle.driverId, null);
});
test('car availability ignores exact edges and excluded vehicles', () => {
  const busy = {
    id: 'busy',
    status: 'assigned',
    carId: 'a6',
    departAt: iso('2026-10-24', '13:30'),
  };
  assert.equal(
    carAvailability(ref.CARS, [busy], { departAt: iso('2026-10-24', '15:29') }).find(
      (x) => x.carId === 'a6',
    ).available,
    false,
  );
  assert.equal(
    carAvailability(ref.CARS, [busy], { departAt: iso('2026-10-24', '15:30') }).find(
      (x) => x.carId === 'a6',
    ).available,
    true,
  );
  assert.equal(
    carAvailability(ref.CARS, [busy], { departAt: busy.departAt, excludeVehicleId: 'busy' }).find(
      (x) => x.carId === 'a6',
    ).available,
    true,
  );
});
test('new vehicle error codes resolve in both locales', () => {
  const i18n = require('../miniprogram/i18n');
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setLocale(locale);
    assert.equal(i18n.t('error.vehicle.driver.required').includes('{'), false);
    assert.equal(i18n.t('error.vehicle.car.busy').includes('{'), false);
  }
  i18n._resetForTests();
});
test('stale states missing capabilities and cars return codes', () => {
  const pending = seed().vehicles.find((x) => x.id === 'v4');
  assert.deepEqual(
    transition(
      pending,
      'dispatch',
      { carId: 'gl8a', driverId: 'p-zhao' },
      { actor: actorFor('receptionist'), now, drivers: ref.DRIVERS },
    ),
    { ok: false, code: 'permission.denied' },
  );
  assert.deepEqual(
    transition(
      pending,
      'dispatch',
      {},
      { actor: actorFor('secretary'), now, drivers: ref.DRIVERS },
    ),
    { ok: false, code: 'vehicle.car.required' },
  );
  assert.deepEqual(
    transition(
      { ...pending, status: 'done' },
      'dispatch',
      { carId: 'gl8a', driverId: 'p-zhao' },
      { actor: actorFor('secretary'), now, drivers: ref.DRIVERS },
    ),
    { ok: false, code: 'vehicle.alreadyHandled' },
  );
});

test('dispatch defaults to the sole available driver', () => {
  const pending = seed().vehicles.find((x) => x.id === 'v4');
  const result = transition(
    pending,
    'dispatch',
    { carId: 'gl8a' },
    {
      actor: actorFor('secretary'),
      now,
      cars: ref.CARS,
      vehicles: seed().vehicles,
      drivers: ['p-qian'],
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.vehicle.driverId, 'p-qian');
});
