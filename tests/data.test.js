'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const reference = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
function bilingual(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.hasOwn(value, 'zh-CN') &&
    Object.hasOwn(value, 'en')
  );
}
function walk(value) {
  if (bilingual(value)) {
    assert.notEqual(value['zh-CN'].trim(), '');
    assert.notEqual(value.en.trim(), '');
  } else if (Array.isArray(value)) value.forEach(walk);
  else if (value && typeof value === 'object') Object.values(value).forEach(walk);
}
test('seed v3 records have valid references and instants', () => {
  const data = seed();
  assert.equal(data.items.length, 12);
  assert.equal(data.vehicles.length, 5);
  for (const item of data.items) {
    assert.ok(['meeting', 'travel', 'stop', 'visit', 'milestone'].includes(item.kind));
    if (item.allDay) assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    else {
      assert.ok(item.startAt.endsWith('Z'));
      assert.ok(item.endAt.endsWith('Z'));
    }
    if (item.kind === 'meeting') {
      assert.notEqual(reference.roomById(item.roomId), null);
      assert.notEqual(reference.personById(item.organizerId), null);
    }
    for (const leaderId of item.leaderIds) assert.ok(reference.personById(leaderId));
  }
  for (const vehicle of data.vehicles) {
    assert.ok(vehicle.departAt.endsWith('Z'));
    assert.notEqual(reference.personById(vehicle.applicantId), null);
    if (vehicle.carId) assert.notEqual(reference.carById(vehicle.carId), null);
  }
});
test('reference and seed bilingual objects are non-empty', () => {
  walk(reference.ROOMS);
  walk(reference.PEOPLE);
  walk(reference.CARS);
  walk(seed());
});
test('every bundled time zone has bilingual city names', () => {
  const { ZONES } = require('../miniprogram/domain/tz');
  const { ZONE_CITIES, zoneCity } = require('../miniprogram/data/zones');
  assert.deepEqual(Object.keys(ZONE_CITIES).sort(), ZONES.map((zone) => zone.id).sort());
  assert.deepEqual(zoneCity('America/Los_Angeles'), { 'zh-CN': '洛杉矶', en: 'Los Angeles' });
  assert.deepEqual(zoneCity('Europe/Paris'), { 'zh-CN': 'Europe/Paris', en: 'Europe/Paris' });
});

test('seed returns independent copies and required additions exist', () => {
  const a = seed();
  const b = seed();
  a.items[0].title.en = 'Changed';
  a.vehicles[0].reason.en = 'Changed';
  assert.notEqual(b.items[0].title.en, 'Changed');
  assert.equal(b.items[0].title['zh-CN'], '月度行政复盘');
  assert.equal(b.vehicles[0].reason['zh-CN'], '临时外出办事');
  assert.notEqual(b.vehicles[0].reason.en, 'Changed');
  assert.equal(
    a.items.some((x) => x.id === 'm6'),
    true,
  );
  assert.equal(
    a.vehicles.some((x) => x.id === 'v5' && x.forLeaderId === 'p-chen'),
    true,
  );
  assert.equal(a.items.find((x) => x.id === 'm4').important, true);
});

test('seed includes the trip, visit, milestone, and converted leader note', () => {
  const data = seed();
  const trip = data.items.find((item) => item.id === 't1');
  assert.equal(trip.kind, 'travel');
  assert.deepEqual(trip.title, { 'zh-CN': '深圳客户拜访', en: 'Shenzhen client visits' });
  assert.equal(trip.leaders[0].confirm, 'pending');
  assert.deepEqual(
    data.items.filter((item) => item.parentId === 't1').map((item) => item.id),
    ['t1-s1', 't1-s2', 't1-s3'],
  );
  assert.equal(data.items.find((item) => item.id === 'vs1').kind, 'visit');
  assert.equal(data.items.find((item) => item.id === 'ms1').allDay, true);
  assert.deepEqual(data.notes[0].itemIds, ['t1']);
  assert.equal(data.notes[0].status, 'converted');
  assert.equal(data.notes[0].handledBy, 'p-lin');
});

test('seed meeting statuses are derived from their instant ranges', () => {
  const { meetingStatus } = require('../miniprogram/domain/meeting');
  const data = seed();
  const now = new Date('2026-10-24T01:20:00Z');
  assert.equal(
    meetingStatus(
      data.items.find((x) => x.id === 'm1'),
      now,
    ),
    'done',
  );
  assert.equal(
    meetingStatus(
      data.items.find((x) => x.id === 'm2'),
      now,
    ),
    'ongoing',
  );
  assert.equal(
    meetingStatus(
      data.items.find((x) => x.id === 'm4'),
      now,
    ),
    'upcoming',
  );
});
test('vehicle status fields are consistent', () => {
  const data = seed();
  const assigned = data.vehicles.find((x) => x.id === 'v3');
  const pending = data.vehicles.find((x) => x.id === 'v4');
  assert.equal(assigned.status, 'assigned');
  assert.ok(assigned.carId);
  assert.ok(assigned.driverId);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.carId, null);
  assert.equal(pending.driverId, null);
});

test('every seed reference id exists', () => {
  const data = seed();
  for (const item of data.items) {
    if (item.kind === 'meeting') {
      assert.ok(reference.personById(item.organizerId));
      assert.ok(reference.roomById(item.roomId));
      for (const id of item.attendeeIds) assert.ok(reference.personById(id));
    }
    for (const id of item.leaderIds) assert.ok(reference.personById(id));
  }
  for (const vehicle of data.vehicles) {
    assert.ok(reference.personById(vehicle.applicantId));
    if (vehicle.driverId) assert.ok(reference.personById(vehicle.driverId));
    if (vehicle.carId) assert.ok(reference.carById(vehicle.carId));
  }
});
