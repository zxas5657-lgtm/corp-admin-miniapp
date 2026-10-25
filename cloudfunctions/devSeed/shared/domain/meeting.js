'use strict';

const { isDateStr, isTimeStr, toMinutes } = require('./dates');
const tzUtil = require('./tz');
const { canEditItem } = require('./visibility');

function asDate(value) {
  const result = value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}
function iso(value) {
  return asDate(value).toISOString();
}
function meetingStatus(item, now) {
  if (item.status === 'cancelled' || item.cancelled) return 'cancelled';
  const current = asDate(now);
  const start = asDate(item.startAt);
  const end = asDate(item.endAt);
  if (!current || !start || !end) return 'upcoming';
  if (current.getTime() < start.getTime()) return 'upcoming';
  if (current.getTime() < end.getTime()) return 'ongoing';
  return 'done';
}

function validateMeeting(input, refs) {
  const value = input || {};
  const errors = [];
  const roomById = refs && refs.roomById;
  const personById = refs && refs.personById;
  if (typeof value.title !== 'string' || value.title.trim() === '')
    errors.push({ field: 'title', code: 'meeting.title.required' });
  else if (value.title.trim().length > 40)
    errors.push({ field: 'title', code: 'meeting.title.tooLong' });
  if (!isDateStr(value.date)) errors.push({ field: 'date', code: 'meeting.date.required' });
  const startValid = isTimeStr(value.start);
  const endValid = isTimeStr(value.end);
  if (!startValid) errors.push({ field: 'start', code: 'meeting.time.required' });
  if (!endValid) errors.push({ field: 'end', code: 'meeting.time.required' });
  if (startValid && endValid && toMinutes(value.end) <= toMinutes(value.start))
    errors.push({ field: 'end', code: 'meeting.time.endBeforeStart' });
  if (typeof roomById !== 'function' || !roomById(value.roomId))
    errors.push({ field: 'roomId', code: 'meeting.room.required' });
  if (!Array.isArray(value.attendeeIds) || value.attendeeIds.length === 0)
    errors.push({ field: 'attendeeIds', code: 'meeting.attendees.required' });
  else {
    const uniqueIds = new Set(value.attendeeIds);
    const hasUnknown =
      typeof personById !== 'function' || value.attendeeIds.some((id) => !personById(id));
    if (hasUnknown || uniqueIds.size !== value.attendeeIds.length)
      errors.push({ field: 'attendeeIds', code: 'meeting.attendees.required' });
  }
  if (typeof value.agenda === 'string' && value.agenda.trim().length > 500)
    errors.push({ field: 'agenda', code: 'meeting.agenda.tooLong' });
  if (value.category !== undefined && !['regular', 'special'].includes(value.category))
    errors.push({ field: 'category', code: 'meeting.category.invalid' });
  if (value.important !== undefined && typeof value.important !== 'boolean')
    errors.push({ field: 'important', code: 'meeting.important.invalid' });
  return errors;
}

function createMeeting(input, options) {
  const value = input || {};
  const config = options || {};
  const actor = config.actor || {};
  const zone = config.tz || 'Asia/Shanghai';
  const start = tzUtil.fromZoned(value.date, value.start, zone);
  const end = tzUtil.fromZoned(value.date, value.end, zone);
  const now = asDate(config.now);
  const startAt = start ? start.toISOString() : null;
  const endAt = end ? end.toISOString() : null;
  const leaderFn = typeof config.isLeader === 'function' ? config.isLeader : () => false;
  const people = [...(value.attendeeIds || []), actor.personId];
  const leaderIds = [...new Set(people.filter((personId) => leaderFn(personId)))];
  const createdAt = now ? now.toISOString() : new Date().toISOString();
  const leaders = leaderIds.map((leaderId) => {
    const own = leaderId === actor.personId && leaderFn(actor.personId);
    return {
      leaderId,
      confirm: own ? 'confirmed' : config.needsConfirm === false ? 'none' : 'pending',
      confirmedAt: own ? createdAt : null,
      declineReason: '',
      changedAt: null,
      changeNote: '',
      seenAt: null,
    };
  });
  return {
    id: config.id,
    kind: 'meeting',
    title: String(value.title || '').trim(),
    startAt,
    endAt,
    allDay: false,
    tz: zone,
    location: value.location || '',
    roomId: value.roomId,
    attendeeIds: [...(value.attendeeIds || [])],
    organizerId: actor.personId,
    category: value.category || 'regular',
    important: value.important === true,
    parentId: null,
    seriesId: null,
    notes:
      typeof value.notes === 'string'
        ? value.notes.trim()
        : typeof value.agenda === 'string'
          ? value.agenda.trim()
          : '',
    noteId: null,
    leaderIds,
    status: 'active',
    leaders,
    createdBy: actor.personId,
    createdAt,
    updatedAt: createdAt,
    updatedBy: actor.personId,
    cancelledAt: null,
    cancelledBy: null,
    v: 1,
    rev: 0,
  };
}

