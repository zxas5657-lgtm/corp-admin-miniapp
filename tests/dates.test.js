'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dates = require('../miniprogram/domain/dates');

test('addDays crosses month and year boundaries', () => {
  assert.equal(dates.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(dates.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dates.addDays('2026-01-01', -1), '2025-12-31');
});

test('handles leap day and rejects invalid dates and times', () => {
  assert.equal(dates.isDateStr('2028-02-29'), true);
  assert.equal(dates.addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(dates.isDateStr('2026-02-29'), false);
  assert.equal(dates.isDateStr('2026-02-30'), false);
  assert.equal(dates.isDateStr('2026-13-01'), false);
  assert.equal(dates.isTimeStr('00:00'), true);
  assert.equal(dates.isTimeStr('23:59'), true);
  assert.equal(dates.isTimeStr('24:00'), false);
  assert.equal(dates.isTimeStr('09:60'), false);
  assert.equal(dates.isTimeStr('9:00'), false);
});

test('formats local date and time parts', () => {
  const value = new Date(2026, 9, 24, 9, 20);
  assert.equal(dates.toDateStr(value), '2026-10-24');
  assert.equal(dates.toTimeStr(value), '09:20');
  assert.deepEqual(dates.nowParts(value), { date: '2026-10-24', time: '09:20' });
});

test('parses local date-time strings without UTC parsing', () => {
  const value = dates.parseLocalDateTime('2026-10-24T09:20');
  assert.equal(value.getFullYear(), 2026);
  assert.equal(value.getMonth(), 9);
  assert.equal(value.getDate(), 24);
  assert.equal(value.getHours(), 9);
  assert.equal(value.getMinutes(), 20);
  assert.equal(dates.parseLocalDateTime('2026-02-30T09:20'), null);
  assert.equal(dates.parseLocalDateTime('2026-10-24T24:00'), null);
});

test('compares dates, converts times, and finds weekdays', () => {
  assert.equal(dates.compareDate('2026-10-23', '2026-10-24'), -1);
  assert.equal(dates.compareDate('2026-10-24', '2026-10-24'), 0);
  assert.equal(dates.compareDate('2026-10-25', '2026-10-24'), 1);
  assert.equal(dates.toMinutes('09:40'), 580);
  assert.equal(dates.weekdayOf('2026-10-24'), 6);
  assert.equal(dates.isSameDay('2026-10-24', new Date(2026, 9, 24, 23, 59)), true);
});

test('builds Monday and Sunday weeks', () => {
  assert.deepEqual(dates.weekDays('2026-10-24', 1), [
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
    '2026-10-25',
  ]);
  assert.deepEqual(dates.weekDays('2026-10-24', 0), [
    '2026-10-18',
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
  ]);
});

test('diffDays counts calendar days across DST and month ends', () => {
  const { diffDays } = require('../miniprogram/domain/dates');
  assert.equal(diffDays('2026-11-30', '2026-12-01'), 1);
  assert.equal(diffDays('2026-03-07', '2026-03-09'), 2);
  assert.equal(diffDays('2026-12-08', '2026-12-01'), -7);
  assert.throws(() => diffDays('2026-02-30', '2026-03-01'), RangeError);
});
