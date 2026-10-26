'use strict';

const { meetingStatus } = require('./meeting');
const tz = require('./tz');

function sourceItem(record, now, viewerTz, date, kind) {
  if (kind === 'meeting') {
    if (record.status === 'cancelled' || record.cancelled) return null;
    const days = tz.spanDays(new Date(record.startAt), new Date(record.endAt), viewerTz);
    if (!days.includes(date)) return null;
    return {
      kind,
      id: record.id,
      date,
      startAt: record.startAt,
      status: meetingStatus(record, now),
      ref: record,
    };
  }
  if (record.status === 'rejected') return null;
  if (tz.dayKey(new Date(record.departAt), viewerTz) !== date) return null;
  return {
    kind,
    id: record.id,
    date,
    startAt: record.departAt,
    status: record.status,
    ref: record,
  };
}
function scheduleItems(date, sources, now, viewerTz) {
  const items = [];
  for (const source of sources || []) {
    for (const record of source.items || []) {
      const item = source.toScheduleItem(record, now, viewerTz, date);
      if (item) items.push(item);
    }
  }
  return items.sort(
    (left, right) =>
      String(left.startAt).localeCompare(String(right.startAt)) ||
      left.kind.localeCompare(right.kind) ||
      String(left.id).localeCompare(String(right.id)),
  );
}
function meetingSource(items) {
  return {
    kind: 'meeting',
    items: (items || []).filter((item) => item.kind === 'meeting'),
    toScheduleItem(item, now, viewerTz, date) {
      return sourceItem(item, now, viewerTz, date, 'meeting');
    },
  };
}
function vehicleSource(vehicles) {
  return {
    kind: 'vehicle',
    items: vehicles || [],
    toScheduleItem(item, now, viewerTz, date) {
      return sourceItem(item, now, viewerTz, date, 'vehicle');
    },
  };
}
function datesWithItems(sources, dates, now, viewerTz) {
  const result = new Set();
  for (const date of dates || [])
    if (scheduleItems(date, sources, now, viewerTz).length > 0) result.add(date);
  return result;
}
module.exports = { scheduleItems, meetingSource, vehicleSource, datesWithItems };
