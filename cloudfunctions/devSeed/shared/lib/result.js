'use strict';

function ok(data) {
  return { ok: true, ...(data || {}) };
}

function fail(code) {
  return { ok: false, code };
}

function wrap(fn, log) {
  return Promise.resolve()
    .then(fn)
    .catch((error) => {
      if (typeof log === 'function') log(error);
      return fail('server.error');
    });
}

module.exports = { ok, fail, wrap };
