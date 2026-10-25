'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../miniprogram/i18n');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const { scheduleView } = require('../miniprogram/viewmodels/schedule');
const { meetingListView, meetingDetailView } = require('../miniprogram/viewmodels/meetings');
const {
  formDefaults,
  formOptions,
  fieldErrors,
  conflictWarnings,
  labels,
} = require('../miniprogram/viewmodels/meeting-form');
const {
  vehicleListView,
  vehicleDetailView,
  dispatchSheetView,
  rejectSheetView,
  vehicleFormDefaults,
  vehicleFormLabels,
} = require('../miniprogram/viewmodels/vehicles');
const ctx = { supports: ref.SUPPORTS, isLeader: ref.isLeader };
function walk(value) {
  if (value === undefined) assert.fail('undefined');
  if (Array.isArray(value)) value.forEach(walk);
  else if (value && typeof value === 'object') Object.values(value).forEach(walk);
}
test.afterEach(() => i18n._resetForTests());
test.beforeEach(() => {
  i18n._resetForTests();
  i18n.setDevMode(false);
  clock.setDemoMode(true);
});
test('viewmodel outputs are complete and JSON safe for v3 inputs', () => {
  const state = seed();
  const now = clock.now();
  const actor = ref.actorFor('secretary');
  const options = { state, actor, now, viewerTz: 'Asia/Shanghai', refs: ref, ctx };
  const outputs = [
    scheduleView({ ...options, date: '2026-10-24' }),
    meetingListView({ ...options, filter: 'all' }),
    meetingDetailView({ ...options, id: 'm1' }),
    formDefaults({ now, viewerTz: 'Asia/Shanghai', personId: actor.personId }),
    formOptions({ refs: ref }),
    fieldErrors([]),
    conflictWarnings([], { state, refs: ref }),
    labels(),
    vehicleListView(options),
    vehicleDetailView({ ...options, id: 'v1' }),
    dispatchSheetView({ ...options, id: 'v4' }),
    rejectSheetView(),
    vehicleFormDefaults({ now, viewerTz: 'Asia/Shanghai' }),
    vehicleFormLabels(),
  ];
  outputs.forEach(walk);
  assert.equal(meetingDetailView({ ...options, id: 'm6' }).notFound, true);
});
