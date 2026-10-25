'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const { createMemoryAdapter, createWxAdapter } = require('../miniprogram/store/adapter');
const { DATA_KEY, LOCALE_KEY, ROLE_KEY } = require('../miniprogram/store/schema');
const { createStore } = require('../miniprogram/store');

function makeStore(adapter) {
  return createStore({ adapter, seed, clock });
}

test.beforeEach(() => {
  clock.setDemoMode(true);
  clock.setNow(null);
});

test('memory and wx adapters return result objects and never expose storage errors', () => {
  const memory = createMemoryAdapter();
  assert.deepEqual(memory.get('missing'), { ok: true, value: undefined });
  assert.deepEqual(memory.set('key', { value: 1 }), { ok: true });
  assert.deepEqual(memory.get('key'), { ok: true, value: { value: 1 } });
  assert.deepEqual(memory.remove('key'), { ok: true });
  memory.failNext({ op: 'get' });
  assert.deepEqual(memory.get('missing'), { ok: false, code: 'storage.readFailed' });
  memory.failNext({ op: 'set' });
  assert.deepEqual(memory.set('key', 1), { ok: false, code: 'storage.writeFailed' });
  memory.failNext({ op: 'remove' });
  assert.deepEqual(memory.remove('key'), { ok: false, code: 'storage.writeFailed' });

  const throwingWx = createWxAdapter({
    getStorageSync() { throw new Error('read'); },
    setStorageSync() { throw new Error('write'); },
    removeStorageSync() { throw new Error('remove'); },
  });
  assert.deepEqual(throwingWx.get('key'), { ok: false, code: 'storage.readFailed' });
  assert.deepEqual(throwingWx.set('key', 1), { ok: false, code: 'storage.writeFailed' });
  assert.deepEqual(throwingWx.remove('key'), { ok: false, code: 'storage.writeFailed' });
});

test('wx adapter treats the empty string wx returns for a missing key as absent, so first launch seeds', () => {
  const values = new Map();
  const fakeWx = {
    getStorageSync(key) { return values.has(key) ? values.get(key) : ''; },
    setStorageSync(key, value) { values.set(key, JSON.parse(JSON.stringify(value))); },
    removeStorageSync(key) { values.delete(key); },
  };
  const adapter = createWxAdapter(fakeWx);
  assert.deepEqual(adapter.get('missing'), { ok: true, value: undefined });
  assert.deepEqual(makeStore(adapter).load(), { ok: true, dropped: 0 });
  assert.equal(values.get(DATA_KEY).version, 2);
});

test('first load seeds and persists, and a second store reads it back', () => {
  const adapter = createMemoryAdapter();
  const first = makeStore(adapter);
  assert.deepEqual(first.load(), { ok: true, dropped: 0 });
  const stored = adapter.get(DATA_KEY);
  assert.equal(stored.ok, true);
  assert.equal(stored.value.version, 2);

  const record = { id: 'm-extra', date: '2026-10-28' };
  assert.deepEqual(first.addMeeting(record), { ok: true });
  const second = makeStore(adapter);
  assert.deepEqual(second.load(), { ok: true, dropped: 0 });
  assert.equal(second.getState().meetings.some((meeting) => meeting.id === 'm-extra'), true);
});

test('write failure leaves memory unchanged and does not notify', () => {
  const adapter = createMemoryAdapter();
  const store = makeStore(adapter);
  store.load();
  const before = store.getState();
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  adapter.failNext({ op: 'set' });
  const result = store.addMeeting({ id: 'm-fail', date: '2026-10-29' });
  assert.deepEqual(result, { ok: false, code: 'storage.writeFailed' });
  assert.deepEqual(store.getState(), before);
  assert.equal(notifications, 0);
});

