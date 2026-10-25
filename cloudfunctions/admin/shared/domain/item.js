'use strict';

const dates = require('./dates');
const tzUtil = require('./tz');
const { createMeeting } = require('./meeting');

const STOP_TYPES = ['depart', 'stop', 'return'];
const VISITOR_TYPES = ['government', 'customer', 'internal', 'partner'];
const RECEPTION_LEVELS = ['A', 'B', 'C'];
const TRANSPORTS = ['selfDrive', 'pickup'];

function asDate(value) {
  const result = value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function iso(value) {
  const result = asDate(value);
  return result ? result.toISOString() : null;
}

function leaderIds(value) {
  return Array.isArray(value) ? [...new Set(value)] : [];
}

function localRange(value, zone) {
  const start = tzUtil.fromZoned(value.date, value.start, zone);
  const endDate = value.endDate || value.date;
  const end = tzUtil.fromZoned(endDate, value.end, zone);
  return { start, end };
}

function validateTimed(value, codePrefix, allowEndDate) {
  const errors = [];
  if (!dates.isDateStr(value.date))
    errors.push({ field: 'date', code: `${codePrefix}.date.required` });
  if (!dates.isTimeStr(value.start) || !dates.isTimeStr(value.end))
    errors.push({ field: 'time', code: `${codePrefix}.time.required` });
  if (allowEndDate && value.endDate !== undefined && !dates.isDateStr(value.endDate))
    errors.push({ field: 'endDate', code: 'item.endDate.invalid' });
  if (
    dates.isDateStr(value.date) &&
    dates.isDateStr(value.endDate || value.date) &&
    value.endDate &&
    value.endDate < value.date
  )
    errors.push({ field: 'endDate', code: 'item.endDate.invalid' });
  if (
    dates.isTimeStr(value.start) &&
    dates.isTimeStr(value.end) &&
    (value.endDate || value.date) === value.date &&
    dates.toMinutes(value.end) <= dates.toMinutes(value.start)
  )
    errors.push({ field: 'end', code: 'item.time.endBeforeStart' });
  return errors;
}

function validateTimes(value, codePrefix, allowEndDate) {
  if (value.allDay === true) {
    return dates.isDateStr(value.date)
      ? []
      : [{ field: 'date', code: `${codePrefix}.date.required` }];
  }
  return validateTimed(value, codePrefix, allowEndDate);
}

function validateItem(kind, input, refs) {
  const value = input || {};
  const reference = refs || {};
  const errors = [];
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title) errors.push({ field: 'title', code: 'item.title.required' });
  else if (title.length > 40) errors.push({ field: 'title', code: 'item.title.tooLong' });
  errors.push(...validateTimes(value, 'item', kind === 'travel'));
  if (!Array.isArray(value.leaderIds) || value.leaderIds.length === 0)
    errors.push({ field: 'leaderIds', code: 'item.leaders.required' });
  else if (
    typeof reference.isLeader !== 'function' ||
    value.leaderIds.some((leaderId) => !reference.isLeader(leaderId))
  )
    errors.push({ field: 'leaderIds', code: 'item.leaders.invalid' });
  if (typeof value.notes === 'string' && value.notes.trim().length > 500)
    errors.push({ field: 'notes', code: 'item.notes.tooLong' });

  if (kind === 'stop') {
    const parent =
      typeof reference.itemById === 'function' ? reference.itemById(value.parentId) : null;
    if (!parent || parent.kind !== 'travel')
      errors.push({ field: 'parentId', code: 'item.parent.invalid' });
    if (!STOP_TYPES.includes(value.stopType))
      errors.push({ field: 'stopType', code: 'item.stopType.invalid' });
    if (typeof value.location !== 'string' || !value.location.trim())
      errors.push({ field: 'location', code: 'item.location.required' });
    else if (value.location.trim().length > 60)
      errors.push({ field: 'location', code: 'item.location.tooLong' });
    if (typeof value.client === 'string' && value.client.trim().length > 60)
      errors.push({ field: 'client', code: 'item.client.tooLong' });
    if (parent && value.allDay !== true && parent.startAt && parent.endAt) {
      const range = localRange(value, parent.tz || 'Asia/Shanghai');
      if (
        !range.start ||
        !range.end ||
        range.start.getTime() < new Date(parent.startAt).getTime() ||
        range.end.getTime() > new Date(parent.endAt).getTime()
      )
        errors.push({ field: 'time', code: 'item.stop.outsideTrip' });
    }
  }

  if (kind === 'visit') {
    if (typeof value.visitorName !== 'string' || !value.visitorName.trim())
      errors.push({ field: 'visitorName', code: 'visit.visitorName.required' });
    else if (value.visitorName.trim().length > 40)
      errors.push({ field: 'visitorName', code: 'visit.visitorName.tooLong' });
    if (typeof value.org === 'string' && value.org.trim().length > 60)
      errors.push({ field: 'org', code: 'visit.org.tooLong' });
    if (!Number.isInteger(value.headcount) || value.headcount < 1 || value.headcount > 50)
      errors.push({ field: 'headcount', code: 'visit.headcount.range' });
    if (typeof value.purpose === 'string' && value.purpose.trim().length > 100)
      errors.push({ field: 'purpose', code: 'visit.purpose.tooLong' });
    if (!VISITOR_TYPES.includes(value.visitorType))
      errors.push({ field: 'visitorType', code: 'visit.visitorType.invalid' });
    if (!RECEPTION_LEVELS.includes(value.receptionLevel))
      errors.push({ field: 'receptionLevel', code: 'visit.receptionLevel.invalid' });
    if (!TRANSPORTS.includes(value.transport))
      errors.push({ field: 'transport', code: 'visit.transport.invalid' });
    if (value.transport === 'selfDrive' && (typeof value.plate !== 'string' || !value.plate.trim()))
      errors.push({ field: 'plate', code: 'visit.plateRequired' });
    if (typeof value.plate === 'string' && value.plate.trim().length > 12)
      errors.push({ field: 'plate', code: 'visit.plate.tooLong' });
    if (!Array.isArray(value.leaderIds) || value.leaderIds.length !== 1)
      errors.push({ field: 'leaderIds', code: 'visit.leaders.exactlyOne' });
  }

  if (kind === 'milestone' && value.important !== undefined && typeof value.important !== 'boolean')
    errors.push({ field: 'important', code: 'item.important.invalid' });
  return errors;
}

