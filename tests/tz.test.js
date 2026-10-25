'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const tz = require('../miniprogram/domain/tz');

const instant = (value) => new Date(value);
const tablePath = (fn) => {
  tz._setIntl(false);
  try {
    return fn();
  } finally {
    tz._setIntl(null);
  }
};

test.afterEach(() => tz._setIntl(null));

test('Intl and the bundled table agree across the supported years', () => {
  const start = Date.UTC(2025, 0, 1);
  const end = Date.UTC(2031, 0, 1);
  for (const zone of tz.ZONES) {
    let intlAccepted = true;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone.id }).format();
    } catch (error) {
      intlAccepted = false;
    }
    for (let ms = start; ms < end; ms += 6 * 60 * 60 * 1000) {
      const value = instant(ms);
      const bundled = tablePath(() => tz.offsetMinutes(value, zone.id));
      if (intlAccepted) {
        tz._setIntl(true);
        assert.equal(tz.offsetMinutes(value, zone.id), bundled, `${zone.id} at ${value.toISOString()}`);
      }
    }
  }
});

test('DST transitions agree at their minute boundaries', () => {
  const edges = [
    ['Europe/London', Date.UTC(2026, 2, 29, 1), Date.UTC(2026, 9, 25, 1)],
    ['Europe/Berlin', Date.UTC(2026, 2, 29, 1), Date.UTC(2026, 9, 25, 1)],
    ['America/New_York', Date.UTC(2026, 2, 8, 7), Date.UTC(2026, 10, 1, 6)],
    ['America/Chicago', Date.UTC(2026, 2, 8, 8), Date.UTC(2026, 10, 1, 7)],
    ['America/Los_Angeles', Date.UTC(2026, 2, 8, 10), Date.UTC(2026, 10, 1, 9)],
    ['Australia/Sydney', Date.UTC(2026, 3, 4, 16), Date.UTC(2026, 9, 3, 16)],
  ];
  for (const [zone, spring, autumn] of edges) {
    for (const [boundary, before, after] of [
      [spring, instant(spring - 60000), instant(spring + 60000)],
      [autumn, instant(autumn - 60000), instant(autumn + 60000)],
    ]) {
      const beforeOffset = tablePath(() => tz.offsetMinutes(before, zone));
      const afterOffset = tablePath(() => tz.offsetMinutes(after, zone));
      assert.notEqual(beforeOffset, afterOffset, `${zone} transition ${new Date(boundary).toISOString()}`);
      tz._setIntl(true);
      assert.equal(tz.offsetMinutes(before, zone), beforeOffset);
      assert.equal(tz.offsetMinutes(after, zone), afterOffset);
    }
  }
});

test('DST gaps move forward and overlaps choose the earlier instant', () => {
  assert.equal(
    tz.fromZoned('2026-03-08', '02:30', 'America/Los_Angeles').toISOString(),
    '2026-03-08T10:30:00.000Z',
  );
  assert.equal(
    tz.toZoned(tz.fromZoned('2026-03-08', '02:30', 'America/Los_Angeles'), 'America/Los_Angeles').time,
    '03:30',
  );
  assert.equal(
    tz.fromZoned('2026-11-01', '01:30', 'America/Los_Angeles').toISOString(),
    '2026-11-01T08:30:00.000Z',
  );
  assert.equal(
    tz.fromZoned('2026-10-25', '01:30', 'Europe/London').toISOString(),
    '2026-10-25T00:30:00.000Z',
  );
});

test('zoned conversion round trips and exposes UTC independent parts', () => {
  for (const zone of ['Asia/Shanghai', 'America/Los_Angeles']) {
    const source = { date: '2026-10-24', time: '09:20' };
    const value = tz.fromZoned(source.date, source.time, zone);
    const local = tz.toZoned(value, zone);
    assert.equal(local.date, source.date);
    assert.equal(local.time, source.time);
    assert.equal(local.weekday, 6);
    assert.equal(typeof local.offset, 'number');
  }
});

