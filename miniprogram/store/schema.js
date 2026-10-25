'use strict';

const tz = require('../domain/tz');
const reference = require('../data/reference');
const SCHEMA_VERSION = 3;
const DATA_KEY = 'corp-admin-v2';
const LOCALE_KEY = 'corp-admin-locale';
const ROLE_KEY = 'corp-admin-role';
const PREFS_KEY = 'corp-admin-prefs';
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function migrationResult(value) {
  if (value && value.ok === false) return null;
  if (value && value.ok === true && Object.prototype.hasOwnProperty.call(value, 'data'))
    return value.data;
  return value;
}
function localInstant(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.endsWith('Z')) return value;
  const date = typeof value === 'string' && value.includes('T') ? value.slice(0, 10) : null;
  const time = typeof value === 'string' && value.includes('T') ? value.slice(11, 16) : null;
  const result = date && time ? tz.fromZoned(date, time, 'Asia/Shanghai') : null;
  return result ? result.toISOString() : null;
}
function leaderIdsFor(attendeeIds, organizerId) {
  return [...new Set([...(attendeeIds || []), organizerId].filter((id) => reference.isLeader(id)))];
}
function migrateMeeting(meeting) {
  const createdAt = localInstant(meeting.createdAt);
  const startAt = localInstant(String(meeting.date) + 'T' + String(meeting.start));
  const endAt = localInstant(String(meeting.date) + 'T' + String(meeting.end));
  const leaderIds = leaderIdsFor(meeting.attendeeIds, meeting.organizerId);
  return {
    id: meeting.id,
    kind: 'meeting',
    title: meeting.title,
    startAt,
    endAt,
    allDay: false,
    tz: 'Asia/Shanghai',
    location: '',
    roomId: meeting.roomId,
    attendeeIds: [...(meeting.attendeeIds || [])],
    organizerId: meeting.organizerId,
    category: 'regular',
    important: false,
    parentId: null,
    seriesId: null,
    notes: meeting.agenda || '',
    noteId: null,
    leaderIds,
    status: meeting.cancelled ? 'cancelled' : 'active',
    leaders: leaderIds.map((leaderId) => ({
      leaderId,
      confirm: 'confirmed',
      confirmedAt: createdAt,
      declineReason: '',
      changedAt: null,
      changeNote: '',
      seenAt: null,
    })),
    createdBy: meeting.organizerId,
    createdAt,
    updatedAt: createdAt,
    updatedBy: meeting.organizerId,
    cancelledAt: localInstant(meeting.cancelledAt),
    cancelledBy: meeting.cancelled ? meeting.organizerId : null,
    v: 1,
    rev: 0,
  };
}
function migrateVehicle(vehicle) {
  return {
    id: vehicle.id,
    reason: vehicle.reason,
    destination: vehicle.destination,
    departAt: localInstant(String(vehicle.date) + 'T' + String(vehicle.time)),
    tz: 'Asia/Shanghai',
    passengers: vehicle.passengers,
    applicantId: vehicle.applicantId,
    forLeaderId: reference.isLeader(vehicle.applicantId) ? vehicle.applicantId : null,
    itemId: null,
    note: vehicle.note || '',
    status: vehicle.status,
    carId: vehicle.carId,
    driverId: vehicle.driverId,
    rejectReason: vehicle.rejectReason || '',
    createdAt: localInstant(vehicle.createdAt),
    dispatchedAt: localInstant(vehicle.dispatchedAt),
    dispatchedBy: vehicle.dispatchedBy || null,
    completedAt: localInstant(vehicle.completedAt),
    rev: 0,
  };
}
const MIGRATIONS = {
  2(data) {
    return {
      ...data,
      version: 3,
      items: (data.meetings || []).map((record) =>
        isRecord(record) ? migrateMeeting(record) : null,
      ),
      vehicles: (data.vehicles || []).map((record) =>
        isRecord(record) ? migrateVehicle(record) : null,
      ),
      notes: [],
    };
  },
};
function migrate(data, migrations) {
  if (
    !isRecord(data) ||
    !Number.isInteger(data.version) ||
    data.version > SCHEMA_VERSION ||
    data.version < 0
  )
    return { ok: false, code: 'storage.readFailed' };
  const steps = migrations || MIGRATIONS;
  let current = clone(data);
  while (current.version < SCHEMA_VERSION) {
    const step = steps[current.version];
    if (typeof step !== 'function') return { ok: false, code: 'storage.readFailed' };
    const previous = current.version;
    current = migrationResult(step(current));
    if (
      !isRecord(current) ||
      !Number.isInteger(current.version) ||
      current.version <= previous ||
      current.version > SCHEMA_VERSION
    )
      return { ok: false, code: 'storage.readFailed' };
  }
  if (!Array.isArray(current.items) || !Array.isArray(current.vehicles))
    return { ok: false, code: 'storage.readFailed' };
  let dropped = 0;
  const valid = (records, timeKey) =>
    records.filter((record) => {
      const hasTime =
        record && record.allDay ? Boolean(record.date) : Boolean(record && record[timeKey]);
      const good = isRecord(record) && Boolean(record.id) && hasTime;
      if (!good) dropped += 1;
      return good;
    });
  const clean = {
    ...current,
    version: SCHEMA_VERSION,
    items: valid(current.items, 'startAt'),
    vehicles: valid(current.vehicles, 'departAt'),
    notes: Array.isArray(current.notes) ? current.notes : [],
  };
  return { ok: true, data: clean, dropped };
}
module.exports = {
  SCHEMA_VERSION,
  DATA_KEY,
  LOCALE_KEY,
  ROLE_KEY,
  PREFS_KEY,
  MIGRATIONS,
  migrate,
};
