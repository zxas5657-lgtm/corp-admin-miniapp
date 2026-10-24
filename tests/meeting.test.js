'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const reference = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const { parseLocalDateTime } = require('../miniprogram/domain/dates');
const {
  cancelMeeting,
  createMeeting,
  filterMeetings,
  findConflicts,
  meetingStatus,
  sortMeetings,
  validateMeeting,
} = require('../miniprogram/domain/meeting');

const refs = {
  roomById: reference.roomById,
  personById: reference.personById,
};
const demoNow = parseLocalDateTime('2026-10-24T09:20');

function at(time) {
  return parseLocalDateTime(`2026-10-24T${time}`);
}

function validInput() {
  return {
    title: 'A meeting',
    date: '2026-10-26',
    start: '09:00',
    end: '10:00',
    roomId: 'f3-small',
    attendeeIds: ['p-lin'],
    agenda: 'Agenda',
  };
}

test('meetingStatus handles every time boundary and cancellation', () => {
  const meeting = { date: '2026-10-24', start: '09:00', end: '09:40', cancelled: false };
  assert.equal(meetingStatus(meeting, at('08:59')), 'upcoming');
  assert.equal(meetingStatus(meeting, at('09:00')), 'ongoing');
  assert.equal(meetingStatus(meeting, at('09:39')), 'ongoing');
  assert.equal(meetingStatus(meeting, at('09:40')), 'done');
  assert.equal(meetingStatus(meeting, at('10:00')), 'done');
  assert.equal(meetingStatus({ ...meeting, date: '2026-10-23' }, demoNow), 'done');
  assert.equal(meetingStatus({ ...meeting, cancelled: true }, at('08:00')), 'cancelled');
});

test('seed meeting statuses match the demo clock', () => {
  const meetings = seed().meetings;
  assert.equal(meetingStatus(meetings[0], demoNow), 'done');
  assert.equal(meetingStatus(meetings[1], demoNow), 'ongoing');
  assert.equal(meetingStatus(meetings[2], demoNow), 'upcoming');
  assert.equal(meetingStatus(meetings[3], demoNow), 'upcoming');
  assert.equal(meetingStatus(meetings[4], demoNow), 'upcoming');
  assert.equal(meetingStatus(meetings[1], at('09:40')), 'done');
});

test('validateMeeting returns every error in form order', () => {
  const input = {
    title: '',
    date: '2026-02-30',
    start: '09:60',
    end: '24:00',
    roomId: 'unknown',
    attendeeIds: [],
    agenda: 'x'.repeat(501),
  };
  assert.deepEqual(validateMeeting(input, refs), [
    { field: 'title', code: 'meeting.title.required' },
    { field: 'date', code: 'meeting.date.required' },
    { field: 'start', code: 'meeting.time.required' },
    { field: 'end', code: 'meeting.time.required' },
    { field: 'roomId', code: 'meeting.room.required' },
    { field: 'attendeeIds', code: 'meeting.attendees.required' },
    { field: 'agenda', code: 'meeting.agenda.tooLong' },
  ]);
});

test('validateMeeting covers length, ordering, references, and duplicates', () => {
  const tooLongTitle = { ...validInput(), title: 'x'.repeat(41) };
  assert.deepEqual(validateMeeting(tooLongTitle, refs), [
    { field: 'title', code: 'meeting.title.tooLong' },
  ]);
  assert.deepEqual(validateMeeting({ ...validInput(), end: '08:59' }, refs), [
    { field: 'end', code: 'meeting.time.endBeforeStart' },
  ]);
  assert.deepEqual(validateMeeting({ ...validInput(), attendeeIds: ['p-lin', 'p-lin'] }, refs), [
    { field: 'attendeeIds', code: 'meeting.attendees.required' },
  ]);
  assert.deepEqual(validateMeeting({ ...validInput(), attendeeIds: ['missing'] }, refs), [
    { field: 'attendeeIds', code: 'meeting.attendees.required' },
  ]);
  assert.deepEqual(validateMeeting(validInput(), refs), []);
});