test('spanDays uses the viewer-local half-open range', () => {
  const start = tz.fromZoned('2026-10-24', '10:00', 'Asia/Shanghai');
  const end = tz.fromZoned('2026-10-26', '10:00', 'Asia/Shanghai');
  assert.deepEqual(tz.spanDays(start, end, 'Asia/Shanghai'), ['2026-10-24', '2026-10-25', '2026-10-26']);

  const midnightEnd = tz.fromZoned('2026-10-26', '00:00', 'Asia/Shanghai');
  assert.deepEqual(tz.spanDays(start, midnightEnd, 'Asia/Shanghai'), ['2026-10-24', '2026-10-25']);

  const viewerStart = tz.fromZoned('2026-10-26', '14:00', 'Asia/Shanghai');
  const viewerEnd = tz.fromZoned('2026-10-26', '16:00', 'Asia/Shanghai');
  assert.deepEqual(tz.spanDays(viewerStart, viewerEnd, 'America/Los_Angeles'), ['2026-10-25', '2026-10-26']);
  assert.deepEqual(tz.spanDays(viewerEnd, viewerStart, 'Asia/Shanghai'), ['2026-10-26']);
});

test('overlaps, dual time, and seasons use the specified boundary rules', () => {
  assert.equal(tz.overlaps(0, 10, 10, 20), false);
  assert.equal(tz.overlaps(0, 10, 9, 20), true);
  assert.equal(tz.overlaps(instant(0), instant(10), instant(10), instant(20)), false);

  const value = instant('2026-10-24T16:00:00.000Z');
  assert.equal(tz.dualTime(value, 'Asia/Shanghai', 'Asia/Hong_Kong'), null);
  assert.equal(tz.dualTime(value, 'Asia/Shanghai', 'America/Los_Angeles').own.dayShift, 1);
  assert.equal(tz.dualTime(value, 'America/Los_Angeles', 'Asia/Shanghai').own.dayShift, -1);

  const boundary = instant('2026-11-30T16:00:00.000Z');
  assert.equal(tz.season(boundary, 'America/Los_Angeles'), 'autumn');
  assert.equal(tz.season(boundary, 'Asia/Shanghai'), 'winter');
  assert.equal(tz.season(instant('2026-03-01T00:00:00.000Z'), 'Asia/Shanghai'), 'spring');
});

test('invalid zones and values follow the documented contracts', () => {
  assert.equal(tz.isValidZone('Asia/Shanghai'), true);
  assert.equal(tz.isValidZone('Mars/Colony'), false);
  assert.throws(() => tz.offsetMinutes(instant(0), 'Mars/Colony'), RangeError);
  assert.throws(() => tz.toZoned(instant(0), 'Mars/Colony'), RangeError);
  assert.throws(() => tz.fromZoned('2026-01-01', '00:00', 'Mars/Colony'), RangeError);
  assert.equal(tz.fromZoned('2026-02-30', '00:00', 'Asia/Shanghai'), null);
  assert.equal(tz.fromZoned('2026-01-01', '24:00', 'Asia/Shanghai'), null);
});

test('probe reports runtime support and bundled offsets', () => {
  const result = tz.probe();
  assert.equal(typeof result.intl, 'boolean');
  assert.equal(typeof result.deviceZone, 'string');
  assert.equal(typeof result.offsets['Asia/Shanghai'], 'number');
  assert.equal(result.offsets['Asia/Shanghai'], 480);
  assert.equal(result.offsets['Asia/Tokyo'], 540);
});

test('host-local Date getters and setters are isolated to deviceZone', () => {
  const source = fs.readFileSync(require.resolve('../miniprogram/domain/tz'), 'utf8');
  const deviceStart = source.indexOf('function deviceZone');
  assert.notEqual(deviceStart, -1);
  const pureSource = source.slice(0, deviceStart);
  assert.doesNotMatch(pureSource, /\b(getHours|getMinutes|getSeconds|getDate|getMonth|getDay|getTimezoneOffset|setHours|setMinutes|setSeconds|setDate|setMonth|setFullYear)\s*\(/);
});
