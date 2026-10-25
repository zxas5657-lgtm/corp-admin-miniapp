'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const { createMemoryAdapter, createWxAdapter } = require('../miniprogram/store/adapter');
const { DATA_KEY, ROLE_KEY } = require('../miniprogram/store/schema');
const { createStore } = require('../miniprogram/store');
const make = (adapter, extra) => createStore({ adapter, seed, clock, ...(extra || {}) });
test.beforeEach(() => {
  clock.setDemoMode(true);
  clock.setNow(null);
});
test('first load seeds v3 state and persists', () => {
  const a = createMemoryAdapter();
  const s = make(a);
  assert.deepEqual(s.load(), { ok: true, dropped: 0 });
  assert.equal(a.get(DATA_KEY).value.version, 3);
  assert.equal(s.getState().items.length, 6);
  assert.equal(s.getState().vehicles.length, 5);
  assert.deepEqual(s.getState().notes, []);
});
test('item and vehicle mutations replace or append and notify', () => {
  const a = createMemoryAdapter();
  const s = make(a);
  s.load();
  let n = 0;
  s.subscribe(() => n++);
  assert.deepEqual(s.addItem({ id: 'x', kind: 'meeting', startAt: 'x' }), { ok: true });
  assert.deepEqual(s.updateItem({ id: 'x', kind: 'meeting', startAt: 'y' }), { ok: true });
  assert.deepEqual(s.updateVehicle({ id: 'v-x', departAt: 'x', status: 'pending' }), { ok: true });
  assert.equal(n, 3);
  assert.equal(s.getState().items.find((x) => x.id === 'x').startAt, 'y');
  assert.equal(typeof s.addMeeting, 'undefined');
  assert.equal(typeof s.updateMeeting, 'undefined');
});
test('write failure preserves state', () => {
  const a = createMemoryAdapter();
  const s = make(a);
  s.load();
  const before = s.getState();
  a.failNext({ op: 'set' });
  assert.deepEqual(s.addItem({ id: 'x' }), { ok: false, code: 'storage.writeFailed' });
  assert.deepEqual(s.getState(), before);
});
test('role persistence maps legacy roles and reset uses secretary', () => {
  const a = createMemoryAdapter({ [ROLE_KEY]: 'admin' });
  const s = make(a);
  assert.equal(s.getRole(), 'secretary');
  assert.deepEqual(s.setRole('reception'), { ok: true });
  assert.equal(s.getRole(), 'receptionist');
  assert.deepEqual(s.resetDemo(), { ok: true });
  assert.equal(s.getRole(), 'secretary');
  assert.equal(a.get(ROLE_KEY).value, 'secretary');
});
test('selected date uses viewer zone and state is deeply copied', () => {
  const s = make(createMemoryAdapter());
  assert.equal(s.ui.getSelectedDate(), '2026-10-24');
  const x = s.getState();
  x.items[0].title = 'changed';
  assert.notEqual(s.getState().items[0].title, 'changed');
});
test('load migrates v2 and reports drops', () => {
  const a = createMemoryAdapter({
    [DATA_KEY]: {
      version: 2,
      meetings: [
        {
          id: 'm',
          title: 'x',
          date: '2026-10-24',
          start: '09:00',
          end: '10:00',
          attendeeIds: [],
          organizerId: 'p-lin',
        },
      ],
      vehicles: [
        { id: 'v', date: '2026-10-24', time: '09:00', applicantId: 'p-zhou', status: 'pending' },
      ],
    },
  });
  const s = make(a);
  assert.deepEqual(s.load(), { ok: true, dropped: 0 });
  assert.equal(s.getState().items[0].kind, 'meeting');
  assert.equal(s.getState().vehicles[0].departAt, '2026-10-24T01:00:00.000Z');
});