function canCancelMeeting(actor, item, now, ctx) {
  return Boolean(
    item &&
      item.status !== 'cancelled' &&
      canEditItem(actor, item, ctx) &&
      meetingStatus(item, now) === 'upcoming',
  );
}

function cancelMeeting(item, options) {
  const config = options || {};
  if (item.status === 'cancelled') return { ok: false, code: 'meeting.cancel.alreadyCancelled' };
  if (meetingStatus(item, config.now) !== 'upcoming')
    return { ok: false, code: 'meeting.cancel.alreadyStarted' };
  if (!canCancelMeeting(config.actor, item, config.now, config.ctx))
    return { ok: false, code: 'meeting.cancel.notAllowed' };
  const now = asDate(config.now);
  const changedAt = now ? now.toISOString() : new Date().toISOString();
  const actor = config.actor || {};
  const leaders = (item.leaders || []).map((leader) =>
    leader.leaderId === actor.personId
      ? { ...leader }
      : { ...leader, confirm: config.needsConfirm ? 'pending' : 'none', changedAt },
  );
  return {
    ok: true,
    item: {
      ...item,
      status: 'cancelled',
      leaders,
      updatedAt: changedAt,
      updatedBy: actor.personId,
      cancelledAt: changedAt,
      cancelledBy: actor.personId,
      rev: (item.rev || 0) + 1,
    },
  };
}

function findConflicts(candidate, items, refs) {
  const conflicts = [];
  const roomById = refs && refs.roomById;
  for (const item of items || []) {
    if (item.kind !== 'meeting' || item.status === 'cancelled' || item.id === candidate.id)
      continue;
    if (
      !tzUtil.overlaps(
        new Date(candidate.startAt),
        new Date(candidate.endAt),
        new Date(item.startAt),
        new Date(item.endAt),
      )
    )
      continue;
    const room = typeof roomById === 'function' ? roomById(candidate.roomId) : null;
    const otherRoom = typeof roomById === 'function' ? roomById(item.roomId) : null;
    if (
      candidate.roomId === item.roomId &&
      !(room && room.online) &&
      !(otherRoom && otherRoom.online)
    )
      conflicts.push({ type: 'room', meetingId: item.id });
    const attendees = new Set(item.attendeeIds || []);
    for (const personId of candidate.attendeeIds || [])
      if (attendees.has(personId))
        conflicts.push({ type: 'attendee', meetingId: item.id, personId });
  }
  return conflicts;
}

function sortMeetings(items) {
  return [...(items || [])].sort(
    (left, right) =>
      String(left.startAt).localeCompare(String(right.startAt)) ||
      String(left.id).localeCompare(String(right.id)),
  );
}
function filterMeetings(items, filter, now) {
  const sorted = sortMeetings(items);
  return filter === 'all' ? sorted : sorted.filter((item) => meetingStatus(item, now) === filter);
}

module.exports = {
  meetingStatus,
  validateMeeting,
  createMeeting,
  cancelMeeting,
  findConflicts,
  sortMeetings,
  filterMeetings,
  canCancelMeeting,
};
