'use strict';

const i18n = require('../i18n');
const reference = require('../data/reference');
const { toDateStr, toTimeStr } = require('../domain/dates');

function formOptions(options) {
  const refs = (options && options.refs) || reference;
  return {
    rooms: refs.ROOMS.map((room) => ({ id: room.id, label: i18n.localName(room) })),
    people: refs.PEOPLE.map((person) => ({ id: person.id, label: i18n.localName(person) })),
  };
}

function formDefaults(options) {
  const config = options || {};
  const current = new Date(config.now.getTime());
  const next = new Date(current.getTime());
  next.setHours(next.getHours() + 1, 0, 0, 0);
  if (next.getDate() !== current.getDate() || next.getHours() >= 23) {
    next.setDate(current.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  }
  const end = new Date(next.getTime());
  end.setHours(end.getHours() + 1);
  if (end.getDate() !== next.getDate()) end.setHours(23, 59, 0, 0);
  return {
    title: '',
    date: toDateStr(next),
    start: toTimeStr(next),
    end: toTimeStr(end),
    roomId: '',
    attendeeIds: config.personId ? [config.personId] : [],
    agenda: '',
  };
}

function fieldErrors(errors) {
  const byField = {};
  let first = null;
  for (const error of errors || []) {
    if (byField[error.field] === undefined) byField[error.field] = i18n.t(`error.${error.code}`);
    if (first === null) first = error.field;
  }
  return { byField, first };
}

function conflictWarnings(conflicts, options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const warnings = [];
  for (const conflict of conflicts || []) {
    const meeting = (state.meetings || []).find((item) => item.id === conflict.meetingId);
    if (!meeting) continue;
    const time = i18n.fmt.timeRange(meeting.start, meeting.end);
    const title = i18n.displayText(meeting.title);
    if (conflict.type === 'room') {
      const room = refs.roomById(meeting.roomId);
      warnings.push(i18n.t('meeting.conflict.room', {
        room: room ? i18n.localName(room) : '',
        time,
        title,
      }));
    } else if (conflict.type === 'attendee') {
      const person = refs.personById(conflict.personId);
      warnings.push(i18n.t('meeting.conflict.attendee', {
        person: person ? i18n.localName(person) : '',
        time,
        title,
      }));
    }
  }
  const sheet = {
    title: i18n.t('meeting.conflict.title'),
    submitAnywayText: i18n.t('meeting.conflict.submitAnyway'),
    backText: i18n.t('meeting.conflict.back'),
  };
  return { warnings, sheet };
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

module.exports = {
  formOptions,
  formDefaults,
  fieldErrors,
  conflictWarnings,
  labels,
};
