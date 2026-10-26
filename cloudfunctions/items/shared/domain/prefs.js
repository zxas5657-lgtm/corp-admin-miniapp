'use strict';

const { isTimeStr } = require('./dates');
const tz = require('./tz');

const DEFAULT_TZ = 'Asia/Shanghai';
const MAX_OFFSET_MIN = 24 * 60;

function defaults(employeeId, at) {
  const now = at instanceof Date ? at : new Date(at || Date.now());
  return {
    id: employeeId,
    tz: DEFAULT_TZ,
    tzUpdatedAt: now.toISOString(),
    itemOffsetMin: 15,
    itemRemindersOn: true,
    digestTimes: ['08:00', '18:00'],
    digestOn: true,
    v: 1,
    rev: 0,
  };
}

const VALIDATORS = Object.freeze({
  tz: (value) => (tz.isValidZone(value) ? null : 'prefs.tzInvalid'),
  itemOffsetMin: (value) =>
    Number.isInteger(value) && value >= 0 && value <= MAX_OFFSET_MIN ? null : 'prefs.invalid',
  itemRemindersOn: (value) => (typeof value === 'boolean' ? null : 'prefs.invalid'),
  digestOn: (value) => (typeof value === 'boolean' ? null : 'prefs.invalid'),
  digestTimes: (value) =>
    Array.isArray(value) && value.length <= 4 && value.every((time) => isTimeStr(time))
      ? null
      : 'prefs.invalid',
});

function validatePrefs(patch) {
  const value = patch && typeof patch === 'object' ? patch : {};
  for (const [field, validate] of Object.entries(VALIDATORS)) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    const code = validate(value[field]);
    if (code) return code;
  }
  return null;
}

function updatePrefs(current, patch, at) {
  const code = validatePrefs(patch);
  if (code) return { ok: false, code };
  const value = current || defaults(null, at);
  const next = { ...value };
  // Only user-editable fields; tzUpdatedAt, v and rev are set here, never by the client.
  for (const field of Object.keys(VALIDATORS)) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, field)) next[field] = patch[field];
  }
  if (next.tz !== value.tz) next.tzUpdatedAt = new Date(at || Date.now()).toISOString();
  next.v = 1;
  next.rev = (value.rev || 0) + 1;
  return { ok: true, prefs: next };
}

module.exports = { DEFAULT_TZ, MAX_OFFSET_MIN, defaults, validatePrefs, updatePrefs };
