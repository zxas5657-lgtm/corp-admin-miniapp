'use strict';

const i18n = require('../i18n/index');
const reference = require('../data/reference');
const { can } = require('../domain/permissions');
const {
  canCancelMeeting,
  filterMeetings,
  meetingStatus,
  sortMeetings,
} = require('../domain/meeting');
const { statusTone } = require('../utils/status-tone');

function personName(personId, refs) {
  const person = refs.personById(personId);
  return person ? i18n.localName(person) : '';
}

function meetingItemView(meeting, now, refs) {
  const status = meetingStatus(meeting, now);
  return {
    id: meeting.id,
    title: i18n.displayText(meeting.title),
    timeText: i18n.fmt.timeRange(meeting.start, meeting.end),
    roomName: (() => {
      const room = refs.roomById(meeting.roomId);
      return room ? i18n.localName(room) : '';
    })(),
    organizerName: personName(meeting.organizerId, refs),
    statusText: i18n.t(`status.meeting.${status}`),
    tone: statusTone('meeting', status),
    cancelled: Boolean(meeting.cancelled),
  };
}

function filters() {
  return ['all', 'upcoming', 'ongoing', 'done', 'cancelled'].map((key) => ({
    key,
    label: i18n.t(`meeting.filter.${key}`),
  }));
}

function meetingListView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const allMeetings = state.meetings || [];
  const filter = config.filter || 'all';
  const visible = filterMeetings(allMeetings, filter, config.now);
  const groups = [];
  for (const meeting of sortMeetings(visible)) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== meeting.date) {
      group = { date: meeting.date, heading: i18n.fmt.dayHeading(meeting.date), items: [] };
      groups.push(group);
    }
    group.items.push(meetingItemView(meeting, config.now, refs));
  }

  const canCreate = can(config.role, 'meeting.create');
  const empty = visible.length > 0
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
        actionText: canCreate ? i18n.t('meeting.action.new') : null,
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
  const meeting = (state.meetings || []).find((item) => item.id === config.id);
  if (!meeting) {
    return {
      notFound: true,
      title: i18n.t('meeting.detail.notFoundTitle'),
      body: i18n.t('meeting.detail.notFoundBody'),
    };
  }

  const status = meetingStatus(meeting, config.now);
  const attendeeNames = (meeting.attendeeIds || []).map((id) => personName(id, refs));
  const room = refs.roomById(meeting.roomId);
  const organizer = refs.personById(meeting.organizerId);
  return {
    notFound: false,
    title: i18n.displayText(meeting.title),
    statusText: i18n.t(`status.meeting.${status}`),
    tone: statusTone('meeting', status),
    cancelled: Boolean(meeting.cancelled),
    cells: [
      { key: 'date', label: i18n.t('meeting.detail.date'), value: i18n.fmt.dayHeading(meeting.date) },
      { key: 'time', label: i18n.t('meeting.detail.time'), value: i18n.fmt.timeRange(meeting.start, meeting.end) },
      { key: 'room', label: i18n.t('meeting.detail.room'), value: room ? i18n.localName(room) : '' },
      { key: 'organizer', label: i18n.t('meeting.detail.organizer'), value: organizer ? i18n.localName(organizer) : '' },
      { key: 'attendees', label: i18n.t('meeting.detail.attendees'), value: i18n.listJoin(attendeeNames) },
    ],
    attendeeCountText: i18n.tn('meeting.attendeeCount', attendeeNames.length),
    agenda: meeting.agenda ? i18n.displayText(meeting.agenda) : null,
    canCancel: canCancelMeeting(config.role, config.personId, meeting, config.now),
    cancelSheet: {
      title: i18n.t('meeting.detail.cancelTitle'),
      body: i18n.t('meeting.detail.cancelBody', { title: i18n.displayText(meeting.title) }),
      confirmText: i18n.t('meeting.detail.cancelConfirm'),
      cancelText: i18n.t('meeting.detail.cancelBack'),
    },
    viewInSchedule: {
      text: i18n.t('meeting.detail.viewInSchedule'),
      date: meeting.date,
      meetingId: meeting.id,
    },
  };
}

module.exports = { meetingListView, meetingDetailView };