test('memory and wx adapters return result objects and never expose storage errors', () => {
  const a = createMemoryAdapter();
  assert.deepEqual(a.get('missing'), { ok: true, value: undefined });
  assert.deepEqual(a.set('key', { value: 1 }), { ok: true });
  assert.deepEqual(a.get('key'), { ok: true, value: { value: 1 } });
  a.failNext({ op: 'get' });
  assert.deepEqual(a.get('key'), { ok: false, code: 'storage.readFailed' });
  const wx = createWxAdapter({
    getStorageSync() {
      throw Error('read');
    },
    setStorageSync() {
      throw Error('write');
    },
    removeStorageSync() {
      throw Error('remove');
    },
  });
  assert.deepEqual(wx.get('x'), { ok: false, code: 'storage.readFailed' });
  assert.deepEqual(wx.set('x', 1), { ok: false, code: 'storage.writeFailed' });
  assert.deepEqual(wx.remove('x'), { ok: false, code: 'storage.writeFailed' });
});
test('read failures corrupt blobs and future versions keep stored data untouched', () => {
  const a = createMemoryAdapter();
  const s = make(a);
  a.failNext({ op: 'get' });
  assert.deepEqual(s.load(), { ok: false, code: 'storage.readFailed' });
  assert.equal(s.getState().items.length, seed().items.length);
  const corrupt = { version: 3, items: 'bad', vehicles: [], notes: [] };
  a.set(DATA_KEY, corrupt);
  assert.deepEqual(make(a).load(), { ok: false, code: 'storage.readFailed' });
  assert.deepEqual(a.get(DATA_KEY).value, corrupt);
  const future = { version: 99, items: [], vehicles: [], notes: [] };
  a.set(DATA_KEY, future);
  assert.deepEqual(make(a).load(), { ok: false, code: 'storage.readFailed' });
  assert.deepEqual(a.get(DATA_KEY).value, future);
});
test('locale and role persistence validate values', () => {
  const s = make(createMemoryAdapter());
  assert.equal(s.getLocale(), null);
  assert.deepEqual(s.setLocale('zh-Hans'), { ok: true });
  assert.equal(s.getLocale(), 'zh-CN');
  assert.equal(s.getRole(), 'secretary');
  assert.deepEqual(s.setRole('unknown'), { ok: false, code: 'permission.denied' });
  assert.deepEqual(s.setRole('leader'), { ok: true });
  assert.equal(s.getRole(), 'leader');
});
test('pending focus is one-shot and selected date defaults from the clock', () => {
  const s = make(createMemoryAdapter());
  assert.equal(s.ui.getSelectedDate(), '2026-10-24');
  s.ui.setPendingFocus({ date: '2026-10-26', itemId: 'm4' });
  assert.deepEqual(s.ui.takePendingFocus(), { date: '2026-10-26', itemId: 'm4' });
  assert.equal(s.ui.takePendingFocus(), null);
  s.ui.setSelectedDate('2026-10-27');
  assert.equal(s.ui.getSelectedDate(), '2026-10-27');
});

test('wx adapter treats an empty string as absent so first launch seeds', () => {
  const values = new Map();
  const fake = {
    getStorageSync(k) {
      return values.has(k) ? values.get(k) : '';
    },
    setStorageSync(k, v) {
      values.set(k, JSON.parse(JSON.stringify(v)));
    },
    removeStorageSync(k) {
      values.delete(k);
    },
  };
  const a = createWxAdapter(fake);
  assert.deepEqual(a.get('missing'), { ok: true, value: undefined });
  assert.deepEqual(make(a).load(), { ok: true, dropped: 0 });
  assert.equal(values.get(DATA_KEY).version, 3);
});

test('first load persists and a second store reads appended items', () => {
  const a = createMemoryAdapter();
  const first = make(a);
  assert.deepEqual(first.load(), { ok: true, dropped: 0 });
  const record = {
    id: 'm-extra',
    kind: 'meeting',
    startAt: '2026-10-28T01:00:00.000Z',
    endAt: '2026-10-28T02:00:00.000Z',
  };
  assert.deepEqual(first.addItem(record), { ok: true });
  const second = make(a);
  assert.deepEqual(second.load(), { ok: true, dropped: 0 });
  assert.equal(
    second.getState().items.some((x) => x.id === 'm-extra'),
    true,
  );
});
test('malformed records are dropped and counted by load', () => {
  const a = createMemoryAdapter({
    [DATA_KEY]: {
      version: 3,
      items: [{ id: 'i', startAt: 'x' }, { id: 'bad' }],
      vehicles: [{ id: 'v', departAt: 'x' }, null],
      notes: [],
    },
  });
  const s = make(a);
  assert.deepEqual(s.load(), { ok: true, dropped: 2 });
  assert.deepEqual(
    s.getState().items.map((x) => x.id),
    ['i'],
  );
  assert.deepEqual(
    s.getState().vehicles.map((x) => x.id),
    ['v'],
  );
});
test('getState returns deep copies and subscribers fire after successful mutations', () => {
  const a = createMemoryAdapter();
  const s = make(a);
  s.load();
  let notifications = 0;
  const unsubscribe = s.subscribe(() => notifications++);
  const state = s.getState();
  state.items[0].title = 'changed';
  assert.notEqual(s.getState().items[0].title, 'changed');
  assert.deepEqual(s.addItem({ id: 'i-add', kind: 'meeting', startAt: 'x' }), { ok: true });
  assert.deepEqual(s.updateItem({ id: 'i-add', kind: 'meeting', startAt: 'y' }), { ok: true });
  assert.deepEqual(s.updateVehicle({ id: 'v-add', departAt: 'x' }), { ok: true });
  assert.equal(notifications, 3);
  unsubscribe();
});
