'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../miniprogram/i18n');
const reference = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const { parseLocalDateTime } = require('../miniprogram/domain/dates');
const {
  dispatchSheetView,
  rejectSheetView,
  vehicleDetailView,
  vehicleFormDefaults,
  vehicleFormLabels,
  vehicleListView,
} = require('../miniprogram/viewmodels/vehicles');

const now = parseLocalDateTime('2026-10-24T09:20');

function walk(value) {
  if (typeof value === 'string') {
    assert.equal(value.includes('{'), false, `unresolved placeholder: ${value}`);
    assert.equal(/^[a-z]+(\.[a-zA-Z]+)+$/.test(value), false, `raw i18n key: ${value}`);
  } else if (Array.isArray(value)) {
    for (const item of value) walk(item);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      assert.notEqual(child, undefined);
      walk(child);
    }
  }
}

test.afterEach(() => i18n._resetForTests());

test('vehicle list scopes, groups, badges, and request permissions are role-aware', () => {
  const state = seed();
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    const driver = vehicleListView({ state, role: 'driver', personId: 'p-zhao', now, refs: reference });
    assert.equal(driver.scopes.find((item) => item.key === 'todo').active, true);
    assert.deepEqual(driver.groups.flatMap((group) => group.items.map((item) => item.id)), ['v4', 'v3']);
    assert.equal(driver.badgeCount, 1);
    assert.equal(driver.requestButton.disabled, true);

    const admin = vehicleListView({ state, role: 'admin', personId: 'p-lin', now, refs: reference });
    assert.deepEqual(admin.groups.flatMap((group) => group.items.map((item) => item.id)), ['v3', 'v1']);
    assert.equal(admin.scopes.find((item) => item.key === 'mine').active, true);
    assert.equal(admin.requestButton.disabled, false);

    const reception = vehicleListView({ state, role: 'reception', personId: 'p-zhou', now, refs: reference });
    assert.deepEqual(reception.groups.flatMap((group) => group.items.map((item) => item.id)), ['v4']);
    walk(driver);
    walk(admin);
    walk(reception);
  }
});

test('vehicle detail shows audit steps, rejected banner, cells, actions, and warnings', () => {
  const state = seed();
  i18n._resetForTests();
  i18n.setDevMode(false);
  const detail = vehicleDetailView({ state, id: 'v3', role: 'driver', personId: 'p-zhao', now, refs: reference });
  assert.deepEqual(detail.steps.map((step) => [step.key, step.state]), [
    ['submitted', 'done'], ['dispatched', 'done'], ['completed', 'current'],
  ]);
  assert.equal(detail.steps[0].timeText.includes('10'), true);
  assert.equal(detail.cells.find((cell) => cell.key === 'passengers').value, '2 位乘车人');
  assert.equal(detail.actions.find((action) => action.key === 'cancelDispatch').kind, 'danger');
  assert.equal(detail.warnings.length, 1);

  const rejected = vehicleDetailView({ state, id: 'v1', role: 'admin', personId: 'p-lin', now, refs: reference });
  assert.equal(rejected.steps, null);
  assert.equal(typeof rejected.rejectBanner.text, 'string');
  assert.equal(rejected.rejectBanner.text.includes('{'), false);
  assert.equal(vehicleDetailView({ state, id: 'missing', now, refs: reference }).notFound, true);
});

test('dispatch and reject sheets localize availability, capacity, and required copy', () => {
  const state = seed();
  state.vehicles.push({
    ...state.vehicles[3],
    id: 'busy',
    date: '2026-10-27',
    time: '09:00',
    status: 'assigned',
    carId: 'a6',
  });
  state.vehicles[3].passengers = 6;
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    const sheet = dispatchSheetView({ state, id: 'v4', now, refs: reference, selectedCarId: 'a6' });
    const car = sheet.cars.find((item) => item.id === 'a6');
    assert.equal(car.available, false);
    assert.equal(typeof car.busyText, 'string');
    assert.equal(sheet.seatWarning.includes('{'), false);
    assert.equal(sheet.confirmDisabled, true);
    walk(sheet);
    walk(rejectSheetView());
  }
});

test('vehicle form labels and defaults follow the meeting form pattern', () => {
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    const labels = vehicleFormLabels();
    assert.equal(labels.passengers.length > 0, true);
    assert.equal(labels.notePlaceholder.includes('{'), false);
    assert.equal(vehicleFormDefaults({ now: parseLocalDateTime('2026-10-24T23:10') }).date, '2026-10-25');
    assert.equal(vehicleFormDefaults({ now: parseLocalDateTime('2026-10-24T23:10') }).time, '09:00');
    assert.equal(vehicleFormDefaults({ now }).passengers, 1);
    walk(labels);
  }
});
