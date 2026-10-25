'use strict';

const i18n = require('../i18n');
const reference = require('../data/reference');
const { nowParts, parseLocalDateTime, toDateStr, toTimeStr } = require('../domain/dates');
const { can } = require('../domain/permissions');
const {
  availableActions,
  carAvailability,
  seatWarning,
} = require('../domain/vehicle');
const {
  filterVehiclesByScope,
  vehicleBadgeCount,
  vehicleScopes,
} = require('../domain/roles');
const { statusTone } = require('../utils/status-tone');

const STATUS_ORDER = ['pending', 'assigned', 'done', 'rejected', 'withdrawn'];
const ACTION_KINDS = {
  dispatch: 'primary',
  reject: 'danger',
  withdraw: 'danger',
  cancelDispatch: 'danger',
};

function personName(personId, refs) {
  const person = refs.personById(personId);
  return person ? i18n.localName(person) : '';
}

function carLabel(car) {
  if (!car) return '';
  const model = i18n.displayText(car.model);
  return model ? `${car.plate} · ${model}` : car.plate;
}

function timestampText(value) {
  if (typeof value !== 'string') return null;
  const parsed = parseLocalDateTime(value);
  if (!parsed) return null;
  const parts = nowParts(parsed);
  return i18n.t('vehicle.when', { day: i18n.fmt.dayHeading(parts.date), time: parts.time });
}

function departureText(vehicle) {
  return i18n.t('vehicle.when', {
    day: i18n.fmt.dayHeading(vehicle.date),
    time: vehicle.time,
  });
}

function vehicleStatusText(status) {
  return STATUS_ORDER.includes(status)
    ? i18n.t(`status.vehicle.${status}`)
    : i18n.t('status.unknown');
}

function vehicleItemView(vehicle, refs) {
  return {
    id: vehicle.id,
    title: i18n.displayText(vehicle.reason),
    whenText: departureText(vehicle),
    destination: i18n.displayText(vehicle.destination),
    applicantName: personName(vehicle.applicantId, refs),
    statusText: vehicleStatusText(vehicle.status),
    tone: statusTone('vehicle', STATUS_ORDER.includes(vehicle.status) ? vehicle.status : 'withdrawn'),
  };
}

function emptyView(allVehicles, visibleVehicles, role, canRequest, scope) {
  if (visibleVehicles.length > 0) return null;
  const actionText = canRequest ? i18n.t('vehicle.action.new') : null;
  if (can(role, 'vehicle.dispatch') && scope === 'todo') {
    return {
      kind: 'noData',
      title: i18n.t('vehicle.empty.fleetTitle'),
      body: i18n.t('vehicle.empty.fleetBody'),
      actionText: null,
    };
  }
  const noData = allVehicles.length === 0;
  return {
    kind: noData ? 'noData' : 'filtered',
    title: i18n.t(noData ? 'vehicle.empty.requesterTitle' : 'vehicle.empty.filteredTitle'),
    body: i18n.t(noData ? 'vehicle.empty.requesterBody' : 'vehicle.empty.filteredBody'),
    actionText,
  };
}

function vehicleListView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const vehicles = Array.isArray(state.vehicles) ? state.vehicles : [];
  const scopes = vehicleScopes(config.role);
  const defaultScope = scopes.find((item) => item.default);
  const activeScope = scopes.some((item) => item.key === config.scope)
    ? config.scope
    : defaultScope.key;
  const visible = filterVehiclesByScope(vehicles, activeScope, {
    role: config.role,
    personId: config.personId,
  });
  const groups = STATUS_ORDER.map((status) => {
    const items = visible
      .filter((vehicle) => vehicle.status === status)
      .sort((left, right) => (
        left.date.localeCompare(right.date)
        || left.time.localeCompare(right.time)
        || String(left.id).localeCompare(String(right.id))
      ))
      .map((vehicle) => vehicleItemView(vehicle, refs));
    return items.length > 0
      ? { status, heading: i18n.t(`status.vehicle.${status}`), items }
      : null;
  }).filter(Boolean);
  const canRequest = can(config.role, 'vehicle.request');
  return {
    scopes: scopes.map((item) => ({
      key: item.key,
      label: i18n.t(`vehicle.scope.${item.key}`),
      active: item.key === activeScope,
    })),
    groups,
    empty: emptyView(vehicles, visible, config.role, canRequest, activeScope),
    requestButton: {
      text: i18n.t('vehicle.action.new'),
      disabled: !canRequest,
      reason: canRequest ? null : i18n.t('vehicle.action.requestDisabled'),
    },
    badgeCount: vehicleBadgeCount(config.role, config.personId, vehicles),
  };
}

function detailSteps(vehicle) {
  if (vehicle.status === 'rejected' || vehicle.status === 'withdrawn') return null;
  const steps = [
    { key: 'submitted', timestamp: vehicle.createdAt },
    { key: 'dispatched', timestamp: vehicle.dispatchedAt },
    { key: 'completed', timestamp: vehicle.completedAt },
  ];
  const current = vehicle.status === 'pending' ? 'dispatched'
    : vehicle.status === 'assigned' ? 'completed'
      : null;
  return steps.map((step, index) => ({
    key: step.key,
    label: i18n.t(`vehicle.step.${step.key}`),
    state: vehicle.status === 'done' || (vehicle.status === 'assigned' && index < 2) || (vehicle.status === 'pending' && index < 1)
      ? 'done'
      : step.key === current ? 'current' : 'todo',
    timeText: timestampText(step.timestamp),
  }));
}

