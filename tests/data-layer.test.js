'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const clock = require('../miniprogram/domain/clock');
const { getApi } = require('../miniprogram/store/api');
const data = require('../miniprogram/utils/data');

function directoryPayload() {
  return {
    ok: true,
    rooms: [{ id: 'r1', name: { 'zh-CN': '房间', en: 'Room' } }],
    cars: [{ id: 'c1', plate: 'A1', seats: 4 }],
    employees: [
      { id: 'p1', name: { 'zh-CN': '艾达', en: 'Ada' }, role: 'leader' },
      { id: 'd1', name: { 'zh-CN': '司机', en: 'Driver' }, role: 'driver' }
    ]
  };
}

function fakeApi(hooks) {
  const calls = hooks || {};
  return {
    directory: async () => {
      if (calls.directory) return calls.directory();
      return directoryPayload();
    },
    listItems: async () => {
      if (calls.listItems) return calls.listItems();
      return { ok: true, items: [{ id: 'i1' }] };
    },
    listVehicles: async () => {
      if (calls.listVehicles) return calls.listVehicles();
      return { ok: true, vehicles: [{ id: 'v1' }] };
    },
    cancelItem: async (payload) => {
      if (calls.cancelItem) return calls.cancelItem(payload);
      return { ok: true, item: { id: 'i1', rev: 1 } };
    }
  };
}

test.afterEach(() => {
  data.setApiFactory(null);
  data.setApiStub(null);
  data.resetSession();
});

test('directory is cached and refs resolve rooms, people, and cars', async () => {
  let reads = 0;
  data.setApiFactory(() => fakeApi({
    directory() {
      reads += 1;
      return directoryPayload();
    }
  }));
  const first = await data.loadDirectory();
  const second = await data.loadDirectory();
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(reads, 1);
  assert.equal(second.refs.roomById('r1').name.en, 'Room');
  assert.equal(second.refs.personById('p1').role, 'leader');
  assert.equal(second.refs.isLeader('p1'), true);
  assert.equal(second.refs.isLeader('d1'), false);
  assert.equal(second.refs.carById('c1').plate, 'A1');
  assert.equal(second.refs.roomById('missing'), null);
  assert.deepEqual(second.refs.DRIVERS, ['d1']);
  assert.equal(second.refs.ROOMS.length, 1);
  assert.equal(second.refs.PEOPLE.length, 2);
  assert.equal(second.refs.CARS.length, 1);
});

test('range load maps success and keeps a failure code', async () => {
  data.setApiFactory(() => fakeApi());
  const span = { from: '2026-10-19T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' };
  const loaded = await data.loadRange(span);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.items[0].id, 'i1');
  assert.equal(loaded.state.vehicles[0].id, 'v1');
  const again = await data.loadRange(span);
  assert.equal(again.state.items[0].id, 'i1');

  data.setApiFactory(() => fakeApi({
    listVehicles: async () => ({ ok: false, code: 'auth.notBound' })
  }));
  data.resetSession();
  const failed = await data.loadRange(span);
  assert.deepEqual(failed, { ok: false, code: 'auth.notBound' });
});

test('a thrown API call becomes network.failed', async () => {
  data.setApiFactory(() => ({
    directory: async () => {
      throw new Error('offline');
    },
    listItems: async () => {
      throw new Error('offline');
    },
    listVehicles: async () => ({ ok: true, vehicles: [] })
  }));
  assert.deepEqual(await data.loadDirectory(), { ok: false, code: 'network.failed' });
  const span = { from: 'a', to: 'b' };
  assert.deepEqual(await data.loadRange(span), { ok: false, code: 'network.failed' });
});

