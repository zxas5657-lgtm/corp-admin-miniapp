'use strict';

const INSTANT_FIELDS = new Set([
  'startAt',
  'endAt',
  'departAt',
  'createdAt',
  'updatedAt',
  'cancelledAt',
  'confirmedAt',
  'changedAt',
  'seenAt',
  'handledAt',
  'dispatchedAt',
  'completedAt',
  'arrivedAt',
  'plateClearAfter',
]);

function cloneDate(value) {
  return value instanceof Date ? new Date(value.getTime()) : value;
}

function toDomain(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toDomain);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    const nextKey = key === '_id' ? 'id' : key;
    if (nextKey === 'id' && Object.prototype.hasOwnProperty.call(result, 'id')) continue;
    result[nextKey] = toDomain(child);
  }
  return result;
}

function toDoc(value, field) {
  if (value instanceof Date) return cloneDate(value);
  if (Array.isArray(value)) return value.map((child) => toDoc(child, field));
  if (!value || typeof value !== 'object') {
    if (INSTANT_FIELDS.has(field) && typeof value === 'string') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date;
    }
    return value;
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'id' || key === '_id') continue;
    result[key] = toDoc(child, key);
  }
  return result;
}

module.exports = { INSTANT_FIELDS, toDomain, toDoc };
