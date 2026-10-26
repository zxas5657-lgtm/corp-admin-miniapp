'use strict';

const reference = require('../data/reference');
const { getStore } = require('../store/index');
const { getApi } = require('../store/api');
const { dataMode, isDemo, cloudEnv } = require('./env');
const { homeUrl } = require('./tabs');

let cached = null;
let inflight = null;
let stub = null;
let lost = false;
let generation = 0;

function finish(result, gen) {
  if (gen !== generation) return cached;
  cached = result;
  return result;
}

function currentMe() {
  return cached && cached.me ? cached.me : null;
}

function actorFrom(me) {
  if (!me || !me.personId) return null;
  return {
    personId: me.personId,
    role: me.role,
    dispatcher: Boolean(me.dispatcher),
    sysAdmin: Boolean(me.sysAdmin)
  };
}

function meFrom(result) {
  const employee = result && result.employee ? result.employee : {};
  return {
    personId: employee.id || '',
    role: employee.role || '',
    dispatcher: Boolean(result && result.dispatcher),
    sysAdmin: Boolean(result && result.sysAdmin),
    employee: employee,
    supports: result && result.supports ? result.supports : {}
  };
}

function localMe() {
  const actor = reference.actorFor(getStore().getRole());
  const person = actor ? reference.personById(actor.personId) : null;
  return {
    personId: actor ? actor.personId : '',
    role: actor ? actor.role : '',
    dispatcher: Boolean(actor && actor.dispatcher),
    sysAdmin: Boolean(actor && actor.sysAdmin),
    employee: person,
    supports: {}
  };
}

function classify(result, gen) {
  if (!result || result.ok === false) {
    if (result && result.code === 'auth.employeeDisabled') {
      return finish({ state: 'disabled', me: null }, gen);
    }
    return finish({ state: 'offline', me: null }, gen);
  }
  if (result.bound === false) return finish({ state: 'unbound', me: null }, gen);
  return finish({ state: 'bound', me: meFrom(result) }, gen);
}

function api() {
  return getApi({ mode: dataMode(), onAuthLost: onAuthLost });
}

function onAuthLost(code) {
  cached = null;
  if (!lost) {
    lost = true;
    const url = code === 'auth.employeeDisabled'
      ? '/pages/blocked/index'
      : '/pages/bind/index';
    try {
      wx.reLaunch({ url: url });
    } catch (err) {
      // The next page show can still route from the cached state.
    }
  }
  bootstrap();
}

function pathFor(result) {
  const state = result && result.state;
  if (state === 'unbound') return '/pages/bind/index';
  if (state === 'disabled') return '/pages/blocked/index';
  if (state === 'offline') return '/pages/blocked/index?state=offline';
  if (state === 'unconfigured') return '/pages/blocked/index?state=unconfigured';
  const me = result && result.me;
  const actor = isDemo() ? reference.actorFor(getStore().getRole()) : actorFrom(me);
  return homeUrl(actor);
}

function open(result) {
  const url = pathFor(result);
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const route = pages.length ? '/' + pages[pages.length - 1].route : '';
    if (route === url.split('?')[0] && url.indexOf('?') < 0) return;
    wx.reLaunch({ url: url });
  } catch (err) {
    // Routing must not break launch.
  }
}

async function run(gen) {
  if (dataMode() === 'remote' && !cloudEnv()) {
    return finish({ state: 'unconfigured', me: null }, gen);
  }
  if (stub && stub.whoami) return classify(stub.whoami, gen);
  if (isDemo()) {
    try {
      await api().whoami();
    } catch (err) {
      // Local mode is bound to the demo role even if the call fails.
    }
    if (gen !== generation) return cached;
    lost = false;
    return finish({ state: 'bound', me: localMe() }, gen);
  }
  let result;
  try {
    result = await api().whoami();
  } catch (err) {
    result = { ok: false, code: 'network.failed' };
  }
  const next = classify(result, gen);
  if (next && next.state === 'bound') lost = false;
  return next;
}

function bootstrap() {
  if (inflight) return inflight;
  const gen = generation;
  inflight = run(gen).then(function (result) {
    if (gen === generation) inflight = null;
    return result;
  }, function () {
    if (gen === generation) inflight = null;
    return finish({ state: 'offline', me: null }, gen);
  });
  return inflight;
}

function ready() {
  if (inflight) return inflight;
  // Nothing cached yet (a page loaded before launch finished): start the check once.
  if (!cached) return bootstrap();
  return Promise.resolve(cached);
}

function setAuthStub(value) {
  stub = value && typeof value === 'object' ? value : null;
  generation += 1;
  cached = null;
  inflight = null;
  return true;
}

function redeem(code) {
  if (stub && stub.redeemInvite) {
    if (stub.redeemInvite.pending) return new Promise(function () {});
    return Promise.resolve(stub.redeemInvite);
  }
  return api().redeemInvite({ code: code });
}

function accept(result) {
  lost = false;
  return finish({ state: 'bound', me: meFrom(result) }, generation);
}

module.exports = {
  bootstrap,
  ready,
  open,
  pathFor,
  currentMe,
  actorFrom,
  setAuthStub,
  redeem,
  accept,
  onAuthLost
};
