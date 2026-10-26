'use strict';

const { convertNote, closeNote, createNote, noteVisibleTo } = require('./shared/domain/notes');
const { itemVisibleTo } = require('./shared/domain/visibility');
const { fail, ok, wrap } = require('./shared/lib/result');
const { fetchAll } = require('./shared/lib/fetch');
const { getDoc, loadCaller } = require('./shared/lib/caller');
const { loadContext } = require('./shared/lib/context');
const { newId: randomId } = require('./shared/lib/ids');
const {
  addRecord,
  auditWrite,
  codedError,
  setRecord,
  toDomain,
  txGet,
} = require('./shared/lib/handler-support');

function createHandler(config) {
  const options = config || {};
  const db = options.db;
  const now = options.now || (() => new Date());
  const log = options.log;
  const newId = options.newId || randomId;

  async function dispatch(event, contextValue) {
    const action = event && event.action;
    if (!['list', 'create', 'convert', 'close'].includes(action)) return fail('action.unknown');
    const caller = await loadCaller(db, contextValue && contextValue.openid);
    if (!caller.ok) return caller;
    const actor = caller.actor;
    const context = await loadContext(db);
    const at = new Date(now());

    if (action === 'list') {
      const records = await fetchAll(db.collection('leader_notes'));
      const notes = records
        .map(toDomain)
        .filter((note) => noteVisibleTo(actor, note, context))
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
      return ok({ notes });
    }

    if (action === 'create') {
      const result = createNote(event.text, { actor, now: at, id: newId('note') });
      if (!result.ok) return result;
      try {
        await db.runTransaction(async (tx) => {
          await addRecord(tx, 'leader_notes', result.note);
          await auditWrite(
            tx,
            actor.personId,
            'note.create',
            'leader_note',
            result.note.id,
            { status: result.note.status },
            at,
          );
        });
      } catch (error) {
        return fail(error.resultCode || 'server.error');
      }
      return ok({ note: result.note });
    }

    const raw = event.id ? await getDoc(db, 'leader_notes', event.id) : null;
    const note = raw ? toDomain(raw) : null;
    if (!note || !noteVisibleTo(actor, note, context)) return fail('item.notVisible');
    if (action === 'convert') {
      if (!Array.isArray(event.itemIds)) return fail('item.ids.required');
      for (const itemId of event.itemIds) {
        const item = await getDoc(db, 'items', itemId);
        if (!item || !itemVisibleTo(actor, toDomain(item), context)) return fail('item.notVisible');
      }
    }
    try {
      let result;
      await db.runTransaction(async (tx) => {
        const currentRaw = await txGet(tx, 'leader_notes', note.id);
        if (!currentRaw) throw codedError('item.notVisible');
        const current = toDomain(currentRaw);
        result =
          action === 'convert'
            ? convertNote(current, event.itemIds, { actor, now: at, ctx: context })
            : closeNote(current, { actor, now: at, ctx: context });
        if (!result.ok) throw codedError(result.code);
        await setRecord(tx, 'leader_notes', result.note);
        await auditWrite(
          tx,
          actor.personId,
          `note.${action}`,
          'leader_note',
          result.note.id,
          { status: result.note.status },
          at,
        );
      });
      return ok({ note: result.note });
    } catch (error) {
      return fail(error.resultCode || 'server.error');
    }
  }

  return (event, contextValue) => wrap(() => dispatch(event, contextValue), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
