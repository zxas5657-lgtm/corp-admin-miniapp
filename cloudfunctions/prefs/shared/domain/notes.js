'use strict';

const { normalizeRole } = require('./permissions');

function asDate(value) {
  const result = value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function timestamp(value) {
  const date = asDate(value) || new Date();
  return date.toISOString();
}

function actorRole(actor) {
  return normalizeRole(actor && actor.role);
}

function noteVisibleTo(actor, note, ctx) {
  if (!actor || !note) return false;
  if (actor.personId === note.leaderId) return true;
  const role = actorRole(actor);
  if (role === 'secretaryAdmin') return true;
  if (role !== 'secretary') return false;
  const supports = (ctx && ctx.supports) || {};
  return (
    Array.isArray(supports[actor.personId]) && supports[actor.personId].includes(note.leaderId)
  );
}

function createNote(text, options) {
  const config = options || {};
  if (actorRole(config.actor) !== 'leader') return { ok: false, code: 'permission.denied' };
  if (typeof text !== 'string' || text.trim() === '')
    return { ok: false, code: 'note.text.required' };
  if (text.trim().length > 200) return { ok: false, code: 'note.text.tooLong' };
  const at = timestamp(config.now);
  const note = {
    id: config.id,
    leaderId: config.actor.personId,
    text: text.trim(),
    status: 'open',
    itemIds: [],
    handledBy: null,
    createdAt: at,
    handledAt: null,
    v: 1,
    rev: 0,
  };
  return { ok: true, note };
}

function canHandle(note, config) {
  const actor = config.actor || {};
  const role = actorRole(actor);
  if (role !== 'leader' && role !== 'secretary' && role !== 'secretaryAdmin') return false;
  return noteVisibleTo(actor, note, config.ctx);
}

function convertNote(note, itemIds, options) {
  const config = options || {};
  if (!canHandle(note, config)) return { ok: false, code: 'permission.denied' };
  if (!Array.isArray(itemIds)) return { ok: false, code: 'item.ids.required' };
  const at = timestamp(config.now);
  return {
    ok: true,
    note: {
      ...note,
      status: 'converted',
      itemIds: [...new Set(itemIds)],
      handledBy: config.actor.personId,
      handledAt: at,
      rev: (note.rev || 0) + 1,
    },
  };
}

function closeNote(note, options) {
  const config = options || {};
  if (!canHandle(note, config)) return { ok: false, code: 'permission.denied' };
  const at = timestamp(config.now);
  return {
    ok: true,
    note: {
      ...note,
      status: 'closed',
      handledBy: config.actor.personId,
      handledAt: at,
      rev: (note.rev || 0) + 1,
    },
  };
}

module.exports = { createNote, convertNote, closeNote, noteVisibleTo };
