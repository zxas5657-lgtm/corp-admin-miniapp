'use strict';

const { can, normalizeRole } = require('./permissions');

function actorRole(actor) {
  return normalizeRole(actor && actor.role);
}

function supportsLeader(actor, leaderId, ctx) {
  const supports = (ctx && ctx.supports) || {};
  return Array.isArray(supports[actor.personId]) && supports[actor.personId].includes(leaderId);
}

function leaderCheck(actor, item, ctx) {
  const leaderIds = item.leaderIds || [];
  const role = actorRole(actor);
  const direct =
    item.organizerId === actor.personId || (item.attendeeIds || []).includes(actor.personId);
  if (direct) return true;
  const leaderActor =
    role === 'leader' ||
    Boolean(ctx && typeof ctx.isLeader === 'function' && ctx.isLeader(actor.personId));
  if (leaderActor) return leaderIds.includes(actor.personId);
  if (role === 'secretary')
    return leaderIds.some((leaderId) => supportsLeader(actor, leaderId, ctx));
  if (role === 'secretaryAdmin') return leaderIds.length > 0;
  return false;
}

function itemVisibleTo(actor, item, ctx) {
  if (!actor || !item) return false;
  const role = actorRole(actor);
  if (item.kind === 'visit' && (role === 'receptionist' || role === 'receptionAdmin')) return true;
  return leaderCheck(actor, item, ctx);
}

function canEditItem(actor, item, ctx) {
  if (!actor || !item) return false;
  const role = actorRole(actor);
  if (item.kind === 'visit' && role === 'receptionist') return item.createdBy === actor.personId;
  if (item.kind === 'visit' && role === 'receptionAdmin') return true;
  if (role === 'receptionist' || role === 'receptionAdmin') return false;
  if (item.organizerId === actor.personId) return true;
  if (
    role === 'leader' ||
    Boolean(ctx && typeof ctx.isLeader === 'function' && ctx.isLeader(actor.personId))
  )
    return (item.leaderIds || []).includes(actor.personId);
  if (role === 'secretary')
    return (item.leaderIds || []).some((leaderId) => supportsLeader(actor, leaderId, ctx));
  if (role === 'secretaryAdmin') return (item.leaderIds || []).length > 0;
  return false;
}

function vehicleVisibleTo(actor, vehicle, ctx) {
  if (!actor || !vehicle) return false;
  const role = actorRole(actor);
  const isApplicant = actor.personId === vehicle.applicantId;
  if (isApplicant) return true;
  if (actor.dispatcher || can(actor, 'vehicle.dispatch')) return true;
  if (role === 'secretaryAdmin' || role === 'receptionist' || role === 'receptionAdmin')
    return true;
  if (role === 'secretary') {
    if (!vehicle.forLeaderId) return true;
    return supportsLeader(actor, vehicle.forLeaderId, ctx);
  }
  if (role === 'driver') return vehicle.forLeaderId ? vehicle.driverId === actor.personId : true;
  if (vehicle.forLeaderId) return vehicle.forLeaderId === actor.personId;
  return false;
}

function visibleItems(actor, items, ctx) {
  return (items || []).filter((item) => itemVisibleTo(actor, item, ctx));
}

function visibleVehicles(actor, vehicles, ctx) {
  return (vehicles || []).filter((vehicle) => vehicleVisibleTo(actor, vehicle, ctx));
}

function busySlots(actor, items, leaderId, day, viewerTz, ctx) {
  if (!actor || !day) return [];
  const role = actorRole(actor);
  const canReadAllVisits = role === 'receptionist' || role === 'receptionAdmin';
  return (items || [])
    .filter((item) => {
      if (item.status === 'cancelled' || item.allDay || !item.startAt || !item.endAt) return false;
      if (leaderId && !(item.leaderIds || []).includes(leaderId)) return false;
      if (!canReadAllVisits && !itemVisibleTo(actor, item, ctx)) return false;
      const zone = viewerTz || 'Asia/Shanghai';
      const startDay = require('./tz').toZoned(new Date(item.startAt), zone).date;
      const endDay = require('./tz').toZoned(new Date(item.endAt), zone).date;
      return startDay <= day && endDay >= day;
    })
    .map((item) => ({ startAt: item.startAt, endAt: item.endAt }));
}

module.exports = {
  itemVisibleTo,
  canEditItem,
  vehicleVisibleTo,
  visibleItems,
  visibleVehicles,
  busySlots,
};
