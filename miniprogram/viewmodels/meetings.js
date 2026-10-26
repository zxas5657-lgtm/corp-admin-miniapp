'use strict';

const i18n = require('../i18n/index');
const reference = require('../data/reference');
const tz = require('../domain/tz');
const { can } = require('../domain/permissions');
const { actorFor } = require('../data/reference');
const {
  canCancelMeeting,
  filterMeetings,
  meetingStatus,
  sortMeetings,
} = require('../domain/meeting');
const { visibleItems } = require('../domain/visibility');
const { statusTone } = require('../utils/status-tone');
function personName(personId, refs) {
  const person = refs.personById(personId);
  return person ? i18n.localName(person) : '';
}
function actorValue(config) {
  return config.actor || actorFor(config.role) || { role: config.role, personId: config.personId };
}
function meetingItemView(meeting, now, refs, viewerTz) {
  const status = meetingStatus(meeting, now);
  const localStart = tz.toZoned(new Date(meeting.startAt), viewerTz);
  const localEnd = tz.toZoned(new Date(meeting.endAt), viewerTz);
  return {
    id: meeting.id,
    title: i18n.displayText(meeting.title),
    timeText: i18n.fmt.timeRange(localStart.time, localEnd.time),
    roomName: (() => {
      const room = refs.roomById(meeting.roomId);
      return room ? i18n.localName(room) : '';
    })(),
    organizerName: personName(meeting.organizerId, refs),
    statusText: i18n.t('status.meeting.' + status),
    tone: statusTone('meeting', status),
    cancelled: meeting.status === 'cancelled',
  };
}
function filters() {
  return ['all', 'upcoming', 'ongoing', 'done', 'cancelled'].map((key) => ({
    key,
    label: i18n.t('meeting.filter.' + key),
  }));
}
function meetingListView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const actor = actorValue(config);
  const viewerTz = config.viewerTz || 'Asia/Shanghai';
  const allMeetings = visibleItems(
    actor,
    (state.items || []).filter((item) => item.kind === 'meeting'),
    config.ctx,
  );
  const filter = config.filter || 'all';
  const visible = filterMeetings(allMeetings, filter, config.now);
  const groups = [];
  for (const meeting of sortMeetings(visible)) {
    const date = tz.toZoned(new Date(meeting.startAt), viewerTz).date;
    let group = groups[groups.length - 1];
    if (!group || group.date !== date) {
      group = { date, heading: i18n.fmt.dayHeading(date), items: [] };
      groups.push(group);
    }
    group.items.push(meetingItemView(meeting, config.now, refs, viewerTz));
  }
  const canCreate = can(actor, 'meeting.create');
  const empty =
    visible.length > 0
      ? null
      : allMeetings.length === 0
        ? {
            kind: 'noData',
            title: i18n.t('meeting.empty.noDataTitle'),
            body: i18n.t('meeting.empty.noDataBody'),
            actionText: canCreate ? i18n.t('meeting.action.new') : null,
          }
        : {
            kind: 'filtered',
            title: i18n.t('meeting.empty.filteredTitle'),
            body: i18n.t('meeting.empty.filteredBody'),
            actionText: i18n.t('meeting.empty.showAll'),
          };
  return {
    filters: filters().map((item) => ({ ...item, active: item.key === filter })),
    groups,
    empty,
    createButton: {
      text: i18n.t('meeting.action.new'),
      disabled: !canCreate,
      reason: canCreate ? null : i18n.t('meeting.action.createDisabled'),
    },
  };
}
function meetingDetailView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const actor = actorValue(config);
  const viewerTz = config.viewerTz || 'Asia/Shanghai';
  const meeting = visibleItems(
    actor,
    (state.items || []).filter((item) => item.kind === 'meeting'),
    config.ctx,
  ).find((item) => item.id === config.id);
  if (!meeting)
    return {
      notFound: true,
      title: i18n.t('meeting.detail.notFoundTitle'),
      body: i18n.t('meeting.detail.notFoundBody'),
    };
  const status = meetingStatus(meeting, config.now);
  const attendeeNames = (meeting.attendeeIds || []).map((id) => personName(id, refs));
  const room = refs.roomById(meeting.roomId);
  const organizer = refs.personById(meeting.organizerId);
  const start = tz.toZoned(new Date(meeting.startAt), viewerTz);
  const end = tz.toZoned(new Date(meeting.endAt), viewerTz);
  return {
    notFound: false,
    title: i18n.displayText(meeting.title),
    statusText: i18n.t('status.meeting.' + status),
    tone: statusTone('meeting', status),
    cancelled: meeting.status === 'cancelled',
    cells: [
      { key: 'date', label: i18n.t('meeting.detail.date'), value: i18n.fmt.dayHeading(start.date) },
      {
        key: 'time',
        label: i18n.t('meeting.detail.time'),
        value: i18n.fmt.timeRange(start.time, end.time),
      },
      {
        key: 'room',
        label: i18n.t('meeting.detail.room'),
        value: room ? i18n.localName(room) : '',
      },
      {
        key: 'organizer',
        label: i18n.t('meeting.detail.organizer'),
        value: organizer ? i18n.localName(organizer) : '',
      },
      {
        key: 'attendees',
        label: i18n.t('meeting.detail.attendees'),
        value: i18n.listJoin(attendeeNames),
      },
    ],
    attendeeCountText: i18n.tn('meeting.attendeeCount', attendeeNames.length),
    agenda: meeting.notes || null,
    canCancel: canCancelMeeting(actor, meeting, config.now, config.ctx),
    cancelSheet: {
      title: i18n.t('meeting.detail.cancelTitle'),
      body: i18n.t('meeting.detail.cancelBody', { title: i18n.displayText(meeting.title) }),
      confirmText: i18n.t('meeting.detail.cancelConfirm'),
      cancelText: i18n.t('meeting.detail.cancelBack'),
    },
    viewInSchedule: {
      text: i18n.t('meeting.detail.viewInSchedule'),
      date: start.date,
      meetingId: meeting.id,
    },
  };
}
module.exports = { meetingListView, meetingDetailView };
