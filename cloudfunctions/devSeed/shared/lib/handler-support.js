'use strict';

const { auditEntry, writeAudit } = require('./audit');
const { getDoc, isMissing } = require('./caller');
const { toDoc, toDomain } = require('./docs');

function codedError(code) {
  const error = new Error(code);
  error.resultCode = code;
  return error;
}

async function txGet(tx, collection, id) {
  try {
    const result = await tx.collection(collection).doc(id).get();
    return result && result.data ? result.data : null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function writeData(record) {
  return toDoc(record);
}

async function setRecord(db, collection, record) {
  const id = record.id;
  const data = writeData(record);
  await db.collection(collection).doc(id).set({ data });
}

async function addRecord(db, collection, record) {
  const id = record.id;
  const data = writeData(record);
  await db.collection(collection).add({ data: { ...data, _id: id } });
}

function changedFields(before, after, fields) {
  const result = {};
  const allowed = fields || [
    'kind',
    'title',
    'date',
    'startAt',
    'endAt',
    'endDate',
    'tz',
    'location',
    'roomId',
    'attendeeIds',
    'notes',
    'important',
    'visitorName',
    'org',
    'headcount',
    'purpose',
    'visitorType',
    'receptionLevel',
    'transport',
    'plate',
    'vehicleRequestId',
    'stopType',
    'client',
    'status',
    'confirm',
    'carId',
    'driverId',
  ];
  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(after || {}, field)) continue;
    const left = JSON.stringify(before && before[field]);
    const right = JSON.stringify(after[field]);
    if (left === right) continue;
    if (['status', 'confirm', 'carId', 'driverId'].includes(field)) result[field] = after[field];
    else result[field] = true;
  }
  return result;
}

async function auditWrite(db, actorId, action, entity, entityId, changes, at, needsConfirm) {
  await writeAudit(
    db,
    auditEntry(
      {
        actorId,
        action,
        entity,
        entityId,
        changes,
        needsConfirm,
      },
      at,
    ),
  );
}

function rangeDates(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? null : { start, end };
}

function instant(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = {
  addRecord,
  auditWrite,
  changedFields,
  codedError,
  getDoc,
  instant,
  rangeDates,
  setRecord,
  toDoc,
  toDomain,
  txGet,
};
