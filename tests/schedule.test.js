'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { seed } = require('../miniprogram/data/seed');
const { parseLocalDateTime } = require('../miniprogram/domain/dates');
const {
  datesWithItems,
  meetingSource,
  scheduleItems,
  vehicleSource,
} = require('../miniprogram/domain/schedule');

const demoNow = parseLocalDateTime('2026-10-24T09:20');

test('builds the demo schedule in time order', () => {
  const data = seed();
  const sources = [meetingSource(data.meetings), vehicleSource(data.vehicles)];
  const items = scheduleItems('2026-10-24', sources, demoNow);
  assert.deepEqual(items.map((item) => item.id), ['m2', 'v3', 'm3']);
  assert.deepEqual(items.map((item) => item.kind), ['meeting', 'vehicle', 'meeting']);
  assert.equal(items[0].status, 'ongoing');
  assert.equal(items[1].status, 'assigned');
  assert.equal(items[2].status, 'upcoming');
  assert.equal(items[0].ref.id, 'm2');
});

test('excludes rejected and cancelled records and handles empty days', () => {
  const data = seed();
  data.meetings[2].cancelled = true;
  const sources = [meetingSource(data.meetings), vehicleSource(data.vehicles)];
  assert.deepEqual(scheduleItems('2026-10-24', sources, demoNow).map((item) => item.id), ['m2', 'v3']);
  assert.deepEqual(scheduleItems('2026-10-25', sources, demoNow), []);
  assert.deepEqual(scheduleItems('2026-10-22', sources, demoNow), []);
});

test('new meetings appear and datesWithItems returns a Set', () => {
  const data = seed();
  data.meetings.push({
    id: 'm-new',
    title: 'New',
    date: '2026-10-25',
    start: '08:00',
    end: '08:30',
    roomId: 'online',
    attendeeIds: [],
    organizerId: 'p-lin',
    agenda: '',
    cancelled: false,
  });
  const sources = [meetingSource(data.meetings), vehicleSource(data.vehicles)];
  assert.deepEqual(scheduleItems('2026-10-25', sources, demoNow).map((item) => item.id), ['m-new']);
  assert.deepEqual([...datesWithItems(sources, ['2026-10-24', '2026-10-25', '2026-10-28'], demoNow)], ['2026-10-24', '2026-10-25']);
});
