'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fromServer, toServer } = require('../miniprogram/store/wire');

test('fromServer converts nested ids and dates while preserving null dates', () => {
  const server = {
    _id: 'item-1',
    startAt: new Date('2026-10-25T00:00:00.000Z'),
    endAt: { $date: 1792886400000 },
    cancelledAt: null,
    leaders: [{ _id: 'p-1', changedAt: { $date: '2026-10-25T01:00:00.000Z' } }],
  };
  assert.deepEqual(fromServer(server), {
    id: 'item-1',
    startAt: '2026-10-25T00:00:00.000Z',
    endAt: '2026-10-25T00:00:00.000Z',
    cancelledAt: null,
    leaders: [{ id: 'p-1', changedAt: '2026-10-25T01:00:00.000Z' }],
  });
});

test('wire conversions are idempotent and toServer removes client-owned fields', () => {
  const client = {
    id: 'item-1',
    _id: 'old-id',
    createdAt: 'created',
    updatedAt: 'updated',
    rev: 4,
    nested: [{ id: 'leader-1', _id: 'leader-old', rev: 2, value: 1 }],
    at: '2026-10-25T00:00:00.000Z',
    empty: null,
  };
  const server = toServer(client);
  assert.deepEqual(server, {
    nested: [{ value: 1 }],
    at: '2026-10-25T00:00:00.000Z',
    empty: null,
  });
  assert.deepEqual(toServer(server), server);
  const roundTrip = fromServer({ _id: 'x', nested: [{ _id: 'y' }], at: { $date: 0 } });
  assert.deepEqual(fromServer(roundTrip), roundTrip);
});
