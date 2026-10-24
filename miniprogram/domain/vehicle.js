'use strict';

const {
  isDateStr,
  isTimeStr,
  nowParts,
  toMinutes,
} = require('./dates');
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

function carAvailability(cars, vehicles, options) {
  const config = options || {};
  const date = config.date;
  const time = config.time;
  const windowMinutes = config.windowMinutes === undefined ? 120 : config.windowMinutes;
  const start = toMinutes(time);
  const end = start + windowMinutes;
  return (cars || []).map((car) => {
    const busyVehicle = (vehicles || []).find((vehicle) => {
      if (
        vehicle.id === config.excludeVehicleId ||
        vehicle.status !== 'assigned' ||
        vehicle.carId !== car.id ||
        vehicle.date !== date ||
        !isTimeStr(vehicle.time)
      ) return false;
      const otherStart = toMinutes(vehicle.time);
      const otherEnd = otherStart + windowMinutes;
      return start < otherEnd && otherStart < end;
    });
    return {
      carId: car.id,
      available: !busyVehicle,
      busyWith: busyVehicle ? busyVehicle.id : null,
    };
  });
}

function seatWarning(car, passengers) {
  if (!car || !Number.isInteger(passengers) || passengers <= car.seats) return null;
  return { code: 'vehicle.seats.exceeded', seats: car.seats, passengers };
}

function validateVehicle(input) {
  const value = input || {};
  const errors = [];
  if (typeof value.reason !== 'string' || value.reason.trim() === '') {
    errors.push({ field: 'reason', code: 'vehicle.reason.required' });
  } else if (value.reason.trim().length > 40) {
    errors.push({ field: 'reason', code: 'vehicle.reason.tooLong' });
  }
  if (typeof value.destination !== 'string' || value.destination.trim() === '') {
    errors.push({ field: 'destination', code: 'vehicle.destination.required' });
  } else if (value.destination.trim().length > 60) {
    errors.push({ field: 'destination', code: 'vehicle.destination.tooLong' });
  }
  if (!isDateStr(value.date)) errors.push({ field: 'date', code: 'vehicle.date.required' });
  if (!isTimeStr(value.time)) errors.push({ field: 'time', code: 'vehicle.time.required' });
  if (!Number.isInteger(value.passengers) || value.passengers < 1 || value.passengers > 6) {
    errors.push({ field: 'passengers', code: 'vehicle.passengers.range' });
  }
  if (typeof value.note === 'string' && value.note.trim().length > 200) {
    errors.push({ field: 'note', code: 'vehicle.note.tooLong' });
  }
  return errors;
}

function createVehicleRequest(input, options) {
  const value = input || {};
  const config = options || {};
  const created = nowParts(config.now);
  return {
    id: config.id,
    reason: typeof value.reason === 'string' ? value.reason.trim() : '',
    destination: typeof value.destination === 'string' ? value.destination.trim() : '',
    date: value.date,
    time: value.time,
    passengers: value.passengers,
    applicantId: config.applicantId,
    note: typeof value.note === 'string' ? value.note.trim() : '',
    status: 'pending',
    carId: null,
    driverId: null,
    rejectReason: '',
    createdAt: `${created.date}T${created.time}`,
    dispatchedAt: null,
    dispatchedBy: null,
    completedAt: null,
  };
}

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
  const vehicles = Array.isArray(config.vehicles) ? config.vehicles : [];
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
  if (action === 'complete') {
    const current = nowParts(config.now);
    if (`${current.date}T${current.time}` < `${vehicle.date}T${vehicle.time}`) {
      return { ok: false, code: 'vehicle.complete.beforeDeparture' };
    }
  }
  if (action === 'dispatch' || action === 'reassign') {
    const cars = Array.isArray(config.cars) && config.cars.length > 0
      ? config.cars
      : [{ id: value.carId }];
    const availability = carAvailability(cars, vehicles, {
      date: vehicle.date,
      time: vehicle.time,
      excludeVehicleId: vehicle.id,
      windowMinutes: config.windowMinutes,
    });
    const selected = availability.find((item) => item.carId === value.carId);
    if (selected && !selected.available) return { ok: false, code: 'vehicle.car.busy' };
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
  carAvailability,
  seatWarning,
  validateVehicle,
  createVehicleRequest,
};
