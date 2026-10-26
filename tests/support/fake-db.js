'use strict';

let nextId = 1;

function clone(value) {
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = clone(item);
    return result;
  }
  return value;
}

function equal(left, right) {
  if (left instanceof Date || right instanceof Date)
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equal(value, right[index]))
    );
  }
  if (left && typeof left === 'object' && right && typeof right === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) => Object.prototype.hasOwnProperty.call(right, key) && equal(left[key], right[key]),
      )
    );
  }
  return left === right;
}

function getPath(value, path) {
  return String(path)
    .split('.')
    .reduce(
      (current, key) => (current === undefined || current === null ? undefined : current[key]),
      value,
    );
}

function setPath(value, path, next) {
  const parts = String(path).split('.');
  let current = value;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = clone(next);
}

function deletePath(value, path) {
  const parts = String(path).split('.');
  let current = value;
  for (const part of parts.slice(0, -1)) {
    if (!current || typeof current !== 'object') return;
    current = current[part];
  }
  if (current && typeof current === 'object') delete current[parts[parts.length - 1]];
}

function command(type, value) {
  return { __fakeCommand: type, value };
}

function compare(value, type, expected) {
  if (type === 'eq') return equal(value, expected);
  if (type === 'neq') return !equal(value, expected);
  if (type === 'in') {
    if (!Array.isArray(expected)) return false;
    return Array.isArray(value)
      ? value.some((item) => expected.some((candidate) => equal(item, candidate)))
      : expected.some((item) => equal(value, item));
  }
  if (type === 'nin') {
    if (!Array.isArray(expected)) return true;
    return Array.isArray(value)
      ? value.every((item) => !expected.some((candidate) => equal(item, candidate)))
      : !expected.some((item) => equal(value, item));
  }
  if (type === 'gt') return value > expected;
  if (type === 'gte') return value >= expected;
  if (type === 'lt') return value < expected;
  if (type === 'lte') return value <= expected;
  if (type === 'exists') return (value !== undefined) === Boolean(expected);
  return false;
}

function matchesValue(actual, expected) {
  if (expected && expected.__fakeCommand) {
    const type = expected.__fakeCommand;
    if (type === 'and') return expected.value.every((item) => matchesValue(actual, item));
    if (type === 'or') return expected.value.some((item) => matchesValue(actual, item));
    return compare(actual, type, expected.value);
  }
  if (Array.isArray(actual) && !Array.isArray(expected))
    return actual.some((item) => equal(item, expected));
  return equal(actual, expected);
}

function matches(document, query) {
  function clauseMatches(item) {
    if (item && item.__fakeCommand && ['and', 'or'].includes(item.__fakeCommand))
      return matches(document, item);
    if (item && typeof item === 'object' && !item.__fakeCommand) return matches(document, item);
    return matchesValue(document, item);
  }
  if (query && query.__fakeCommand === 'and') return query.value.every(clauseMatches);
  if (query && query.__fakeCommand === 'or') return query.value.some(clauseMatches);
  if (!query || Object.keys(query).length === 0) return true;
  return Object.entries(query).every(([field, expected]) =>
    matchesValue(getPath(document, field), expected),
  );
}

function applyUpdate(document, update) {
  const next = clone(document);
  for (const [field, value] of Object.entries(update || {})) {
    if (value && value.__fakeCommand) {
      if (value.__fakeCommand === 'remove') deletePath(next, field);
      else if (value.__fakeCommand === 'inc')
        setPath(next, field, (getPath(next, field) || 0) + value.value);
      else if (value.__fakeCommand === 'set') setPath(next, field, value.value);
      continue;
    }
    setPath(next, field, value);
  }
  return next;
}

function createCommand() {
  return {
    eq: (value) => command('eq', value),
    neq: (value) => command('neq', value),
    in: (value) => command('in', value),
    nin: (value) => command('nin', value),
    gt: (value) => command('gt', value),
    gte: (value) => command('gte', value),
    lt: (value) => command('lt', value),
    lte: (value) => command('lte', value),
    exists: (value) => command('exists', value),
    and: (...values) =>
      command('and', values.length === 1 && Array.isArray(values[0]) ? values[0] : values),
    or: (...values) =>
      command('or', values.length === 1 && Array.isArray(values[0]) ? values[0] : values),
    inc: (value) => command('inc', value),
    set: (value) => command('set', value),
    remove: () => command('remove'),
  };
}

function missing(id) {
  const error = new Error(`Document ${id} was not found`);
  error.errCode = -1;
  error.code = 'DOCUMENT_NOT_FOUND';
  return error;
}

// The server SDK refuses bulk update/remove without a condition; use _.exists(true) to match all.
function requireCondition(where, operation) {
  if (!where || Object.keys(where).length === 0)
    throw new Error(`${operation} requires a non-empty where condition`);
}

// doc(id).set/update take the id from doc(); the SDK rejects _id inside data.
function rejectIdInData(data, operation) {
  if (data && Object.prototype.hasOwnProperty.call(data, '_id'))
    throw new Error(`${operation} data must not contain _id`);
}

