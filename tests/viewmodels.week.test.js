'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../miniprogram/i18n');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const { leaderWeekView } = require('../miniprogram/viewmodels/week');

const now = new Date('2026-10-24T01:20:00.000Z');
const ctx = { supports: ref.SUPPORTS, isLeader: ref.isLeader };

function view(options) {
  return leaderWeekView({
    state: seed(),
    refs: ref,
    date: '2026-10-24',
    now,
    actor: ref.actorFor('leader'),
    viewerTz: 'Asia/Shanghai',
    ctx,
    ...options,
  });
}

test.afterEach(() => i18n._resetForTests());

test('week bounds follow the locale first day and today-first ordering', () => {
  i18n.setLocale('zh-CN');
  assert.deepEqual(view().weekDates, [
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
    '2026-10-25',
  ]);
  const state = seed();
  const first = state.items.find((item) => item.id === 'm1');
  first.startAt = '2026-10-24T08:00:00.000Z';
  first.endAt = '2026-10-24T09:00:00.000Z';
  assert.equal(view({ state }).days.find((day) => day.date).date, '2026-10-24');
  i18n.setLocale('en');
  assert.deepEqual(view().weekDates, [
    '2026-10-18',
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
  ]);
});

test('today mode returns one row and empty rows are merged', () => {
  i18n.setLocale('en');
  const result = view({ mode: 'today' });
  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].date, '2026-10-24');
  const empty = view({ state: { items: [], vehicles: [] } });
  assert.equal(empty.days.length, 1);
  assert.equal(empty.days[0].empty, true);
});

test('overview counts and filters use the leader entry', () => {
  i18n.setLocale('en');
  const result = view();
  const order = ['pending', 'meetings', 'trips', 'visits'];
  const keys = result.overview.map((tile) => tile.key);
  assert.ok(keys.includes('meetings'));
  assert.deepEqual(
    keys,
    order.filter((key) => keys.includes(key)),
  );
  assert.ok(result.overview.every((tile) => tile.count > 0));
  assert.equal(
    view({ filter: 'meetings' }).overview.find((tile) => tile.key === 'meetings').active,
    true,
  );
  assert.ok(
    view({ filter: 'meetings' }).days.some((day) =>
      (day.items || []).some((item) => item.kind === 'meeting'),
    ),
  );
});

test('markers, confirmation actions, and leader visibility are exposed', () => {
  const state = seed();
  const m = state.items.find((item) => item.id === 'm1');
  const own = m.leaders.find((entry) => entry.leaderId === 'p-chen');
  own.confirm = 'pending';
  own.seenAt = '2026-10-23T00:00:00.000Z';
  own.changedAt = '2026-10-24T03:00:00.000Z';
  m.updatedAt = '2026-10-24T03:00:00.000Z';
  m.updatedBy = 'p-lin';
  m.important = true;
  const result = view({ state });
  const item = result.days
    .find((day) => (day.items || []).some((entry) => entry.id === 'm1'))
    .items.find((entry) => entry.id === 'm1');
  assert.deepEqual(item.markers, ['pending', 'updated', 'important']);
  assert.equal(item.canConfirm, true);
  m.status = 'cancelled';
  const cancelled = view({ state })
    .days.flatMap((day) => day.items || [])
    .find((entry) => entry.id === 'm1');
  assert.equal(cancelled.canConfirm, false);
  assert.ok(cancelled.markers.includes('cancelled'));
  assert.equal(
    view({ state })
      .days.flatMap((day) => day.items || [])
      .some((entry) => entry.id === 'm6'),
    false,
  );
});

