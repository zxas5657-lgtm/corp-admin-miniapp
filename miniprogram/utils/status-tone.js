'use strict';

const MEETING = {
  upcoming: 'warn',
  ongoing: 'info',
  done: 'mute',
  cancelled: 'mute'
};

const VEHICLE = {
  pending: 'warn',
  assigned: 'info',
  done: 'ok',
  rejected: 'danger',
  withdrawn: 'mute'
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
