'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const { actorFor, isLeader, SUPPORTS } = ref;
const tz = require('../miniprogram/domain/tz');
const {
  meetingStatus,
  validateMeeting,
  createMeeting,
  findConflicts,
  sortMeetings,
  filterMeetings,
  cancelMeeting,
  canCancelMeeting,
} = require('../miniprogram/domain/meeting');
const { itemVisibleTo } = require('../miniprogram/domain/visibility');
const now = new Date('2026-10-24T01:20:00Z');
const ctx = { supports: SUPPORTS, isLeader };
const refs = { roomById: ref.roomById, personById: ref.personById };
function input() {
  return {
    title: 'A meeting',
    date: '2026-10-26',
    start: '09:00',
    end: '10:00',
    roomId: 'f3-small',
    attendeeIds: ['p-chen'],
    agenda: 'Agenda',
    category: 'special',
    important: true,
  };
}
test('meeting status uses instants and cancellation', () => {
  const item = {
    kind: 'meeting',
    status: 'active',
    startAt: tz.fromZoned('2026-10-24', '09:00', 'Asia/Shanghai').toISOString(),
    endAt: tz.fromZoned('2026-10-24', '09:40', 'Asia/Shanghai').toISOString(),
  };
  assert.equal(meetingStatus(item, new Date('2026-10-24T00:59:00Z')), 'upcoming');
  assert.equal(meetingStatus(item, new Date('2026-10-24T01:00:00Z')), 'ongoing');
  assert.equal(meetingStatus(item, new Date('2026-10-24T01:40:00Z')), 'done');
  assert.equal(meetingStatus({ ...item, status: 'cancelled' }, now), 'cancelled');
});
test('validation keeps form order and validates optional flags', () => {
  assert.deepEqual(
    validateMeeting({ ...input(), category: 'bad', important: 'yes' }, refs).slice(-2),
    [
      { field: 'category', code: 'meeting.category.invalid' },
      { field: 'important', code: 'meeting.important.invalid' },
    ],
  );
  assert.deepEqual(validateMeeting(input(), refs), []);
});
test('createMeeting stores instants and leader confirmation rules', () => {
  const item = createMeeting(input(), {
    id: 'm-new',
    actor: actorFor('secretary'),
    now,
    tz: 'Asia/Shanghai',
    isLeader,
  });
  assert.equal(item.startAt, '2026-10-26T01:00:00.000Z');
  assert.deepEqual(item.leaderIds, ['p-chen']);
  assert.equal(item.leaders[0].confirm, 'pending');
  assert.equal(item.notes, 'Agenda');
  const own = createMeeting(
    { ...input(), attendeeIds: ['p-wang'] },
    { id: 'm-own', actor: actorFor('leader'), now, tz: 'Asia/Shanghai', isLeader },
  );
  assert.equal(own.leaders.find((x) => x.leaderId === 'p-chen').confirm, 'confirmed');
  assert.equal(own.leaders.find((x) => x.leaderId === 'p-wang').confirm, 'pending');
});
test('conflicts use instant half-open ranges', () => {
  const candidate = {
    id: 'new',
    kind: 'meeting',
    startAt: tz.fromZoned('2026-10-26', '10:00', 'Asia/Shanghai').toISOString(),
    endAt: tz.fromZoned('2026-10-26', '11:00', 'Asia/Shanghai').toISOString(),
    roomId: 'f3-small',
    attendeeIds: ['p-lin'],
  };
  const other = {
    id: 'room',
    kind: 'meeting',
    status: 'active',
    startAt: tz.fromZoned('2026-10-26', '10:30', 'Asia/Shanghai').toISOString(),
    endAt: tz.fromZoned('2026-10-26', '11:30', 'Asia/Shanghai').toISOString(),
    roomId: 'f3-small',
    attendeeIds: [],
  };
  assert.deepEqual(findConflicts(candidate, [other], refs), [{ type: 'room', meetingId: 'room' }]);
});
test('sort, filter, edit and cancel use v3 items', () => {
  const items = seed().items;
  assert.deepEqual(
    sortMeetings([items[4], items[0], items[1]]).map((x) => x.id),
    ['m1', 'm2', 'm5'],
  );
  assert.equal(
    filterMeetings(items, 'ongoing', now)
      .map((x) => x.id)
      .includes('m2'),
    true,
  );
  const item = items.find((x) => x.id === 'm4');
  assert.equal(canCancelMeeting(actorFor('leader'), item, now, ctx), true);
  const result = cancelMeeting(item, { actor: actorFor('leader'), now, ctx });
  assert.equal(result.ok, true);
  assert.equal(result.item.status, 'cancelled');
  assert.equal(item.status, 'active');
});
test('leader visibility prevents another leader item', () => {
  const m6 = seed().items.find((x) => x.id === 'm6');
  assert.equal(itemVisibleTo(actorFor('leader'), m6, ctx), false);
  assert.equal(itemVisibleTo(actorFor('secretaryAdmin'), m6, ctx), true);
});

