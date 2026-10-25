'use strict';

const i18n = require('../i18n/index');
const reference = require('../data/reference');
const tz = require('../domain/tz');
const { can } = require('../domain/permissions');
const { availableActions, carAvailability, seatWarning } = require('../domain/vehicle');
const { filterVehiclesByScope, vehicleBadgeCount, vehicleScopes } = require('../domain/roles');
const { vehicleVisibleTo } = require('../domain/visibility');
const { statusTone } = require('../utils/status-tone');
const STATUS_ORDER = ['pending', 'assigned', 'done', 'rejected', 'withdrawn'];
const ACTION_KINDS = {
  dispatch: 'primary',
  reject: 'danger',
  withdraw: 'danger',
  cancelDispatch: 'danger',
};
function actorValue(config) {
  return config.actor || { role: config.role, personId: config.personId, dispatcher: false };
}
function personName(personId, refs) {
  const person = refs.personById(personId);
  return person ? i18n.localName(person) : '';
}
function carLabel(car) {
  if (!car) return '';
  const model = i18n.displayText(car.model);
  return model ? `${car.plate} · ${model}` : car.plate;
}
function timestampText(value, viewerTz) {
  if (!value) return null;
  const local = tz.toZoned(new Date(value), viewerTz);
  return i18n.t('vehicle.when', { day: i18n.fmt.dayHeading(local.date), time: local.time });
}
function departureText(vehicle, viewerTz) {
  const local = tz.toZoned(new Date(vehicle.departAt), viewerTz);
  return i18n.t('vehicle.when', { day: i18n.fmt.dayHeading(local.date), time: local.time });
}
function vehicleStatusText(status) {
  return STATUS_ORDER.includes(status)
    ? i18n.t('status.vehicle.' + status)
    : i18n.t('status.unknown');
}
function vehicleItemView(vehicle, refs, viewerTz) {
  return {
    id: vehicle.id,
    title: i18n.displayText(vehicle.reason),
    whenText: departureText(vehicle, viewerTz),
    destination: i18n.displayText(vehicle.destination),
    applicantName: personName(vehicle.applicantId, refs),
    statusText: vehicleStatusText(vehicle.status),
    tone: statusTone(
      'vehicle',
      STATUS_ORDER.includes(vehicle.status) ? vehicle.status : 'withdrawn',
    ),
  };
}
function emptyView(allVehicles, visibleVehicles, actor, canRequest, scope) {
  if (visibleVehicles.length > 0) return null;
  const actionText = canRequest ? i18n.t('vehicle.action.new') : null;
  if (can(actor, 'vehicle.dispatch') && scope === 'todo')
    return {
      kind: 'noData',
      title: i18n.t('vehicle.empty.fleetTitle'),
      body: i18n.t('vehicle.empty.fleetBody'),
      actionText: null,
    };
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
  const actor = actorValue(config);
  const viewerTz = config.viewerTz || 'Asia/Shanghai';
  const allVehicles = Array.isArray(state.vehicles) ? state.vehicles : [];
  const visible = allVehicles.filter((vehicle) => vehicleVisibleTo(actor, vehicle, config.ctx));
  const scopes = vehicleScopes(actor);
  const defaultScope = scopes.find((item) => item.default);
  const activeScope = scopes.some((item) => item.key === config.scope)
    ? config.scope
    : defaultScope.key;
  const scoped = filterVehiclesByScope(visible, activeScope, { actor });
  const groups = STATUS_ORDER.map((status) => {
    const items = scoped
      .filter((vehicle) => vehicle.status === status)
      .sort(
        (left, right) =>
          String(left.departAt).localeCompare(String(right.departAt)) ||
          String(left.id).localeCompare(String(right.id)),
      )
      .map((vehicle) => vehicleItemView(vehicle, refs, viewerTz));
    return items.length > 0 ? { status, heading: i18n.t('status.vehicle.' + status), items } : null;
  }).filter(Boolean);
  const canRequest = can(actor, 'vehicle.request');
  return {
    scopes: scopes.map((item) => ({
      key: item.key,
      label: i18n.t('vehicle.scope.' + item.key),
      active: item.key === activeScope,
    })),
    groups,
    empty: emptyView(visible, scoped, actor, canRequest, activeScope),
    requestButton: {
      text: i18n.t('vehicle.action.new'),
      disabled: !canRequest,
      reason: canRequest ? null : i18n.t('vehicle.action.requestDisabled'),
    },
    badgeCount: vehicleBadgeCount(actor, visible),
  };
}
function detailSteps(vehicle, viewerTz) {
  if (vehicle.status === 'rejected' || vehicle.status === 'withdrawn') return null;
  const steps = [
    { key: 'submitted', timestamp: vehicle.createdAt },
    { key: 'dispatched', timestamp: vehicle.dispatchedAt },
    { key: 'completed', timestamp: vehicle.completedAt },
  ];
  const current =
    vehicle.status === 'pending'
      ? 'dispatched'
      : vehicle.status === 'assigned'
        ? 'completed'
        : null;
  return steps.map((step, index) => ({
    key: step.key,
    label: i18n.t('vehicle.step.' + step.key),
    state:
      vehicle.status === 'done' ||
      (vehicle.status === 'assigned' && index < 2) ||
      (vehicle.status === 'pending' && index < 1)
        ? 'done'
        : step.key === current
          ? 'current'
          : 'todo',
    timeText: timestampText(step.timestamp, viewerTz),
  }));
}
function vehicleDetailView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const actor = actorValue(config);
  const viewerTz = config.viewerTz || 'Asia/Shanghai';
  const vehicle = (state.vehicles || []).find((item) => item.id === config.id);
  if (!vehicle || !vehicleVisibleTo(actor, vehicle, config.ctx))
    return {
      notFound: true,
      title: i18n.t('vehicle.detail.notFoundTitle'),
      body: i18n.t('vehicle.detail.notFoundBody'),
    };
  const car = vehicle.carId ? refs.carById(vehicle.carId) : null;
  const warnings = [];
  const capacity = seatWarning(car, vehicle.passengers);
  if (capacity) warnings.push(i18n.t('error.' + capacity.code, capacity));
  const actions = availableActions(vehicle, actor);
  const now = new Date(config.now);
  if (actions.includes('complete') && new Date(vehicle.departAt).getTime() > now.getTime())
    warnings.push(i18n.t('error.vehicle.complete.beforeDeparture'));
  return {
    notFound: false,
    title: i18n.displayText(vehicle.reason),
    statusText: vehicleStatusText(vehicle.status),
    tone: statusTone(
      'vehicle',
      STATUS_ORDER.includes(vehicle.status) ? vehicle.status : 'withdrawn',
    ),
    steps: detailSteps(vehicle, viewerTz),
    rejectBanner:
      vehicle.status === 'rejected' ? { text: i18n.displayText(vehicle.rejectReason) } : null,
    cells: [
      {
        key: 'reason',
        label: i18n.t('vehicle.detail.reason'),
        value: i18n.displayText(vehicle.reason),
      },
      {
        key: 'destination',
        label: i18n.t('vehicle.detail.destination'),
        value: i18n.displayText(vehicle.destination),
      },
      {
        key: 'departure',
        label: i18n.t('vehicle.detail.departure'),
        value: departureText(vehicle, viewerTz),
      },
      {
        key: 'passengers',
        label: i18n.t('vehicle.detail.passengers'),
        value: i18n.tn('vehicle.passengerCount', vehicle.passengers),
      },
      {
        key: 'applicant',
        label: i18n.t('vehicle.detail.applicant'),
        value: personName(vehicle.applicantId, refs),
      },
      { key: 'car', label: i18n.t('vehicle.detail.car'), value: carLabel(car) },
      {
        key: 'driver',
        label: i18n.t('vehicle.detail.driver'),
        value: personName(vehicle.driverId, refs),
      },
      { key: 'note', label: i18n.t('vehicle.detail.note'), value: i18n.displayText(vehicle.note) },
    ],
    actions: actions.map((key) => ({
      key,
      label: i18n.t('vehicle.action.' + key),
      kind: ACTION_KINDS[key] || 'secondary',
    })),
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
        departAt: vehicle.departAt,
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
    seatWarning: warning ? i18n.t('error.' + warning.code, warning) : null,
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
  const zone = config.viewerTz || 'Asia/Shanghai';
  const local = tz.toZoned(config.now, zone);
  let date = local.date;
  let hour = Number(local.time.slice(0, 2)) + 1;
  if (hour >= 23) {
    date = require('../domain/dates').addDays(date, 1);
    hour = 9;
  }
  return {
    reason: '',
    destination: '',
    date,
    time: String(hour).padStart(2, '0') + ':00',
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
