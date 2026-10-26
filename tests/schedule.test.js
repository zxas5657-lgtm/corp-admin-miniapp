'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const {
  scheduleItems,
  meetingSource,
  vehicleSource,
  datesWithItems,
} = require('../miniprogram/domain/schedule');
const tz = require('../miniprogram/domain/tz');
const now = new Date('2026-10-24T01:20:00Z');
test('schedule groups v3 records by viewer-local day', () => {
  const d = seed();
  const sources = [meetingSource(d.items), vehicleSource(d.vehicles)];
  const items = scheduleItems('2026-10-24', sources, now, 'Asia/Shanghai');
  assert.deepEqual(
    items.map((x) => x.id),
    ['m2', 'v3', 'm3'],
  );
  assert.equal(items[0].startAt.endsWith('Z'), true);
});
test('spanning items touch every viewer day and rejected items are absent', () => {
  const d = seed();
  const trip = {
    id: 'trip',
    kind: 'meeting',
    title: 'Trip',
    startAt: tz.fromZoned('2026-10-24', '23:00', 'Asia/Shanghai').toISOString(),
    endAt: tz.fromZoned('2026-10-26', '01:00', 'Asia/Shanghai').toISOString(),
    status: 'active',
  };
  d.items.push(trip);
  const sources = [meetingSource(d.items), vehicleSource(d.vehicles)];
  assert.equal(
    scheduleItems('2026-10-25', sources, now, 'Asia/Shanghai').some((x) => x.id === 'trip'),
    true,
  );
  assert.equal(
    scheduleItems('2026-10-24', sources, now, 'America/Los_Angeles').some((x) => x.id === 'trip'),
    true,
  );
  assert.equal(
    scheduleItems('2026-10-22', sources, now, 'Asia/Shanghai').some((x) => x.id === 'v1'),
    false,
  );
  assert.deepEqual(
    [...datesWithItems(sources, ['2026-10-24', '2026-10-25'], now, 'Asia/Shanghai')],
    ['2026-10-24', '2026-10-25'],
  );
});

test('excludes rejected and cancelled records and handles empty days', () => {
  const d = seed();
  d.items.find((x) => x.id === 'm2').status = 'cancelled';
  const sources = [meetingSource(d.items), vehicleSource(d.vehicles)];
  assert.equal(
    scheduleItems('2026-10-24', sources, now, 'Asia/Shanghai').some((x) => x.id === 'm2'),
    false,
  );
  assert.equal(
    scheduleItems('2026-10-22', sources, now, 'Asia/Shanghai').some((x) => x.id === 'v1'),
    false,
  );
  assert.deepEqual(scheduleItems('2026-10-25', sources, now, 'Asia/Shanghai'), []);
});

test('viewer zone changes the day for late Shanghai meetings and spans multi-day items', () => {
  const late = {
    id: 'late',
    kind: 'meeting',
    title: { en: 'Late', 'zh-CN': '?' },
    startAt: '2026-10-24T16:30:00.000Z',
    endAt: '2026-10-24T17:30:00.000Z',
    status: 'active',
    roomId: 'online',
    attendeeIds: [],
    organizerId: 'p-chen',
    leaderIds: ['p-chen'],
  };
  const span = {
    id: 'span',
    kind: 'meeting',
    title: { en: 'Span', 'zh-CN': '?' },
    startAt: '2026-10-25T15:30:00.000Z',
    endAt: '2026-10-26T01:30:00.000Z',
    status: 'active',
    roomId: 'online',
    attendeeIds: [],
    organizerId: 'p-chen',
    leaderIds: ['p-chen'],
  };
  const sources = [meetingSource([late, span]), vehicleSource([])];
  assert.equal(
    scheduleItems('2026-10-25', sources, now, 'Asia/Shanghai').some((x) => x.id === 'late'),
    true,
  );
  assert.equal(
    scheduleItems('2026-10-24', sources, now, 'America/Los_Angeles').some((x) => x.id === 'late'),
    true,
  );
  assert.equal(
    scheduleItems('2026-10-25', sources, now, 'America/Los_Angeles').some((x) => x.id === 'late'),
    false,
  );
  assert.equal(
    scheduleItems('2026-10-25', sources, now, 'Asia/Shanghai').some((x) => x.id === 'span'),
    true,
  );
  assert.equal(
    scheduleItems('2026-10-26', sources, now, 'Asia/Shanghai').some((x) => x.id === 'span'),
    true,
  );
});
