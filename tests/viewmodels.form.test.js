'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../miniprogram/i18n');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const { parseLocalDateTime } = require('../miniprogram/domain/dates');
const { findConflicts } = require('../miniprogram/domain/meeting');
const {
  conflictWarnings,
  fieldErrors,
  formDefaults,
  formOptions,
  labels,
} = require('../miniprogram/viewmodels/meeting-form');

test.afterEach(() => i18n._resetForTests());
test.beforeEach(() => {
  i18n._resetForTests();
  i18n.setDevMode(false);
  clock.setDemoMode(true);
  clock.setNow(null);
});

test('form defaults and options use the current locale', () => {
  const now = clock.now();
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    assert.deepEqual(formDefaults({ now, personId: 'p-lin' }), {
      title: '',
      date: '2026-10-24',
      start: '10:00',
      end: '11:00',
      roomId: '',
      attendeeIds: ['p-lin'],
      agenda: '',
    });
    const options = formOptions({});
    assert.equal(options.rooms[0].label, locale === 'en' ? '3F Small Meeting Room' : '3楼小会议室');
    assert.equal(options.people[0].label, locale === 'en' ? 'Chen Qiming' : '陈启明');
  }
});

test('form defaults stay valid near midnight', () => {
  const cases = [
    ['2026-10-24T22:30', '2026-10-25', '09:00', '10:00'],
    ['2026-10-24T23:10', '2026-10-25', '09:00', '10:00'],
    ['2026-10-24T09:20', '2026-10-24', '10:00', '11:00'],
  ];
  for (const [input, date, start, end] of cases) {
    const defaults = formDefaults({ now: parseLocalDateTime(input), personId: 'p-lin' });
    assert.equal(defaults.date, date);
    assert.equal(defaults.start, start);
    assert.equal(defaults.end, end);
  }
});

test('field errors map to translated text and retain the first field', () => {
  i18n.setDevMode(false);
  const result = fieldErrors([
    { field: 'title', code: 'meeting.title.required' },
    { field: 'end', code: 'meeting.time.endBeforeStart' },
  ]);
  assert.equal(result.first, 'title');
  assert.equal(result.byField.title, '请填写会议主题');
  assert.equal(result.byField.end, '结束时间需晚于开始时间');
  assert.deepEqual(fieldErrors([]), { byField: {}, first: null });
});

test('conflict warnings interpolate room and attendee text and expose the sheet copy', () => {
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setDevMode(false);
    i18n.setLocale(locale);
    const state = seed();
    const candidate = { id: 'new', date: '2026-10-26', start: '09:30', end: '10:00', roomId: 'f5-board', attendeeIds: ['p-lin'] };
    const conflicts = findConflicts(candidate, state.meetings, require('../miniprogram/data/reference'));
    const warnings = conflictWarnings(conflicts, { state });
    assert.equal(warnings.warnings.length, 2);
    assert.equal(warnings.warnings[0].includes('{'), false);
    assert.equal(warnings.warnings[1].includes('{'), false);
    assert.equal(warnings.sheet.title, locale === 'en' ? 'Schedule conflict' : '发现日程冲突');
    assert.equal(warnings.sheet.submitAnywayText, locale === 'en' ? 'Submit anyway' : '仍然提交');
    assert.equal(warnings.sheet.backText, locale === 'en' ? 'Go back' : '返回修改');
  }
});

test('labels include form, submitting, and dirty-leave copy', () => {
  i18n.setDevMode(false);
  const value = labels();
  assert.equal(value.title, '会议主题');
  assert.equal(value.submitting, '提交中…');
  assert.equal(value.dirtyLeave.leave, '离开');
  assert.equal(value.dirtyLeave.stay, '继续编辑');
});
