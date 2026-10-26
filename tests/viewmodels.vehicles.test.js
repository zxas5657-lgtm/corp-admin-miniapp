'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../miniprogram/i18n');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const { vehicleListView } = require('../miniprogram/viewmodels/vehicles');
test.afterEach(() => i18n._resetForTests());
test('vehicle list outputs contain translated strings and v3 values', () => {
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    const view = vehicleListView({
      state: seed(),
      actor: ref.actorFor('secretary'),
      now: new Date('2026-10-24T01:20:00Z'),
      viewerTz: 'Asia/Shanghai',
      refs: ref,
    });
    assert.equal(view.groups.length > 0, true);
    for (const group of view.groups)
      for (const item of group.items) {
        assert.equal(item.whenText.includes('{'), false);
        assert.equal(item.statusText.includes('{'), false);
      }
  }
});

test('vehicle list scopes groups badges and request permissions are actor-aware', () => {
  const vm = require('../miniprogram/viewmodels/vehicles');
  const state = seed();
  const driver = vm.vehicleListView({
    state,
    actor: ref.actorFor('driver'),
    now: new Date('2026-10-24T01:20:00Z'),
    viewerTz: 'Asia/Shanghai',
    refs: ref,
  });
  assert.deepEqual(
    driver.groups.flatMap((g) => g.items.map((x) => x.id)),
    ['v3'],
  );
  assert.equal(driver.badgeCount, 1);
  assert.equal(driver.requestButton.disabled, true);
  const dispatcher = vm.vehicleListView({
    state,
    actor: ref.actorFor('secretary'),
    now: new Date('2026-10-24T01:20:00Z'),
    viewerTz: 'Asia/Shanghai',
    refs: ref,
  });
  assert.deepEqual(
    dispatcher.groups.flatMap((g) => g.items.map((x) => x.id)),
    ['v4', 'v5'],
  );
  assert.equal(dispatcher.requestButton.disabled, false);
});
test('vehicle detail shows audit steps cells actions and warnings', () => {
  const vm = require('../miniprogram/viewmodels/vehicles');
  const detail = vm.vehicleDetailView({
    state: seed(),
    id: 'v3',
    actor: ref.actorFor('driver'),
    now: new Date('2026-10-24T01:20:00Z'),
    viewerTz: 'Asia/Shanghai',
    refs: ref,
  });
  assert.equal(detail.notFound, false);
  assert.deepEqual(
    detail.steps.map((x) => [x.key, x.state]),
    [
      ['submitted', 'done'],
      ['dispatched', 'done'],
      ['completed', 'current'],
    ],
  );
  assert.equal(detail.cells.find((x) => x.key === 'passengers').value.includes('2'), true);
  assert.equal(
    detail.actions.some((x) => x.key === 'complete'),
    true,
  );
  assert.equal(detail.warnings.length, 1);
});
test('dispatch and reject sheets localize availability capacity and required copy', () => {
  const vm = require('../miniprogram/viewmodels/vehicles');
  const state = seed();
  state.vehicles.push({ ...state.vehicles[3], id: 'busy', status: 'assigned', carId: 'a6' });
  state.vehicles[3].passengers = 6;
  const sheet = vm.dispatchSheetView({ state, id: 'v4', refs: ref, selectedCarId: 'a6' });
  const car = sheet.cars.find((x) => x.id === 'a6');
  assert.equal(car.available, false);
  assert.equal(sheet.seatWarning.includes('{'), false);
  assert.equal(sheet.confirmDisabled, true);
  assert.equal(typeof vm.rejectSheetView().placeholder, 'string');
});
test('vehicle form labels and defaults follow the instant form pattern', () => {
  const vm = require('../miniprogram/viewmodels/vehicles');
  const defaults = vm.vehicleFormDefaults({
    now: new Date('2026-10-24T01:20:00Z'),
    viewerTz: 'Asia/Shanghai',
  });
  assert.equal(defaults.date, '2026-10-24');
  assert.equal(defaults.time, '10:00');
  assert.equal(defaults.passengers, 1);
  assert.equal(vm.vehicleFormLabels().passengers.length > 0, true);
});