test('seed meeting statuses match the demo clock', () => {
  const items = seed().items;
  assert.equal(
    meetingStatus(
      items.find((x) => x.id === 'm1'),
      now,
    ),
    'done',
  );
  assert.equal(
    meetingStatus(
      items.find((x) => x.id === 'm2'),
      now,
    ),
    'ongoing',
  );
  assert.equal(
    meetingStatus(
      items.find((x) => x.id === 'm4'),
      now,
    ),
    'upcoming',
  );
});
test('validateMeeting covers lengths ordering references and duplicates', () => {
  const value = input();
  const errors = validateMeeting(
    {
      ...value,
      title: 'x'.repeat(41),
      end: '08:00',
      roomId: 'missing',
      attendeeIds: ['p-chen', 'p-chen'],
      agenda: 'x'.repeat(501),
    },
    refs,
  );
  assert.deepEqual(
    errors.map((x) => x.code),
    [
      'meeting.title.tooLong',
      'meeting.time.endBeforeStart',
      'meeting.room.required',
      'meeting.attendees.required',
      'meeting.agenda.tooLong',
    ],
  );
});
test('cancelMeeting updates other leader confirmations', () => {
  const item = createMeeting(
    { ...input(), attendeeIds: ['p-chen', 'p-wang'] },
    { id: 'cancel-leaders', actor: actorFor('leader'), now, tz: 'Asia/Shanghai', isLeader },
  );
  const result = cancelMeeting(item, { actor: actorFor('leader'), now, ctx, needsConfirm: true });
  assert.equal(result.ok, true);
  const other = result.item.leaders.find((x) => x.leaderId === 'p-wang');
  assert.equal(other.confirm, 'pending');
  assert.equal(other.changedAt, '2026-10-24T01:20:00.000Z');
  const none = cancelMeeting(item, { actor: actorFor('leader'), now, ctx, needsConfirm: false });
  assert.equal(none.item.leaders.find((x) => x.leaderId === 'p-wang').confirm, 'none');
});

test('createMeeting applies leader confirmation and needsConfirm rules', () => {
  const secretary = createMeeting(
    { ...input(), attendeeIds: ['p-chen', 'p-wang'] },
    {
      id: 'sec',
      actor: actorFor('secretary'),
      now,
      tz: 'Asia/Shanghai',
      isLeader,
      needsConfirm: true,
    },
  );
  assert.deepEqual(
    secretary.leaders.map((x) => [x.leaderId, x.confirm]),
    [
      ['p-chen', 'pending'],
      ['p-wang', 'pending'],
    ],
  );
  const leader = createMeeting(
    { ...input(), attendeeIds: ['p-chen', 'p-wang'] },
    {
      id: 'lead',
      actor: actorFor('leader'),
      now,
      tz: 'Asia/Shanghai',
      isLeader,
      needsConfirm: true,
    },
  );
  assert.deepEqual(
    leader.leaders.map((x) => [x.leaderId, x.confirm]),
    [
      ['p-chen', 'confirmed'],
      ['p-wang', 'pending'],
    ],
  );
  const none = createMeeting(
    { ...input(), attendeeIds: ['p-chen', 'p-wang'] },
    {
      id: 'none',
      actor: actorFor('secretary'),
      now,
      tz: 'Asia/Shanghai',
      isLeader,
      needsConfirm: false,
    },
  );
  assert.deepEqual(
    none.leaders.map((x) => x.confirm),
    ['none', 'none'],
  );
});
