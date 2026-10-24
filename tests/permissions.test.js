'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { seed } = require('../miniprogram/data/seed');
const { parseLocalDateTime } = require('../miniprogram/domain/dates');
const {
  CAPS,
  ROLE_CAPS,
  can,
  canCancelMeeting,
  meetingVisibleTo,
} = require('../miniprogram/domain/permissions');

const now = parseLocalDateTime('2026-10-24T09:20');

test('exposes the role capability map and rejects unknown capabilities', () => {
  assert.deepEqual(ROLE_CAPS.leader, ['meeting.create', 'meeting.cancelOwn', 'vehicle.request', 'schedule.viewAll']);
  assert.equal(CAPS.includes('meeting.create'), true);
  assert.equal(can('admin', 'meeting.create'), true);
  assert.equal(can('driver', 'meeting.create'), false);
  assert.equal(can('nobody', 'vehicle.request'), false);
  assert.equal(can('admin', 'unknown'), false);
});

test('only the organizer with the capability can cancel an upcoming meeting', () => {
  const meeting = seed().meetings[3];
  assert.equal(canCancelMeeting('admin', 'p-chen', meeting, now), true);
  assert.equal(canCancelMeeting('leader', 'p-chen', meeting, now), true);
  assert.equal(canCancelMeeting('leader', 'p-lin', meeting, now), false);
  assert.equal(canCancelMeeting('leader', 'p-chen', { ...meeting, cancelled: true }, now), false);
  assert.equal(canCancelMeeting('leader', 'p-chen', seed().meetings[1], now), false);
});

test('meetingVisibleTo is the v1 everyone-visible hook', () => {
  assert.equal(meetingVisibleTo('leader', 'p-chen', seed().meetings[0]), true);
  assert.equal(meetingVisibleTo('unknown', 'unknown', seed().meetings[0]), true);
});
