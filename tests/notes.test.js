'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ref = require('../miniprogram/data/reference');
const {
  createNote,
  convertNote,
  closeNote,
  noteVisibleTo,
} = require('../miniprogram/domain/notes');

const now = new Date('2026-10-24T01:20:00.000Z');
const ctx = { supports: ref.SUPPORTS };

test('leaders create notes and invalid note text returns localized codes', () => {
  const result = createNote('  Please plan a client trip  ', {
    id: 'note-1',
    actor: ref.actorFor('leader'),
    now,
  });
  assert.equal(result.ok, true);
  const { note } = result;
  assert.equal(note.status, 'open');
  assert.equal(note.text, 'Please plan a client trip');
  assert.equal(note.leaderId, 'p-chen');
  assert.deepEqual(createNote('', { id: 'empty', actor: ref.actorFor('leader'), now }), {
    ok: false,
    code: 'note.text.required',
  });
  assert.deepEqual(
    createNote('x'.repeat(201), { id: 'long', actor: ref.actorFor('leader'), now }),
    { ok: false, code: 'note.text.tooLong' },
  );
  assert.deepEqual(
    createNote('No access', { id: 'denied', actor: ref.actorFor('secretary'), now }),
    { ok: false, code: 'permission.denied' },
  );
});

test('supported secretaries convert and close notes', () => {
  const { note } = createNote('Please schedule a trip', {
    id: 'note-2',
    actor: ref.actorFor('leader'),
    now,
  });
  const convertedResult = convertNote(note, ['t1'], {
    actor: ref.actorFor('secretary'),
    now,
    ctx,
  });
  assert.equal(convertedResult.ok, true);
  const converted = convertedResult.note;
  assert.equal(converted.status, 'converted');
  assert.deepEqual(converted.itemIds, ['t1']);
  assert.equal(converted.handledBy, 'p-lin');
  assert.equal(converted.rev, 1);
  const closedResult = closeNote(converted, { actor: ref.actorFor('secretaryAdmin'), now, ctx });
  assert.equal(closedResult.ok, true);
  const closed = closedResult.note;
  assert.equal(closed.status, 'closed');
  assert.equal(closed.rev, 2);
  assert.equal(closed.handledBy, 'p-he');
  assert.deepEqual(convertNote(note, ['t1'], { actor: ref.actorFor('receptionist'), now, ctx }), {
    ok: false,
    code: 'permission.denied',
  });
});

test('note visibility follows leader support mappings', () => {
  const { note } = createNote('Visible to support', {
    id: 'note-3',
    actor: ref.actorFor('leader'),
    now,
  });
  assert.equal(noteVisibleTo(ref.actorFor('leader'), note, ctx), true);
  assert.equal(noteVisibleTo(ref.actorFor('secretary'), note, ctx), true);
  assert.equal(noteVisibleTo(ref.actorFor('secretaryAdmin'), note, ctx), true);
  assert.equal(noteVisibleTo(ref.actorFor('receptionAdmin'), note, ctx), false);
  assert.equal(noteVisibleTo(ref.actorFor('driver'), note, ctx), false);
});
