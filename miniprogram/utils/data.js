'use strict';

const clock = require('../domain/clock');
const dates = require('../domain/dates');
const i18n = require('../i18n/index');
const tz = require('../domain/tz');
const { visibleItems } = require('../domain/visibility');
const { getStore } = require('../store/index');
const { resetApi } = require('../store/api');
const { api: authApi } = require('./auth');
const { isDemo } = require('./env');
const { session } = require('./session');

// List pages have no date pager yet (S3-F4). Keep the window short: the cloud
// list reads at most 1000 rows before it filters by visibility.
const CATALOG_BEFORE_DAYS = 60;
const CATALOG_AFTER_DAYS = 120;

let factory = null;
let built = null;
let apiStub = null;
let generation = 0;
let rangeEpoch = 0;
let directoryCache = null;
let directoryInflight = null;
const rangeCache = new Map();
const rangeInflight = new Map();
const listeners = new Set();

function api() {
  if (factory) {
    if (!built) built = factory();
    return built;
  }
  return authApi();
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function indexById(list) {
  const map = Object.create(null);
  const items = list || [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item && item.id) map[item.id] = item;
  }
  return map;
}

function refsFrom(payload) {
  const rooms = (payload && payload.rooms) || [];
  const cars = (payload && payload.cars) || [];
  const people = (payload && (payload.employees || payload.people)) || [];
  const roomMap = indexById(rooms);
  const carMap = indexById(cars);
  const personMap = indexById(people);
  const drivers = [];
  for (let i = 0; i < people.length; i += 1) {
    if (people[i] && people[i].role === 'driver' && people[i].id) drivers.push(people[i].id);
  }
  return {
    ROOMS: rooms,
    CARS: cars,
    PEOPLE: people,
    DRIVERS: drivers,
    roomById(id) {
      return roomMap[id] || null;
    },
    carById(id) {
      return carMap[id] || null;
    },
    personById(id) {
      return personMap[id] || null;
    },
    isLeader(id) {
      const person = personMap[id];
      return Boolean(person && person.role === 'leader');
    }
  };
}

function settle(result) {
  if (!result || result.ok !== true) {
    const code = result && result.code ? result.code : 'network.failed';
    return { ok: false, code: code };
  }
  return result;
}

function call(method, payload) {
  const stub = apiStub && apiStub[method];
  if (stub) {
    if (stub.pending) return new Promise(function () {});
    return Promise.resolve(settle(stub));
  }
  let pending;
  try {
    const target = api()[method];
    if (typeof target !== 'function') return Promise.resolve({ ok: false, code: 'network.failed' });
    pending = target(payload);
  } catch (err) {
    return Promise.resolve({ ok: false, code: 'network.failed' });
  }
  return Promise.resolve(pending).then(settle, function () {
    return { ok: false, code: 'network.failed' };
  });
}

function span(startDate, endDate, viewerTz) {
  const from = tz.fromZoned(startDate, '00:00', viewerTz);
  const to = tz.fromZoned(dates.addDays(endDate, 1), '00:00', viewerTz);
  if (!from || !to) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}

function weekWindow(date, viewerTz) {
  const days = dates.weekDays(date, i18n.firstDayOfWeek());
  return span(days[0], days[days.length - 1], viewerTz);
}

function dayWindow(date, viewerTz) {
  return span(date, date, viewerTz);
}

function catalogWindow(viewerTz) {
  const today = tz.toZoned(clock.now(), viewerTz).date;
  const start = dates.addDays(today, -CATALOG_BEFORE_DAYS);
  const end = dates.addDays(today, CATALOG_AFTER_DAYS);
  return span(start, end, viewerTz);
}

function loadDirectory(options) {
  const fresh = Boolean(options && options.fresh);
  if (!fresh && directoryCache) return Promise.resolve({ ok: true, refs: directoryCache });
  if (!fresh && directoryInflight) return directoryInflight;
  const gen = generation;
  const pending = call('directory').then(function (result) {
    if (directoryInflight === pending) directoryInflight = null;
    // A role switch landed mid-flight: load again for the new session.
    if (gen !== generation) return loadDirectory(options);
    if (!result.ok) return { ok: false, code: result.code };
    directoryCache = refsFrom(result);
    return { ok: true, refs: directoryCache };
  });
  directoryInflight = pending;
  return pending;
}

function rangeKey(window) {
  return window.from + '|' + window.to;
}

function itemInWindow(item, window) {
  const start = new Date(window.from);
  const end = new Date(window.to);
  if (item && item.allDay) {
    const zone = item.tz || 'Asia/Shanghai';
    const dayStart = tz.fromZoned(item.date, '00:00', zone);
    const next = item.date ? dates.addDays(item.date, 1) : '';
    const dayEnd = next ? tz.fromZoned(next, '00:00', zone) : null;
    return Boolean(dayStart && dayEnd && start < dayEnd && dayStart < end);
  }
  const itemStart = new Date(item && item.startAt);
  const itemEnd = new Date(item && item.endAt);
  return itemStart < end && start < itemEnd;
}

