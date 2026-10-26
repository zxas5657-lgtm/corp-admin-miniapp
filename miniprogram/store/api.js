'use strict';

const config = require('../config');
const reference = require('../data/reference');
const clock = require('../domain/clock');
const { getStore } = require('./index');
const { createLocalApi } = require('./local');
const { createRemoteApi, wxCall } = require('./remote');

function createApi(options) {
  const value = options || {};
  if (value.mode === 'remote') {
    return createRemoteApi({ call: value.call || wxCall, onAuthLost: value.onAuthLost });
  }
  const store = value.store || getStore();
  const actor = value.actor || reference.actorFor(store.getRole());
  return createLocalApi({
    store,
    actor,
    clock: value.clock || clock,
    ctx: value.ctx,
    newId: value.newId,
  });
}

let singleton = null;

function getApi(options) {
  if (!singleton) singleton = createApi({ mode: config.DATA_MODE, ...(options || {}) });
  return singleton;
}

function resetApi() {
  singleton = null;
}

module.exports = { createApi, getApi, resetApi };