test('createMeeting trims user text and stores a local creation timestamp', () => {
  const meeting = createMeeting({ ...validInput(), title: '  Subject  ', agenda: '  Notes  ' }, {
    id: 'm-new',
    organizerId: 'p-lin',
    now: demoNow,
  });
  assert.deepEqual(meeting, {
    id: 'm-new',
    title: 'Subject',
    date: '2026-10-26',
    start: '09:00',
    end: '10:00',
    roomId: 'f3-small',
    attendeeIds: ['p-lin'],
    organizerId: 'p-lin',
    agenda: 'Notes',
    cancelled: false,
    createdAt: '2026-10-24T09:20',
  });
  assert.equal(Object.hasOwn(meeting, 'status'), false);
});

test('findConflicts reports room and attendee overlaps but respects exemptions', () => {
  const candidate = { id: 'new', date: '2026-10-26', start: '10:00', end: '11:00', roomId: 'f3-small', attendeeIds: ['p-lin'] };
  const meetings = [
    { id: 'room', date: '2026-10-26', start: '10:30', end: '11:30', roomId: 'f3-small', attendeeIds: ['p-chen'], cancelled: false },
    { id: 'touch', date: '2026-10-26', start: '11:00', end: '12:00', roomId: 'f3-small', attendeeIds: ['p-lin'], cancelled: false },
    { id: 'online', date: '2026-10-26', start: '10:30', end: '11:30', roomId: 'online', attendeeIds: ['p-lin'], cancelled: false },
    { id: 'cancelled', date: '2026-10-26', start: '10:30', end: '11:30', roomId: 'f3-small', attendeeIds: ['p-lin'], cancelled: true },
    { id: 'new', date: '2026-10-26', start: '10:30', end: '11:30', roomId: 'f3-small', attendeeIds: ['p-lin'], cancelled: false },
  ];
  assert.deepEqual(findConflicts(candidate, meetings, refs), [
    { type: 'room', meetingId: 'room' },
    { type: 'attendee', meetingId: 'online', personId: 'p-lin' },
  ]);
});

test('sorts and filters meetings by date and derived status', () => {
  const meetings = seed().meetings;
  const sorted = sortMeetings([meetings[4], meetings[0], meetings[1]]);
  assert.deepEqual(sorted.map((meeting) => meeting.id), ['m1', 'm2', 'm5']);
  assert.deepEqual(filterMeetings(meetings, 'ongoing', demoNow).map((meeting) => meeting.id), ['m2']);
  assert.deepEqual(filterMeetings(meetings, 'done', demoNow).map((meeting) => meeting.id), ['m1']);
  assert.deepEqual(filterMeetings(meetings, 'all', demoNow).map((meeting) => meeting.id), ['m1', 'm2', 'm3', 'm4', 'm5']);
});

test('cancelMeeting enforces organizer, timing, and stale-state rules', () => {
  const source = seed().meetings[3];
  const cancelled = cancelMeeting(source, { role: 'leader', personId: 'p-chen', now: demoNow });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.meeting.cancelled, true);
  assert.equal(cancelled.meeting.cancelledAt, '2026-10-24T09:20');
  assert.equal(source.cancelled, false);

  assert.deepEqual(
    cancelMeeting(source, { role: 'leader', personId: 'p-lin', now: demoNow }),
    { ok: false, code: 'meeting.cancel.notAllowed' },
  );
  assert.deepEqual(
    cancelMeeting(source, {
      role: 'leader',
      personId: 'p-chen',
      now: parseLocalDateTime('2026-10-26T10:00'),
    }),
    { ok: false, code: 'meeting.cancel.alreadyStarted' },
  );
  assert.deepEqual(
    cancelMeeting({ ...source, cancelled: true }, { role: 'leader', personId: 'p-chen', now: demoNow }),
    { ok: false, code: 'meeting.cancel.alreadyCancelled' },
  );
});
