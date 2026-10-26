'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../miniprogram/i18n');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const { meetingListView, meetingDetailView } = require('../miniprogram/viewmodels/meetings');
const ctx = { supports: ref.SUPPORTS, isLeader: ref.isLeader };
const now = new Date('2026-10-24T01:20:00Z');
test.afterEach(() => i18n._resetForTests());
test.beforeEach(() => {
  i18n._resetForTests();
  i18n.setDevMode(false);
  clock.setDemoMode(true);
});
test('meeting lists apply visibility before filters and preserve grouping', () => {
  const state = seed();
  const view = meetingListView({
    state,
    actor: ref.actorFor('secretary'),
    now,
    viewerTz: 'Asia/Shanghai',
    ctx,
    refs: ref,
  });
  assert.deepEqual(
    view.groups.flatMap((g) => g.items.map((x) => x.id)),
    ['m1', 'm2', 'm3', 'm4', 'm5'],
  );
  assert.equal(view.createButton.disabled, false);
  const admin = meetingListView({
    state,
    actor: ref.actorFor('secretaryAdmin'),
    now,
    viewerTz: 'Asia/Shanghai',
    ctx,
    refs: ref,
  });
  assert.deepEqual(
    admin.groups.flatMap((g) => g.items.map((x) => x.id)),
    ['m1', 'm4', 'm6'],
  );
});
test('meeting detail hides records and allows supported leader cancellation', () => {
  const state = seed();
  const hidden = meetingDetailView({
    state,
    id: 'm6',
    actor: ref.actorFor('leader'),
    now,
    viewerTz: 'Asia/Shanghai',
    ctx,
    refs: ref,
  });
  assert.equal(hidden.notFound, true);
  const detail = meetingDetailView({
    state,
    id: 'm4',
    actor: ref.actorFor('leader'),
    now,
    viewerTz: 'Asia/Shanghai',
    ctx,
    refs: ref,
  });
  assert.equal(detail.notFound, false);
  assert.equal(detail.canCancel, true);
  assert.equal(
    meetingDetailView({
      state,
      id: 'm4',
      actor: ref.actorFor('secretary'),
      now,
      viewerTz: 'Asia/Shanghai',
      ctx,
      refs: ref,
    }).canCancel,
    true,
  );
});
