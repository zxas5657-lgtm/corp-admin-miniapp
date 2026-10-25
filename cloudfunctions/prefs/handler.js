'use strict';

const { defaults, updatePrefs, validatePrefs } = require('./shared/domain/prefs');
const { getDoc, loadCaller } = require('./shared/lib/caller');
const { fail, ok, wrap } = require('./shared/lib/result');

const PREF_FIELDS = ['tz', 'itemOffsetMin', 'itemRemindersOn', 'digestOn', 'digestTimes'];

function fromServer(value, employeeId) {
  const source = value || {};
  const { _id, ...rest } = source;
  return { ...rest, id: _id || employeeId };
}

function toServer(value, employeeId) {
  const source = value || {};
  const { id, ...rest } = source;
  const stamp = rest.tzUpdatedAt instanceof Date ? rest.tzUpdatedAt : new Date(rest.tzUpdatedAt);
  return {
    ...rest,
    _id: employeeId,
    tzUpdatedAt: stamp,
  };
}

function createHandler(config) {
  const options = config || {};
  const db = options.db;
  const now = options.now || (() => new Date());
  const log = options.log;
  async function dispatch(event, context) {
    if (!event || (event.action !== 'get' && event.action !== 'update'))
      return fail('action.unknown');
    const caller = await loadCaller(db, context && context.openid);
    if (!caller.ok) return caller;
    const employeeId = caller.actor.personId;
    const stored = await getDoc(db, 'reminder_prefs', employeeId);
    const current = stored || toServer(defaults(employeeId, now()), employeeId);
    if (event.action === 'get') return ok({ prefs: current });
    const patch = event.patch && typeof event.patch === 'object' ? event.patch : {};
    const filtered = Object.fromEntries(
      PREF_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(patch, field)).map(
        (field) => [field, patch[field]],
      ),
    );
    const clientCurrent = fromServer(current, employeeId);
    const code = validatePrefs(filtered);
    if (code) return fail(code);
    const result = updatePrefs(clientCurrent, filtered, now());
    if (!result.ok) return fail(result.code);
    const next = toServer(result.prefs, employeeId);
    const { _id, ...data } = next;
    await db.collection('reminder_prefs').doc(employeeId).set({ data });
    return ok({ prefs: next });
  }
  return (event, context) => wrap(() => dispatch(event, context), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
