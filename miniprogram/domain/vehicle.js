'use strict';

const { isDateStr, isTimeStr } = require('./dates');
const tzUtil = require('./tz');
const { can, normalizeRole } = require('./permissions');

const TRANSITIONS = Object.freeze({
  pending: { dispatch: 'assigned', reject: 'rejected', withdraw: 'withdrawn' },
  assigned: { complete: 'done', reassign: 'assigned', cancelDispatch: 'pending' },
  done: {},
  rejected: {},
  withdrawn: {},
});
const ACTION_CAP = Object.freeze({
  dispatch: 'vehicle.dispatch',
  reject: 'vehicle.reject',
  complete: 'vehicle.complete',
  reassign: 'vehicle.dispatch',
  cancelDispatch: 'vehicle.dispatch',
  withdraw: 'vehicle.request',
});

function asDate(value) {
  const result = value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}
function iso(value) {
  return asDate(value).toISOString();
}
function driverIds(drivers) {
  return (drivers || [])
    .map((driver) =>
      typeof driver === 'string' ? driver : driver && (driver.id || driver.personId),
    )
    .filter(Boolean);
}

function carAvailability(cars, vehicles, options) {
  const config = options || {};
  const target = asDate(config.departAt);
  const windowMinutes = config.windowMinutes === undefined ? 120 : config.windowMinutes;
  const start = target ? target.getTime() : NaN;
  const end = start + windowMinutes * 60000;
  return (cars || []).map((car) => {
    const busy = (vehicles || []).find((vehicle) => {
      const depart = asDate(vehicle.departAt);
      if (
        vehicle.id === config.excludeVehicleId ||
        vehicle.status !== 'assigned' ||
        vehicle.carId !== car.id ||
        !depart
      )
        return false;
      const otherStart = depart.getTime();
      return start < otherStart + windowMinutes * 60000 && otherStart < end;
    });
    return { carId: car.id, available: !busy, busyWith: busy ? busy.id : null };
  });
}

function resourceBusy(vehicles, field, id, departAt, options) {
  const config = options || {};
  const target = asDate(departAt);
  const windowMinutes = config.windowMinutes === undefined ? 120 : config.windowMinutes;
  if (!target) return false;
  return (vehicles || []).some((vehicle) => {
    if (
      vehicle.id === config.excludeVehicleId ||
      vehicle.status !== 'assigned' ||
      vehicle[field] !== id
    )
      return false;
    const other = asDate(vehicle.departAt);
    return other && Math.abs(other.getTime() - target.getTime()) < windowMinutes * 60000;
  });
}

function seatWarning(car, passengers) {
  if (!car || !Number.isInteger(passengers) || passengers <= car.seats) return null;
  return { code: 'vehicle.seats.exceeded', seats: car.seats, passengers };
}

function validateVehicle(input) {
  const value = input || {};
  const errors = [];
  if (typeof value.reason !== 'string' || value.reason.trim() === '')
    errors.push({ field: 'reason', code: 'vehicle.reason.required' });
  else if (value.reason.trim().length > 40)
    errors.push({ field: 'reason', code: 'vehicle.reason.tooLong' });
  if (typeof value.destination !== 'string' || value.destination.trim() === '')
    errors.push({ field: 'destination', code: 'vehicle.destination.required' });
  else if (value.destination.trim().length > 60)
    errors.push({ field: 'destination', code: 'vehicle.destination.tooLong' });
  if (!isDateStr(value.date)) errors.push({ field: 'date', code: 'vehicle.date.required' });
  if (!isTimeStr(value.time)) errors.push({ field: 'time', code: 'vehicle.time.required' });
  if (!Number.isInteger(value.passengers) || value.passengers < 1 || value.passengers > 6)
    errors.push({ field: 'passengers', code: 'vehicle.passengers.range' });
  if (typeof value.note === 'string' && value.note.trim().length > 200)
    errors.push({ field: 'note', code: 'vehicle.note.tooLong' });
  return errors;
}

function createVehicleRequest(input, options) {
  const value = input || {};
  const config = options || {};
  const actor = config.actor || {};
  if (!can(actor, 'vehicle.request')) return { ok: false, code: 'permission.denied' };
  const zone = config.tz || 'Asia/Shanghai';
  const depart = tzUtil.fromZoned(value.date, value.time, zone);
  const created = asDate(config.now) || new Date();
  const role = normalizeRole(actor.role);
  const forLeaderId = role === 'leader' ? actor.personId : config.forLeaderId || null;
  return {
    id: config.id,
    reason: typeof value.reason === 'string' ? value.reason.trim() : '',
    destination: typeof value.destination === 'string' ? value.destination.trim() : '',
    departAt: depart ? depart.toISOString() : null,
    tz: zone,
    passengers: value.passengers,
    applicantId: actor.personId,
    forLeaderId,
    itemId: null,
    note: typeof value.note === 'string' ? value.note.trim() : '',
    status: 'pending',
    carId: null,
    driverId: null,
    rejectReason: '',
    createdAt: created.toISOString(),
    dispatchedAt: null,
    dispatchedBy: null,
    completedAt: null,
    rev: 0,
  };
}

