'use strict';

const i18n = require('../i18n/index');
const reference = require('../data/reference');
const tz = require('../domain/tz');
const dates = require('../domain/dates');
const schedule = require('../domain/schedule');
const { actorFor } = require('../data/reference');
const { filterScheduleByScope, scheduleScopes } = require('../domain/roles');
const { visibleItems, visibleVehicles } = require('../domain/visibility');
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
function scheduleItemView(item, refs, focusId, viewerTz) {
  const record = item.ref;
  const meeting = item.kind === 'meeting';
  const start = tz.toZoned(new Date(record.startAt || record.departAt), viewerTz);
  const end = meeting ? tz.toZoned(new Date(record.endAt), viewerTz) : null;
  return {
    kind: item.kind,
    id: item.id,
    timeText: meeting ? i18n.fmt.timeRange(start.time, end.time) : start.time,
    title: i18n.displayText(meeting ? record.title : record.reason),
    subtitle: meeting ? roomName(record.roomId, refs) : vehicleSubtitle(record, refs),
    statusText: i18n.t('status.' + (meeting ? 'meeting' : 'vehicle') + '.' + item.status),
    tone: statusTone(meeting ? 'meeting' : 'vehicle', item.status),
    focused: item.id === focusId,
    url: meeting
      ? '/pages/meeting-detail/index?id=' + item.id
      : '/pages/vehicle-detail/index?id=' + item.id,
  };
}
function scheduleView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const viewerTz = config.viewerTz || 'Asia/Shanghai';
  const actor = config.actor || actorFor(config.role);
  const now = config.now;
  const todayDate = tz.toZoned(now, viewerTz).date;
  const allItems = state.items || [];
  const meetings = allItems.filter((item) => item.kind === 'meeting');
  const vehicles = actor
    ? visibleVehicles(actor, state.vehicles || [], config.ctx)
    : state.vehicles || [];
  const visibleMeetings = actor ? visibleItems(actor, meetings, config.ctx) : meetings;
  const sources = [schedule.meetingSource(visibleMeetings), schedule.vehicleSource(vehicles)];
  const days = dates.weekDays(config.date, i18n.firstDayOfWeek());
  const scopes = actor ? scheduleScopes(actor) : [];
  const defaultScope = scopes.find((item) => item.default);
  const activeScope = actor
    ? scopes.some((item) => item.key === config.scope)
      ? config.scope
      : defaultScope.key
    : 'all';
  const scoped = (day) =>
    filterScheduleByScope(schedule.scheduleItems(day, sources, now, viewerTz), activeScope, {
      actor,
    });
  const itemDates = new Set(days.filter((day) => scoped(day).length > 0));
  const items = scoped(config.date);
  const weekdayShort = i18n.t('date.weekdayShort');
  return {
    date: config.date,
    todayDate,
    isToday: config.date === todayDate,
    dayHeading: i18n.fmt.dayHeading(config.date),
    week: {
      days: days.map((day) => ({
        date: day,
        weekday: weekdayShort[dates.weekdayOf(day)],
        dayNum: Number(day.slice(-2)),
        isToday: day === todayDate,
        isSelected: day === config.date,
        hasItems: itemDates.has(day),
      })),
      prevDate: dates.addDays(config.date, -7),
      nextDate: dates.addDays(config.date, 7),
    },
    items: items.map((item) => scheduleItemView(item, refs, config.focusId, viewerTz)),
    scopes: scopes.map((item) => ({
      key: item.key,
      label: i18n.t('schedule.scope.' + item.key),
      active: item.key === activeScope,
    })),
    countText: i18n.tn('schedule.count', items.length),
    empty:
      items.length > 0
        ? null
        : { title: i18n.t('schedule.emptyTitle'), body: i18n.t('schedule.emptyBody') },
    backToToday: config.date === todayDate ? null : i18n.t('schedule.backToToday'),
  };
}
module.exports = { scheduleView };
