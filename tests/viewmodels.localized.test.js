'use strict';

// Exact zh-CN / en output of the page-facing view models, ported from the
// pre-v3 view-model tests so localized copy stays covered after S3-B0b-1.

const test = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../miniprogram/i18n');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const { scheduleView } = require('../miniprogram/viewmodels/schedule');
const { meetingDetailView, meetingListView } = require('../miniprogram/viewmodels/meetings');
const { vehicleDetailView } = require('../miniprogram/viewmodels/vehicles');

const ctx = { supports: ref.SUPPORTS, isLeader: ref.isLeader };
const viewerTz = 'Asia/Shanghai';

function useLocale(locale) {
  i18n._resetForTests();
  i18n.setDevMode(false);
  i18n.setLocale(locale);
}

function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) walk(child, visit);
  }
}

test.afterEach(() => i18n._resetForTests());
test.beforeEach(() => {
  i18n._resetForTests();
  i18n.setDevMode(false);
  clock.setDemoMode(true);
  clock.setNow(null);
});

test('schedule view is localized, fixed-week, focused and complete', () => {
  const now = clock.now();
  const actor = ref.actorFor('secretary');
  for (const locale of ['zh-CN', 'en']) {
    useLocale(locale);
    const view = scheduleView({
      state: seed(),
      date: '2026-10-24',
      now,
      actor,
      viewerTz,
      ctx,
      scope: 'all',
      focusId: 'm3',
    });
    assert.deepEqual(
      view.items.map((item) => item.id),
      ['m2', 'v3', 'm3'],
    );
    assert.equal(view.items[0].statusText, locale === 'en' ? 'In progress' : '进行中');
    assert.equal(view.items[2].focused, true);
    assert.equal(view.items[0].url, '/pages/meeting-detail/index?id=m2');
    assert.equal(view.items[1].url, '/pages/vehicle-detail/index?id=v3');
    assert.deepEqual(
      view.week.days.map((day) => day.date),
      locale === 'en'
        ? [
            '2026-10-18',
            '2026-10-19',
            '2026-10-20',
            '2026-10-21',
            '2026-10-22',
            '2026-10-23',
            '2026-10-24',
          ]
        : [
            '2026-10-19',
            '2026-10-20',
            '2026-10-21',
            '2026-10-22',
            '2026-10-23',
            '2026-10-24',
            '2026-10-25',
          ],
    );
    for (const day of view.week.days) {
      assert.equal(day.hasItems, ['2026-10-23', '2026-10-24'].includes(day.date), day.date);
    }
    const empty = scheduleView({ state: seed(), date: '2026-10-25', now, actor, viewerTz, ctx });
    assert.equal(empty.items.length, 0);
    assert.equal(empty.empty.body.includes('{'), false);
    assert.equal(empty.backToToday !== null, true);
    walk(view, (value) => {
      assert.notEqual(value, undefined);
      if (typeof value === 'string') assert.equal(value.includes('{'), false);
    });
  }
});

test('schedule scopes are labelled and the leader sees only their own day', () => {
  const now = clock.now();
  const secretary = scheduleView({
    state: seed(),
    date: '2026-10-24',
    now,
    actor: ref.actorFor('secretary'),
    viewerTz,
    ctx,
  });
  assert.deepEqual(
    secretary.items.map((item) => item.id),
    ['m2', 'v3', 'm3'],
  );
  assert.deepEqual(secretary.scopes, [
    { key: 'all', label: '全部日程', active: false },
    { key: 'mine', label: '我的日程', active: true },
  ]);

  const leader = scheduleView({
    state: seed(),
    date: '2026-10-24',
    now,
    actor: ref.actorFor('leader'),
    viewerTz,
    ctx,
  });
  assert.equal(leader.scopes.find((item) => item.key === 'all').active, true);
  assert.equal(leader.items.length, 0);
  assert.equal(leader.week.days.find((day) => day.date === '2026-10-23').hasItems, true);
});

