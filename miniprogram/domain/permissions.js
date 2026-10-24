'use strict';

const { meetingStatus } = require('./meeting');

const ROLE_CAPS = {
  leader: ['meeting.create', 'meeting.cancelOwn', 'vehicle.request', 'schedule.viewAll'],
  admin: ['meeting.create', 'meeting.cancelOwn', 'vehicle.request'],
  driver: ['vehicle.dispatch', 'vehicle.reject', 'vehicle.complete'],
  reception: ['vehicle.request'],
};

const CAPS = Object.freeze([...new Set(Object.values(ROLE_CAPS).flat())]);

function can(role, capability) {
  return Boolean(ROLE_CAPS[role] && ROLE_CAPS[role].includes(capability));
}

function canCancelMeeting(role, personId, meeting, now) {
  return Boolean(
    meeting &&
    can(role, 'meeting.cancelOwn') &&
    personId === meeting.organizerId &&
    !meeting.cancelled &&
    meetingStatus(meeting, now) === 'upcoming',
  );
}

function meetingVisibleTo() {
  return true;
}

module.exports = {
  ROLE_CAPS,
  CAPS,
  can,
  canCancelMeeting,
  meetingVisibleTo,
};