function actionViews(vehicle, role, personId) {
  return availableActions(vehicle, role, personId).map((key) => ({
    key,
    label: i18n.t(`vehicle.action.${key}`),
    kind: ACTION_KINDS[key] || 'secondary',
  }));
}

function vehicleDetailView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const vehicle = (state.vehicles || []).find((item) => item.id === config.id);
  if (!vehicle) {
    return {
      notFound: true,
      title: i18n.t('vehicle.detail.notFoundTitle'),
      body: i18n.t('vehicle.detail.notFoundBody'),
    };
  }
  const car = vehicle.carId ? refs.carById(vehicle.carId) : null;
  const driverName = personName(vehicle.driverId, refs);
  const applicantName = personName(vehicle.applicantId, refs);
  const warnings = [];
  const capacity = seatWarning(car, vehicle.passengers);
  if (capacity) warnings.push(i18n.t(`error.${capacity.code}`, capacity));
  const actions = actionViews(vehicle, config.role, config.personId);
  const current = nowParts(config.now);
  if (actions.some((item) => item.key === 'complete')
      && `${current.date}T${current.time}` < `${vehicle.date}T${vehicle.time}`) {
    warnings.push(i18n.t('error.vehicle.complete.beforeDeparture'));
  }
  return {
    notFound: false,
    title: i18n.displayText(vehicle.reason),
    statusText: vehicleStatusText(vehicle.status),
    tone: statusTone('vehicle', STATUS_ORDER.includes(vehicle.status) ? vehicle.status : 'withdrawn'),
    steps: detailSteps(vehicle),
    rejectBanner: vehicle.status === 'rejected'
      ? { text: i18n.displayText(vehicle.rejectReason) }
      : null,
    cells: [
      { key: 'reason', label: i18n.t('vehicle.detail.reason'), value: i18n.displayText(vehicle.reason) },
      { key: 'destination', label: i18n.t('vehicle.detail.destination'), value: i18n.displayText(vehicle.destination) },
      { key: 'departure', label: i18n.t('vehicle.detail.departure'), value: departureText(vehicle) },
      { key: 'passengers', label: i18n.t('vehicle.detail.passengers'), value: i18n.tn('vehicle.passengerCount', vehicle.passengers) },
      { key: 'applicant', label: i18n.t('vehicle.detail.applicant'), value: applicantName },
      { key: 'car', label: i18n.t('vehicle.detail.car'), value: carLabel(car) },
      { key: 'driver', label: i18n.t('vehicle.detail.driver'), value: driverName },
      { key: 'note', label: i18n.t('vehicle.detail.note'), value: i18n.displayText(vehicle.note) },
    ],
    actions,
    warnings,
  };
}

function dispatchSheetView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const vehicle = (state.vehicles || []).find((item) => item.id === config.id);
  const cars = refs.CARS || [];
  const availability = vehicle
    ? carAvailability(cars, state.vehicles || [], {
      date: vehicle.date,
      time: vehicle.time,
      excludeVehicleId: config.id,
    })
    : cars.map((car) => ({ carId: car.id, available: true, busyWith: null }));
  const renderedCars = cars.map((car) => {
    const status = availability.find((item) => item.carId === car.id);
    return {
      id: car.id,
      label: carLabel(car),
      seatsText: i18n.tn('vehicle.seatCount', car.seats),
      available: Boolean(status && status.available),
      busyText: status && !status.available ? i18n.t('vehicle.dispatch.busy') : null,
      selected: car.id === config.selectedCarId,
    };
  });
  const selected = cars.find((car) => car.id === config.selectedCarId);
  const warning = vehicle && selected ? seatWarning(selected, vehicle.passengers) : null;
  const selectedStatus = availability.find((item) => item.carId === config.selectedCarId);
  return {
    title: i18n.t('vehicle.dispatch.title'),
    cars: renderedCars,
    seatWarning: warning ? i18n.t(`error.${warning.code}`, warning) : null,
    confirmText: i18n.t('vehicle.dispatch.confirm'),
    cancelText: i18n.t('vehicle.dispatch.cancel'),
    confirmDisabled: !selected || !selectedStatus || !selectedStatus.available,
  };
}

function rejectSheetView() {
  return {
    title: i18n.t('vehicle.reject.title'),
    placeholder: i18n.t('vehicle.reject.placeholder'),
    confirmText: i18n.t('vehicle.reject.confirm'),
    cancelText: i18n.t('vehicle.reject.cancel'),
  };
}

function vehicleFormLabels() {
  return {
    reason: i18n.t('vehicle.form.reason'),
    destination: i18n.t('vehicle.form.destination'),
    date: i18n.t('vehicle.form.date'),
    start: i18n.t('vehicle.form.start'),
    passengers: i18n.t('vehicle.form.passengers'),
    note: i18n.t('vehicle.form.note'),
    notePlaceholder: i18n.t('vehicle.form.notePlaceholder'),
    submit: i18n.t('vehicle.form.submit'),
    submitting: i18n.t('vehicle.form.submitting'),
  };
}

function vehicleFormDefaults(options) {
  const config = options || {};
  const current = new Date(config.now.getTime());
  const next = new Date(current.getTime());
  next.setHours(next.getHours() + 1, 0, 0, 0);
  if (next.getDate() !== current.getDate() || next.getHours() >= 23) {
    next.setDate(current.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  }
  return {
    reason: '',
    destination: '',
    date: toDateStr(next),
    time: toTimeStr(next),
    passengers: 1,
    note: '',
  };
}

module.exports = {
  vehicleListView,
  vehicleDetailView,
  dispatchSheetView,
  rejectSheetView,
  vehicleFormLabels,
  vehicleFormDefaults,
};
