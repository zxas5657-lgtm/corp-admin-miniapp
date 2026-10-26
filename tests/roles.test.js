'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../miniprogram/data/seed');
const ref = require('../miniprogram/data/reference');
const { actorFor } = ref;
const {
  filterVehiclesByScope,
  vehicleBadgeCount,
  vehicleScopes,
  scheduleScopes,
  filterScheduleByScope,
  roleHome,
} = require('../miniprogram/domain/roles');
test('role homes scopes and badges use actors', () => {
  const d = seed();
  const dispatcher = actorFor('secretary');
  const driver = actorFor('driver');
  assert.equal(roleHome('driver'), 'vehicles');
  assert.equal(roleHome('secretary'), 'schedule');
  assert.equal(vehicleBadgeCount(dispatcher, d.vehicles), 2);
  assert.equal(vehicleBadgeCount(driver, d.vehicles), 1);
  assert.equal(vehicleScopes(driver).find((x) => x.key === 'todo').default, true);
  assert.deepEqual(
    filterVehiclesByScope(d.vehicles, 'todo', { actor: driver }).map((x) => x.id),
    ['v3'],
  );
  assert.deepEqual(
    filterVehiclesByScope(d.vehicles, 'mine', { actor: dispatcher }).map((x) => x.id),
    ['v1', 'v3'],
  );
});
test('schedule mine includes direct participation and leader ownership', () => {
  const d = seed();
  const items = d.items.filter((x) => x.kind === 'meeting');
  assert.equal(scheduleScopes(actorFor('leader')).find((x) => x.key === 'all').default, true);
  assert.deepEqual(
    filterScheduleByScope(items, 'mine', { actor: actorFor('secretary') }).map((x) => x.id),
    ['m1', 'm2', 'm3', 'm4', 'm5'],
  );
  assert.deepEqual(
    filterScheduleByScope(items, 'mine', { actor: actorFor('secretaryAdmin') }).map((x) => x.id),
    ['m6'],
  );
});

test('vehicle scopes expose one default and restrict todo to dispatchers', () => {
  const d = seed();
  const dispatcher = actorFor('secretary');
  const driver = actorFor('driver');
  assert.equal(vehicleScopes(dispatcher).filter((x) => x.default).length, 1);
  assert.equal(vehicleScopes(driver).find((x) => x.key === 'todo').default, true);
  assert.deepEqual(
    filterVehiclesByScope(d.vehicles, 'todo', { actor: dispatcher }).map((x) => x.id),
    ['v4', 'v5'],
  );
});
