'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCHEMA_VERSION,
  DATA_KEY,
  LOCALE_KEY,
  ROLE_KEY,
  MIGRATIONS,
  migrate,
} = require('../miniprogram/store/schema');
const v2 = () => ({
  version: 2,
  meetings: [
    {
      id: 'm1',
      title: 'Legacy',
      date: '2026-10-24',
      start: '09:00',
      end: '10:00',
      roomId: 'f3-small',
      attendeeIds: ['p-chen'],
      organizerId: 'p-lin',
      agenda: 'old notes',
      createdAt: '2026-10-20T09:00',
      cancelledAt: null,
    },
  ],
  vehicles: [
    {
      id: 'v1',
      reason: 'Trip',
      destination: 'Port',
      date: '2026-10-24',
      time: '11:00',
      passengers: 1,
      applicantId: 'p-chen',
      note: 'n',
      status: 'pending',
      carId: null,
      driverId: null,
      createdAt: '2026-10-20T09:00',
      dispatchedAt: null,
      dispatchedBy: null,
      completedAt: null,
    },
  ],
});
test('exports v3 schema constants and migration', () => {
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(DATA_KEY, 'corp-admin-v2');
  assert.equal(LOCALE_KEY, 'corp-admin-locale');
  assert.equal(ROLE_KEY, 'corp-admin-role');
  assert.equal(typeof MIGRATIONS[2], 'function');
});
test('migrates real v2 records into instants and items', () => {
  const result = migrate(v2());
  assert.equal(result.ok, true);
  assert.equal(result.data.version, 3);
  assert.equal(result.data.items[0].kind, 'meeting');
  assert.equal(result.data.items[0].startAt, '2026-10-24T01:00:00.000Z');
  assert.equal(result.data.items[0].notes, 'old notes');
  assert.deepEqual(result.data.items[0].leaderIds, ['p-chen']);
  assert.equal(result.data.vehicles[0].departAt, '2026-10-24T03:00:00.000Z');
  assert.equal(result.data.vehicles[0].forLeaderId, 'p-chen');
  assert.deepEqual(result.data.notes, []);
});
test('drops malformed v2 and v3 records without mutating input', () => {
  const data = v2();
  data.meetings.push(null, { id: 'bad' });
  data.vehicles.push(null, { id: 'bad' });
  const result = migrate(data);
  assert.equal(result.ok, true);
  assert.equal(result.dropped, 4);
  assert.deepEqual(data.meetings.length, 3);
  const v3 = migrate({
    version: 3,
    items: [{ id: 'i', startAt: 'x' }, null, { id: 'bad' }],
    vehicles: [{ id: 'v', departAt: 'x' }, null],
    notes: 'bad',
  });
  assert.equal(v3.ok, true);
  assert.equal(v3.dropped, 3);
  assert.deepEqual(
    v3.data.items.map((x) => x.id),
    ['i'],
  );
  assert.deepEqual(
    v3.data.vehicles.map((x) => x.id),
    ['v'],
  );
  assert.deepEqual(v3.data.notes, []);
});
test('rejects invalid and future versions', () => {
  assert.equal(migrate(null).ok, false);
  assert.equal(migrate({ version: 99, items: [], vehicles: [] }).ok, false);
  assert.equal(migrate({ version: 1, items: [], vehicles: [] }).ok, false);
});

test('does not invent a v1 migration', () => {
  assert.deepEqual(migrate({ version: 1, meetings: [], vehicles: [] }), {
    ok: false,
    code: 'storage.readFailed',
  });
});

test('literal v2 fixture migrates leaders audit timestamps and vehicle ownership', () => {
  const fixture = {
    version: 2,
    meetings: [
      {
        id: 'm-legacy',
        title: { en: 'Legacy', 'zh-CN': '旧' },
        date: '2026-10-24',
        start: '09:00',
        end: '10:00',
        roomId: 'f3-small',
        attendeeIds: ['p-chen', 'p-wang'],
        organizerId: 'p-lin',
        agenda: 'Brief',
        createdAt: '2026-10-23T09:00',
        cancelled: false,
        cancelledAt: null,
      },
    ],
    vehicles: [
      {
        id: 'v-legacy',
        reason: 'Trip',
        destination: 'Port',
        date: '2026-10-28',
        time: '08:30',
        passengers: 2,
        applicantId: 'p-chen',
        note: '',
        status: 'pending',
        carId: null,
        driverId: null,
        createdAt: '2026-10-24T10:00',
        dispatchedAt: null,
        dispatchedBy: null,
        completedAt: null,
      },
    ],
  };
  const result = migrate(fixture);
  const item = result.data.items[0];
  const vehicle = result.data.vehicles[0];
  assert.equal(item.startAt, '2026-10-24T01:00:00.000Z');
  assert.equal(item.endAt, '2026-10-24T02:00:00.000Z');
  assert.equal(item.notes, 'Brief');
  assert.deepEqual(item.leaderIds, ['p-chen', 'p-wang']);
  assert.deepEqual(
    item.leaders.map((x) => [x.leaderId, x.confirm]),
    [
      ['p-chen', 'confirmed'],
      ['p-wang', 'confirmed'],
    ],
  );
  assert.equal(item.createdAt, '2026-10-23T01:00:00.000Z');
  assert.equal(vehicle.departAt, '2026-10-28T00:30:00.000Z');
  assert.equal(vehicle.forLeaderId, 'p-chen');
});
