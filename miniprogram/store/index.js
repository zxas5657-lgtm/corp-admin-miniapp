'use strict';

const { normalizeLocale } = require('../i18n/index');
const { seed: defaultSeed } = require('../data/seed');
const defaultClock = require('../domain/clock');
const { ROLE_CAPS, normalizeRole } = require('../domain/permissions');
const tz = require('../domain/tz');
const { createWxAdapter } = require('./adapter');
const { DATA_KEY, LOCALE_KEY, ROLE_KEY, SCHEMA_VERSION, migrate } = require('./schema');
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
  const listeners = new Set();
  function seedState() {
    const value = makeSeed();
    return {
      items: clone(value.items || []),
      vehicles: clone(value.vehicles || []),
      notes: clone(value.notes || []),
    };
  }
  function persistedData(value) {
    return {
      version: SCHEMA_VERSION,
      items: clone(value.items),
      vehicles: clone(value.vehicles),
      notes: clone(value.notes || []),
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
      if (!saved || saved.ok !== true)
        return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
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
      items: clone(migrated.data.items),
      vehicles: clone(migrated.data.vehicles),
      notes: clone(migrated.data.notes || []),
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
    if (!saved || saved.ok !== true)
      return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
    state = {
      items: clone(next.items),
      vehicles: clone(next.vehicles),
      notes: clone(next.notes || []),
    };
    notify();
    return { ok: true };
  }
  function addItem(record) {
    const current = ensureState();
    return writeState({
      items: [...current.items, clone(record)],
      vehicles: current.vehicles,
      notes: current.notes,
    });
  }
  function addItems(records) {
    const current = ensureState();
    return writeState({
      items: [...current.items, ...clone(records || [])],
      vehicles: current.vehicles,
      notes: current.notes,
    });
  }
  function updateItem(record) {
    const current = ensureState();
    let replaced = false;
    const items = current.items.map((item) => {
      if (item.id !== record.id) return item;
      replaced = true;
      return clone(record);
    });
    if (!replaced) items.push(clone(record));
    return writeState({ items, vehicles: current.vehicles, notes: current.notes });
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
    return writeState({ items: current.items, vehicles, notes: current.notes });
  }
  function addNote(record) {
    const current = ensureState();
    return writeState({
      items: current.items,
      vehicles: current.vehicles,
      notes: [...current.notes, clone(record)],
    });
  }
  function updateNote(record) {
    const current = ensureState();
    let replaced = false;
    const notes = current.notes.map((note) => {
      if (note.id !== record.id) return note;
      replaced = true;
      return clone(record);
    });
    if (!replaced) notes.push(clone(record));
    return writeState({ items: current.items, vehicles: current.vehicles, notes });
  }
  function resetDemo() {
    const next = seedState();
    let saved;
    try {
      saved = adapter.set(DATA_KEY, persistedData(next));
    } catch (error) {
      return { ok: false, code: 'storage.writeFailed' };
    }
    if (!saved || saved.ok !== true)
      return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
    let roleSaved;
    try {
      roleSaved = adapter.set(ROLE_KEY, 'secretary');
    } catch (error) {
      return { ok: false, code: 'storage.writeFailed' };
    }
    if (!roleSaved || roleSaved.ok !== true)
      return { ok: false, code: resultCode(roleSaved, 'storage.writeFailed') };
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
    return result && result.ok === true && result.value !== undefined ? result.value : null;
  }
  function setLocale(locale) {
    const value = normalizeLocale(locale);
    let saved;
    try {
      saved = adapter.set(LOCALE_KEY, value);
    } catch (error) {
      return { ok: false, code: 'storage.writeFailed' };
    }
    if (!saved || saved.ok !== true)
      return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
    notify();
    return { ok: true };
  }
  function getRole() {
    let result;
    try {
      result = adapter.get(ROLE_KEY);
    } catch (error) {
      return 'secretary';
    }
    const role = result && result.ok === true ? normalizeRole(result.value) : 'secretary';
    return Object.prototype.hasOwnProperty.call(ROLE_CAPS, role) ? role : 'secretary';
  }
  function setRole(role) {
    const value = normalizeRole(role);
    if (!Object.prototype.hasOwnProperty.call(ROLE_CAPS, value))
      return { ok: false, code: 'permission.denied' };
    let saved;
    try {
      saved = adapter.set(ROLE_KEY, value);
    } catch (error) {
      return { ok: false, code: 'storage.writeFailed' };
    }
    if (!saved || saved.ok !== true)
      return { ok: false, code: resultCode(saved, 'storage.writeFailed') };
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
      if (selectedDate === null) selectedDate = tz.toZoned(clock.now(), clock.viewerZone()).date;
      return selectedDate;
    },
  };
  return {
    load,
    getState() {
      return clone(ensureState());
    },
    addItem,
    addItems,
    updateItem,
    updateVehicle,
    addNote,
    updateNote,
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