test('a successful write clears cached ranges and fires onChange', async () => {
  let lists = 0;
  let changes = 0;
  data.setApiFactory(() => fakeApi({
    listItems() {
      lists += 1;
      return { ok: true, items: [{ id: 'i1', rev: 0 }] };
    },
    cancelItem(payload) {
      assert.equal(payload.expectedRev, 0);
      return { ok: true, item: { id: 'i1', rev: 1 } };
    }
  }));
  const span = { from: 'from', to: 'to' };
  await data.loadRange(span);
  await data.loadRange(span);
  assert.equal(lists, 1);
  const off = data.onChange(() => {
    changes += 1;
  });
  const failed = await data.write('cancelItem', { id: 'i1', expectedRev: 0 });
  assert.equal(failed.ok, true);
  assert.equal(changes, 1);
  await data.loadRange(span);
  assert.equal(lists, 2);
  const denied = await data.write('cancelItem', { id: 'i1', expectedRev: 0 });
  assert.equal(denied.ok, true);
  off();
  await data.write('cancelItem', { id: 'i1', expectedRev: 0 });
  assert.equal(changes, 2);
});

test('a failed write does not clear the cache or notify', async () => {
  let lists = 0;
  let changes = 0;
  data.setApiFactory(() => fakeApi({
    listItems() {
      lists += 1;
      return { ok: true, items: [] };
    },
    cancelItem: async () => ({ ok: false, code: 'network.failed' })
  }));
  const span = { from: 'from', to: 'to' };
  await data.loadRange(span);
  const off = data.onChange(() => {
    changes += 1;
  });
  const result = await data.write('cancelItem', { id: 'i1', expectedRev: 1 });
  assert.deepEqual(result, { ok: false, code: 'network.failed' });
  await data.loadRange(span);
  assert.equal(lists, 1);
  assert.equal(changes, 0);
  off();
});

test('resetSession drops caches and builds a new API after a role switch', async () => {
  let builds = 0;
  let reads = 0;
  data.setApiFactory(() => {
    builds += 1;
    return fakeApi({
      directory() {
        reads += 1;
        return directoryPayload();
      }
    });
  });
  await data.loadDirectory();
  await data.loadDirectory();
  assert.equal(builds, 1);
  assert.equal(reads, 1);
  data.resetSession();
  const next = await data.loadDirectory();
  assert.equal(next.ok, true);
  assert.equal(builds, 2);
  assert.equal(reads, 2);
});

test('resetSession clears the shared API singleton', () => {
  data.setApiFactory(null);
  const first = getApi();
  data.resetSession();
  const second = getApi();
  assert.notEqual(first, second);
});

test('demo range keeps a meeting the secretary organizes without a leader', async () => {
  const { getStore } = require('../miniprogram/store/index');
  const store = getStore();
  const previous = store.getRole();
  const demo = clock.isDemoMode();
  data.setApiFactory(null);
  data.setApiStub(null);
  clock.setDemoMode(true);
  try {
    store.load();
    store.setRole('secretary');
    data.resetSession();
    const span = data.dayWindow('2026-10-24', 'Asia/Shanghai');
    const result = await data.loadRange(span);
    assert.equal(result.ok, true);
    assert.equal(result.state.items.some((item) => item.id === 'm3'), true);
    const { meetingDetailView } = require('../miniprogram/viewmodels/meetings');
    const { session } = require('../miniprogram/utils/session');
    const current = session(store);
    const view = meetingDetailView({
      state: result.state,
      id: 'm3',
      now: clock.now(),
      actor: current.actor,
      viewerTz: current.viewerTz,
      ctx: current.ctx
    });
    assert.equal(view.canCancel, true);
  } finally {
    store.setRole(previous);
    clock.setDemoMode(demo);
    data.resetSession();
  }
});

test('the stale-response gate ignores an older token', () => {
  const gate = data.createGate();
  const first = gate.next();
  const second = gate.next();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
});

test('week and day windows are instants covering those viewer days', () => {
  const previous = clock.isDemoMode();
  clock.setDemoMode(true);
  try {
    const week = data.weekWindow('2026-10-24', 'Asia/Shanghai');
    const day = data.dayWindow('2026-10-24', 'Asia/Shanghai');
    assert.equal(new Date(week.to) - new Date(week.from), 7 * 24 * 60 * 60 * 1000);
    assert.equal(new Date(day.to) - new Date(day.from), 24 * 60 * 60 * 1000);
    assert.ok(week.from <= day.from && day.to <= week.to);
  } finally {
    clock.setDemoMode(previous);
  }
});
