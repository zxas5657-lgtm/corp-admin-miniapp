'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const clock = require('../miniprogram/domain/clock');
const season = require('../miniprogram/utils/season');

function restoreWx(previous) {
  if (previous === undefined) delete global.wx;
  else global.wx = previous;
}

function withWx(wx, fn) {
  const previous = global.wx;
  global.wx = wx;
  try {
    fn();
  } finally {
    restoreWx(previous);
    clock.setNow(null);
    clock.setDemoMode(true);
    season._resetForTests();
  }
}

test('seasonFor uses meteorological month boundaries', function () {
  assert.equal(season.seasonFor('2026-01-01'), 'winter');
  assert.equal(season.seasonFor('2026-02-28'), 'winter');
  assert.equal(season.seasonFor('2026-03-01'), 'spring');
  assert.equal(season.seasonFor('2026-05-31'), 'spring');
  assert.equal(season.seasonFor('2026-06-01'), 'summer');
  assert.equal(season.seasonFor('2026-08-31'), 'summer');
  assert.equal(season.seasonFor('2026-09-01'), 'autumn');
  assert.equal(season.seasonFor('2026-11-30'), 'autumn');
  assert.equal(season.seasonFor('2026-12-01'), 'winter');
  assert.equal(season.seasonFor('2026-12-31'), 'winter');
});

test('auto uses the viewer-zone date when UTC is still the previous month', function () {
  withWx(undefined, function () {
    clock.setDemoMode(true);
    clock.setNow(new Date('2026-02-28T16:00:00.000Z'));
    assert.equal(season.calendarSeason(), 'spring');
    assert.equal(season.currentSeason(), 'spring');
    assert.equal(season.seasonClass(), 'season-spring');
  });
});

test('a fixed season and brand blue ignore the calendar', function () {
  const store = {};
  withWx({
    getStorageSync(key) {
      return store[key];
    },
    setStorageSync(key, value) {
      store[key] = value;
    }
  }, function () {
    clock.setDemoMode(true);
    clock.setNow(new Date('2026-10-24T01:20:00.000Z'));
    assert.equal(season.setSetting('winter').ok, true);
    assert.equal(season.getSetting(), 'winter');
    assert.equal(season.currentSeason(), 'winter');
    assert.equal(season.seasonClass(), 'season-winter');
    assert.equal(season.setSetting('brand').ok, true);
    assert.equal(season.currentSeason(), 'summer');
    assert.equal(season.seasonClass(), 'season-summer');
    assert.equal(season.calendarSeason(), 'autumn');
  });
});

test('a storage failure falls back to auto', function () {
  withWx({
    getStorageSync() {
      throw new Error('read failed');
    },
    setStorageSync() {
      throw new Error('write failed');
    }
  }, function () {
    clock.setDemoMode(true);
    clock.setNow(new Date('2026-10-24T01:20:00.000Z'));
    assert.equal(season.setSetting('spring').ok, false);
    assert.equal(season.getSetting(), 'auto');
    assert.equal(season.currentSeason(), 'autumn');
    assert.equal(season.seasonClass(), 'season-autumn');
  });
});

test('an invalid stored value falls back to auto', function () {
  withWx({
    getStorageSync() {
      return 'olive';
    },
    setStorageSync() {
      throw new Error('write failed');
    }
  }, function () {
    clock.setDemoMode(true);
    clock.setNow(new Date('2026-10-24T01:20:00.000Z'));
    assert.equal(season.getSetting(), 'auto');
    assert.equal(season.currentSeason(), 'autumn');
  });
});
