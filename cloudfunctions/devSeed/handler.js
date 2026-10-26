'use strict';

const reference = require('./shared/data/reference');
const { seed } = require('./shared/data/seed');
const { fail, ok, wrap } = require('./shared/lib/result');

const DATE_FIELDS = new Set([
  'startAt',
  'endAt',
  'departAt',
  'createdAt',
  'updatedAt',
  'disabledAt',
  'confirmedAt',
  'changedAt',
  'seenAt',
  'handledAt',
  'dispatchedAt',
  'completedAt',
  'cancelledAt',
  'tzUpdatedAt',
  'plateClearAfter',
]);

function cloneDates(value, key) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map((item) => cloneDates(item, key));
  if (!value || typeof value !== 'object') {
    if (DATE_FIELDS.has(key) && typeof value === 'string') return new Date(value);
    return value;
  }
  const result = {};
  for (const [field, item] of Object.entries(value)) result[field] = cloneDates(item, field);
  return result;
}

function documentFrom(record) {
  const next = cloneDates(record);
  if (next.id !== undefined && next._id === undefined) {
    next._id = next.id;
    delete next.id;
  }
  if (next.v === undefined) next.v = 1;
  if (next.rev === undefined) next.rev = 0;
  return next;
}

function peopleDocs(at) {
  return reference.PEOPLE.map((person) => ({
    _id: person.id,
    name: person.name,
    title: person.title,
    dept: person.dept || '',
    role: person.role,
    dispatcher: Boolean(person.dispatcher),
    sysAdmin: Boolean(person.sysAdmin),
    status: 'active',
    active: true,
    createdAt: new Date(at),
    updatedAt: new Date(at),
    disabledAt: null,
    v: 1,
    rev: 0,
  }));
}

function roomDocs() {
  return reference.ROOMS.map((room, index) => ({
    _id: room.id,
    name: room.name,
    online: Boolean(room.online),
    ...(room.capacity === undefined ? {} : { capacity: room.capacity }),
    active: true,
    sort: index,
    v: 1,
    rev: 0,
  }));
}

function carDocs() {
  return reference.CARS.map((car, index) => ({
    _id: car.id,
    plate: car.plate,
    model: car.model,
    kind: car.kind,
    seats: car.seats,
    active: true,
    sort: index,
    v: 1,
    rev: 0,
  }));
}

function supportDocs(at) {
  return Object.entries(reference.SUPPORTS).map(([secretaryId, leaderIds]) => ({
    _id: secretaryId,
    leaderIds: [...leaderIds],
    updatedAt: new Date(at),
    updatedBy: secretaryId,
    v: 1,
    rev: 0,
  }));
}

async function replaceCollection(db, name, records) {
  // The server SDK refuses an empty condition for bulk removes.
  await db
    .collection(name)
    .where({ _id: db.command.exists(true) })
    .remove();
  for (const record of records) await db.collection(name).add({ data: record });
}

function createHandler(config) {
  const options = config || {};
  const db = options.db;
  const now = options.now || (() => new Date());
  const log = options.log;
  async function dispatch(event, context) {
    if (!event || event.action !== 'run') return fail('action.unknown');
    const env = context && context.env;
    if (
      !Array.isArray(event.allowEnvs) ||
      !event.allowEnvs.includes(env) ||
      event.confirm !== 'seed-dev'
    )
      return fail('seed.notDev');
    const at = now();
    const source = seed();
    const records = {
      rooms: roomDocs(),
      cars: carDocs(),
      employees: peopleDocs(at),
      supports: supportDocs(at),
      items: source.items.map(documentFrom),
      vehicle_requests: source.vehicles.map(documentFrom),
      leader_notes: source.notes.map(documentFrom),
    };
    for (const [name, values] of Object.entries(records)) await replaceCollection(db, name, values);
    const counts = {};
    for (const [name, values] of Object.entries(records)) counts[name] = values.length;
    return ok({ counts });
  }
  return (event, context) => wrap(() => dispatch(event, context), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
