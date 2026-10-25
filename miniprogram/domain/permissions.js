'use strict';

const ROLE_CAPS = {
  leader: ['meeting.create', 'meeting.cancelOwn', 'vehicle.request', 'schedule.viewAll'],
  admin: ['meeting.create', 'meeting.cancelOwn', 'vehicle.request'],
  driver: ['vehicle.dispatch', 'vehicle.reject', 'vehicle.complete'],
  reception: ['vehicle.request'],
};

const caps = [];
for (const role of Object.keys(ROLE_CAPS)) {
  for (const capability of ROLE_CAPS[role]) {
    if (!caps.includes(capability)) caps.push(capability);
  }
}
const CAPS = Object.freeze(caps);

function can(role, capability) {
  return Boolean(ROLE_CAPS[role] && ROLE_CAPS[role].includes(capability));
}

function meetingVisibleTo() {
  return true;
}

module.exports = {
  ROLE_CAPS,
  CAPS,
  can,
  meetingVisibleTo,
};
