'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../miniprogram/i18n');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const { meetingDetailView, meetingListView } = require('../miniprogram/viewmodels/meetings');

function localState() {
  return seed();
}

test.afterEach(() => i18n._resetForTests());
test.beforeEach(() => {
  i18n._resetForTests();
  i18n.setDevMode(false);
  clock.setDemoMode(true);
  clock.setNow(null);
});

test('meeting list groups, filters, and exposes role-aware empty states', () => {
  const now = clock.now();
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    const view = meetingListView({ state: localState(), filter: 'all', now, role: 'admin' });
    assert.deepEqual(view.groups.map((group) => group.date), ['2026-10-23', '2026-10-24', '2026-10-26']);
    assert.deepEqual(view.groups.flatMap((group) => group.items.map((item) => item.id)), ['m1', 'm2', 'm3', 'm4', 'm5']);
    assert.deepEqual(view.filters.map((filter) => filter.key), ['all', 'upcoming', 'ongoing', 'done', 'cancelled']);
    assert.equal(view.createButton.disabled, false);
    assert.equal(view.empty, null);

    const empty = meetingListView({ state: { meetings: [], vehicles: [] }, filter: 'all', now, role: 'admin' });
    assert.equal(empty.empty.kind, 'noData');
    assert.equal(empty.empty.actionText, locale === 'en' ? 'New meeting' : '新建会议');
    const filtered = meetingListView({ state: localState(), filter: 'cancelled', now, role: 'admin' });
    assert.equal(filtered.empty.kind, 'filtered');

    for (const role of ['driver', 'reception']) {
      const roleView = meetingListView({ state: localState(), filter: 'all', now, role });
      assert.equal(roleView.createButton.disabled, true);
      assert.equal(roleView.createButton.reason, locale === 'en' ? 'This role cannot create meetings' : '当前身份不能新建会议');
      assert.equal(roleView.empty, null);
    }

    const cancelledState = localState();
    cancelledState.meetings[2].cancelled = true;
    const cancelled = meetingListView({ state: cancelledState, filter: 'cancelled', now, role: 'admin' });
    assert.equal(cancelled.groups[0].items[0].cancelled, true);
    assert.equal(cancelled.groups[0].items[0].statusText, locale === 'en' ? 'Cancelled' : '已取消');
  }
});

test('meeting detail handles missing records, attendees, and cancellation permission', () => {
  const now = clock.now();
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    const state = localState();
    const missing = meetingDetailView({ state, id: 'missing', now, role: 'admin', personId: 'p-lin' });
    assert.equal(missing.notFound, true);
    assert.equal(missing.body.includes('demo'), false);
    const detail = meetingDetailView({ state, id: 'm2', now, role: 'admin', personId: 'p-lin' });
    const attendees = detail.cells.find((cell) => cell.key === 'attendees');
    assert.equal(attendees.value, locale === 'en' ? 'Lin Xiaowen and Zhou Ning' : '林晓雯、周宁');
    assert.equal(detail.attendeeCountText, locale === 'en' ? '2 attendees' : '2 位参会人');
    assert.equal(detail.canCancel, false);
    assert.equal(meetingDetailView({ state, id: 'm4', now, role: 'leader', personId: 'p-chen' }).canCancel, true);
    assert.equal(meetingDetailView({ state, id: 'm4', now, role: 'leader', personId: 'p-lin' }).canCancel, false);
  }
});
