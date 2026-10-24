'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../miniprogram/i18n');
const reference = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const { scheduleView } = require('../miniprogram/viewmodels/schedule');
const { meetingDetailView, meetingListView } = require('../miniprogram/viewmodels/meetings');
const { conflictWarnings, fieldErrors, formDefaults, formOptions, labels } = require('../miniprogram/viewmodels/meeting-form');
const {
  dispatchSheetView,
  rejectSheetView,
  vehicleDetailView,
  vehicleFormDefaults,
  vehicleFormLabels,
  vehicleListView,
} = require('../miniprogram/viewmodels/vehicles');

function assertClean(value) {
  if (value === undefined) assert.fail('viewmodel output contains undefined');
  if (typeof value === 'string') {
    assert.equal(/^[a-z]+(\.[a-zA-Z]+)+$/.test(value), false, `raw i18n key: ${value}`);
  }
  if (Array.isArray(value)) {
    for (const item of value) assertClean(item);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) assertClean(child);
  }
}

test.afterEach(() => i18n._resetForTests());
test.beforeEach(() => {
  i18n._resetForTests();
  i18n.setDevMode(false);
  clock.setDemoMode(true);
  clock.setNow(null);
});

test('every viewmodel output is JSON-safe and contains no raw i18n keys', () => {
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    const state = seed();
    const now = clock.now();
    const outputs = [
      scheduleView({ state, date: '2026-10-24', now, focusId: 'm2', refs: reference }),
      scheduleView({ state, date: '2026-10-24', now, role: 'admin', personId: 'p-lin', refs: reference }),
      meetingListView({ state, filter: 'all', now, role: 'admin', refs: reference }),
      meetingDetailView({ state, id: 'm2', now, role: 'admin', personId: 'p-lin', refs: reference }),
      formDefaults({ now, personId: 'p-lin' }),
      formOptions({ refs: reference }),
      fieldErrors([{ field: 'title', code: 'meeting.title.required' }]),
      conflictWarnings([], { state, refs: reference }),
      labels(),
      vehicleListView({ state, now, role: 'driver', personId: 'p-zhao', refs: reference }),
      vehicleDetailView({ state, id: 'v3', now, role: 'driver', personId: 'p-zhao', refs: reference }),
      dispatchSheetView({ state, id: 'v4', now, refs: reference, selectedCarId: null }),
      rejectSheetView(),
      vehicleFormDefaults({ now }),
      vehicleFormLabels(),
    ];
    for (const output of outputs) assertClean(output);
    assertClean(conflictWarnings([], { state, refs: reference }));
  }
});
