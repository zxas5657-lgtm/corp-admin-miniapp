'use strict';

const { normalizeRole } = require('./shared/domain/permissions');
const { createVehicleRequest, resourceBusy, transition } = require('./shared/domain/vehicle');
const { vehicleVisibleTo, visibleVehicles } = require('./shared/domain/visibility');
const { validateVehicle } = require('./shared/domain/vehicle');
const tz = require('./shared/domain/tz');
const { fail, ok, wrap } = require('./shared/lib/result');
const { fetchAll } = require('./shared/lib/fetch');
const { getDoc, loadCaller } = require('./shared/lib/caller');
const { loadContext } = require('./shared/lib/context');
const { newId: randomId } = require('./shared/lib/ids');
const {
  addRecord,
  auditWrite,
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

function txResult(error) {
  return error && error.resultCode ? fail(error.resultCode) : null;
}

function activeEmployee(person) {
  return person && person.active !== false && person.status !== 'disabled';
}

function lockId(type, id, departAt, zone) {
  const day = tz.toZoned(new Date(departAt), zone || 'Asia/Shanghai').date;
  return `${type}:${id}:${day}`;
}

async function bumpLock(tx, id, type, resourceId, date, at) {
  const current = await txGet(tx, 'locks', id);
  const rev = current && Number.isInteger(current.rev) ? current.rev + 1 : 1;
  await tx
    .collection('locks')
    .doc(id)
    .set({
      data: {
        resourceType: type,
        resourceId,
        date,
        rev,
        updatedAt: at,
      },
    });
}

function optionsFor(actor, at, extras) {
  return { actor, now: at, ...(extras || {}) };
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
      'request',
      'dispatch',
      'reassign',
      'cancelDispatch',
      'reject',
      'complete',
      'withdraw',
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
        ? db.collection('vehicle_requests').where({
            departAt: db.command.and(db.command.gte(range.start), db.command.lt(range.end)),
          })
        : db.collection('vehicle_requests');
      const records = await fetchAll(query);
      const vehicles = records.map(toDomain).filter((vehicle) => {
        if (!range) return true;
        const depart = instant(vehicle.departAt);
        return depart && depart >= range.start && depart < range.end;
      });
      return ok({ vehicles: visibleVehicles(actor, vehicles, context) });
    }

    const raw = event.id ? await getDoc(db, 'vehicle_requests', event.id) : null;
    const opened = raw ? toDomain(raw) : null;
    if (action === 'get')
      return opened && vehicleVisibleTo(actor, opened, context)
        ? ok({ vehicle: opened })
        : fail('permission.denied');

    if (action === 'request') {
      const input = { ...(event.input || {}) };
      const role = normalizeRole(actor.role);
      if (role === 'driver') return fail('permission.denied');
      if (input.forLeaderId) {
        const supported = (context.supports[actor.personId] || []).includes(input.forLeaderId);
        const leader = context.personById(input.forLeaderId);
        if (!leader || leader.role !== 'leader' || !activeEmployee(leader))
          return fail('permission.denied');
        if (role === 'leader' && input.forLeaderId !== actor.personId)
          return fail('permission.denied');
        if (role === 'secretary' && !supported) return fail('permission.denied');
        if (role === 'secretaryAdmin' && !leader) return fail('permission.denied');
        if (!['leader', 'secretary', 'secretaryAdmin'].includes(role))
          return fail('permission.denied');
      }
      if (input.departAt && (!input.date || !input.time)) {
        const parts = tz.toZoned(new Date(input.departAt), input.tz || 'Asia/Shanghai');
        input.date = parts.date;
        input.time = parts.time;
      }
      const code = resultCode(validateVehicle(input));
      if (code) return fail(code);
      const prefs = await getDoc(db, 'reminder_prefs', actor.personId);
      const vehicle = createVehicleRequest(input, {
        actor,
        now: at,
        tz: input.tz || (prefs && prefs.tz) || 'Asia/Shanghai',
        id: newId('vehicle'),
        forLeaderId: input.forLeaderId,
      });
      if (!vehicle || vehicle.ok === false) return vehicle;
      try {
        await db.runTransaction(async (tx) => {
          await addRecord(tx, 'vehicle_requests', vehicle);
          await auditWrite(
            tx,
            actor.personId,
            'vehicle.request',
            'vehicle_request',
            vehicle.id,
            { status: vehicle.status },
            at,
          );
        });
      } catch (error) {
        return txResult(error) || fail('server.error');
      }
      return ok({ vehicle });
    }

    if (!opened) return fail('vehicle.notFound');
    if (!vehicleVisibleTo(actor, opened, context)) return fail('permission.denied');
    const cars = (await fetchAll(db.collection('cars'))).map(toDomain);
    const drivers = context.employees
      .filter((person) => activeEmployee(person) && person.role === 'driver')
      .map((person) => person._id);

    if (action === 'dispatch' || action === 'reassign') {
      if (!actor.dispatcher) return fail('permission.denied');
      const targetCarId = action === 'reassign' ? event.carId || opened.carId : event.carId;
      const targetDriverId =
        action === 'reassign' ? event.driverId || opened.driverId : event.driverId;
      if (!targetCarId) return fail('vehicle.car.required');
      if (!targetDriverId) return fail('vehicle.driver.required');
      const departAt = instant(opened.departAt);
      if (!departAt) return fail('vehicle.alreadyHandled');
      const windowStart = new Date(departAt.getTime() - 24 * 60 * 60 * 1000);
      const windowEnd = new Date(departAt.getTime() + 24 * 60 * 60 * 1000);
      const carRequests = await fetchAll(
        db.collection('vehicle_requests').where({
          status: 'assigned',
          carId: targetCarId,
          departAt: db.command.and(db.command.gte(windowStart), db.command.lt(windowEnd)),
        }),
      );
      const driverRequests = await fetchAll(
        db.collection('vehicle_requests').where({
          status: 'assigned',
          driverId: targetDriverId,
          departAt: db.command.and(db.command.gte(windowStart), db.command.lt(windowEnd)),
        }),
      );
      const carVehicles = carRequests.map(toDomain);
      const driverVehicles = driverRequests.map(toDomain);
      const currentVehicles = [...carVehicles, ...driverVehicles];
      const carRaw = await getDoc(db, 'cars', targetCarId);
      const driverRaw = await getDoc(db, 'employees', targetDriverId);
      if (!carRaw || carRaw.active === false) return fail('vehicle.car.inactive');
      if (!driverRaw || !activeEmployee(driverRaw) || driverRaw.role !== 'driver')
        return fail('vehicle.driver.inactive');
      if (Number(opened.passengers) > Number(carRaw.seats || 0))
        return fail('vehicle.seats.exceeded');
      if (
        resourceBusy(carVehicles, 'carId', targetCarId, opened.departAt, {
          excludeVehicleId: opened.id,
        })
      )
        return fail('vehicle.car.busy');
      if (
        resourceBusy(driverVehicles, 'driverId', targetDriverId, opened.departAt, {
          excludeVehicleId: opened.id,
        })
      )
        return fail('vehicle.driver.busy');
      try {
        let result;
        await db.runTransaction(async (tx) => {
          const currentRaw = await txGet(tx, 'vehicle_requests', opened.id);
          if (!currentRaw) throw codedError('vehicle.notFound');
          const current = toDomain(currentRaw);
          if (event.expectedRev !== undefined && event.expectedRev !== current.rev)
            throw codedError('vehicle.alreadyHandled');
          const transitionPayload =
            action === 'reassign'
              ? { ...event, carId: targetCarId, driverId: targetDriverId }
              : event;
          result = transition(
            current,
            action,
            transitionPayload,
            optionsFor(actor, at, { cars, drivers, vehicles: currentVehicles }),
          );
          if (!result.ok) throw codedError(result.code);
          const day = tz.toZoned(new Date(current.departAt), current.tz).date;
          const lockSpecs = new Map();
          for (const [type, resourceId] of [
            ['car', current.carId],
            ['driver', current.driverId],
            ['car', result.vehicle.carId],
            ['driver', result.vehicle.driverId],
          ]) {
            if (!resourceId) continue;
            const id = lockId(type, resourceId, current.departAt, current.tz);
            lockSpecs.set(id, { type, resourceId });
          }
          for (const [id, spec] of lockSpecs) {
            await bumpLock(tx, id, spec.type, spec.resourceId, day, at);
          }
          await setRecord(tx, 'vehicle_requests', result.vehicle);
          await auditWrite(
            tx,
            actor.personId,
            `vehicle.${action}`,
            'vehicle_request',
            result.vehicle.id,
            {
              status: result.vehicle.status,
              carId: result.vehicle.carId,
              driverId: result.vehicle.driverId,
            },
            at,
          );
        });
        return ok({ vehicle: result.vehicle });
      } catch (error) {
        return txResult(error) || fail('server.error');
      }
    }

    if (!['cancelDispatch', 'reject', 'complete', 'withdraw'].includes(action))
      return fail('action.unknown');
    try {
      let result;
      await db.runTransaction(async (tx) => {
        const currentRaw = await txGet(tx, 'vehicle_requests', opened.id);
        if (!currentRaw) throw codedError('vehicle.notFound');
        const current = toDomain(currentRaw);
        if (event.expectedRev !== undefined && event.expectedRev !== current.rev)
          throw codedError('vehicle.alreadyHandled');
        result = transition(
          current,
          action,
          event,
          optionsFor(actor, at, {
            cars,
            drivers,
            vehicles: [],
          }),
        );
        if (!result.ok) throw codedError(result.code);
        if (action === 'cancelDispatch') {
          const day = tz.toZoned(new Date(current.departAt), current.tz).date;
          const lockSpecs = [
            ['car', current.carId],
            ['driver', current.driverId],
          ];
          for (const [type, resourceId] of lockSpecs) {
            if (!resourceId) continue;
            await bumpLock(
              tx,
              lockId(type, resourceId, current.departAt, current.tz),
              type,
              resourceId,
              day,
              at,
            );
          }
        }
        await setRecord(tx, 'vehicle_requests', result.vehicle);
        const changes = { status: result.vehicle.status };
        if (action === 'cancelDispatch') {
          changes.carId = result.vehicle.carId;
          changes.driverId = result.vehicle.driverId;
        }
        await auditWrite(
          tx,
          actor.personId,
          `vehicle.${action}`,
          'vehicle_request',
          result.vehicle.id,
          changes,
          at,
        );
      });
      return ok({ vehicle: result.vehicle });
    } catch (error) {
      return txResult(error) || fail('server.error');
    }
  }

  return (event, contextValue) => wrap(() => dispatch(event, contextValue), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
