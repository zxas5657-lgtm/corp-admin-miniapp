'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const {
  itemVisibleTo,
  visibleItems,
  vehicleVisibleTo,
  visibleVehicles,
  canEditItem,
} = require('../miniprogram/domain/visibility');
const ctx = { supports: ref.SUPPORTS, isLeader: ref.isLeader };
const data = seed();
const items = data.items.filter((x) => x.kind === 'meeting');
test('visibility matrix covers every demo role and every seed item', () => {
  const expected = {
    leader: ['m1', 'm4'],
    secretary: ['m1', 'm2', 'm3', 'm4', 'm5'],
    secretaryAdmin: ['m1', 'm4', 'm6'],
    receptionist: ['m2', 'm5'],
    receptionAdmin: [],
    driver: [],
  };
  for (const role of ref.ROLE_ORDER) {
    const actor = ref.actorFor(role);
    const ids = visibleItems(actor, items, ctx).map((x) => x.id);
    assert.deepEqual(ids, expected[role], role);
    for (const item of items)
      assert.equal(
        itemVisibleTo(actor, item, ctx),
        expected[role].includes(item.id),
        role + '/' + item.id,
      );
  }
  assert.equal(
    itemVisibleTo(
      ref.actorFor('leader'),
      data.items.find((x) => x.id === 'm6'),
      ctx,
    ),
    false,
  );
});
test('vehicle visibility matrix keeps leader requests need-to-know', () => {
  const expected = {
    leader: ['v5'],
    secretary: ['v1', 'v2', 'v3', 'v4', 'v5'],
    secretaryAdmin: ['v1', 'v2', 'v3', 'v4', 'v5'],
    receptionist: ['v1', 'v2', 'v3', 'v4', 'v5'],
    receptionAdmin: ['v1', 'v2', 'v3', 'v4', 'v5'],
    driver: ['v1', 'v2', 'v3', 'v4'],
  };
  for (const role of ref.ROLE_ORDER) {
    const actor = ref.actorFor(role);
    const ids = visibleVehicles(actor, data.vehicles, ctx).map((x) => x.id);
    assert.deepEqual(ids, expected[role], role);
    for (const vehicle of data.vehicles)
      assert.equal(
        vehicleVisibleTo(actor, vehicle, ctx),
        expected[role].includes(vehicle.id),
        role + '/' + vehicle.id,
      );
  }
  assert.equal(
    vehicleVisibleTo(
      ref.actorFor('leader'),
      data.vehicles.find((x) => x.id === 'v4'),
      ctx,
    ),
    false,
  );
  assert.equal(
    vehicleVisibleTo(
      ref.actorFor('leader'),
      data.vehicles.find((x) => x.id === 'v5'),
      ctx,
    ),
    true,
  );
  assert.equal(
    vehicleVisibleTo(
      ref.actorFor('driver'),
      data.vehicles.find((x) => x.id === 'v5'),
      ctx,
    ),
    false,
  );
});
test('canEditItem follows organizer, leader, secretary support, and admin rules', () => {
  const m1 = data.items.find((x) => x.id === 'm1');
  const m2 = data.items.find((x) => x.id === 'm2');
  const m4 = data.items.find((x) => x.id === 'm4');
  const m6 = data.items.find((x) => x.id === 'm6');
  assert.equal(canEditItem(ref.actorFor('secretary'), m2, ctx), true);
  assert.equal(canEditItem(ref.actorFor('secretary'), m6, ctx), false);
  assert.equal(canEditItem(ref.actorFor('leader'), m4, ctx), true);
  assert.equal(canEditItem(ref.actorFor('leader'), m6, ctx), false);
  assert.equal(canEditItem(ref.actorFor('secretaryAdmin'), m6, ctx), true);
  assert.equal(canEditItem(ref.actorFor('receptionist'), m1, ctx), false);
  assert.equal(canEditItem(ref.actorFor('secretary'), m1, ctx), true);
});
