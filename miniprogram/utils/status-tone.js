'use strict';

const MEETING = {
  upcoming: 'warn',
  ongoing: 'info',
  done: 'mute',
  // DESIGN.md v2: cancelled and withdrawn use the cancel tone, not "finished".
  cancelled: 'danger'
};

const VEHICLE = {
  pending: 'warn',
  assigned: 'info',
  done: 'ok',
  rejected: 'danger',
  withdrawn: 'danger'
};

function statusTone(group, status) {
  const table = group === 'vehicle' ? VEHICLE : group === 'meeting' ? MEETING : null;
  const tone = table && table[status];
  if (!tone) {
    console.warn('Unknown status: ' + group + '/' + status);
    return 'mute';
  }
  return tone;
}

module.exports = {
  statusTone
};
