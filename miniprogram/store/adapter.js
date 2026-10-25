'use strict';

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function readFailure() {
  return { ok: false, code: 'storage.readFailed' };
}

function writeFailure() {
  return { ok: false, code: 'storage.writeFailed' };
}

function createWxAdapter(wxApi) {
  return {
    get(key) {
      try {
        return { ok: true, value: wxApi.getStorageSync(key) };
      } catch (error) {
        return readFailure();
      }
    },
    set(key, value) {
      try {
        wxApi.setStorageSync(key, value);
        return { ok: true };
      } catch (error) {
        return writeFailure();
      }
    },
    remove(key) {
      try {
        wxApi.removeStorageSync(key);
        return { ok: true };
      } catch (error) {
        return writeFailure();
      }
    },
  };
}

function createMemoryAdapter(initial) {
  const values = new Map();
  for (const key of Object.keys(initial || {})) {
    try {
      values.set(key, clone(initial[key]));
    } catch (error) {
      values.set(key, undefined);
    }
  }
  let pendingFailure = null;

  function maybeFail(op) {
    if (!pendingFailure || pendingFailure.op !== op) return null;
    const failure = pendingFailure;
    pendingFailure = null;
    return {
      ok: false,
      code: failure.code || (op === 'get' ? 'storage.readFailed' : 'storage.writeFailed'),
    };
  }

  return {
    get(key) {
      const failure = maybeFail('get');
      if (failure) return failure;
      try {
        return { ok: true, value: clone(values.get(key)) };
      } catch (error) {
        return readFailure();
      }
    },
    set(key, value) {
      const failure = maybeFail('set');
      if (failure) return failure;
      try {
        values.set(key, clone(value));
      } catch (error) {
        return writeFailure();
      }
      return { ok: true };
    },
    remove(key) {
      const failure = maybeFail('remove');
      if (failure) return failure;
      values.delete(key);
      return { ok: true };
    },
    failNext(failure) {
      pendingFailure = { ...(failure || {}) };
    },
  };
}

module.exports = { createWxAdapter, createMemoryAdapter };
