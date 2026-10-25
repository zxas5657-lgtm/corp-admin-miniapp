'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_CAPS, CAPS, can } = require('../miniprogram/domain/permissions');
const ref = require('../miniprogram/data/reference');
const { itemVisibleTo, vehicleVisibleTo } = require('../miniprogram/domain/visibility');
const { seed } = require('../miniprogram/data/seed');
const ctx = { supports: ref.SUPPORTS, isLeader: ref.isLeader };
test('six roles and flag capabilities are explicit', () => {
  assert.deepEqual(Object.keys(ROLE_CAPS), [
    'leader',
    'secretary',
    'secretaryAdmin',
    'receptionist',
    'receptionAdmin',
    'driver',
  ]);
  assert.equal(can('leader', 'meeting.create'), true);
  assert.equal(can('driver', 'vehicle.complete'), true);
  assert.equal(can(ref.actorFor('secretary'), 'vehicle.dispatch'), true);
  assert.equal(can(ref.actorFor('secretaryAdmin'), 'admin.manage'), true);
  assert.equal(CAPS.includes('admin.manage'), true);
});
test('visibility matrix enforces leaders, supported secretaries, and staff admins', () => {
  const d = seed();
  const m1 = d.items.find((x) => x.id === 'm1');
  const m6 = d.items.find((x) => x.id === 'm6');
  assert.equal(itemVisibleTo(ref.actorFor('leader'), m1, ctx), true);
  assert.equal(itemVisibleTo(ref.actorFor('leader'), m6, ctx), false);
  assert.equal(
    itemVisibleTo(
      ref.actorFor('leader'),
      d.items.find((x) => x.id === 'm4'),
      ctx,
    ),
    true,
  );
  assert.equal(itemVisibleTo(ref.actorFor('leader'), m6, ctx), false);
  assert.equal(itemVisibleTo(ref.actorFor('secretary'), m1, ctx), true);
  assert.equal(itemVisibleTo({ ...ref.actorFor('secretary'), dispatcher: false }, m6, ctx), false);
  assert.equal(itemVisibleTo(ref.actorFor('secretaryAdmin'), m6, ctx), true);
  assert.equal(
    itemVisibleTo(
      ref.actorFor('receptionist'),
      d.items.find((x) => x.id === 'm5'),
      ctx,
    ),
    true,
  );
});
test('vehicle visibility keeps leader requests private and exposes staff requests', () => {
  const d = seed();
  const leaderRequest = d.vehicles.find((x) => x.id === 'v5');
  const staffRequest = d.vehicles.find((x) => x.id === 'v4');
  assert.equal(vehicleVisibleTo(ref.actorFor('leader'), leaderRequest, ctx), true);
  assert.equal(vehicleVisibleTo(ref.actorFor('leader'), staffRequest, ctx), false);
  assert.equal(vehicleVisibleTo(ref.actorFor('driver'), leaderRequest, ctx), false);
  assert.equal(vehicleVisibleTo(ref.actorFor('secretaryAdmin'), leaderRequest, ctx), true);
  assert.equal(vehicleVisibleTo(ref.actorFor('receptionist'), staffRequest, ctx), true);
});