test('zone line includes the relative day and trip detail includes an in-window meeting', () => {
  i18n.setLocale('en');
  const state = seed();
  state.items.push({
    id: 'zone-meeting',
    kind: 'meeting',
    title: 'Early meeting',
    startAt: '2026-10-23T21:00:00.000Z',
    endAt: '2026-10-23T22:00:00.000Z',
    allDay: false,
    tz: 'Asia/Shanghai',
    roomId: 'online',
    location: '',
    leaderIds: ['p-chen'],
    leaders: [{ leaderId: 'p-chen', confirm: 'confirmed', seenAt: '2026-10-20T00:00:00.000Z' }],
    organizerId: 'p-lin',
    attendeeIds: ['p-chen'],
    status: 'active',
    createdBy: 'p-lin',
    updatedBy: 'p-lin',
    updatedAt: '2026-10-20T00:00:00.000Z',
    rev: 0,
  });
  state.items.push({
    id: 'trip-meeting',
    kind: 'meeting',
    title: 'Inside trip',
    startAt: '2026-10-28T05:00:00.000Z',
    endAt: '2026-10-28T06:00:00.000Z',
    allDay: false,
    tz: 'Asia/Shanghai',
    roomId: 'online',
    location: '',
    leaderIds: ['p-chen'],
    leaders: [],
    organizerId: 'p-lin',
    attendeeIds: ['p-chen'],
    status: 'active',
    createdBy: 'p-lin',
    updatedBy: 'p-lin',
    updatedAt: '2026-10-20T00:00:00.000Z',
    rev: 0,
  });
  const result = view({ state, viewerTz: 'America/Los_Angeles' });
  const meeting = result.days
    .flatMap((day) => day.items || [])
    .find((item) => item.id === 'zone-meeting');
  assert.match(meeting.zoneLine, /Shanghai/);
  assert.match(meeting.zoneLine, /next day|previous day/);
  const tripResult = view({ state, date: '2026-10-28', viewerTz: 'Asia/Shanghai' });
  const trip = tripResult.days.flatMap((day) => day.items || []).find((item) => item.id === 't1');
  assert.equal(
    trip.detail.meetings.some((entry) => entry.id === 'trip-meeting'),
    true,
  );
});

test('English and Chinese labels are localized', () => {
  i18n.setLocale('en');
  assert.equal(view().title, 'My week');
  i18n.setLocale('zh-CN');
  assert.equal(view().title, '我的一周');
});

function allItems(result) {
  return result.days.flatMap((day) => day.items || []);
}

test('updated follows the leader entry: changedAt later than seenAt', () => {
  const state = seed();
  const m = state.items.find((item) => item.id === 'm1');
  const own = m.leaders.find((entry) => entry.leaderId === 'p-chen');
  const markers = () => allItems(view({ state })).find((item) => item.id === 'm1').markers;
  own.confirm = 'none';
  own.changedAt = null;
  own.seenAt = null;
  m.updatedAt = '2026-10-24T03:00:00.000Z';
  assert.deepEqual(markers(), [], 'an edit without changedAt is not an update for the leader');
  own.changedAt = '2026-10-24T03:00:00.000Z';
  assert.deepEqual(markers(), ['updated'], 'changed and never seen');
  own.seenAt = '2026-10-24T02:00:00.000Z';
  assert.deepEqual(markers(), ['updated'], 'seen before the change');
  own.seenAt = '2026-10-24T04:00:00.000Z';
  assert.deepEqual(markers(), [], 'seen after the change');
});

test('a confirmed item cannot be confirmed or declined again', () => {
  const state = seed();
  const m = state.items.find((item) => item.id === 'm1');
  m.leaders.find((entry) => entry.leaderId === 'p-chen').confirm = 'confirmed';
  const item = allItems(view({ state })).find((entry) => entry.id === 'm1');
  assert.equal(item.canConfirm, false);
  assert.equal(item.canDecline, false);
  assert.equal(item.markers.includes('pending'), false);
});

test('overview tiles count only the shown week and ignore the active filter', () => {
  i18n.setLocale('en');
  const state = seed();
  const whole = view({ state }).overview;
  const filtered = view({ state, filter: 'meetings' }).overview;
  assert.deepEqual(
    filtered.map((tile) => [tile.key, tile.count]),
    whole.map((tile) => [tile.key, tile.count]),
  );
  const m = state.items.find((item) => item.id === 'm1');
  state.items.push({
    ...m,
    id: 'far-meeting',
    startAt: '2027-03-01T02:00:00.000Z',
    endAt: '2027-03-01T03:00:00.000Z',
  });
  const meetings = (result) =>
    (result.overview.find((tile) => tile.key === 'meetings') || {}).count;
  assert.equal(meetings(view({ state })), meetings(view({ state: seed() })));
});

test('no zone line when the item is in the viewer zone', () => {
  const result = view({ viewerTz: 'Asia/Shanghai' });
  const shanghai = allItems(result).filter((item) => item.kind === 'meeting');
  assert.ok(shanghai.length > 0);
  assert.ok(shanghai.every((item) => item.zoneLine === null));
});
