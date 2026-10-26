'use strict';

const dates = require('./shared/domain/dates');
const { changeItem, confirmItem, declineItem, markSeen } = require('./shared/domain/confirm');
const { createItem, createSeries, markArrived, validateItem } = require('./shared/domain/item');
const { cancelMeeting, validateMeeting } = require('./shared/domain/meeting');
const { can, normalizeRole } = require('./shared/domain/permissions');
const { itemVisibleTo, visibleItems, canEditItem } = require('./shared/domain/visibility');
const tz = require('./shared/domain/tz');
const { fail, ok, wrap } = require('./shared/lib/result');
const { VISITOR_PICKUP_REASON } = require('./shared/data/labels');
const { fetchAll } = require('./shared/lib/fetch');
const { getDoc, loadCaller } = require('./shared/lib/caller');
const { loadContext } = require('./shared/lib/context');
const { newId: randomId } = require('./shared/lib/ids');
const {
  addRecord,
  auditWrite,
  changedFields,
  codedError,
  instant,
  rangeDates,
  setRecord,
  toDomain,
  txGet,
} = require('./shared/lib/handler-support');

function resultCode(errors) {
  return errors && errors.length ? errors[0].code : null;
}

async function callerZone(db, actor, input, context) {
  const prefs = await getDoc(db, 'reminder_prefs', actor.personId);
  const role = normalizeRole(actor.role);
  if (
    (role === 'secretary' || role === 'secretaryAdmin') &&
    input &&
    input.tz &&
    ((Array.isArray(input.leaderIds) && input.leaderIds.length > 0) ||
      (Array.isArray(input.attendeeIds) && input.attendeeIds.some((id) => context.isLeader(id))))
  )
    return input.tz;
  return (prefs && prefs.tz) || actor.tz || 'Asia/Shanghai';
}

function inRange(item, range) {
  if (!range) return true;
  if (item.allDay) {
    const start = tz.fromZoned(item.date, '00:00', item.tz || 'Asia/Shanghai');
    const next = dates.addDays(item.date, 1);
    const end = tz.fromZoned(next, '00:00', item.tz || 'Asia/Shanghai');
    return Boolean(start && end && start < range.end && range.start < end);
  }
  const start = instant(item.startAt);
  const end = instant(item.endAt);
  return Boolean(start && end && start < range.end && range.start < end);
}

function utcDate(value) {
  return value.toISOString().slice(0, 10);
}

function coarseRangeQuery(db, range) {
  const dayBefore = new Date(range.start.getTime() - 24 * 60 * 60 * 1000);
  const dayAfter = new Date(range.end.getTime() + 24 * 60 * 60 * 1000);
  return db.command.or([
    {
      startAt: db.command.lt(range.end),
      endAt: db.command.gt(range.start),
    },
    {
      allDay: true,
      date: db.command.and(db.command.gte(utcDate(dayBefore)), db.command.lte(utcDate(dayAfter))),
    },
  ]);
}

function localStart(item) {
  return item.allDay ? item.date || '' : item.startAt || item.date || '';
}

function optionsFor(actor, context, now, extra) {
  return {
    actor,
    now,
    ctx: context,
    isLeader: context.isLeader,
    roomById: context.roomById,
    personById: context.personById,
    ...(extra || {}),
  };
}

function permissionFor(kind) {
  if (kind === 'meeting') return 'meeting.create';
  if (kind === 'visit') return 'visit.create';
  return 'item.create';
}

async function parentFor(db, input) {
  if (!input || !input.parentId) return null;
  const parent = await getDoc(db, 'items', input.parentId);
  return parent ? toDomain(parent) : null;
}

function pickupRequest(item, actor, now, id) {
  const departAt = item.startAt ? new Date(item.startAt) : new Date(now);
  return {
    id,
    reason: VISITOR_PICKUP_REASON,
    destination: { 'zh-CN': '', en: '' },
    departAt: departAt.toISOString(),
    tz: item.tz,
    passengers: item.headcount,
    applicantId: actor.personId,
    forLeaderId: null,
    itemId: item.id,
    note: { 'zh-CN': '', en: '' },
    status: 'pending',
    carId: null,
    driverId: null,
    rejectReason: '',
    createdAt: new Date(now).toISOString(),
    dispatchedAt: null,
    dispatchedBy: null,
    completedAt: null,
    rev: 0,
    v: 1,
  };
}

