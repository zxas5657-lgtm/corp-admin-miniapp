'use strict';

const { can, normalizeRole } = require('./permissions');

function actorValue(actor) {
  return typeof actor === 'string'
    ? { role: normalizeRole(actor), personId: null, dispatcher: false }
    : actor || {};
}
function roleHome(role) {
  return normalizeRole(role) === 'driver' ? 'vehicles' : 'schedule';
}
function vehicleBadgeCount(actorInput, vehicles) {
  const actor = actorValue(actorInput);
  if (actor.dispatcher || can(actor, 'vehicle.dispatch'))
    return (vehicles || []).filter((vehicle) => vehicle.status === 'pending').length;
  if (normalizeRole(actor.role) === 'driver')
    return (vehicles || []).filter(
      (vehicle) => vehicle.status === 'assigned' && vehicle.driverId === actor.personId,
    ).length;
  return 0;
}
function vehicleScopes(actorInput) {
  const actor = actorValue(actorInput);
  const todo =
    actor.dispatcher || can(actor, 'vehicle.dispatch') || normalizeRole(actor.role) === 'driver';
  return [
    { key: 'all', default: false },
    { key: 'mine', default: !todo },
    ...(todo ? [{ key: 'todo', default: true }] : []),
  ];
}
function filterVehiclesByScope(vehicles, scope, options) {
  const actor = actorValue(options && options.actor ? options.actor : options && options.role);
  if (scope === 'all') return [...(vehicles || [])];
  if (scope === 'mine')
    return (vehicles || []).filter((vehicle) => vehicle.applicantId === actor.personId);
  if (scope === 'todo') {
    return (vehicles || []).filter(
      (vehicle) =>
        ((actor.dispatcher || can(actor, 'vehicle.dispatch')) && vehicle.status === 'pending') ||
        (normalizeRole(actor.role) === 'driver' &&
          vehicle.status === 'assigned' &&
          vehicle.driverId === actor.personId),
    );
  }
  return [];
}
function scheduleScopes(actorInput) {
  const actor = actorValue(actorInput);
  const leader = normalizeRole(actor.role) === 'leader';
  return [
    { key: 'all', default: leader },
    { key: 'mine', default: !leader },
  ];
}
function filterScheduleByScope(items, scope, options) {
  if (scope === 'all') return [...(items || [])];
  const actor = actorValue(options && options.actor ? options.actor : options && options.role);
  return (items || []).filter((item) => {
    const record = item.ref || item;
    if (item.kind === 'meeting' || record.kind === 'meeting') {
      return (
        record.organizerId === actor.personId ||
        (record.attendeeIds || []).includes(actor.personId) ||
        (record.leaderIds || []).includes(actor.personId)
      );
    }
    if (item.kind === 'vehicle' || record.departAt !== undefined) {
      return (
        record.applicantId === actor.personId ||
        record.driverId === actor.personId ||
        record.forLeaderId === actor.personId
      );
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
