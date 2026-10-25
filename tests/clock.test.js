'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const clock = require('../miniprogram/domain/clock');

test.beforeEach(() => {
  clock.setDemoMode(true);
  clock.setNow(null);
});

test('demo mode returns the fixed local wall-clock instant', () => {
  assert.equal(clock.isDemoMode(), true);
  const value = clock.now();
  assert.equal(value.getFullYear(), 2026);
  assert.equal(value.getMonth(), 9);
  assert.equal(value.getDate(), 24);
  assert.equal(value.getHours(), 9);
  assert.equal(value.getMinutes(), 20);
});

test('setNow overrides the clock and returns independent Dates', () => {
  const override = new Date(2028, 1, 29, 12, 34);
  clock.setNow(override);
  const first = clock.now();
  first.setFullYear(2030);
  assert.equal(clock.now().getFullYear(), 2028);
  assert.equal(clock.now().getMinutes(), 34);
  assert.notEqual(clock.now(), override);
});

test('real mode returns approximately the current time', () => {
  clock.setDemoMode(false);
  clock.setNow(null);
  const before = Date.now();
  const value = clock.now().getTime();
  const after = Date.now();
  assert.equal(clock.isDemoMode(), false);
  assert.equal(value >= before && value <= after, true);
});
