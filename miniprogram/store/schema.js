'use strict';

const SCHEMA_VERSION = 2;
const DATA_KEY = 'corp-admin-v2';
const LOCALE_KEY = 'corp-admin-locale';
const ROLE_KEY = 'corp-admin-role';
const MIGRATIONS = {};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function migrationResult(value) {
  if (value && value.ok === false) return null;
  if (value && value.ok === true && Object.prototype.hasOwnProperty.call(value, 'data')) {
    return value.data;
  }
  return value;
}

function migrate(data, migrations) {
  if (!isRecord(data) || !Number.isInteger(data.version)) {
    return { ok: false, code: 'storage.readFailed' };
  }
  if (data.version > SCHEMA_VERSION || data.version < 0) {
    return { ok: false, code: 'storage.readFailed' };
  }

  const steps = migrations || MIGRATIONS;
  let current = clone(data);
  while (current.version < SCHEMA_VERSION) {
    const step = steps[current.version];
    if (typeof step !== 'function') return { ok: false, code: 'storage.readFailed' };
    const previousVersion = current.version;
    current = migrationResult(step(current));
    if (!isRecord(current) || !Number.isInteger(current.version) || current.version <= previousVersion) {
      return { ok: false, code: 'storage.readFailed' };
    }
    if (current.version > SCHEMA_VERSION) {
      return { ok: false, code: 'storage.readFailed' };
    }
  }

  if (!Array.isArray(current.meetings) || !Array.isArray(current.vehicles)) {
    return { ok: false, code: 'storage.readFailed' };
  }

  let dropped = 0;
  const validRecords = (records) => records.filter((record) => {
    const valid = isRecord(record) && Boolean(record.id) && Boolean(record.date);
    if (!valid) dropped += 1;
    return valid;
  });
  const clean = {
    ...current,
    version: SCHEMA_VERSION,
    meetings: validRecords(current.meetings),
    vehicles: validRecords(current.vehicles),
  };
  return { ok: true, data: clean, dropped };
}

module.exports = {
  SCHEMA_VERSION,
  DATA_KEY,
  LOCALE_KEY,
  ROLE_KEY,
  MIGRATIONS,
  migrate,
};
