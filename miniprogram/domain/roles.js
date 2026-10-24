'use strict';

const { can } = require('./permissions');

function roleHome(role) {
  return role === 'driver' ? 'vehicles' : 'schedule';
}

function vehicleBadgeCount(role, personId, vehicles) {
  if (role !== 'driver') return 0;
  // TODO: add read tracking for requester-side "my requests that changed" counts.
  return (vehicles || []).filter((vehicle) => vehicle.status === 'pending').length;
}

function vehicleScopes(role) {
  const dispatcher = can(role, 'vehicle.dispatch');
  return [
    { key: 'all', default: false },
    { key: 'mine', default: !dispatcher },
    ...(dispatcher ? [{ key: 'todo', default: true }] : []),
  ];
}

function filterVehiclesByScope(vehicles, scope, options) {
  const config = options || {};
  if (scope === 'all') return [...(vehicles || [])];
  if (scope === 'mine') {
    return (vehicles || []).filter((vehicle) => vehicle.applicantId === config.personId);
  }
  if (scope === 'todo' && can(config.role, 'vehicle.dispatch')) {
    return (vehicles || []).filter((vehicle) => (
      vehicle.status === 'pending' ||
      (vehicle.status === 'assigned' && vehicle.driverId === config.personId)
    ));
  }
  return [];
}

function scheduleScopes(role) {
  const leader = role === 'leader';
  return [
    { key: 'all', default: leader },
    { key: 'mine', default: !leader },
  ];
}

function filterScheduleByScope(items, scope, options) {
  if (scope === 'all') return [...(items || [])];
  const config = options || {};
  return (items || []).filter((item) => {
    const record = item.ref || item;
    if (item.kind === 'meeting') {
      return record.organizerId === config.personId
        || (record.attendeeIds || []).includes(config.personId);
    }
    if (item.kind === 'vehicle') {
      return record.applicantId === config.personId || record.driverId === config.personId;
    }
    return false;
  });
}

module.exports = {
  roleHome,
  vehicleBadgeCount,
  vehicleScopes,
  filterVehiclesByScope,
  scheduleScopes,
  filterScheduleByScope,
};