test('read failures, corrupt blobs, and future versions keep stored data untouched', () => {
  const adapter = createMemoryAdapter();
  const store = makeStore(adapter);
  adapter.failNext({ op: 'get' });
  assert.deepEqual(store.load(), { ok: false, code: 'storage.readFailed' });
  assert.equal(store.getState().meetings.length, seed().meetings.length);

  const corrupt = { version: 2, meetings: 'bad', vehicles: [] };
  adapter.set(DATA_KEY, corrupt);
  const corruptStore = makeStore(adapter);
  assert.deepEqual(corruptStore.load(), { ok: false, code: 'storage.readFailed' });
  assert.deepEqual(adapter.get(DATA_KEY).value, corrupt);

  const future = { version: 99, meetings: [], vehicles: [] };
  adapter.set(DATA_KEY, future);
  const futureStore = makeStore(adapter);
  assert.deepEqual(futureStore.load(), { ok: false, code: 'storage.readFailed' });
  assert.deepEqual(adapter.get(DATA_KEY).value, future);
});

test('malformed records are dropped and counted by load', () => {
  const adapter = createMemoryAdapter({
    [DATA_KEY]: {
      version: 2,
      meetings: [{ id: 'm1', date: '2026-10-24' }, { id: 'bad' }],
      vehicles: [{ id: 'v1', date: '2026-10-24' }, null],
    },
  });
  const store = makeStore(adapter);
  assert.deepEqual(store.load(), { ok: true, dropped: 2 });
  assert.deepEqual(store.getState().meetings.map((meeting) => meeting.id), ['m1']);
  assert.deepEqual(store.getState().vehicles.map((vehicle) => vehicle.id), ['v1']);
});

test('resetDemo keeps locale and resets role', () => {
  const adapter = createMemoryAdapter();
  const store = makeStore(adapter);
  store.load();
  assert.deepEqual(store.setLocale('en'), { ok: true });
  assert.deepEqual(store.setRole('driver'), { ok: true });
  assert.deepEqual(store.resetDemo(), { ok: true });
  assert.equal(store.getLocale(), 'en');
  assert.equal(store.getRole(), 'admin');
  assert.equal(adapter.get(LOCALE_KEY).value, 'en');
  assert.equal(adapter.get(ROLE_KEY).value, 'admin');
});

test('locale and role persistence validate values', () => {
  const adapter = createMemoryAdapter();
  const store = makeStore(adapter);
  assert.equal(store.getLocale(), null);
  assert.deepEqual(store.setLocale('zh-Hans'), { ok: true });
  assert.equal(store.getLocale(), 'zh-CN');
  assert.equal(store.getRole(), 'admin');
  assert.deepEqual(store.setRole('unknown'), { ok: false, code: 'permission.denied' });
  assert.deepEqual(store.setRole('leader'), { ok: true });
  assert.equal(store.getRole(), 'leader');
});

test('pending focus is one-shot and selected date defaults from the clock', () => {
  const store = makeStore(createMemoryAdapter());
  assert.equal(store.ui.getSelectedDate(), '2026-10-24');
  store.ui.setPendingFocus({ date: '2026-10-26', meetingId: 'm4' });
  assert.deepEqual(store.ui.takePendingFocus(), { date: '2026-10-26', meetingId: 'm4' });
  assert.equal(store.ui.takePendingFocus(), null);
  store.ui.setSelectedDate('2026-10-27');
  assert.equal(store.ui.getSelectedDate(), '2026-10-27');
});

test('getState returns deep copies and subscribers fire after successful mutations', () => {
  const adapter = createMemoryAdapter();
  const store = makeStore(adapter);
  store.load();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });
  const state = store.getState();
  state.meetings[0].title = 'changed';
  assert.notEqual(store.getState().meetings[0].title, 'changed');
  assert.deepEqual(store.addMeeting({ id: 'm-add', date: '2026-10-30' }), { ok: true });
  assert.deepEqual(store.updateMeeting({ id: 'm-add', date: '2026-10-31' }), { ok: true });
  assert.deepEqual(store.updateVehicle({ id: 'v-add', date: '2026-10-31' }), { ok: true });
  assert.equal(notifications, 3);
  unsubscribe();
});
