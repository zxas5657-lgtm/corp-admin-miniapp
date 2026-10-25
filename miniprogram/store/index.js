'use strict';

const { normalizeLocale } = require('../i18n/index');
const { seed: defaultSeed } = require('../data/seed');
const defaultClock = require('../domain/clock');
const { ROLE_CAPS } = require('../domain/permissions');
const { toDateStr } = require('../domain/dates');
const { createWxAdapter } = require('./adapter');
const {
  DATA_KEY,
  LOCALE_KEY,
  ROLE_KEY,
  SCHEMA_VERSION,
  migrate,
} = require('./schema');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function resultCode(result, fallback) {
  return result && result.code ? result.code : fallback;
}

function createStore(options) {
  const config = options || {};
  const adapter = config.adapter;
  const makeSeed = config.seed || defaultSeed;
  const clock = config.clock || defaultClock;
  let state = null;
  let pendingFocus = null;
  let selectedDate = null;
  let listeners = new Set();

  function seedState() {
    const value = makeSeed();
    return {
      meetings: clone(value.meetings || []),
      vehicles: clone(value.vehicles || []),
    };
  }

  function persistedData(value) {
    return {
      version: SCHEMA_VERSION,
      meetings: clone(value.meetings),
      vehicles: clone(value.vehicles),
    };
  }

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  function ensureState() {
    if (!state) state = seedState();
    return state;
  }

  function load() {
    let read;
    try {
      read = adapter.get(DATA_KEY);
    } catch (error) {
      state = seedState();
      return { ok: false, code: 'storage.readFailed' };
    }
    if (!read || read.ok !== true) {
      state = seedState();
      return { ok: false, code: resultCode(read, 'storage.readFailed') };
    }
    if (read.value === undefined) {
      const initial = seedState();
      let saved;
      try {
        saved = adapter.set(DATA_KEY, persistedData(initial));
      } catch (error) {
        state = initial;
        return { ok: false, code: 'storage.writeFailed' };
      }
      state = initial;
      if (!saved || saved.ok !== true) {
        return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
      }
      return { ok: true, dropped: 0 };
    }

    let migrated;
    try {
      migrated = migrate(read.value);
    } catch (error) {
      state = seedState();
      return { ok: false, code: 'storage.readFailed' };
    }
    if (!migrated.ok) {
      state = seedState();
      return { ok: false, code: migrated.code };
    }
    state = {
      meetings: clone(migrated.data.meetings),
      vehicles: clone(migrated.data.vehicles),
    };
    return { ok: true, dropped: migrated.dropped };
  }

  function writeState(next) {
    let saved;
    try {
      saved = adapter.set(DATA_KEY, persistedData(next));
    } catch (error) {
      return { ok: false, code: 'storage.writeFailed' };
    }
    if (!saved || saved.ok !== true) {
      return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
    }
    state = {
      meetings: clone(next.meetings),
      vehicles: clone(next.vehicles),
    };
    notify();
    return { ok: true };
  }

  function addMeeting(record) {
    const current = ensureState();
    return writeState({
      meetings: [...current.meetings, clone(record)],
      vehicles: current.vehicles,
    });
  }

  function updateMeeting(record) {
    const current = ensureState();
    let replaced = false;
    const meetings = current.meetings.map((meeting) => {
      if (meeting.id !== record.id) return meeting;
      replaced = true;
      return clone(record);
    });
    if (!replaced) meetings.push(clone(record));
    return writeState({ meetings, vehicles: current.vehicles });
  }

  function updateVehicle(record) {
    const current = ensureState();
    let replaced = false;
    const vehicles = current.vehicles.map((vehicle) => {
      if (vehicle.id !== record.id) return vehicle;
      replaced = true;
      return clone(record);
    });
    if (!replaced) vehicles.push(clone(record));
    return writeState({ meetings: current.meetings, vehicles });
  }

  function resetDemo() {
    const next = seedState();
    let saved;
    try {
      saved = adapter.set(DATA_KEY, persistedData(next));
    } catch (error) {
      return { ok: false, code: 'storage.writeFailed' };
    }
    if (!saved || saved.ok !== true) {
      return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
    }
    let roleSaved;
    try {
      roleSaved = adapter.set(ROLE_KEY, 'admin');
    } catch (error) {
      return { ok: false, code: 'storage.writeFailed' };
    }
    if (!roleSaved || roleSaved.ok !== true) {
      return { ok: false, code: resultCode(roleSaved, 'storage.writeFailed') };
    }
    state = next;
    notify();
    return { ok: true };
  }

  function getLocale() {
    let result;
    try {
      result = adapter.get(LOCALE_KEY);
    } catch (error) {
      return null;
    }
    if (!result || result.ok !== true || result.value === undefined) return null;
    return result.value;
  }

  function setLocale(locale) {
    const value = normalizeLocale(locale);
    let saved;
    try {
      saved = adapter.set(LOCALE_KEY, value);
    } catch (error) {
      return { ok: false, code: 'storage.writeFailed' };
    }
    if (!saved || saved.ok !== true) {
      return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
    }
    notify();
    return { ok: true };
  }

  function getRole() {
    let result;
    try {
      result = adapter.get(ROLE_KEY);
    } catch (error) {
      return 'admin';
    }
    if (!result || result.ok !== true || !Object.prototype.hasOwnProperty.call(ROLE_CAPS, result.value)) {
      return 'admin';
    }
    return result.value;
  }

  function setRole(role) {
    if (!Object.prototype.hasOwnProperty.call(ROLE_CAPS, role)) {
      return { ok: false, code: 'permission.denied' };
    }
    let saved;
    try {
      saved = adapter.set(ROLE_KEY, role);
    } catch (error) {
      return { ok: false, code: 'storage.writeFailed' };
    }
    if (!saved || saved.ok !== true) {
      return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
    }
    notify();
    return { ok: true };
  }

  const ui = {
    setPendingFocus(value) {
      pendingFocus = clone(value);
    },
    takePendingFocus() {
      const value = pendingFocus;
      pendingFocus = null;
      return clone(value);
    },
    setSelectedDate(value) {
      selectedDate = value;
    },
    getSelectedDate() {
      if (selectedDate === null) selectedDate = toDateStr(clock.now());
      return selectedDate;
    },
  };

  return {
    load,
    getState() {
      const current = ensureState();
      return clone(current);
    },
    addMeeting,
    updateMeeting,
    updateVehicle,
    resetDemo,
    getLocale,
    setLocale,
    getRole,
    setRole,
    ui,
    subscribe(fn) {
      if (typeof fn !== 'function') throw new TypeError('subscribe requires a function');
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

let singleton = null;

function getStore() {
  if (!singleton) {
    const wxApi = typeof wx === 'undefined' ? {} : wx;
    singleton = createStore({
      adapter: createWxAdapter(wxApi),
      seed: defaultSeed,
      clock: defaultClock,
    });
  }
  return singleton;
}

module.exports = { createStore, getStore };