function availableActions(vehicle, actor) {
  if (!vehicle) return [];
  const role = normalizeRole(actor && actor.role);
  const actions = [];
  if (vehicle.status === 'pending') {
    if (can(actor, 'vehicle.dispatch')) actions.push('dispatch');
    if (can(actor, 'vehicle.reject')) actions.push('reject');
    if (vehicle.applicantId === actor.personId && can(actor, 'vehicle.request'))
      actions.push('withdraw');
  } else if (vehicle.status === 'assigned') {
    if (vehicle.driverId === actor.personId && can(actor, 'vehicle.complete'))
      actions.push('complete');
    if (can(actor, 'vehicle.dispatch')) actions.push('reassign', 'cancelDispatch');
  }
  return actions;
}

function transition(vehicle, action, payload, options) {
  const value = payload || {};
  const config = options || {};
  const actor = config.actor || {};
  const transitions = TRANSITIONS[vehicle && vehicle.status] || {};
  if (!Object.prototype.hasOwnProperty.call(transitions, action))
    return { ok: false, code: 'vehicle.alreadyHandled' };
  if (
    action === 'complete' &&
    !(vehicle.driverId === actor.personId && can(actor, 'vehicle.complete'))
  )
    return { ok: false, code: 'permission.denied' };
  if (
    action === 'withdraw' &&
    !(vehicle.applicantId === actor.personId && can(actor, 'vehicle.request'))
  )
    return { ok: false, code: 'permission.denied' };
  if (
    ['dispatch', 'reassign', 'reject', 'cancelDispatch'].includes(action) &&
    !can(actor, ACTION_CAP[action])
  )
    return { ok: false, code: 'permission.denied' };
  if ((action === 'dispatch' || action === 'reassign') && !value.carId)
    return { ok: false, code: 'vehicle.car.required' };
  const now = asDate(config.now);
  if (
    action === 'complete' &&
    now &&
    asDate(vehicle.departAt) &&
    now.getTime() < asDate(vehicle.departAt).getTime()
  )
    return { ok: false, code: 'vehicle.complete.beforeDeparture' };
  if (action === 'dispatch' || action === 'reassign') {
    const ids = driverIds(config.drivers);
    const driverId = value.driverId || (ids.length === 1 ? ids[0] : null);
    if (!driverId || !ids.includes(driverId)) return { ok: false, code: 'vehicle.driver.required' };
    const availability = carAvailability(config.cars || [], config.vehicles || [], {
      departAt: vehicle.departAt,
      excludeVehicleId: vehicle.id,
      windowMinutes: config.windowMinutes,
    });
    const selected = availability.find((item) => item.carId === value.carId);
    if (selected && !selected.available) return { ok: false, code: 'vehicle.car.busy' };
  }
  if (action === 'reject' && (typeof value.reason !== 'string' || value.reason.trim() === ''))
    return { ok: false, code: 'vehicle.reject.reasonRequired' };
  const timestamp = now ? now.toISOString() : new Date().toISOString();
  const next = {
    ...vehicle,
    status: transitions[action],
    updatedAt: timestamp,
    rev: (vehicle.rev || 0) + 1,
  };
  if (action === 'dispatch' || action === 'reassign') {
    const ids = driverIds(config.drivers);
    next.carId = value.carId;
    next.driverId = value.driverId || (ids.length === 1 ? ids[0] : null);
    next.dispatchedAt = timestamp;
    next.dispatchedBy = actor.personId || null;
  } else if (action === 'reject') next.rejectReason = value.reason.trim();
  else if (action === 'complete') next.completedAt = timestamp;
  else if (action === 'cancelDispatch') {
    next.carId = null;
    next.driverId = null;
    next.dispatchedAt = null;
    next.dispatchedBy = null;
  }
  return { ok: true, vehicle: next };
}

module.exports = {
  TRANSITIONS,
  ACTION_CAP,
  availableActions,
  transition,
  carAvailability,
  resourceBusy,
  seatWarning,
  validateVehicle,
  createVehicleRequest,
};
