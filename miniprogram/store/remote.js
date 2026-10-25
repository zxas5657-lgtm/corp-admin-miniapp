'use strict';

const en = require('../i18n/en');
const { BY_METHOD, METHODS } = require('./contract');
const { fromServer, toServer } = require('./wire');

function errorKeys(value, prefix, result) {
  for (const [key, child] of Object.entries(value || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) errorKeys(child, path, result);
    else result.add(path);
  }
  return result;
}

const ERROR_CODES = errorKeys(en.error, 'error', new Set());

function wxCall(name, data) {
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.callFunction !== 'function')
    return Promise.reject(new Error('wx.cloud.callFunction is unavailable'));
  return wx.cloud.callFunction({ name, data }).then((result) => result.result);
}

function createRemoteApi(options) {
  const config = options || {};
  const call = typeof config.call === 'function' ? config.call : wxCall;
  const onAuthLost = typeof config.onAuthLost === 'function' ? config.onAuthLost : () => {};

  async function invoke(method, payload) {
    const entry = BY_METHOD[method];
    const value =
      method === 'redeemInvite' && typeof payload === 'string' ? { code: payload } : payload || {};
    let raw;
    try {
      raw = await call(entry.fn, { action: entry.action, ...toServer(value) });
    } catch (error) {
      return { ok: false, code: 'network.failed' };
    }
    const result = fromServer(raw);
    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      typeof result.ok !== 'boolean'
    )
      return { ok: false, code: 'network.failed' };
    if (!result.ok) {
      const code = ERROR_CODES.has(`error.${result.code}`) ? result.code : 'server.error';
      if (code === 'auth.notBound' || code === 'auth.employeeDisabled') {
        try {
          onAuthLost(code);
        } catch (error) {
          // Authentication loss still belongs to the API result if the hook fails.
        }
      }
      return { ok: false, code };
    }
    return result;
  }

  const api = {};
  for (const method of METHODS) api[method] = (payload) => invoke(method, payload);
  return api;
}

module.exports = { createRemoteApi, wxCall, ERROR_CODES };