async function writeCreated(tx, actor, now, item, request) {
  await addRecord(tx, 'items', item);
  await auditWrite(
    tx,
    actor.personId,
    'item.create',
    'item',
    item.id,
    { kind: item.kind, status: item.status },
    now,
  );
  if (request) {
    await addRecord(tx, 'vehicle_requests', request);
    await auditWrite(
      tx,
      actor.personId,
      'vehicle.request',
      'vehicle_request',
      request.id,
      { status: request.status },
      now,
    );
  }
}

function txResult(error) {
  return error && error.resultCode ? fail(error.resultCode) : null;
}

function seriesCandidates(records, opened) {
  return records
    .map((record) => toDomain(record))
    .filter((item) => item.seriesId === opened.seriesId && localStart(item) >= localStart(opened))
    .sort((left, right) => localStart(left).localeCompare(localStart(right)));
}

function dateShift(item, patch) {
  if (!patch || patch.date === undefined) return 0;
  const current = item.allDay
    ? item.date
    : tz.toZoned(new Date(item.startAt), item.tz || 'Asia/Shanghai').date;
  return dates.diffDays(current, patch.date);
}

function shiftedPatch(item, patch, shiftDays) {
  if (!patch || patch.date === undefined || !shiftDays) return patch;
  const current = item.allDay
    ? item.date
    : tz.toZoned(new Date(item.startAt), item.tz || 'Asia/Shanghai').date;
  return { ...patch, date: dates.addDays(current, shiftDays) };
}