// Local listItems keeps only a secretary's supported leaders. The cloud list
// and the view model also keep meetings that secretary organizes. Demo mode
// adds those rows so both modes show the same page.
function demoItems(window, listed) {
  if (!isDemo() || factory || (apiStub && apiStub.listItems)) return listed;
  const current = session(getStore());
  const role = current.actor && current.actor.role;
  if (role !== 'secretary') return listed;
  const state = getStore().getState() || {};
  const visible = visibleItems(current.actor, state.items || [], current.ctx);
  const items = listed.slice();
  const seen = new Set();
  for (let i = 0; i < items.length; i += 1) {
    if (items[i] && items[i].id) seen.add(items[i].id);
  }
  for (let i = 0; i < visible.length; i += 1) {
    const item = visible[i];
    if (!item || seen.has(item.id) || !itemInWindow(item, window)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

function loadRange(window, options) {
  if (!window || !window.from || !window.to) {
    return Promise.resolve({ ok: false, code: 'network.failed' });
  }
  const fresh = Boolean(options && options.fresh);
  const key = rangeKey(window);
  if (!fresh && rangeCache.has(key)) {
    return Promise.resolve({ ok: true, state: clone(rangeCache.get(key)) });
  }
  if (!fresh && rangeInflight.has(key)) return rangeInflight.get(key);
  const gen = generation;
  const epoch = rangeEpoch;
  const pending = Promise.all([
    call('listItems', { from: window.from, to: window.to }),
    call('listVehicles', { from: window.from, to: window.to })
  ]).then(function (results) {
    if (rangeInflight.get(key) === pending) rangeInflight.delete(key);
    // A write or role switch landed mid-flight: this result is stale, so load again.
    if (gen !== generation || epoch !== rangeEpoch) return loadRange(window, options);
    if (!results[0].ok) return { ok: false, code: results[0].code };
    if (!results[1].ok) return { ok: false, code: results[1].code };
    const state = {
      items: demoItems(window, results[0].items || []),
      vehicles: results[1].vehicles || []
    };
    rangeCache.set(key, state);
    return { ok: true, state: clone(state) };
  });
  rangeInflight.set(key, pending);
  return pending;
}

function emit() {
  const current = Array.from(listeners);
  for (let i = 0; i < current.length; i += 1) {
    try {
      current[i]();
    } catch (err) {
      // A listener must not break the write that notified it.
    }
  }
}

function invalidate() {
  rangeEpoch += 1;
  rangeCache.clear();
  rangeInflight.clear();
  emit();
}

function write(method, payload) {
  return call(method, payload).then(function (result) {
    if (result && result.ok === true) invalidate();
    return result;
  });
}

function onChange(fn) {
  if (typeof fn !== 'function') return function () {};
  listeners.add(fn);
  return function () {
    listeners.delete(fn);
  };
}

function resetSession() {
  generation += 1;
  rangeEpoch += 1;
  resetApi();
  built = null;
  directoryCache = null;
  directoryInflight = null;
  rangeCache.clear();
  rangeInflight.clear();
}

function setApiStub(value) {
  apiStub = value && typeof value === 'object' ? value : null;
  return true;
}

function setApiFactory(fn) {
  factory = typeof fn === 'function' ? fn : null;
  built = null;
  directoryCache = null;
  directoryInflight = null;
  rangeCache.clear();
  rangeInflight.clear();
  generation += 1;
  rangeEpoch += 1;
}

function failureKeys(code) {
  if (code === 'network.failed') {
    return { code: 'network.failed', titleKey: 'error.network.failed' };
  }
  return { code: code || 'server.error', titleKey: 'error.server.error' };
}

function failurePatch(code, translate) {
  const failure = failureKeys(code);
  return {
    phase: 'error',
    errorCode: failure.code,
    errorTitle: translate(failure.titleKey),
    errorBody: '',
    retryText: translate('state.retry')
  };
}

function createGate() {
  let token = 0;
  return {
    next() {
      token += 1;
      return token;
    },
    isCurrent(value) {
      return value === token;
    }
  };
}

function isRevConflict(code) {
  return code === 'item.alreadyChanged' || code === 'vehicle.alreadyHandled';
}

module.exports = {
  api,
  loadDirectory,
  loadRange,
  write,
  onChange,
  resetSession,
  invalidate,
  setApiStub,
  setApiFactory,
  weekWindow,
  dayWindow,
  catalogWindow,
  failureKeys,
  failurePatch,
  createGate,
  isRevConflict,
  refsFrom
};
