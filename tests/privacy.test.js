'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const privacy = require('../miniprogram/utils/privacy');

function restore(previous, warn) {
  if (previous === undefined) delete global.wx;
  else global.wx = previous;
  console.warn = warn;
  privacy._resetForTests();
}

test('a missing or unreadable consent record is not accepted', function () {
  const previous = global.wx;
  const warn = console.warn;
  const store = {};
  global.wx = {
    getStorageSync(key) {
      if (store.fail) throw new Error('read');
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : '';
    },
    setStorageSync(key, value) {
      store[key] = value;
    },
    removeStorageSync(key) {
      delete store[key];
    },
  };
  try {
    privacy._resetForTests();
    assert.equal(privacy.accepted(), false);
    assert.equal(privacy.needsConsent(), true);
    store[privacy.STORAGE_KEY] = { version: 0 };
    assert.equal(privacy.accepted(), false);
    store[privacy.STORAGE_KEY] = { version: 'nope' };
    assert.equal(privacy.accepted(), false);
    store[privacy.STORAGE_KEY] = '1';
    assert.equal(privacy.accepted(), false);
    store.fail = true;
    assert.equal(privacy.accepted(), false);
    assert.equal(privacy.needsConsent(), true);
  } finally {
    restore(previous, warn);
  }
});

test('accept stores the config version and a later version still counts', function () {
  const previous = global.wx;
  const warn = console.warn;
  const store = {};
  global.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : '';
    },
    setStorageSync(key, value) {
      if (store.failWrite) throw new Error('write');
      store[key] = value;
    },
  };
  try {
    privacy._resetForTests();
    assert.equal(privacy.accept(), true);
    assert.deepEqual(store[privacy.STORAGE_KEY], { version: 1 });
    assert.equal(privacy.accepted(), true);
    assert.equal(privacy.needsConsent(), false);
    store[privacy.STORAGE_KEY] = { version: 2 };
    assert.equal(privacy.accepted(), true);
    store.failWrite = true;
    delete store[privacy.STORAGE_KEY];
    assert.equal(privacy.accept(), false);
    assert.equal(privacy.accepted(), false);
  } finally {
    restore(previous, warn);
  }
});

test('agree resolves the WeChat hook and disagree exits or keeps the sheet', function () {
  const previous = global.wx;
  const warn = console.warn;
  const store = {};
  const agreed = [];
  const declined = [];
  let failExit = false;
  global.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : '';
    },
    setStorageSync(key, value) {
      if (store.failWrite) throw new Error('write');
      store[key] = value;
    },
    exitMiniProgram(options) {
      if (failExit) throw new Error('exit');
      if (options && store.failCallback && typeof options.fail === 'function') options.fail();
    },
  };
  try {
    privacy._resetForTests();
    privacy.onNeedPrivacyAuthorization(function (payload) { agreed.push(payload); });
    assert.equal(privacy.isSheetOpen(), true);
    assert.equal(privacy.hasPendingPrivacyAuth(), true);
    store.failWrite = true;
    assert.equal(privacy.agree(privacy.AGREE_BUTTON_ID), false);
    assert.equal(privacy.isSheetOpen(), true);
    assert.deepEqual(agreed, [{ buttonId: 'privacy-agree', event: 'agree' }]);
    store.failWrite = false;
    privacy.onNeedPrivacyAuthorization(function (payload) { declined.push(payload); });
    failExit = true;
    assert.equal(privacy.disagree(), false);
    assert.equal(privacy.isSheetOpen(), true);
    assert.deepEqual(declined, [{ event: 'disagree' }]);
    failExit = false;
    store.failCallback = true;
    privacy.onNeedPrivacyAuthorization(function () {});
    assert.equal(privacy.disagree(), true);
    assert.equal(privacy.isSheetOpen(), true);
  } finally {
    restore(previous, warn);
  }
});

test('release warns once when an owner field is empty and develop does not', function () {
  const previous = global.wx;
  const warn = console.warn;
  const warnings = [];
  console.warn = function (message) { warnings.push(String(message)); };
  global.wx = {
    getAccountInfoSync() {
      return { miniProgram: { envVersion: 'release' } };
    },
  };
  try {
    privacy._resetForTests();
    assert.equal(privacy.ownerField('operatorName'), '');
    assert.equal(privacy.ownerField('operatorName'), '');
    assert.deepEqual(warnings, ['privacy owner input is empty: operatorName']);
    global.wx = {
      getAccountInfoSync() {
        return { miniProgram: { envVersion: 'develop' } };
      },
    };
    privacy._resetForTests();
    warnings.length = 0;
    assert.equal(privacy.ownerField('contact'), '');
    assert.deepEqual(warnings, []);
    assert.equal(privacy.retentionDays('plateRetentionDays'), 30);
    assert.equal(privacy.retentionDays('auditRetentionDays'), 365);
    assert.equal(privacy.policyVersion(), 1);
  } finally {
    restore(previous, warn);
  }
});

test('presentForBound opens the sheet only while consent or WeChat auth is pending', function () {
  const previous = global.wx;
  const warn = console.warn;
  const store = {};
  global.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : '';
    },
    setStorageSync(key, value) {
      store[key] = value;
    },
    removeStorageSync(key) {
      delete store[key];
    },
  };
  try {
    privacy._resetForTests();
    privacy.presentForBound();
    assert.equal(privacy.isSheetOpen(), true);
    assert.equal(privacy.setAccepted(true), true);
    assert.equal(privacy.isSheetOpen(), false);
    assert.equal(privacy.needsConsent(), false);
    privacy.presentForBound();
    assert.equal(privacy.isSheetOpen(), false);
    assert.equal(privacy.setAccepted(false), false);
    assert.equal(privacy.needsConsent(), true);
    privacy.presentForBound();
    assert.equal(privacy.isSheetOpen(), true);
  } finally {
    restore(previous, warn);
  }
});
