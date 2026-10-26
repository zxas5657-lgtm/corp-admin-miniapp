'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const clock = require('../miniprogram/domain/clock');
const tz = require('../miniprogram/domain/tz');
test.beforeEach(() => {
  clock.setDemoMode(true);
  clock.setNow(null);
});
test('demo mode is a fixed instant and zone', () => {
  assert.equal(clock.DEMO_TZ, 'Asia/Shanghai');
  assert.equal(clock.now().toISOString(), '2026-10-24T01:20:00.000Z');
  assert.equal(clock.viewerZone(), 'Asia/Shanghai');
});
test('setNow clones and real mode uses device zone', () => {
  const value = new Date('2028-02-29T20:34:00Z');
  clock.setNow(value);
  const first = clock.now();
  first.setUTCFullYear(2030);
  assert.equal(clock.now().toISOString(), '2028-02-29T20:34:00.000Z');
  clock.setNow(null);
  clock.setDemoMode(false);
  assert.equal(clock.viewerZone(), tz.deviceZone());
});

test('real mode returns approximately the current time', () => {
  clock.setDemoMode(false);
  clock.setNow(null);
  const before = Date.now();
  const value = clock.now().getTime();
  const after = Date.now();
  assert.ok(value >= before - 1000 && value <= after + 1000);
});
