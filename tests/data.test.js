'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const reference = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');

const VEHICLE_STATUSES = new Set(['pending', 'assigned', 'done', 'rejected']);

function isBilingual(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.prototype.hasOwnProperty.call(value, 'zh-CN')
    && Object.prototype.hasOwnProperty.call(value, 'en');
}

function assertBilingualValues(value) {
  if (isBilingual(value)) {
    assert.equal(typeof value['zh-CN'], 'string');
    assert.equal(typeof value.en, 'string');
    assert.notEqual(value['zh-CN'].trim(), '');
    assert.notEqual(value.en.trim(), '');
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertBilingualValues(item);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) assertBilingualValues(child);
  }
}

test('every seed reference id exists', () => {
  const data = seed();
  for (const meeting of data.meetings) {
    assert.notEqual(reference.roomById(meeting.roomId), null);
    assert.notEqual(reference.personById(meeting.organizerId), null);
    for (const attendeeId of meeting.attendeeIds) {
      assert.notEqual(reference.personById(attendeeId), null);
    }
  }
  for (const vehicle of data.vehicles) {
    assert.notEqual(reference.personById(vehicle.applicantId), null);
    if (vehicle.carId !== null) assert.notEqual(reference.carById(vehicle.carId), null);
    if (vehicle.driverId !== null) assert.notEqual(reference.personById(vehicle.driverId), null);
  }
});

test('reference and seed bilingual objects have non-empty values', () => {
  assertBilingualValues(reference.ROOMS);
  assertBilingualValues(reference.PEOPLE);
  assertBilingualValues(reference.CARS);
  assertBilingualValues(seed());
});

test('seed returns independent copies', () => {
  const first = seed();
  const second = seed();
  first.meetings[0].title['zh-CN'] = 'Changed';
  first.vehicles[0].reason['zh-CN'] = 'Changed';
  first.meetings[0].attendeeIds.push('p-ma');
  assert.equal(second.meetings[0].title['zh-CN'], '月度行政复盘');
  assert.equal(second.vehicles[0].reason['zh-CN'], '临时外出办事');
  assert.equal(second.meetings[0].attendeeIds.includes('p-ma'), false);
});

test('meetings derive status later and contain no status field', () => {
  for (const meeting of seed().meetings) assert.equal(Object.hasOwn(meeting, 'status'), false);
});

test('vehicle status fields are consistent', () => {
  for (const vehicle of seed().vehicles) {
    assert.equal(VEHICLE_STATUSES.has(vehicle.status), true);
    if (vehicle.status === 'assigned' || vehicle.status === 'done') {
      assert.notEqual(vehicle.carId, null);
      assert.notEqual(vehicle.driverId, null);
      assert.notEqual(vehicle.dispatchedAt, null);
      assert.notEqual(vehicle.dispatchedBy, null);
    }
    if (vehicle.status === 'done') assert.notEqual(vehicle.completedAt, null);
    if (vehicle.status === 'rejected') {
      assert.equal(typeof vehicle.rejectReason, 'object');
      assert.notEqual(vehicle.rejectReason['zh-CN'].trim(), '');
      assert.notEqual(vehicle.rejectReason.en.trim(), '');
    }
  }
});
