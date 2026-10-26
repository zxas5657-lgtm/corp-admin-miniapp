'use strict';

const { normalizeRole } = require('./permissions');
const { canEditItem } = require('./visibility');
const tz = require('./tz');

function asDate(value) {
  const result = value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function timestamp(value) {
  const date = asDate(value) || new Date();
  return date.toISOString();
}

function ownLeader(item, actor) {
  if (!item || !actor) return null;
  if (!(item.leaderIds || []).includes(actor.personId)) return null;
  return (item.leaders || []).find((leader) => leader.leaderId === actor.personId) || null;
}

function permission(item, actor) {
  return ownLeader(item, actor) ? null : { ok: false, code: 'permission.denied' };
}

function updateItem(item, actor, now, update) {
  const at = timestamp(now);
  const leaders = (item.leaders || []).map((leader) =>
    leader.leaderId === actor.personId ? update({ ...leader }, at) : { ...leader },
  );
  return {
    ...item,
    leaders,
    updatedAt: at,
    updatedBy: actor.personId,
    rev: (item.rev || 0) + 1,
  };
}

function confirmOne(item, options) {
  const config = options || {};
  const actor = config.actor || {};
  if (item && item.status === 'cancelled') return { ok: false, code: 'item.alreadyChanged' };
  const denied = permission(item, actor);
  if (denied) return denied;
  return {
    ok: true,
    item: updateItem(item, actor, config.now, (leader, at) => ({
      ...leader,
      confirm: 'confirmed',
      confirmedAt: at,
      declineReason: '',
    })),
  };
}

function declineOne(item, options) {
  const config = options || {};
  const actor = config.actor || {};
  if (item && item.status === 'cancelled') return { ok: false, code: 'item.alreadyChanged' };
  const denied = permission(item, actor);
  if (denied) return denied;
  if (typeof config.reason !== 'string' || config.reason.trim() === '')
    return { ok: false, code: 'item.decline.reasonRequired' };
  return {
    ok: true,
    item: updateItem(item, actor, config.now, (leader, at) => ({
      ...leader,
      confirm: 'declined',
      declineReason: config.reason.trim(),
      changedAt: at,
    })),
  };
}

function seenOne(item, options) {
  const config = options || {};
  const actor = config.actor || {};
  const denied = permission(item, actor);
  if (denied) return denied;
  return {
    ok: true,
    item: updateItem(item, actor, config.now, (leader, at) => ({
      ...leader,
      seenAt: at,
    })),
  };
}

function applyToSeries(items, item, fn) {
  const seriesId = item && item.seriesId;
  return (items || []).map((candidate) => {
    const itemStart = item && (item.startAt || item.date || '');
    const candidateStart = candidate && (candidate.startAt || candidate.date || '');
    if (!seriesId || candidate.seriesId !== seriesId || String(candidateStart) < String(itemStart))
      return candidate;
    return fn(candidate) || candidate;
  });
}

function confirmItem(item, options) {
  const result = confirmOne(item, options);
  if (!result.ok || !Array.isArray(options && options.items)) return result;
  return {
    ok: true,
    items: applyToSeries(options.items, item, (candidate) => confirmOne(candidate, options).item),
  };
}

function declineItem(item, options) {
  const result = declineOne(item, options);
  if (!result.ok || !Array.isArray(options && options.items)) return result;
  return {
    ok: true,
    items: applyToSeries(options.items, item, (candidate) => declineOne(candidate, options).item),
  };
}

function markSeen(item, options) {
  return seenOne(item, options);
}

function applyTimes(item, patch) {
  const zone = patch.tz || item.tz || 'Asia/Shanghai';
  const date = patch.date || item.date;
  const hasTimePatch =
    patch.start !== undefined ||
    patch.end !== undefined ||
    patch.date !== undefined ||
    patch.tz !== undefined;
  if (!hasTimePatch) return { item, error: null };
  if (item.allDay && patch.start === undefined && patch.end === undefined) {
    if (typeof date !== 'string') return { item: null, error: 'item.date.required' };
    return { item: { ...item, date, tz: zone }, error: null };
  }
  const startParts = item.startAt ? tz.toZoned(new Date(item.startAt), zone) : null;
  const endParts = item.endAt ? tz.toZoned(new Date(item.endAt), zone) : null;
  const startTime = patch.start === undefined ? startParts && startParts.time : patch.start;
  const endTime = patch.end === undefined ? endParts && endParts.time : patch.end;
  if (typeof date !== 'string' || typeof startTime !== 'string' || typeof endTime !== 'string')
    return { item: null, error: 'item.time.required' };
  const startDate = patch.date || (startParts && startParts.date);
  const endDate = patch.endDate || patch.date || (endParts && endParts.date);
  const start = tz.fromZoned(startDate, startTime, zone);
  const end = tz.fromZoned(endDate, endTime, zone);
  if (!start || !end || end.getTime() <= start.getTime())
    return { item: null, error: 'item.time.endBeforeStart' };
  return {
    item: {
      ...item,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      tz: zone,
      endDate: patch.endDate || item.endDate,
    },
    error: null,
  };
}

function changeItem(item, patch, options) {
  const config = options || {};
  const actor = config.actor || {};
  if (!canEditItem(actor, item, config.ctx)) return { ok: false, code: 'permission.denied' };
  if (config.expectedRev !== undefined && config.expectedRev !== item.rev)
    return { ok: false, code: 'item.alreadyChanged' };
  const role = normalizeRole(actor.role);
  if (
    (role === 'secretary' || role === 'secretaryAdmin') &&
    typeof config.needsConfirm !== 'boolean'
  )
    return { ok: false, code: 'item.needsConfirm.required' };
  const timeResult = applyTimes(item, patch || {});
  if (timeResult.error) return { ok: false, code: timeResult.error };
  const allowed = [
    'title',
    'location',
    'roomId',
    'attendeeIds',
    'notes',
    'important',
    'category',
    'visitorName',
    'org',
    'headcount',
    'purpose',
    'visitorType',
    'receptionLevel',
    'transport',
    'plate',
    'plateClearAfter',
    'vehicleRequestId',
    'arrivedAt',
    'stopType',
    'client',
  ];
  const next = { ...timeResult.item };
  for (const field of allowed) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, field)) next[field] = patch[field];
  }
  if (patch && patch.endDate !== undefined) next.endDate = patch.endDate;
  const at = timestamp(config.now);
  next.updatedAt = at;
  next.updatedBy = actor.personId;
  next.rev = (item.rev || 0) + 1;
  next.leaders = (item.leaders || []).map((leader) => {
    const own = leader.leaderId === actor.personId && role === 'leader';
    if (own) return { ...leader, confirm: 'confirmed', confirmedAt: at };
    return {
      ...leader,
      confirm: config.needsConfirm ? 'pending' : 'none',
      changedAt: at,
      changeNote: config.changeNote || '',
    };
  });
  return { ok: true, item: next };
}

module.exports = {
  confirmItem,
  declineItem,
  markSeen,
  changeItem,
  applyToSeries,
};
