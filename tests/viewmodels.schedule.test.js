'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../miniprogram/i18n');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const { scheduleView } = require('../miniprogram/viewmodels/schedule');

const state = seed();

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

test('schedule view models are localized, fixed-week, focused, and complete', () => {
  const now = clock.now();
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    const view = scheduleView({ state, date: '2026-10-24', now, focusId: 'm3' });
    assert.deepEqual(view.items.map((item) => item.id), ['m2', 'v3', 'm3']);
    assert.equal(view.items[0].statusText, locale === 'en' ? 'In progress' : '进行中');
    assert.equal(view.items[2].focused, true);
    assert.equal(view.items[0].url, '/pages/meeting-detail/index?id=m2');
    assert.equal(view.items[1].url, '/pages/vehicle-detail/index?id=v3');
    assert.deepEqual(view.week.days.map((day) => day.date), locale === 'en'
      ? ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']
      : ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    for (const day of view.week.days) {
      assert.equal(day.hasItems, ['2026-10-23', '2026-10-24', '2026-10-26', '2026-10-27'].includes(day.date));
    }
    const empty = scheduleView({ state, date: '2026-10-25', now });
    assert.equal(empty.items.length, 0);
    assert.equal(empty.empty.body.includes('{'), false);
    assert.equal(empty.backToToday !== null, true);
    walk(view, (value) => {
      assert.notEqual(value, undefined);
      if (typeof value === 'string') assert.equal(value.includes('{'), false);
    });
  }
});

test('schedule scopes filter rows and week dots by role', () => {
  const now = clock.now();
  const admin = scheduleView({
    state,
    date: '2026-10-24',
    now,
    role: 'admin',
    personId: 'p-lin',
  });
  assert.deepEqual(admin.items.map((item) => item.id), ['m2', 'v3', 'm3']);
  assert.deepEqual(admin.scopes, [
    { key: 'all', label: '全部日程', active: false },
    { key: 'mine', label: '我的日程', active: true },
  ]);
  assert.equal(admin.week.days.find((day) => day.date === '2026-10-23').hasItems, true);

  const leader = scheduleView({
    state,
    date: '2026-10-24',
    now,
    role: 'leader',
    personId: 'p-chen',
  });
  assert.equal(leader.scopes.find((item) => item.key === 'all').active, true);
  assert.equal(leader.items.length, 3);
});
