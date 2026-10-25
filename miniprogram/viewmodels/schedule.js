'use strict';

const i18n = require('../i18n');
const reference = require('../data/reference');
const dates = require('../domain/dates');
const schedule = require('../domain/schedule');
const { filterScheduleByScope, scheduleScopes } = require('../domain/roles');
const { statusTone } = require('../utils/status-tone');

function roomName(roomId, refs) {
  const room = refs.roomById(roomId);
  return room ? i18n.localName(room) : '';
}

function vehicleSubtitle(vehicle, refs) {
  if ((vehicle.status === 'assigned' || vehicle.status === 'done') && vehicle.carId) {
    const car = refs.carById(vehicle.carId);
    if (car && car.plate) return car.plate;
  }
  return i18n.displayText(vehicle.destination);
}

function scheduleItemView(item, refs, focusId) {
  const record = item.ref;
  const meeting = item.kind === 'meeting';
  return {
    kind: item.kind,
    id: item.id,
    timeText: meeting ? i18n.fmt.timeRange(record.start, record.end) : record.time,
    title: i18n.displayText(meeting ? record.title : record.reason),
    subtitle: meeting ? roomName(record.roomId, refs) : vehicleSubtitle(record, refs),
    statusText: i18n.t(`status.${meeting ? 'meeting' : 'vehicle'}.${item.status}`),
    tone: statusTone(meeting ? 'meeting' : 'vehicle', item.status),
    focused: item.id === focusId,
    url: meeting
      ? `/pages/meeting-detail/index?id=${item.id}`
      : `/pages/vehicle-detail/index?id=${item.id}`,
  };
}

function scheduleView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const date = config.date;
  const now = config.now;
  const todayDate = dates.toDateStr(now);
  const meetings = state.meetings || [];
  const vehicles = state.vehicles || [];
  const sources = [schedule.meetingSource(meetings), schedule.vehicleSource(vehicles)];
  const days = dates.weekDays(date, i18n.firstDayOfWeek());
  const hasRole = Boolean(config.role);
  const scopes = hasRole ? scheduleScopes(config.role) : [];
  const defaultScope = scopes.find((item) => item.default);
  const activeScope = hasRole
    ? (scopes.some((item) => item.key === config.scope) ? config.scope : defaultScope.key)
    : 'all';
  const scopedItems = (day) => filterScheduleByScope(
    schedule.scheduleItems(day, sources, now),
    activeScope,
    { role: config.role, personId: config.personId },
  );
  const itemDates = new Set(days.filter((day) => scopedItems(day).length > 0));
  const items = scopedItems(date);
  const weekdayShort = i18n.t('date.weekdayShort');

  return {
    date,
    todayDate,
    isToday: date === todayDate,
    dayHeading: i18n.fmt.dayHeading(date),
    week: {
      days: days.map((day) => ({
        date: day,
        weekday: weekdayShort[dates.weekdayOf(day)],
        dayNum: Number(day.slice(-2)),
        isToday: day === todayDate,
        isSelected: day === date,
        hasItems: itemDates.has(day),
      })),
      prevDate: dates.addDays(date, -7),
      nextDate: dates.addDays(date, 7),
    },
    items: items.map((item) => scheduleItemView(item, refs, config.focusId)),
    scopes: scopes.map((item) => ({
      key: item.key,
      label: i18n.t(`schedule.scope.${item.key}`),
      active: item.key === activeScope,
    })),
    countText: i18n.tn('schedule.count', items.length),
    empty: items.length > 0
      ? null
      : { title: i18n.t('schedule.emptyTitle'), body: i18n.t('schedule.emptyBody') },
    backToToday: date === todayDate ? null : i18n.t('schedule.backToToday'),
  };
}

module.exports = { scheduleView };
