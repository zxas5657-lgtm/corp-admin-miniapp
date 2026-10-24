'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DATA_KEY,
  LOCALE_KEY,
  MIGRATIONS,
  ROLE_KEY,
  SCHEMA_VERSION,
  migrate,
} = require('../miniprogram/store/schema');

const validData = () => ({
  version: 2,
  meetings: [{ id: 'm1', date: '2026-10-24' }],
  vehicles: [{ id: 'v1', date: '2026-10-24' }],
});

test('exports the v2 schema constants', () => {
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(DATA_KEY, 'corp-admin-v2');
  assert.equal(LOCALE_KEY, 'corp-admin-locale');
  assert.equal(ROLE_KEY, 'corp-admin-role');
  assert.deepEqual(MIGRATIONS, {});
});

test('rejects missing, non-object, and future versions', () => {
  assert.deepEqual(migrate(null), { ok: false, code: 'storage.readFailed' });
  assert.deepEqual(migrate({ meetings: [], vehicles: [] }), { ok: false, code: 'storage.readFailed' });
  assert.deepEqual(migrate({ version: 3, meetings: [], vehicles: [] }), { ok: false, code: 'storage.readFailed' });
});

test('validates v2 arrays and drops malformed records', () => {
  const data = {
    version: 2,
    meetings: [
      { id: 'm1', date: '2026-10-24' },
      null,
      { id: 'm2' },
    ],
    vehicles: [
      { id: 'v1', date: '2026-10-24' },
      { date: '2026-10-24' },
    ],
  };
  const result = migrate(data);
  assert.equal(result.ok, true);
  assert.equal(result.dropped, 3);
  assert.deepEqual(result.data.meetings.map((record) => record.id), ['m1']);
  assert.deepEqual(result.data.vehicles.map((record) => record.id), ['v1']);
  assert.deepEqual(data.meetings.length, 3);
});

test('runs injected lower-version migrations in order', () => {
  const order = [];
  const result = migrate({ version: 0, meetings: [], vehicles: [] }, {
    0(data) {
      order.push(0);
      return { ...data, version: 1 };
    },
    1(data) {
      order.push(1);
      return { ok: true, data: { ...data, version: 2 } };
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(order, [0, 1]);
  assert.equal(result.data.version, 2);
});

test('does not invent a v1 migration', () => {
  assert.deepEqual(migrate({ version: 1, meetings: [], vehicles: [] }), {
    ok: false,
    code: 'storage.readFailed',
  });
});
