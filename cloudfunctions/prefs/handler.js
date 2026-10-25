'use strict';

const tz = require('./shared/domain/tz');
const { isTimeStr } = require('./shared/domain/dates');
const { getDoc, loadCaller } = require('./shared/lib/caller');
const { fail, ok, wrap } = require('./shared/lib/result');

// The server's own zone is meaningless for users; the app refreshes tz from the phone on open.
const DEFAULT_TZ = 'Asia/Shanghai';
const MAX_OFFSET_MIN = 24 * 60;

function defaults(employeeId, at) {
  return {
    _id: employeeId,
    tz: DEFAULT_TZ,
    tzUpdatedAt: at,
    itemOffsetMin: 15,
    itemRemindersOn: true,
    digestTimes: ['08:00', '18:00'],
    digestOn: true,
    v: 1,
    rev: 0,
  };
}

const VALIDATORS = {
  tz: (value) => (tz.isValidZone(value) ? null : 'prefs.tzInvalid'),
  itemOffsetMin: (value) =>
    Number.isInteger(value) && value >= 0 && value <= MAX_OFFSET_MIN ? null : 'prefs.invalid',
  itemRemindersOn: (value) => (typeof value === 'boolean' ? null : 'prefs.invalid'),
  digestOn: (value) => (typeof value === 'boolean' ? null : 'prefs.invalid'),
  digestTimes: (value) =>
    Array.isArray(value) && value.length <= 4 && value.every((time) => isTimeStr(time))
      ? null
      : 'prefs.invalid',
};

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
    const current = (await getDoc(db, 'reminder_prefs', employeeId)) || defaults(employeeId, now());
    if (event.action === 'get') return ok({ prefs: current });
    const patch = event.patch && typeof event.patch === 'object' ? event.patch : {};
    const next = { ...current };
    for (const [field, validate] of Object.entries(VALIDATORS)) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
      const code = validate(patch[field]);
      if (code) return fail(code);
      next[field] = patch[field];
    }
    if (next.tz !== current.tz) next.tzUpdatedAt = now();
    next.v = 1;
    next.rev = (current.rev || 0) + 1;
    // The SDK rejects _id inside set() data; the doc id carries it.
    const { _id, ...data } = next;
    await db.collection('reminder_prefs').doc(employeeId).set({ data });
    return ok({ prefs: { ...data, _id: employeeId } });
  }
  return (event, context) => wrap(() => dispatch(event, context), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