test('meeting list copy: empty, filtered, no-permission and cancelled states', () => {
  const now = clock.now();
  const secretary = ref.actorFor('secretary');
  for (const locale of ['zh-CN', 'en']) {
    useLocale(locale);
    const empty = meetingListView({
      state: { items: [], vehicles: [], notes: [] },
      filter: 'all',
      now,
      actor: secretary,
      viewerTz,
      ctx,
    });
    assert.equal(empty.empty.kind, 'noData');
    assert.equal(empty.empty.actionText, locale === 'en' ? 'New meeting' : '新建会议');

    const filtered = meetingListView({
      state: seed(),
      filter: 'cancelled',
      now,
      actor: secretary,
      viewerTz,
      ctx,
    });
    assert.equal(filtered.empty.kind, 'filtered');
    assert.equal(filtered.empty.actionText, locale === 'en' ? 'Show all meetings' : '查看全部会议');

    for (const role of ['driver', 'receptionist', 'receptionAdmin']) {
      const roleView = meetingListView({
        state: seed(),
        filter: 'all',
        now,
        actor: ref.actorFor(role),
        viewerTz,
        ctx,
      });
      assert.equal(roleView.createButton.disabled, true, role);
      assert.equal(
        roleView.createButton.reason,
        locale === 'en' ? 'This role cannot create meetings' : '当前身份不能新建会议',
      );
    }

    const cancelledState = seed();
    cancelledState.items.find((item) => item.id === 'm3').status = 'cancelled';
    const cancelled = meetingListView({
      state: cancelledState,
      filter: 'cancelled',
      now,
      actor: secretary,
      viewerTz,
      ctx,
    });
    assert.equal(cancelled.groups[0].items[0].cancelled, true);
    assert.equal(cancelled.groups[0].items[0].statusText, locale === 'en' ? 'Cancelled' : '已取消');
  }
});

test('meeting detail copy: missing record, attendees and cancel permission', () => {
  const now = clock.now();
  const secretary = ref.actorFor('secretary');
  for (const locale of ['zh-CN', 'en']) {
    useLocale(locale);
    const state = seed();
    const missing = meetingDetailView({
      state,
      id: 'missing',
      now,
      actor: secretary,
      viewerTz,
      ctx,
    });
    assert.equal(missing.notFound, true);
    assert.equal(missing.body.includes('demo'), false);

    const detail = meetingDetailView({ state, id: 'm2', now, actor: secretary, viewerTz, ctx });
    const attendees = detail.cells.find((cell) => cell.key === 'attendees');
    assert.equal(attendees.value, locale === 'en' ? 'Lin Xiaowen and Zhou Ning' : '林晓雯、周宁');
    assert.equal(detail.attendeeCountText, locale === 'en' ? '2 attendees' : '2 位参会人');
    assert.equal(detail.canCancel, false);
  }
});

test('vehicle detail copy: steps, passengers, dispatcher actions and rejection', () => {
  const now = clock.now();
  const state = seed();
  i18n._resetForTests();
  i18n.setDevMode(false);
  const detail = vehicleDetailView({
    state,
    id: 'v3',
    actor: ref.actorFor('secretary'),
    now,
    viewerTz,
    ctx,
    refs: ref,
  });
  assert.deepEqual(
    detail.steps.map((step) => [step.key, step.state]),
    [
      ['submitted', 'done'],
      ['dispatched', 'done'],
      ['completed', 'current'],
    ],
  );
  assert.equal(detail.cells.find((cell) => cell.key === 'passengers').value, '2 位乘车人');
  assert.equal(detail.cells.find((cell) => cell.key === 'car').value, '京A·E1902 · 奥迪 A6L');
  assert.equal(detail.actions.find((action) => action.key === 'cancelDispatch').kind, 'danger');

  const rejected = vehicleDetailView({
    state,
    id: 'v1',
    actor: ref.actorFor('secretary'),
    now,
    viewerTz,
    ctx,
    refs: ref,
  });
  assert.equal(rejected.steps, null);
  assert.equal(typeof rejected.rejectBanner.text, 'string');
  assert.equal(rejected.rejectBanner.text.includes('{'), false);
});
