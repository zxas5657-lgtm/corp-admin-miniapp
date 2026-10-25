'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDb } = require('./support/fake-db');

test('fake db supports filters, ordering, paging, counts, and updates', async () => {
  const db = createFakeDb({
    things: [
      { _id: 'a', n: 1, group: 'x', tags: ['one'] },
      { _id: 'b', n: 3, group: 'x', tags: ['two'] },
      { _id: 'c', n: 2, group: 'y', tags: ['one', 'two'] },
    ],
  });
  assert.deepEqual(
    (
      await db
        .collection('things')
        .where({ n: db.command.gte(2) })
        .orderBy('n', 'asc')
        .get()
    ).data.map((x) => x._id),
    ['c', 'b'],
  );
  assert.equal((await db.collection('things').where({ group: 'x' }).count()).total, 2);
  assert.deepEqual(
    (
      await db
        .collection('things')
        .where({ tags: db.command.in(['one']) })
        .get()
    ).data.map((x) => x._id),
    ['a', 'c'],
  );
  assert.deepEqual(
    (
      await db
        .collection('things')
        .where({ n: db.command.nin([1, 2]) })
        .get()
    ).data.map((x) => x._id),
    ['b'],
  );
  assert.deepEqual(
    (
      await db
        .collection('things')
        .where({ n: db.command.eq(1) })
        .get()
    ).data.map((x) => x._id),
    ['a'],
  );
  assert.deepEqual(
    (
      await db
        .collection('things')
        .where({ n: db.command.neq(1) })
        .get()
    ).data.map((x) => x._id),
    ['b', 'c'],
  );
  assert.deepEqual(
    (
      await db
        .collection('things')
        .where({ n: db.command.gt(2) })
        .get()
    ).data.map((x) => x._id),
    ['b'],
  );
  assert.deepEqual(
    (
      await db
        .collection('things')
        .where({ n: db.command.lt(2) })
        .get()
    ).data.map((x) => x._id),
    ['a'],
  );
  assert.deepEqual(
    (
      await db
        .collection('things')
        .where({ n: db.command.and(db.command.gte(2), db.command.lte(2)) })
        .get()
    ).data.map((x) => x._id),
    ['c'],
  );
  assert.deepEqual(
    (
      await db
        .collection('things')
        .where({ n: db.command.or(db.command.eq(1), db.command.eq(3)) })
        .get()
    ).data.map((x) => x._id),
    ['a', 'b'],
  );
  await db
    .collection('things')
    .where({ group: 'x' })
    .update({ data: { n: db.command.inc(1) } });
  assert.equal((await db.collection('things').doc('a').get()).data.n, 2);
  await db
    .collection('things')
    .doc('a')
    .update({ data: { removed: db.command.set('yes') } });
  assert.equal((await db.collection('things').doc('a').get()).data.removed, 'yes');
  await db
    .collection('things')
    .doc('a')
    .update({ data: { removed: db.command.remove() } });
  assert.equal(
    Object.hasOwn((await db.collection('things').doc('a').get()).data, 'removed'),
    false,
  );
  const many = createFakeDb({
    things: Array.from({ length: 101 }, (_, index) => ({ _id: String(index) })),
  });
  assert.equal((await many.collection('things').get()).data.length, 100);
});

test('fake db deep copies reads and writes and rolls back transactions', async () => {
  const date = new Date('2026-01-01T00:00:00.000Z');
  const db = createFakeDb({ things: [{ _id: 'a', date }] });
  const read = (await db.collection('things').doc('a').get()).data;
  read.date.setUTCFullYear(2030);
  assert.equal((await db.collection('things').doc('a').get()).data.date.getUTCFullYear(), 2026);
  await assert.rejects(
    db.runTransaction(async (tx) => {
      await tx
        .collection('things')
        .doc('a')
        .update({ data: { n: 1 } });
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal((await db.collection('things').doc('a').get()).data.n, undefined);
  await db.runTransaction(async (tx) => {
    await tx
      .collection('things')
      .doc('a')
      .update({ data: { n: 2 } });
  });
  assert.equal((await db.collection('things').doc('a').get()).data.n, 2);
  await db.collection('things').add({ data: { value: true } });
  assert.equal((await db.collection('things').get()).data.length, 2);
});

test('fake db bulk writes need a condition, exists matches all, ids stay unique', async () => {
  const db = createFakeDb({
    things: [{ _id: 'a', group: 1 }, { _id: 'b', group: 2 }, { _id: 'c' }],
  });
  const _ = db.command;
  await assert.rejects(db.collection('things').where({}).remove(), /non-empty where/);
  await assert.rejects(
    db
      .collection('things')
      .where({})
      .update({ data: { x: 1 } }),
    /non-empty where/,
  );
  assert.equal(
    (
      await db
        .collection('things')
        .where({ group: _.exists(true) })
        .count()
    ).total,
    2,
  );
  assert.equal(
    (
      await db
        .collection('things')
        .where({ group: _.exists(false) })
        .count()
    ).total,
    1,
  );
  const updated = await db
    .collection('things')
    .where({ group: _.gte(2) })
    .update({ data: { x: _.inc(1) } });
  assert.deepEqual(updated, { stats: { updated: 1 } });
  await assert.rejects(db.collection('things').add({ data: { _id: 'a' } }), /Duplicate _id a/);
  const removed = await db
    .collection('things')
    .where({ _id: _.exists(true) })
    .remove();
  assert.deepEqual(removed, { stats: { removed: 3 } });
  assert.equal((await db.collection('things').count()).total, 0);
});
