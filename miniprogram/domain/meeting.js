'use strict';

const {
  isDateStr,
  isTimeStr,
  nowParts,
  toMinutes,
} = require('./dates');
const { can } = require('./permissions');

function dateTimeKey(date, time) {
  return `${date}T${time}`;
}

function meetingStatus(meeting, now) {
  if (meeting.cancelled) return 'cancelled';
  const current = nowParts(now);
  const currentKey = dateTimeKey(current.date, current.time);
  const startKey = dateTimeKey(meeting.date, meeting.start);
  const endKey = dateTimeKey(meeting.date, meeting.end);
  if (currentKey < startKey) return 'upcoming';
  if (currentKey < endKey) return 'ongoing';
  return 'done';
}

function validateMeeting(input, refs) {
  const value = input || {};
  const errors = [];
  const roomById = refs && refs.roomById;
  const personById = refs && refs.personById;

  if (typeof value.title !== 'string' || value.title.trim() === '') {
    errors.push({ field: 'title', code: 'meeting.title.required' });
  } else if (value.title.trim().length > 40) {
    errors.push({ field: 'title', code: 'meeting.title.tooLong' });
  }

  if (!isDateStr(value.date)) {
    errors.push({ field: 'date', code: 'meeting.date.required' });
  }

  const startValid = isTimeStr(value.start);
  const endValid = isTimeStr(value.end);
  if (!startValid) errors.push({ field: 'start', code: 'meeting.time.required' });
  if (!endValid) errors.push({ field: 'end', code: 'meeting.time.required' });
  if (startValid && endValid && toMinutes(value.end) <= toMinutes(value.start)) {
    errors.push({ field: 'end', code: 'meeting.time.endBeforeStart' });
  }

  if (typeof roomById !== 'function' || !roomById(value.roomId)) {
    errors.push({ field: 'roomId', code: 'meeting.room.required' });
  }

  if (!Array.isArray(value.attendeeIds) || value.attendeeIds.length === 0) {
    errors.push({ field: 'attendeeIds', code: 'meeting.attendees.required' });
  } else {
    const uniqueIds = new Set(value.attendeeIds);
    const hasUnknown = typeof personById !== 'function'
      || value.attendeeIds.some((id) => !personById(id));
    if (hasUnknown || uniqueIds.size !== value.attendeeIds.length) {
      errors.push({ field: 'attendeeIds', code: 'meeting.attendees.required' });
    }
  }

  if (typeof value.agenda === 'string' && value.agenda.trim().length > 500) {
    errors.push({ field: 'agenda', code: 'meeting.agenda.tooLong' });
  }

  return errors;
}

function canCancelMeeting(role, personId, meeting, now) {
  return Boolean(
    meeting &&
    can(role, 'meeting.cancelOwn') &&
    personId === meeting.organizerId &&
    !meeting.cancelled &&
    meetingStatus(meeting, now) === 'upcoming',
  );
}

function createMeeting(input, options) {
  const value = input || {};
  const config = options || {};
  const created = nowParts(config.now);
  return {
    id: config.id,
    title: String(value.title).trim(),
    date: value.date,
    start: value.start,
    end: value.end,
    roomId: value.roomId,
    attendeeIds: [...value.attendeeIds],
    organizerId: config.organizerId,
    agenda: typeof value.agenda === 'string' ? value.agenda.trim() : '',
    cancelled: false,
    createdAt: `${created.date}T${created.time}`,
  };
}

function cancelMeeting(meeting, options) {
  const config = options || {};
  if (meeting.cancelled) return { ok: false, code: 'meeting.cancel.alreadyCancelled' };
  if (!config.role || !config.personId || meeting.organizerId !== config.personId) {
    return { ok: false, code: 'meeting.cancel.notAllowed' };
  }
  if (meetingStatus(meeting, config.now) !== 'upcoming') {
    return { ok: false, code: 'meeting.cancel.alreadyStarted' };
  }
  if (!canCancelMeeting(config.role, config.personId, meeting, config.now)) {
    return { ok: false, code: 'meeting.cancel.notAllowed' };
  }
  const cancelledAt = nowParts(config.now);
  return {
    ok: true,
    meeting: {
      ...meeting,
      cancelled: true,
      cancelledAt: `${cancelledAt.date}T${cancelledAt.time}`,
    },
  };
}

function overlaps(left, right) {
  return toMinutes(left.start) < toMinutes(right.end)
    && toMinutes(right.start) < toMinutes(left.end);
}

function findConflicts(candidate, meetings, refs) {
  const conflicts = [];
  const roomById = refs && refs.roomById;
  for (const meeting of meetings || []) {
    if (
      (candidate.id !== undefined && candidate.id !== null && meeting.id === candidate.id) ||
      meeting.cancelled ||
      meeting.date !== candidate.date ||
      !overlaps(candidate, meeting)
    ) continue;

    const room = typeof roomById === 'function' ? roomById(candidate.roomId) : null;
    const otherRoom = typeof roomById === 'function' ? roomById(meeting.roomId) : null;
    if (
      candidate.roomId === meeting.roomId &&
      !(room && room.online) &&
      !(otherRoom && otherRoom.online)
    ) {
      conflicts.push({ type: 'room', meetingId: meeting.id });
    }

    const otherAttendees = new Set(meeting.attendeeIds || []);
    for (const personId of candidate.attendeeIds || []) {
      if (otherAttendees.has(personId)) {
        conflicts.push({ type: 'attendee', meetingId: meeting.id, personId });
      }
    }
  }
  return conflicts;
}

function sortMeetings(meetings) {
  return [...(meetings || [])].sort((left, right) => (
    left.date.localeCompare(right.date)
    || left.start.localeCompare(right.start)
    || String(left.id).localeCompare(String(right.id))
  ));
}

function filterMeetings(meetings, filter, now) {
  if (filter === 'all') return sortMeetings(meetings);
  return sortMeetings((meetings || []).filter((meeting) => meetingStatus(meeting, now) === filter));
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
