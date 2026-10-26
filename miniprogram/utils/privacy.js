'use strict';

const config = require('../config');
const { envVersion } = require('./env');

const STORAGE_KEY = 'privacy-consent';
const AGREE_BUTTON_ID = 'privacy-agree';

let sheetOpen = false;
let listeners = [];
let pending = [];
let warned = {};

function requiredVersion() {
  const value = Number(config.PRIVACY && config.PRIVACY.version);
  return Number.isFinite(value) ? value : 0;
}

function readStored() {
  try {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return null;
    const value = wx.getStorageSync(STORAGE_KEY);
    if (!value || typeof value !== 'object') return null;
    const version = Number(value.version);
    if (!Number.isFinite(version)) return null;
    return version;
  } catch (err) {
    return null;
  }
}

function accepted() {
  const version = readStored();
  if (version === null) return false;
  return version >= requiredVersion();
}

function accept() {
  try {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') return false;
    wx.setStorageSync(STORAGE_KEY, { version: requiredVersion() });
    return true;
  } catch (err) {
    return false;
  }
}

function clear() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.removeStorageSync === 'function') {
      wx.removeStorageSync(STORAGE_KEY);
    }
  } catch (err) {
    // A failed clear still reads as not accepted.
  }
}

function needsConsent() {
  return !accepted();
}

function ownerField(name) {
  const privacy = config.PRIVACY || {};
  const raw = privacy[name];
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text) return text;
  if (envVersion() === 'release' && !warned[name]) {
    warned[name] = true;
    try {
      console.warn('privacy owner input is empty: ' + name);
    } catch (err) {
      // A missing console must not block the page.
    }
  }
  return '';
}

function policyVersion() {
  return requiredVersion();
}

function retentionDays(name) {
  const privacy = config.PRIVACY || {};
  const value = Number(privacy[name]);
  return Number.isFinite(value) ? value : 0;
}

function emit() {
  const current = listeners.slice();
  for (let i = 0; i < current.length; i += 1) {
    try {
      current[i](sheetOpen);
    } catch (err) {
      // One listener must not block the others.
    }
  }
}

function isSheetOpen() {
  return sheetOpen;
}

function openSheet() {
  if (sheetOpen) return;
  sheetOpen = true;
  emit();
}

function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;
  emit();
}

function subscribe(fn) {
  if (typeof fn !== 'function') return function () {};
  listeners.push(fn);
  return function () {
    listeners = listeners.filter(function (item) { return item !== fn; });
  };
}

function hasPendingPrivacyAuth() {
  return pending.length > 0;
}

function presentForBound() {
  if (needsConsent() || hasPendingPrivacyAuth()) openSheet();
  else closeSheet();
}

function onNeedPrivacyAuthorization(resolve) {
  if (typeof resolve === 'function') pending.push(resolve);
  openSheet();
}

function settle(payload) {
  const queued = pending.splice(0, pending.length);
  for (let i = 0; i < queued.length; i += 1) {
    try {
      queued[i](payload);
    } catch (err) {
      // A failed resolve must not skip the rest.
    }
  }
}

function agree(buttonId) {
  const stored = accept();
  settle({ buttonId: buttonId || AGREE_BUTTON_ID, event: 'agree' });
  if (stored) closeSheet();
  return stored;
}

function disagree() {
  settle({ event: 'disagree' });
  try {
    if (typeof wx === 'undefined' || typeof wx.exitMiniProgram !== 'function') {
      openSheet();
      return false;
    }
    wx.exitMiniProgram({
      fail: function () {
        openSheet();
      },
    });
    return true;
  } catch (err) {
    openSheet();
    return false;
  }
}

// Demo hook. Clearing a queued WeChat resolve here only skips the sheet in
// screenshot runs; the real button still resolves it.
function setAccepted(value) {
  if (value) {
    const stored = accept();
    pending = [];
    if (stored) closeSheet();
    return stored && accepted();
  }
  clear();
  closeSheet();
  return false;
}

function _resetForTests() {
  sheetOpen = false;
  listeners = [];
  pending = [];
  warned = {};
}

module.exports = {
  STORAGE_KEY,
  AGREE_BUTTON_ID,
  accepted,
  accept,
  clear,
  needsConsent,
  ownerField,
  policyVersion,
  retentionDays,
  isSheetOpen,
  openSheet,
  closeSheet,
  subscribe,
  hasPendingPrivacyAuth,
  presentForBound,
  onNeedPrivacyAuthorization,
  agree,
  disagree,
  setAccepted,
  _resetForTests,
};
