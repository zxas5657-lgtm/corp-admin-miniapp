'use strict';

const i18n = require('../i18n/index');
const reference = require('../data/reference');
const dates = require('../domain/dates');
const tz = require('../domain/tz');

function formOptions(options) {
  const refs = (options && options.refs) || reference;
  return {
    rooms: refs.ROOMS.map((room) => ({ id: room.id, label: i18n.localName(room) })),
    people: refs.PEOPLE.map((person) => ({ id: person.id, label: i18n.localName(person) })),
  };
}
function formDefaults(options) {
  const config = options || {};
  const zone = config.viewerTz || 'Asia/Shanghai';
  const local = tz.toZoned(config.now, zone);
  const minute = Number(local.time.slice(3));
  let date = local.date;
  let hour = Number(local.time.slice(0, 2)) + 1;
  if (minute > 0) hour += 0;
  if (hour >= 23) {
    date = dates.addDays(date, 1);
    hour = 9;
  }
  const start = String(hour).padStart(2, '0') + ':00';
  const endHour = hour + 1;
  const end = String(Math.min(endHour, 23)).padStart(2, '0') + (endHour > 23 ? ':59' : ':00');
  return {
    title: '',
    date,
    start,
    end,
    roomId: '',
    attendeeIds: config.personId ? [config.personId] : [],
    agenda: '',
  };
}
function displayTime(item, viewerTz) {
  const start = tz.toZoned(new Date(item.startAt), viewerTz).time;
  const end = tz.toZoned(new Date(item.endAt), viewerTz).time;
  return i18n.fmt.timeRange(start, end);
}
function fieldErrors(errors) {
  const byField = {};
  let first = null;
  for (const error of errors || []) {
    if (byField[error.field] === undefined) byField[error.field] = i18n.t('error.' + error.code);
    if (first === null) first = error.field;
  }
  return { byField, first };
}
function conflictWarnings(conflicts, options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const viewerTz = config.viewerTz || 'Asia/Shanghai';
  const items = state.items || [];
  const warnings = [];
  for (const conflict of conflicts || []) {
    const meeting = items.find((item) => item.id === conflict.meetingId);
    if (!meeting) continue;
    const time = displayTime(meeting, viewerTz);
    const title = i18n.displayText(meeting.title);
    if (conflict.type === 'room') {
      const room = refs.roomById(meeting.roomId);
      warnings.push(
        i18n.t('meeting.conflict.room', { room: room ? i18n.localName(room) : '', time, title }),
      );
    } else if (conflict.type === 'attendee') {
      const person = refs.personById(conflict.personId);
      warnings.push(
        i18n.t('meeting.conflict.attendee', {
          person: person ? i18n.localName(person) : '',
          time,
          title,
        }),
      );
    }
  }
  return {
    warnings,
    sheet: {
      title: i18n.t('meeting.conflict.title'),
      submitAnywayText: i18n.t('meeting.conflict.submitAnyway'),
      backText: i18n.t('meeting.conflict.back'),
    },
  };
}
function labels() {
  return {
    title: i18n.t('meeting.form.title'),
    date: i18n.t('meeting.form.date'),
    start: i18n.t('meeting.form.start'),
    end: i18n.t('meeting.form.end'),
    room: i18n.t('meeting.form.room'),
    attendees: i18n.t('meeting.form.attendees'),
    agenda: i18n.t('meeting.form.agenda'),
    titlePlaceholder: i18n.t('meeting.form.titlePlaceholder'),
    agendaPlaceholder: i18n.t('meeting.form.agendaPlaceholder'),
    submit: i18n.t('meeting.form.submit'),
    submitting: i18n.t('meeting.form.submitting'),
    dirtyLeave: {
      title: i18n.t('meeting.form.dirtyLeave.title'),
      body: i18n.t('meeting.form.dirtyLeave.body'),
      leave: i18n.t('meeting.form.dirtyLeave.leave'),
      stay: i18n.t('meeting.form.dirtyLeave.stay'),
    },
  };
}
module.exports = { formOptions, formDefaults, fieldErrors, conflictWarnings, labels };