function createHandler(config) {
  const options = config || {};
  const db = options.db;
  const now = options.now || (() => new Date());
  const log = options.log;
  const newId = options.newId || randomId;

  async function dispatch(event, contextValue) {
    const action = event && event.action;
    const actions = [
      'list',
      'get',
      'create',
      'createSeries',
      'edit',
      'cancel',
      'confirm',
      'decline',
      'seen',
      'arrived',
      'busy',
    ];
    if (!actions.includes(action)) return fail('action.unknown');
    const caller = await loadCaller(db, contextValue && contextValue.openid);
    if (!caller.ok) return caller;
    const actor = caller.actor;
    const context = await loadContext(db);
    const at = new Date(now());

    if (action === 'list') {
      const range = rangeDates(event.from, event.to);
      const query = range
        ? db.collection('items').where(coarseRangeQuery(db, range))
        : db.collection('items').where({ status: db.command.in(['active', 'cancelled']) });
      const records = (await fetchAll(query)).filter(
        (record) => record.status === 'active' || record.status === 'cancelled',
      );
      let items = visibleItems(actor, records.map(toDomain), context).filter((item) =>
        inRange(item, range),
      );
      const role = normalizeRole(actor.role);
      if (role === 'receptionist' || role === 'receptionAdmin')
        items = items.filter((item) => item.kind === 'visit');
      return ok({ items });
    }

    if (action === 'busy') {
      const range = rangeDates(event.from, event.to);
      if (!range) return ok({ slots: [] });
      const records = (
        await fetchAll(db.collection('items').where(coarseRangeQuery(db, range)))
      ).filter((record) => record.status === 'active');
      const leaders = new Set(Array.isArray(event.leaderIds) ? event.leaderIds : []);
      const role = normalizeRole(actor.role);
      const slots = records
        .map(toDomain)
        .filter((item) => !item.allDay && item.startAt && item.endAt)
        .filter((item) => !leaders.size || (item.leaderIds || []).some((id) => leaders.has(id)))
        .filter((item) => inRange(item, range))
        .filter(
          (item) =>
            role === 'receptionist' ||
            role === 'receptionAdmin' ||
            itemVisibleTo(actor, item, context),
        )
        .map((item) => ({ startAt: item.startAt, endAt: item.endAt }));
      return ok({ slots });
    }

    const raw = event.id ? await getDoc(db, 'items', event.id) : null;
    const opened = raw ? toDomain(raw) : null;
    if (action === 'get')
      return opened && itemVisibleTo(actor, opened, context)
        ? ok({ item: opened })
        : fail('item.notVisible');

    if (action === 'create' || action === 'createSeries') {
      const kind = event.kind;
      if (!can(actor, permissionFor(kind))) return fail('permission.denied');
      const parent = await parentFor(db, event.input);
      const refs = {
        ...context,
        itemById: (id) => (id === (event.input && event.input.parentId) ? parent : null),
      };
      const errors =
        kind === 'meeting'
          ? validateMeeting(event.input, refs)
          : validateItem(kind, event.input, refs);
      const code = resultCode(errors);
      if (code) return fail(code);
      const zone = await callerZone(db, actor, event.input, context);
      const seriesId = action === 'createSeries' ? newId('series') : null;
      const baseId = newId('item');
      const records =
        action === 'createSeries'
          ? createSeries(
              kind,
              event.input,
              optionsFor(actor, refs, at, {
                id: baseId,
                seriesId,
                until: event.until,
                needsConfirm: event.needsConfirm,
                tz: zone,
                itemById: refs.itemById,
              }),
            )
          : [
              createItem(
                kind,
                event.input,
                optionsFor(actor, refs, at, {
                  id: baseId,
                  needsConfirm: event.needsConfirm,
                  tz: zone,
                  itemById: refs.itemById,
                }),
              ),
            ];
      if (!records.length) return fail('item.date.required');
      if (action === 'createSeries')
        records.forEach((item) => {
          item.id = newId('item');
          item.seriesId = seriesId;
        });
      const requestIds = records.map(() =>
        event.input && event.input.transport === 'pickup' ? newId('vehicle') : null,
      );
      records.forEach((item, index) => {
        if (requestIds[index]) item.vehicleRequestId = requestIds[index];
      });
      try {
        await db.runTransaction(async (tx) => {
          for (let index = 0; index < records.length; index += 1)
            await writeCreated(
              tx,
              actor,
              at,
              records[index],
              requestIds[index]
                ? pickupRequest(records[index], actor, at, requestIds[index])
                : null,
            );
        });
      } catch (error) {
        return txResult(error) || fail('server.error');
      }
      return action === 'createSeries' ? ok({ items: records }) : ok({ item: records[0] });
    }

    if (!opened || !itemVisibleTo(actor, opened, context)) return fail('item.notVisible');
    if (action === 'edit') {
      if (!canEditItem(actor, opened, context)) return fail('permission.denied');
      const patch = event.patch || {};
      let candidates = [opened];
      if (event.scope === 'following' && opened.seriesId) {
        const series = await fetchAll(db.collection('items').where({ seriesId: opened.seriesId }));
        candidates = seriesCandidates(series, opened);
      }
      const shiftDays = dateShift(opened, patch);
      const changed = [];
      try {
        await db.runTransaction(async (tx) => {
          for (const candidate of candidates) {
            const currentRaw = await txGet(tx, 'items', candidate.id);
            if (!currentRaw) throw codedError('item.alreadyChanged');
            const current = toDomain(currentRaw);
            const ownPatch =
              candidate.id === opened.id ? patch : shiftedPatch(candidate, patch, shiftDays);
            const result = changeItem(
              current,
              ownPatch,
              optionsFor(actor, context, at, {
                expectedRev: candidate.id === opened.id ? event.expectedRev : current.rev,
                needsConfirm: event.needsConfirm,
                changeNote: event.changeNote,
              }),
            );
            if (!result.ok) throw codedError(result.code);
            await setRecord(tx, 'items', result.item);
            await auditWrite(
              tx,
              actor.personId,
              'item.update',
              'item',
              result.item.id,
              changedFields(current, result.item),
              at,
              ['secretary', 'secretaryAdmin'].includes(normalizeRole(actor.role))
                ? event.needsConfirm
                : undefined,
            );
            changed.push(result.item);
          }
        });
      } catch (error) {
        return txResult(error) || fail('server.error');
      }
      return candidates.length > 1 ? ok({ items: changed }) : ok({ item: changed[0] });
    }

    if (action === 'cancel') {
      try {
        let result;
        await db.runTransaction(async (tx) => {
          const currentRaw = await txGet(tx, 'items', opened.id);
          if (!currentRaw) throw codedError('item.notVisible');
          const current = toDomain(currentRaw);
          if (event.expectedRev !== undefined && event.expectedRev !== current.rev)
            throw codedError('item.alreadyChanged');
          if (!canEditItem(actor, current, context)) throw codedError('permission.denied');
          if (current.kind === 'meeting')
            result = cancelMeeting(
              current,
              optionsFor(actor, context, at, {
                needsConfirm: event.needsConfirm,
              }),
            );
          else if (current.status === 'cancelled')
            result = { ok: false, code: 'item.alreadyChanged' };
          else
            result = {
              ok: true,
              item: {
                ...current,
                status: 'cancelled',
                leaders: (current.leaders || []).map((leader) =>
                  leader.leaderId === actor.personId
                    ? { ...leader }
                    : {
                        ...leader,
                        confirm: event.needsConfirm ? 'pending' : 'none',
                        changedAt: at.toISOString(),
                      },
                ),
                cancelledAt: at.toISOString(),
                cancelledBy: actor.personId,
                updatedAt: at.toISOString(),
                updatedBy: actor.personId,
                rev: (current.rev || 0) + 1,
              },
            };
          if (!result.ok) throw codedError(result.code);
          await setRecord(tx, 'items', result.item);
          await auditWrite(
            tx,
            actor.personId,
            'item.cancel',
            'item',
            result.item.id,
            { status: 'cancelled' },
            at,
            ['secretary', 'secretaryAdmin'].includes(normalizeRole(actor.role))
              ? event.needsConfirm
              : undefined,
          );
        });
        return ok({ item: result.item });
      } catch (error) {
        return txResult(error) || fail('server.error');
      }
    }

    if (action === 'arrived') {
      try {
        let result;
        await db.runTransaction(async (tx) => {
          const currentRaw = await txGet(tx, 'items', opened.id);
          if (!currentRaw) throw codedError('item.notVisible');
          result = markArrived(toDomain(currentRaw), optionsFor(actor, context, at));
          if (!result.ok) throw codedError(result.code);
          await setRecord(tx, 'items', result.item);
          await auditWrite(
            tx,
            actor.personId,
            'visit.arrived',
            'item',
            result.item.id,
            { arrivedAt: true },
            at,
          );
        });
        return ok({ item: result.item });
      } catch (error) {
        return txResult(error) || fail('server.error');
      }
    }

    if (!['confirm', 'decline', 'seen'].includes(action)) return fail('action.unknown');
    const series =
      action !== 'seen' && opened.seriesId
        ? seriesCandidates(
            await fetchAll(db.collection('items').where({ seriesId: opened.seriesId })),
            opened,
          )
        : [opened];
    const fn = { confirm: confirmItem, decline: declineItem, seen: markSeen }[action];
    const changed = [];
    try {
      await db.runTransaction(async (tx) => {
        const before = new Map();
        const currentItems = [];
        let openedCurrent = null;
        for (const candidate of series) {
          const currentRaw = await txGet(tx, 'items', candidate.id);
          if (!currentRaw) {
            if (candidate.id === opened.id) throw codedError('item.alreadyChanged');
            continue;
          }
          const current = toDomain(currentRaw);
          before.set(current.id, current);
          currentItems.push(current);
          if (candidate.id === opened.id) openedCurrent = current;
        }
        if (!openedCurrent) throw codedError('item.alreadyChanged');
        if (event.expectedRev !== undefined && event.expectedRev !== openedCurrent.rev)
          throw codedError('item.alreadyChanged');
        const result = fn(
          openedCurrent,
          optionsFor(actor, context, at, {
            reason: event.reason,
            items: currentItems.filter(
              (item) => item.id === openedCurrent.id || item.status !== 'cancelled',
            ),
          }),
        );
        if (!result.ok) throw codedError(result.code);
        for (const next of result.items || [result.item]) {
          const original = before.get(next.id);
          if (!original || original.rev === next.rev) continue;
          await setRecord(tx, 'items', next);
          await auditWrite(
            tx,
            actor.personId,
            `item.${action}`,
            'item',
            next.id,
            action === 'decline'
              ? { confirm: 'declined' }
              : action === 'confirm'
                ? { confirm: 'confirmed' }
                : { seenAt: true },
            at,
          );
          changed.push(next);
        }
      });
    } catch (error) {
      return txResult(error) || fail('server.error');
    }
    return series.length > 1 ? ok({ items: changed }) : ok({ item: changed[0] });
  }

  return (event, contextValue) => wrap(() => dispatch(event, contextValue), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