function leaderEntries(ids, actor, createdAt, needsConfirm) {
  return ids.map((leaderId) => {
    const own = leaderId === actor.personId;
    return {
      leaderId,
      confirm: own ? 'confirmed' : needsConfirm ? 'pending' : 'none',
      confirmedAt: own ? createdAt : null,
      declineReason: '',
      changedAt: null,
      changeNote: '',
      seenAt: null,
    };
  });
}

function createItem(kind, input, options) {
  const value = input || {};
  const config = options || {};
  if (kind === 'meeting') {
    const meeting = createMeeting(value, config);
    return { ...meeting, seriesId: value.seriesId || config.seriesId || null };
  }
  const actor = config.actor || {};
  const now = asDate(config.now) || new Date();
  const createdAt = now.toISOString();
  const parent =
    kind === 'stop' && typeof config.itemById === 'function'
      ? config.itemById(value.parentId)
      : null;
  const zone = parent && parent.tz ? parent.tz : config.tz || 'Asia/Shanghai';
  const allDay = value.allDay === true;
  const range = allDay ? { start: null, end: null } : localRange(value, zone);
  const ids = parent ? [...(parent.leaderIds || [])] : leaderIds(value.leaderIds);
  const item = {
    id: config.id,
    kind,
    title: value.title || '',
    allDay,
    tz: zone,
    location: value.location || '',
    leaderIds: ids,
    important: kind === 'milestone' ? value.important !== false : value.important === true,
    parentId: value.parentId || null,
    seriesId: value.seriesId || config.seriesId || null,
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    noteId: value.noteId || null,
    status: 'active',
    leaders: leaderEntries(ids, actor, createdAt, config.needsConfirm !== false),
    createdBy: actor.personId,
    createdAt,
    updatedAt: createdAt,
    updatedBy: actor.personId,
    cancelledAt: null,
    cancelledBy: null,
    v: 1,
    rev: 0,
  };
  if (allDay) {
    item.date = value.date;
  } else {
    item.startAt = iso(range.start);
    item.endAt = iso(range.end);
  }
  if (kind === 'travel') item.endDate = value.endDate || value.date;
  if (kind === 'stop') {
    item.stopType = value.stopType;
    item.client = value.client || '';
  }
  if (kind === 'visit') {
    item.visitorName = value.visitorName || '';
    item.org = value.org || '';
    item.headcount = value.headcount;
    item.purpose = value.purpose || '';
    item.visitorType = value.visitorType;
    item.receptionLevel = value.receptionLevel;
    item.transport = value.transport;
    item.plate = value.plate || '';
    item.plateClearAfter = range.end
      ? new Date(range.end.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    item.vehicleRequestId = value.transport === 'pickup' ? null : value.vehicleRequestId || null;
    item.arrivedAt = value.arrivedAt || null;
  }
  return item;
}

function itemStatus(item, now) {
  if (item.status === 'cancelled') return 'cancelled';
  const current = asDate(now);
  if (!current) return 'upcoming';
  if (item.allDay) {
    const day = tzUtil.toZoned(current, item.tz || 'Asia/Shanghai').date;
    if (day < item.date) return 'upcoming';
    if (day > item.date) return 'done';
    return 'ongoing';
  }
  const start = asDate(item.startAt);
  const end = asDate(item.endAt);
  if (!start || !end) return 'upcoming';
  if (current.getTime() < start.getTime()) return 'upcoming';
  if (current.getTime() < end.getTime()) return 'ongoing';
  return 'done';
}

function expandWeekly(input, options) {
  const value = input || {};
  const config = options || {};
  const until = config.until;
  const max = config.max === undefined ? 26 : config.max;
  const result = [];
  let date = value.date;
  let index = 0;
  while (date && until && date <= until && result.length < max) {
    const occurrence = { ...value, date };
    if (value.endDate) occurrence.endDate = dates.addDays(value.endDate, index * 7);
    result.push(occurrence);
    date = dates.addDays(date, 7);
    index += 1;
  }
  return result;
}

function createSeries(kind, input, options) {
  const config = options || {};
  const seriesId = config.seriesId;
  return expandWeekly(input, config).map((value, index) =>
    createItem(
      kind,
      { ...value, seriesId },
      {
        ...config,
        id: `${config.id}-${index + 1}`,
        seriesId,
      },
    ),
  );
}

module.exports = {
  STOP_TYPES,
  VISITOR_TYPES,
  RECEPTION_LEVELS,
  TRANSPORTS,
  validateItem,
  createItem,
  itemStatus,
  expandWeekly,
  createSeries,
};
