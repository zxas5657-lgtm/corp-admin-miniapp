'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ref = require('../miniprogram/data/reference');
const i18n = require('../miniprogram/i18n');
const tz = require('../miniprogram/domain/tz');
const {
  validateItem,
  createItem,
  itemStatus,
  expandWeekly,
  createSeries,
} = require('../miniprogram/domain/item');

const now = new Date('2026-10-24T01:20:00.000Z');
const options = {
  actor: ref.actorFor('secretary'),
  now,
  tz: 'Asia/Shanghai',
  isLeader: ref.isLeader,
};

function travelInput() {
  return {
    title: 'Shanghai trip',
    date: '2026-10-28',
    start: '08:00',
    endDate: '2026-10-29',
    end: '18:00',
    leaderIds: ['p-chen'],
  };
}

function visitInput() {
  return {
    title: 'Visitor review',
    date: '2026-10-27',
    start: '10:00',
    end: '11:00',
    leaderIds: ['p-chen'],
    visitorName: 'Visitor',
    org: 'Organisation',
    headcount: 3,
    purpose: 'Review',
    visitorType: 'government',
    receptionLevel: 'A',
    transport: 'selfDrive',
    plate: 'TEST-001',
  };
}

test('validateItem covers travel, stop, visit, and milestone rules', () => {
  const travel = travelInput();
  const parent = createItem('travel', travel, { ...options, id: 'travel' });
  const itemById = (id) => (id === parent.id ? parent : null);
  assert.deepEqual(validateItem('travel', travel, { isLeader: ref.isLeader }), []);
  assert.deepEqual(
    validateItem(
      'stop',
      {
        title: 'Stop',
        parentId: 'travel',
        stopType: 'stop',
        date: '2026-10-28',
        start: '14:00',
        end: '16:00',
        location: 'Location',
        leaderIds: ['p-chen'],
      },
      { isLeader: ref.isLeader, itemById },
    ),
    [],
  );
  assert.deepEqual(validateItem('visit', visitInput(), { isLeader: ref.isLeader }), []);
  assert.deepEqual(
    validateItem(
      'milestone',
      { title: 'Milestone', allDay: true, date: '2026-10-30', leaderIds: ['p-chen'] },
      { isLeader: ref.isLeader },
    ),
    [],
  );
  assert.ok(
    validateItem(
      'stop',
      {
        title: 'Outside',
        parentId: 'travel',
        stopType: 'stop',
        date: '2026-10-30',
        start: '09:00',
        end: '10:00',
        location: 'Location',
        leaderIds: ['p-chen'],
      },
      { isLeader: ref.isLeader, itemById },
    ).some((error) => error.code === 'item.stop.outsideTrip'),
  );
  assert.ok(
    validateItem('visit', { ...visitInput(), plate: '' }, { isLeader: ref.isLeader }).some(
      (error) => error.code === 'visit.plateRequired',
    ),
  );
});

test('new validation codes resolve in zh-CN', () => {
  i18n._resetForTests();
  assert.notEqual(i18n.t('error.item.stop.outsideTrip'), 'error.item.stop.outsideTrip');
  assert.notEqual(i18n.t('error.visit.plateRequired'), 'error.visit.plateRequired');
  assert.equal(i18n.t('error.item.stop.outsideTrip').includes('{'), false);
  assert.equal(i18n.t('error.visit.plateRequired').includes('{'), false);
});

test('travel and all-day status use instants and the item zone', () => {
  const travel = createItem('travel', travelInput(), { ...options, id: 'travel' });
  assert.equal(
    tz.spanDays(new Date(travel.startAt), new Date(travel.endAt), 'Asia/Shanghai').length,
    2,
  );
  assert.equal(
    tz.spanDays(new Date(travel.startAt), new Date(travel.endAt), 'America/Los_Angeles').length,
    3,
  );
  assert.equal(itemStatus(travel, new Date('2026-10-28T01:00:00.000Z')), 'ongoing');
  const milestone = createItem(
    'milestone',
    { title: 'Milestone', allDay: true, date: '2026-10-30', leaderIds: ['p-chen'] },
    { ...options, id: 'milestone' },
  );
  assert.equal(itemStatus(milestone, new Date('2026-10-30T04:00:00.000Z')), 'ongoing');
  assert.equal(itemStatus(milestone, new Date('2026-10-31T00:00:00.000Z')), 'done');
});

test('visit creation requires self-drive plates and clears plates after thirty days', () => {
  const visit = createItem('visit', visitInput(), { ...options, id: 'visit' });
  assert.equal(visit.plateClearAfter, '2026-11-26T03:00:00.000Z');
  const pickup = createItem(
    'visit',
    { ...visitInput(), transport: 'pickup', plate: '', vehicleRequestId: 'later' },
    { ...options, id: 'pickup' },
  );
  assert.equal(pickup.vehicleRequestId, null);
});

test('weekly expansion and series preserve four LA wall times across DST', () => {
  const input = {
    title: 'Weekly review',
    date: '2026-10-25',
    start: '09:30',
    end: '10:30',
    leaderIds: ['p-chen'],
  };
  assert.equal(expandWeekly(input, { until: '2026-11-15' }).length, 4);
  const series = createSeries('travel', input, {
    id: 'weekly',
    seriesId: 'series-1',
    until: '2026-11-15',
    tz: 'America/Los_Angeles',
    actor: ref.actorFor('leader'),
    now,
    isLeader: ref.isLeader,
  });
  assert.deepEqual(
    series.map((item) => item.id),
    ['weekly-1', 'weekly-2', 'weekly-3', 'weekly-4'],
  );
  assert.deepEqual(
    series.map((item) => tz.toZoned(new Date(item.startAt), 'America/Los_Angeles').time),
    ['09:30', '09:30', '09:30', '09:30'],
  );
  assert.ok(series.every((item) => item.seriesId === 'series-1'));
});
