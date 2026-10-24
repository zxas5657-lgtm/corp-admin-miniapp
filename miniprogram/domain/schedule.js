'use strict';

const { meetingStatus } = require('./meeting');

function scheduleItems(date, sources, now) {
  const items = [];
  for (const source of sources || []) {
    for (const record of source.items || []) {
      const item = source.toScheduleItem(record, now);
      if (item && item.date === date) items.push(item);
    }
  }
  return items.sort((left, right) => (
    left.start.localeCompare(right.start)
    || left.kind.localeCompare(right.kind)
    || String(left.id).localeCompare(String(right.id))
  ));
}

function meetingSource(meetings) {
  return {
    kind: 'meeting',
    items: meetings || [],
    toScheduleItem(meeting, now) {
      if (meeting.cancelled) return null;
      return {
        kind: 'meeting',
        id: meeting.id,
        date: meeting.date,
        start: meeting.start,
        end: meeting.end,
        status: meetingStatus(meeting, now),
        ref: meeting,
      };
    },
  };
}

function vehicleSource(vehicles) {
  return {
    kind: 'vehicle',
    items: vehicles || [],
    toScheduleItem(vehicle) {
      if (vehicle.status === 'rejected') return null;
      return {
        kind: 'vehicle',
        id: vehicle.id,
        date: vehicle.date,
        start: vehicle.time,
        end: null,
        status: vehicle.status,
        ref: vehicle,
      };
    },
  };
}

function datesWithItems(sources, dates, now) {
  const result = new Set();
  for (const date of dates || []) {
    if (scheduleItems(date, sources, now).length > 0) result.add(date);
  }
  return result;
}

module.exports = {
  scheduleItems,
  meetingSource,
  vehicleSource,
  datesWithItems,
};
