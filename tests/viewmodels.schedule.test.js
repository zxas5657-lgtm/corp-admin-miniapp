'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../miniprogram/i18n');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const {
  vehicleListView,
  vehicleDetailView,
  dispatchSheetView,
  rejectSheetView,
  vehicleFormDefaults,
  vehicleFormLabels,
} = require('../miniprogram/viewmodels/vehicles');
const now = new Date('2026-10-24T01:20:00Z');
test.afterEach(() => i18n._resetForTests());
test.beforeEach(() => {
  i18n._resetForTests();
  i18n.setDevMode(false);
});
test('vehicle lists apply visibility then actor scopes and badges', () => {
  const state = seed();
  const dispatcher = vehicleListView({
    state,
    actor: ref.actorFor('secretary'),
    now,
    viewerTz: 'Asia/Shanghai',
    refs: ref,
  });
  assert.deepEqual(
    dispatcher.groups.flatMap((g) => g.items.map((x) => x.id)),
    ['v4', 'v5'],
  );
  assert.equal(dispatcher.badgeCount, 2);
  const driver = vehicleListView({
    state,
    actor: ref.actorFor('driver'),
    now,
    viewerTz: 'Asia/Shanghai',
    refs: ref,
  });
  assert.deepEqual(
    driver.groups.flatMap((g) => g.items.map((x) => x.id)),
    ['v3'],
  );
  assert.equal(driver.badgeCount, 1);
  const requester = vehicleListView({
    state,
    actor: ref.actorFor('receptionist'),
    now,
    viewerTz: 'Asia/Shanghai',
    refs: ref,
  });
  assert.deepEqual(
    requester.groups.flatMap((g) => g.items.map((x) => x.id)),
    ['v4', 'v2'],
  );
});
test('vehicle details honor visibility and actor actions', () => {
  const state = seed();
  const detail = vehicleDetailView({
    state,
    id: 'v3',
    actor: ref.actorFor('driver'),
    now,
    viewerTz: 'Asia/Shanghai',
    refs: ref,
  });
  assert.equal(detail.notFound, false);
  assert.equal(
    detail.actions.some((x) => x.key === 'complete'),
    true,
  );
  assert.equal(detail.warnings.length, 1);
  assert.equal(
    vehicleDetailView({
      state,
      id: 'v5',
      actor: ref.actorFor('leader'),
      now,
      viewerTz: 'Asia/Shanghai',
      refs: ref,
    }).notFound,
    false,
  );
  assert.equal(
    vehicleDetailView({
      state,
      id: 'v5',
      actor: ref.actorFor('driver'),
      now,
      viewerTz: 'Asia/Shanghai',
      refs: ref,
    }).notFound,
    true,
  );
});
test('dispatch sheet detects busy cars and form defaults use viewer zone', () => {
  const state = seed();
  state.vehicles.push({ ...state.vehicles[3], id: 'busy', status: 'assigned', carId: 'a6' });
  const sheet = dispatchSheetView({
    state,
    id: 'v4',
    now,
    viewerTz: 'Asia/Shanghai',
    refs: ref,
    selectedCarId: 'a6',
  });
  assert.equal(sheet.cars.find((x) => x.id === 'a6').available, false);
  assert.equal(sheet.confirmDisabled, true);
  assert.equal(rejectSheetView().confirmText.length > 0, true);
  assert.equal(vehicleFormDefaults({ now, viewerTz: 'Asia/Shanghai' }).time, '10:00');
  assert.equal(vehicleFormDefaults({ now, viewerTz: 'America/Los_Angeles' }).date, '2026-10-23');
  assert.equal(vehicleFormLabels().passengers.length > 0, true);
});
