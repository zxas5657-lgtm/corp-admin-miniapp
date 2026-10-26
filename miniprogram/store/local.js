'use strict';

const reference = require('../data/reference');
const clockDefault = require('../domain/clock');
const dates = require('../domain/dates');
const { createItem, createSeries, markArrived, validateItem } = require('../domain/item');
const { validateMeeting, cancelMeeting } = require('../domain/meeting');
const { confirmItem, declineItem, markSeen, changeItem } = require('../domain/confirm');
const { createNote, convertNote, closeNote, noteVisibleTo } = require('../domain/notes');
const { can, normalizeRole } = require('../domain/permissions');
const { createVehicleRequest, transition, validateVehicle } = require('../domain/vehicle');
const { visibleItems, visibleVehicles, canEditItem } = require('../domain/visibility');
const tz = require('../domain/tz');
const { defaults, updatePrefs } = require('../domain/prefs');
const { PREFS_KEY } = require('./schema');
const { VISITOR_PICKUP_REASON } = require('../data/labels');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function resultCode(errors) {
  return errors && errors.length ? errors[0].code : null;
}

function createLocalApi(options) {
  const config = options || {};
  const store = config.store;
  const actor = config.actor || reference.actorFor('secretary');
  const clock = config.clock || clockDefault;
  const context = {
    supports: reference.SUPPORTS,
    isLeader: reference.isLeader,
    roomById: reference.roomById,
    personById: reference.personById,
    ...(config.ctx || {}),
  };
  let idCounter = 0;
  const newId =
    typeof config.newId === 'function' ? config.newId : (prefix) => `${prefix}-${++idCounter}`;
  const now = () => (typeof clock.now === 'function' ? clock.now() : new Date());

  function state() {
    return store && typeof store.getState === 'function'
      ? store.getState()
      : { items: [], vehicles: [], notes: [] };
  }

  function write(method, value) {
    if (!store || typeof store[method] !== 'function')
      return { ok: false, code: 'storage.writeFailed' };
    const result = store[method](value);
    return result && result.ok === true
      ? { ok: true }
      : result || { ok: false, code: 'storage.writeFailed' };
  }

  function itemOptions(extra) {
    return {
      actor,
      now: now(),
      ctx: context,
      tz: actor.tz || context.tz || 'Asia/Shanghai',
      isLeader: context.isLeader,
      itemById: (id) => state().items.find((item) => item.id === id) || null,
      roomById: context.roomById,
      personById: context.personById,
      ...(extra || {}),
    };
  }

  function inRange(item, from, to) {
    if (!from || !to) return true;
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
    if (item.allDay) {
      const dayStart = tz.fromZoned(item.date, '00:00', item.tz || 'Asia/Shanghai');
      const nextDate = dates.addDays(item.date, 1);
      const dayEnd = tz.fromZoned(nextDate, '00:00', item.tz || 'Asia/Shanghai');
      return dayStart && dayEnd && start < dayEnd && dayStart < end;
    }
    const itemStart = new Date(item.startAt);
    const itemEnd = new Date(item.endAt);
    return (
      !Number.isNaN(itemStart.getTime()) &&
      !Number.isNaN(itemEnd.getTime()) &&
      itemStart < end &&
      start < itemEnd
    );
  }

  function visibleRange(from, to) {
    const role = normalizeRole(actor.role);
    const supported = context.supports[actor.personId] || [];
    return visibleItems(actor, state().items, context)
      .filter((item) => {
        if (role === 'receptionist' || role === 'receptionAdmin') return item.kind === 'visit';
        if (role === 'secretary')
          return (item.leaderIds || []).some((leaderId) => supported.includes(leaderId));
        return true;
      })
      .filter((item) => inRange(item, from, to));
  }

  function createOne(kind, input, needsConfirm, id, seriesId) {
    if (
      !can(
        actor,
        kind === 'meeting' ? 'meeting.create' : kind === 'visit' ? 'visit.create' : 'item.create',
      )
    )
      return { ok: false, code: 'permission.denied' };
    const errors =
      kind === 'meeting'
        ? validateMeeting(input, { roomById: context.roomById, personById: context.personById })
        : validateItem(kind, input, context);
    const code = resultCode(errors);
    if (code) return { ok: false, code };
    const item = createItem(kind, input, itemOptions({ id, seriesId, needsConfirm }));
    return { ok: true, item };
  }

  function localDate(item) {
    if (item.allDay) return item.date;
    return tz.toZoned(new Date(item.startAt), item.tz || 'Asia/Shanghai').date;
  }

  function getItem(id) {
    return state().items.find((item) => item.id === id) || null;
  }

  function getVehicle(id) {
    return state().vehicles.find((vehicle) => vehicle.id === id) || null;
  }

  function prefAdapter() {
    if (store && typeof store.getAdapter === 'function') return store.getAdapter();
    return store && (store.adapter || store.storage);
  }

  async function whoami() {
    const employee = reference.personById(actor.personId);
    if (!employee) return { ok: false, code: 'auth.notBound' };
    return {
      ok: true,
      bound: true,
      employee: {
        id: employee.id,
        name: employee.name,
        title: employee.title,
        role: employee.role,
      },
      dispatcher: Boolean(actor.dispatcher),
      sysAdmin: Boolean(actor.sysAdmin),
    };
  }

  async function directory() {
    return {
      ok: true,
      rooms: clone(reference.ROOMS),
      cars: clone(reference.CARS),
      // Same fields as the directory cloud function: no flags, no bindings.
      employees: reference.PEOPLE.map((person) => ({
        id: person.id,
        name: clone(person.name),
        title: clone(person.title),
        role: person.role,
      })),
    };
  }

  async function createItemApi(payload) {
    const value = payload || {};
    const result = createOne(value.kind, value.input, value.needsConfirm, newId('item'));
    if (!result.ok) return result;
    if (value.kind === 'visit' && value.input && value.input.transport === 'pickup') {
      const vehicle = createVehicleRequest(
        {
          reason: VISITOR_PICKUP_REASON.en,
          destination: '',
          note: '',
          date: value.input.date,
          time: value.input.start,
          passengers: value.input.headcount,
        },
        {
          actor,
          now: now(),
          tz: result.item.tz,
          id: newId('vehicle'),
        },
      );
      if (!vehicle || vehicle.ok === false) return vehicle;
      vehicle.reason = VISITOR_PICKUP_REASON;
      vehicle.destination = { 'zh-CN': '', en: '' };
      vehicle.note = { 'zh-CN': '', en: '' };
      vehicle.forLeaderId = null;
      vehicle.itemId = result.item.id;
      result.item.vehicleRequestId = vehicle.id;
      const itemSaved = write('addItem', result.item);
      if (!itemSaved.ok) return itemSaved;
      const vehicleSaved = write('updateVehicle', vehicle);
      return vehicleSaved.ok ? { ...result, item: result.item } : vehicleSaved;
    }
    const saved = write('addItem', result.item);
    return saved.ok ? result : saved;
  }

  async function createSeriesApi(payload) {
    const value = payload || {};
    if (!can(actor, value.kind === 'meeting' ? 'meeting.create' : 'item.create'))
      return { ok: false, code: 'permission.denied' };
    const errors =
      value.kind === 'meeting'
        ? validateMeeting(value.input, {
            roomById: context.roomById,
            personById: context.personById,
          })
        : validateItem(value.kind, value.input, context);
    const code = resultCode(errors);
    if (code) return { ok: false, code };
    const seriesId = newId('series');
    const items = createSeries(
      value.kind,
      value.input,
      itemOptions({
        id: newId('item'),
        seriesId,
        until: value.until,
        needsConfirm: value.needsConfirm,
      }),
    );
    const pickupVehicles = [];
    if (value.kind === 'visit' && value.input && value.input.transport === 'pickup') {
      for (const item of items) {
        const vehicle = createVehicleRequest(
          {
            reason: VISITOR_PICKUP_REASON.en,
            destination: '',
            note: '',
            date: value.input.date,
            time: value.input.start,
            passengers: value.input.headcount,
          },
          {
            actor,
            now: now(),
            tz: item.tz,
            id: newId('vehicle'),
          },
        );
        if (!vehicle || vehicle.ok === false) return vehicle;
        vehicle.reason = VISITOR_PICKUP_REASON;
        vehicle.destination = { 'zh-CN': '', en: '' };
        vehicle.note = { 'zh-CN': '', en: '' };
        vehicle.forLeaderId = null;
        vehicle.itemId = item.id;
        item.vehicleRequestId = vehicle.id;
        pickupVehicles.push(vehicle);
      }
    }
    const saved = write('addItems', items);
    if (!saved.ok) return saved;
    for (const vehicle of pickupVehicles) {
      const vehicleSaved = write('updateVehicle', vehicle);
      if (!vehicleSaved.ok) return vehicleSaved;
    }
    return { ok: true, items };
  }

  async function editItemApi(payload) {
    const value = payload || {};
    const item = getItem(value.id);
    if (!item) return { ok: false, code: 'item.notVisible' };
    if (!canEditItem(actor, item, context)) return { ok: false, code: 'permission.denied' };
    if (value.scope !== 'following' || !item.seriesId) {
      const result = changeItem(item, value.patch || {}, itemOptions(value));
      if (!result.ok) return result;
      const saved = write('updateItem', result.item);
      return saved.ok ? { ok: true, item: result.item } : saved;
    }
    const candidates = state().items.filter((candidate) => {
      const start = candidate.startAt || candidate.date || '';
      const origin = item.startAt || item.date || '';
      return candidate.seriesId === item.seriesId && String(start) >= String(origin);
    });
    const patch = value.patch || {};
    // A new date moves every following occurrence by the same number of days.
    const shiftDays = patch.date ? dates.diffDays(localDate(item), patch.date) : 0;
    const changed = [];
    for (const candidate of candidates) {
      const own =
        candidate.id === item.id
          ? patch
          : {
              ...patch,
              ...(patch.date ? { date: dates.addDays(localDate(candidate), shiftDays) } : {}),
            };
      // expectedRev guards the occurrence the user opened; the others follow it.
      const options = candidate.id === item.id ? value : { ...value, expectedRev: candidate.rev };
      const result = changeItem(candidate, own, itemOptions(options));
      if (!result.ok) return result;
      const saved = write('updateItem', result.item);
      if (!saved.ok) return saved;
      changed.push(result.item);
    }
    return { ok: true, items: changed };
  }

  async function cancelItemApi(payload) {
    const value = payload || {};
    const item = getItem(value.id);
    if (!item) return { ok: false, code: 'item.notVisible' };
    if (value.expectedRev !== undefined && value.expectedRev !== item.rev)
      return { ok: false, code: 'item.alreadyChanged' };
    if (!canEditItem(actor, item, context)) return { ok: false, code: 'permission.denied' };
    let result;
    if (item.kind === 'meeting')
      result = cancelMeeting(item, itemOptions({ expectedRev: value.expectedRev }));
    else if (item.status === 'cancelled') result = { ok: false, code: 'item.alreadyChanged' };
    else {
      const at = now().toISOString();
      result = {
        ok: true,
        item: {
          ...item,
          status: 'cancelled',
          updatedAt: at,
          updatedBy: actor.personId,
          cancelledAt: at,
          cancelledBy: actor.personId,
          rev: (item.rev || 0) + 1,
        },
      };
    }
    if (!result.ok) return result;
    const saved = write('updateItem', result.item);
    return saved.ok ? { ok: true, item: result.item } : saved;
  }

  async function transitionItem(method, payload) {
    const value = payload || {};
    const item = getItem(value.id);
    if (!item) return { ok: false, code: 'item.notVisible' };
    if (!visibleItems(actor, [item], context).length) return { ok: false, code: 'item.notVisible' };
    if (value.expectedRev !== undefined && value.expectedRev !== item.rev)
      return { ok: false, code: 'item.alreadyChanged' };
    const fn = { confirm: confirmItem, decline: declineItem, seen: markSeen }[method];
    const result = fn(
      item,
      itemOptions({
        reason: value.reason,
        items: item.seriesId ? state().items : undefined,
      }),
    );
    if (!result.ok) return result;
    const before = new Map(state().items.map((candidate) => [candidate.id, candidate]));
    const records = result.items
      ? result.items.filter((record) => {
          const original = before.get(record.id);
          return !original || original.rev !== record.rev;
        })
      : [result.item];
    for (const record of records) {
      const saved = write('updateItem', record);
      if (!saved.ok) return saved;
    }
    return result.items ? { ok: true, items: records } : { ok: true, item: result.item };
  }

  async function markArrivedApi(payload) {
    const item = getItem(payload && payload.id);
    if (!item) return { ok: false, code: 'item.notVisible' };
    const result = markArrived(item, itemOptions());
    if (!result.ok) return result;
    const saved = write('updateItem', result.item);
    return saved.ok ? result : saved;
  }

  async function requestVehicleApi(payload) {
    const value = payload || {};
    const input = { ...(value.input || {}) };
    const role = normalizeRole(actor.role);
    if (input.forLeaderId) {
      const supported = (context.supports[actor.personId] || []).includes(input.forLeaderId);
      if (role === 'leader' && input.forLeaderId !== actor.personId)
        return { ok: false, code: 'permission.denied' };
      if (role === 'secretary' && !supported) return { ok: false, code: 'permission.denied' };
      if (!['leader', 'secretary', 'secretaryAdmin'].includes(role))
        return { ok: false, code: 'permission.denied' };
    }
    if (input.departAt && (!input.date || !input.time)) {
      const parts = tz.toZoned(new Date(input.departAt), input.tz || 'Asia/Shanghai');
      input.date = parts.date;
      input.time = parts.time;
    }
    const errors = validateVehicle(input);
    const code = resultCode(errors);
    if (code) return { ok: false, code };
    const vehicle = createVehicleRequest(input, {
      actor,
      now: now(),
      tz: input.tz || actor.tz || 'Asia/Shanghai',
      id: newId('vehicle'),
      forLeaderId: input.forLeaderId,
    });
    if (!vehicle || vehicle.ok === false) return vehicle;
    const saved = write('updateVehicle', vehicle);
    return saved.ok ? { ok: true, vehicle } : saved;
  }

  async function transitionVehicle(method, payload) {
    const value = payload || {};
    const vehicle = getVehicle(value.id);
    if (!vehicle) return { ok: false, code: 'vehicle.notFound' };
    if (!visibleVehicles(actor, [vehicle], context).length)
      return { ok: false, code: 'permission.denied' };
    if (value.expectedRev !== undefined && value.expectedRev !== vehicle.rev)
      return { ok: false, code: 'vehicle.alreadyHandled' };
    const result = transition(vehicle, method, value, {
      actor,
      now: now(),
      cars: reference.CARS,
      drivers: reference.DRIVERS,
      vehicles: state().vehicles,
    });
    if (!result.ok) return result;
    const saved = write('updateVehicle', result.vehicle);
    return saved.ok ? result : saved;
  }

  const adapter = prefAdapter();
  async function getPrefs() {
    const read = adapter && typeof adapter.get === 'function' ? adapter.get(PREFS_KEY) : null;
    const records =
      read && read.ok && read.value && typeof read.value === 'object' ? read.value : {};
    const value = records[actor.personId] || defaults(actor.personId, now());
    return { ok: true, prefs: clone(value) };
  }

  async function updatePrefsApi(payload) {
    const current = await getPrefs();
    const result = updatePrefs(current.prefs, payload && payload.patch, now());
    if (!result.ok) return result;
    if (!adapter || typeof adapter.set !== 'function')
      return { ok: false, code: 'storage.writeFailed' };
    const read = typeof adapter.get === 'function' ? adapter.get(PREFS_KEY) : null;
    const records =
      read && read.ok && read.value && typeof read.value === 'object' ? read.value : {};
    records[actor.personId] = result.prefs;
    const saved = adapter.set(PREFS_KEY, records);
    if (!saved || saved.ok !== true) return saved || { ok: false, code: 'storage.writeFailed' };
    if (store && store.notify) store.notify();
    return result;
  }

  return {
    whoami,
    redeemInvite: async () => ({ ok: false, code: 'action.unknown' }),
    directory,
    listItems: async (payload) => ({
      ok: true,
      items: clone(visibleRange(payload && payload.from, payload && payload.to)),
    }),
    createItem: createItemApi,
    createSeries: createSeriesApi,
    editItem: editItemApi,
    cancelItem: cancelItemApi,
    confirmItem: (payload) => transitionItem('confirm', payload),
    declineItem: (payload) => transitionItem('decline', payload),
    markSeen: (payload) => transitionItem('seen', payload),
    markArrived: markArrivedApi,
    busySlots: async (payload) => {
      const value = payload || {};
      const from = new Date(value.from);
      const to = new Date(value.to);
      const leaders = new Set(value.leaderIds || []);
      const role = normalizeRole(actor.role);
      const supported = context.supports[actor.personId] || [];
      const slots = state()
        .items.filter((item) => {
          if (item.status === 'cancelled' || item.allDay || !item.startAt || !item.endAt)
            return false;
          if (leaders.size && !(item.leaderIds || []).some((id) => leaders.has(id))) return false;
          if (
            role === 'secretary' &&
            !(item.leaderIds || []).some((leaderId) => supported.includes(leaderId))
          )
            return false;
          if (
            role !== 'receptionist' &&
            role !== 'receptionAdmin' &&
            !visibleItems(actor, [item], context).length
          )
            return false;
          return item.startAt < to.toISOString() && from.toISOString() < item.endAt;
        })
        .map((item) => ({ startAt: item.startAt, endAt: item.endAt }));
      return { ok: true, slots: clone(slots) };
    },
    listNotes: async () => ({
      ok: true,
      notes: clone(state().notes.filter((note) => noteVisibleTo(actor, note, context))),
    }),
    createNote: async (payload) => {
      const result = createNote(payload && payload.text, { actor, now: now(), id: newId('note') });
      if (!result.ok) return result;
      const saved = write('addNote', result.note);
      return saved.ok ? result : saved;
    },
    convertNote: async (payload) => {
      const note = state().notes.find((candidate) => candidate.id === (payload && payload.id));
      if (!note) return { ok: false, code: 'item.notVisible' };
      const result = convertNote(note, payload && payload.itemIds, {
        actor,
        now: now(),
        ctx: context,
      });
      if (!result.ok) return result;
      const saved = write('updateNote', result.note);
      return saved.ok ? result : saved;
    },
    closeNote: async (payload) => {
      const note = state().notes.find((candidate) => candidate.id === (payload && payload.id));
      if (!note) return { ok: false, code: 'item.notVisible' };
      const result = closeNote(note, { actor, now: now(), ctx: context });
      if (!result.ok) return result;
      const saved = write('updateNote', result.note);
      return saved.ok ? result : saved;
    },
    listVehicles: async (payload) => ({
      ok: true,
      vehicles: clone(
        visibleVehicles(actor, state().vehicles, context).filter((vehicle) => {
          const from = payload && payload.from;
          const to = payload && payload.to;
          if (!from || !to) return true;
          const departure = new Date(vehicle.departAt);
          return departure >= new Date(from) && departure < new Date(to);
        }),
      ),
    }),
    requestVehicle: requestVehicleApi,
    dispatchVehicle: (payload) => transitionVehicle('dispatch', payload),
    rejectVehicle: (payload) => transitionVehicle('reject', payload),
    completeVehicle: (payload) => transitionVehicle('complete', payload),
    withdrawVehicle: (payload) => transitionVehicle('withdraw', payload),
    getPrefs,
    updatePrefs: updatePrefsApi,
  };
}

module.exports = { createLocalApi };
