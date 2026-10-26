'use strict';

const clock = require('../domain/clock');
const tz = require('../domain/tz');

const STORAGE_KEY = 'appearance-season';
const SETTINGS = ['auto', 'spring', 'summer', 'autumn', 'winter', 'brand'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

let listeners = [];

function seasonFor(date) {
  const month = Number(String(date || '').slice(5, 7));
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function viewerDate() {
  return tz.toZoned(clock.now(), clock.viewerZone()).date;
}

function calendarSeason() {
  return seasonFor(viewerDate());
}

function readStored() {
  try {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
      return 'auto';
    }
    const value = wx.getStorageSync(STORAGE_KEY);
    if (SETTINGS.indexOf(value) === -1) return 'auto';
    return value;
  } catch (err) {
    return 'auto';
  }
}

function getSetting() {
  return readStored();
}

function currentSeason() {
  const setting = readStored();
  if (setting === 'brand') return 'summer';
  if (SEASONS.indexOf(setting) !== -1) return setting;
  return calendarSeason();
}

function seasonClass() {
  return 'season-' + currentSeason();
}

function notify() {
  const current = listeners.slice();
  for (let i = 0; i < current.length; i += 1) current[i]();
}

function setSetting(setting) {
  if (SETTINGS.indexOf(setting) === -1) return { ok: false };
  try {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
      return { ok: false };
    }
    wx.setStorageSync(STORAGE_KEY, setting);
  } catch (err) {
    return { ok: false };
  }
  notify();
  return { ok: true };
}

function onChange(listener) {
  if (typeof listener !== 'function') return function () {};
  listeners.push(listener);
  return function () {
    listeners = listeners.filter(function (item) {
      return item !== listener;
    });
  };
}

function _resetForTests() {
  listeners = [];
}

module.exports = {
  STORAGE_KEY,
  seasonFor,
  calendarSeason,
  getSetting,
  setSetting,
  currentSeason,
  seasonClass,
  onChange,
  _resetForTests
};
