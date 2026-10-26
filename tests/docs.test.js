'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toDoc, toDomain } = require('../cloudfunctions/_lib/docs');
const { fetchAll } = require('../cloudfunctions/_lib/fetch');
const { createFakeDb } = require('./support/fake-db');

test('documents round trip nested leader instants', () => {
  const source = {
    _id: 'item-1',
    startAt: new Date('2026-01-01T00:00:00.000Z'),
    leaders: [
      {
        leaderId: 'p-1',
        confirmedAt: new Date('2026-01-01T01:00:00.000Z'),
        seenAt: null,
      },
    ],
  };
  const domain = toDomain(source);
  assert.equal(domain.id, 'item-1');
  assert.equal(domain.startAt, '2026-01-01T00:00:00.000Z');
  assert.equal(domain.leaders[0].confirmedAt, '2026-01-01T01:00:00.000Z');
  const document = toDoc(domain);
  assert.equal(document.id, undefined);
  assert.equal(document.startAt instanceof Date, true);
  assert.equal(document.leaders[0].confirmedAt instanceof Date, true);
});

test('document write data never contains an id', async () => {
  const db = createFakeDb();
  const data = toDoc({ id: 'item-1', nested: { id: 'leader-1' }, rev: 0 });
  assert.equal(Object.hasOwn(data, '_id'), false);
  assert.equal(Object.hasOwn(data, 'id'), false);
  await db.collection('items').doc('item-1').set({ data });
  assert.equal((await db.collection('items').doc('item-1').get()).data._id, 'item-1');
});

test('fetchAll pages past one hundred records and stops at max', async () => {
  const db = createFakeDb({
    things: Array.from({ length: 205 }, (_, index) => ({ _id: `${index}` })),
  });
  const all = await fetchAll(db.collection('things'));
  const limited = await fetchAll(db.collection('things'), { max: 155 });
  assert.equal(all.length, 205);
  assert.equal(limited.length, 155);
  assert.equal(limited.at(-1)._id, '154');
});
