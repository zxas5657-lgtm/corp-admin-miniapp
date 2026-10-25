'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { seed } = require('../miniprogram/data/seed');
const { scheduleItems, meetingSource, vehicleSource } = require('../miniprogram/domain/schedule');
const {
  filterScheduleByScope,
  filterVehiclesByScope,
  roleHome,
  scheduleScopes,
  vehicleBadgeCount,
  vehicleScopes,
} = require('../miniprogram/domain/roles');
const { parseLocalDateTime } = require('../miniprogram/domain/dates');

test('role homes and vehicle badges are role-aware', () => {
  const vehicles = seed().vehicles;
  assert.equal(roleHome('driver'), 'vehicles');
  assert.equal(roleHome('admin'), 'schedule');
  assert.equal(vehicleBadgeCount('driver', 'p-zhao', vehicles), 1);
  assert.equal(vehicleBadgeCount('admin', 'p-lin', vehicles), 0);
  assert.equal(vehicleBadgeCount('reception', 'p-zhou', vehicles), 0);
});

test('vehicle scopes expose one default and restrict todo to dispatchers', () => {
  assert.deepEqual(vehicleScopes('driver'), [
    { key: 'all', default: false },
    { key: 'mine', default: false },
    { key: 'todo', default: true },
  ]);
  assert.deepEqual(vehicleScopes('admin'), [
    { key: 'all', default: false },
    { key: 'mine', default: true },
  ]);
  const vehicles = seed().vehicles;
  assert.deepEqual(filterVehiclesByScope(vehicles, 'mine', { role: 'admin', personId: 'p-lin' }).map((item) => item.id), ['v1', 'v3']);
  assert.deepEqual(filterVehiclesByScope(vehicles, 'todo', { role: 'driver', personId: 'p-zhao' }).map((item) => item.id), ['v3', 'v4']);
  assert.deepEqual(filterVehiclesByScope(vehicles, 'todo', { role: 'admin', personId: 'p-lin' }), []);
});

test('schedule scopes give the leader all items and others their own items', () => {
  assert.deepEqual(scheduleScopes('leader'), [
    { key: 'all', default: true },
    { key: 'mine', default: false },
  ]);
  assert.deepEqual(scheduleScopes('admin'), [
    { key: 'all', default: false },
    { key: 'mine', default: true },
  ]);
  const data = seed();
  const items = scheduleItems('2026-10-24', [meetingSource(data.meetings), vehicleSource(data.vehicles)], parseLocalDateTime('2026-10-24T09:20'));
  assert.deepEqual(filterScheduleByScope(items, 'mine', { role: 'admin', personId: 'p-lin' }).map((item) => item.id), ['m2', 'v3', 'm3']);
  assert.deepEqual(filterScheduleByScope(items, 'mine', { role: 'driver', personId: 'p-zhao' }).map((item) => item.id), ['v3']);
  assert.deepEqual(filterScheduleByScope(items, 'all', { role: 'admin', personId: 'p-lin' }).map((item) => item.id), ['m2', 'v3', 'm3']);
});