function createFakeDb(initial, transaction = false) {
  const collections = new Map();
  for (const [name, docs] of Object.entries(initial || {}))
    collections.set(name, clone(docs || []));

  function docsFor(name) {
    if (!collections.has(name)) collections.set(name, []);
    return collections.get(name);
  }

  function docRef(name, id) {
    return {
      async get() {
        const document = docsFor(name).find((item) => item._id === id);
        if (!document) throw missing(id);
        return { data: clone(document) };
      },
      async set({ data }) {
        rejectIdInData(data, 'set');
        const docs = docsFor(name);
        const next = { ...(clone(data) || {}), _id: id };
        const index = docs.findIndex((item) => item._id === id);
        if (index < 0) docs.push(next);
        else docs[index] = next;
        return { stats: { updated: 1 } };
      },
      async update({ data }) {
        rejectIdInData(data, 'update');
        const docs = docsFor(name);
        const index = docs.findIndex((item) => item._id === id);
        if (index < 0) throw missing(id);
        docs[index] = applyUpdate(docs[index], data);
        return { stats: { updated: 1 } };
      },
      async remove() {
        const docs = docsFor(name);
        const index = docs.findIndex((item) => item._id === id);
        if (index >= 0) docs.splice(index, 1);
        return { stats: { removed: index >= 0 ? 1 : 0 } };
      },
    };
  }

  function query(name, state) {
    // CloudBase server queries return at most 100 records unless a limit is supplied.
    const config = { where: null, order: null, skip: 0, limit: 100, ...(state || {}) };
    const api = {
      where(value) {
        return query(name, { ...config, where: value || {} });
      },
      orderBy(field, direction) {
        return query(name, { ...config, order: { field, direction } });
      },
      skip(value) {
        return query(name, { ...config, skip: Math.max(0, Number(value) || 0) });
      },
      limit(value) {
        return query(name, { ...config, limit: Math.max(0, Number(value) || 0) });
      },
      async get() {
        let rows = docsFor(name).filter((item) => matches(item, config.where));
        if (config.order) {
          const { field, direction } = config.order;
          rows = rows.slice().sort((left, right) => {
            const a = getPath(left, field);
            const b = getPath(right, field);
            if (a === b) return 0;
            const result = a === undefined ? -1 : b === undefined ? 1 : a < b ? -1 : 1;
            return direction === 'desc' ? -result : result;
          });
        }
        rows = rows.slice(config.skip, config.skip + config.limit);
        return { data: clone(rows) };
      },
      async count() {
        return { total: docsFor(name).filter((item) => matches(item, config.where)).length };
      },
      async update({ data }) {
        requireCondition(config.where, 'update');
        const docs = docsFor(name);
        let updated = 0;
        for (let index = 0; index < docs.length; index += 1) {
          if (!matches(docs[index], config.where)) continue;
          docs[index] = applyUpdate(docs[index], data);
          updated += 1;
        }
        return { stats: { updated } };
      },
      async remove() {
        requireCondition(config.where, 'remove');
        const docs = docsFor(name);
        const kept = docs.filter((item) => !matches(item, config.where));
        const removed = docs.length - kept.length;
        collections.set(name, kept);
        return { stats: { removed } };
      },
    };
    return api;
  }

  const db = {
    command: createCommand(),
    collection(name) {
      if (transaction) {
        const unsupported = () => {
          throw new Error('where is not supported in transactions');
        };
        return {
          doc(id) {
            return docRef(name, id);
          },
          add: async ({ data }) => {
            const docs = docsFor(name);
            const next = clone(data) || {};
            const id = next._id || `fake-${nextId++}`;
            if (docs.some((item) => item._id === id)) throw new Error(`Duplicate _id ${id}`);
            next._id = id;
            docs.push(next);
            return { _id: id };
          },
          where: unsupported,
          get: unsupported,
          count: unsupported,
          orderBy: unsupported,
        };
      }
      const collection = {
        doc(id) {
          return docRef(name, id);
        },
        add: async ({ data }) => {
          const docs = docsFor(name);
          const next = clone(data) || {};
          const id = next._id || `fake-${nextId++}`;
          if (docs.some((item) => item._id === id)) throw new Error(`Duplicate _id ${id}`);
          next._id = id;
          docs.push(next);
          return { _id: id };
        },
        ...query(name),
      };
      return collection;
    },
    async runTransaction(callback) {
      const snapshot = new Map();
      for (const [name, docs] of collections.entries()) snapshot.set(name, clone(docs));
      const tx = createFakeDb(Object.fromEntries(snapshot), true);
      try {
        const value = await callback(tx);
        collections.clear();
        for (const [name, docs] of Object.entries(tx._dump())) collections.set(name, clone(docs));
        return value;
      } catch (error) {
        throw error;
      }
    },
    _dump() {
      const result = {};
      for (const [name, docs] of collections.entries()) result[name] = clone(docs);
      return result;
    },
  };
  return db;
}

module.exports = { createFakeDb };
