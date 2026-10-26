'use strict';

const OMIT_FROM_CLIENT_PAYLOAD = new Set(['id', '_id', 'createdAt', 'updatedAt', 'rev']);

function dateValue(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    Object.prototype.hasOwnProperty.call(value, '$date')
  ) {
    const date = new Date(value.$date);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function fromServer(value) {
  if (value instanceof Date && Number.isNaN(value.getTime())) return value;
  const date = dateValue(value);
  if (date) return date.toISOString();
  if (Array.isArray(value)) return value.map(fromServer);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      const nextKey = key === '_id' ? 'id' : key;
      if (nextKey === 'id' && Object.prototype.hasOwnProperty.call(result, nextKey)) continue;
      result[nextKey] = fromServer(child);
    }
    return result;
  }
  return value;
}

function toServer(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? value : value.toISOString();
  if (Array.isArray(value)) return value.map(toServer);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (OMIT_FROM_CLIENT_PAYLOAD.has(key)) continue;
      result[key] = toServer(child);
    }
    return result;
  }
  return value;
}

module.exports = { fromServer, toServer };
