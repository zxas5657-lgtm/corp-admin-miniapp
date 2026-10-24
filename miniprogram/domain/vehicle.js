'use strict';

const { nowParts } = require('./dates');
const { can } = require('./permissions');

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

function availableActions(vehicle, role, personId) {
  const transitions = TRANSITIONS[vehicle && vehicle.status] || {};
  return Object.keys(transitions).filter((action) => (
    can(role, ACTION_CAP[action]) &&
    (action !== 'withdraw' || vehicle.applicantId === personId)
  ));
}

function transition(vehicle, action, payload, options) {
  const value = payload || {};
  const config = options || {};
  const drivers = Array.isArray(config.drivers) ? config.drivers : [];
  const transitions = TRANSITIONS[vehicle && vehicle.status] || {};
  if (!Object.prototype.hasOwnProperty.call(transitions, action)) {
    return { ok: false, code: 'vehicle.alreadyHandled' };
  }
  if (!can(config.role, ACTION_CAP[action])) {
    return { ok: false, code: 'permission.denied' };
  }
  if (action === 'withdraw' && vehicle.applicantId !== config.personId) {
    return { ok: false, code: 'permission.denied' };
  }
  if ((action === 'dispatch' || action === 'reassign') && !value.carId) {
    return { ok: false, code: 'vehicle.car.required' };
  }
  if (action === 'reject' && (typeof value.reason !== 'string' || value.reason.trim() === '')) {
    return { ok: false, code: 'vehicle.reject.reasonRequired' };
  }

  const next = { ...vehicle, status: transitions[action] };
  if (action === 'dispatch' || action === 'reassign') {
    const timestamp = nowParts(config.now);
    next.carId = value.carId;
    next.driverId = drivers.includes(config.personId) ? config.personId : (vehicle.driverId || null);
    next.dispatchedAt = `${timestamp.date}T${timestamp.time}`;
    next.dispatchedBy = config.personId || null;
  } else if (action === 'reject') {
    next.rejectReason = value.reason.trim();
  } else if (action === 'complete') {
    const timestamp = nowParts(config.now);
    next.completedAt = `${timestamp.date}T${timestamp.time}`;
  } else if (action === 'cancelDispatch') {
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
};
