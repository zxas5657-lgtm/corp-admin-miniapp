'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../miniprogram/i18n');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const clock = require('../miniprogram/domain/clock');
const tz = require('../miniprogram/domain/tz');
const { findConflicts } = require('../miniprogram/domain/meeting');
const {
  formDefaults,
  formOptions,
  fieldErrors,
  conflictWarnings,
  labels,
} = require('../miniprogram/viewmodels/meeting-form');
const now = new Date('2026-10-24T01:20:00Z');
const ctx = { supports: ref.SUPPORTS, isLeader: ref.isLeader };
test.afterEach(() => i18n._resetForTests());
test.beforeEach(() => {
  i18n._resetForTests();
  i18n.setDevMode(false);
  clock.setDemoMode(true);
});
test('meeting defaults are in the requested viewer zone', () => {
  assert.deepEqual(formDefaults({ now, viewerTz: 'Asia/Shanghai', personId: 'p-lin' }), {
    title: '',
    date: '2026-10-24',
    start: '10:00',
    end: '11:00',
    roomId: '',
    attendeeIds: ['p-lin'],
    agenda: '',
  });
  assert.equal(formDefaults({ now, viewerTz: 'America/Los_Angeles' }).date, '2026-10-23');
});
test('form options, errors, labels and conflict warnings stay localized', () => {
  assert.equal(formOptions({ refs: ref }).people.length >= 10, true);
  assert.equal(fieldErrors([{ field: 'title', code: 'meeting.title.required' }]).first, 'title');
  const items = seed().items;
  const candidate = {
    id: 'new',
    kind: 'meeting',
    startAt: tz.fromZoned('2026-10-26', '09:30', 'Asia/Shanghai').toISOString(),
    endAt: tz.fromZoned('2026-10-26', '10:00', 'Asia/Shanghai').toISOString(),
    roomId: 'f5-board',
    attendeeIds: ['p-chen'],
  };
  const conflicts = findConflicts(candidate, items, ref);
  const warnings = conflictWarnings(conflicts, {
    state: { items },
    viewerTz: 'Asia/Shanghai',
    refs: ref,
  });
  assert.equal(warnings.warnings.length, 2);
  assert.equal(warnings.warnings[0].includes('{'), false);
  assert.equal(labels().dirtyLeave.leave.length > 0, true);
});

test('form defaults and options use the current locale', () => {
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setLocale(locale);
    const defaults = formDefaults({ now, viewerTz: 'Asia/Shanghai', personId: 'p-lin' });
    assert.equal(defaults.date, '2026-10-24');
    assert.equal(defaults.start, '10:00');
    const options = formOptions({});
    assert.equal(options.rooms[0].label, locale === 'en' ? '3F Small Meeting Room' : '3楼小会议室');
    assert.equal(options.people[0].label, locale === 'en' ? 'Chen Qiming' : '陈启明');
    assert.equal(options.people.length >= 10, true);
  }
});
test('field errors map to translated text and retain the first field', () => {
  const result = fieldErrors([
    { field: 'title', code: 'meeting.title.required' },
    { field: 'end', code: 'meeting.time.endBeforeStart' },
  ]);
  assert.equal(result.first, 'title');
  assert.equal(result.byField.title, '请填写会议主题');
  assert.equal(result.byField.end, '结束时间需晚于开始时间');
  assert.deepEqual(fieldErrors([]), { byField: {}, first: null });
});
test('labels include form submitting and dirty-leave copy', () => {
  const value = labels();
  assert.equal(value.title, '会议主题');
  assert.equal(value.submitting, '提交中…');
  assert.equal(value.dirtyLeave.leave, '离开');
  assert.equal(value.dirtyLeave.stay, '继续编辑');
});

test('form defaults stay valid near midnight in the viewer zone', () => {
  for (const [instant, date, time] of [
    ['2026-10-24T14:30:00Z', '2026-10-25', '09:00'],
    ['2026-10-24T15:10:00Z', '2026-10-25', '09:00'],
    ['2026-10-24T01:20:00Z', '2026-10-24', '10:00'],
  ]) {
    const value = formDefaults({
      now: new Date(instant),
      viewerTz: 'Asia/Shanghai',
      personId: 'p-lin',
    });
    assert.equal(value.date, date);
    assert.equal(value.start, time);
    assert.equal(value.end, time === '09:00' ? '10:00' : '11:00');
  }
});
test('conflict warnings interpolate room attendee text and sheet copy', () => {
  const state = seed();
  const candidate = {
    id: 'new',
    kind: 'meeting',
    startAt: tz.fromZoned('2026-10-26', '09:30', 'Asia/Shanghai').toISOString(),
    endAt: tz.fromZoned('2026-10-26', '10:00', 'Asia/Shanghai').toISOString(),
    roomId: 'f5-board',
    attendeeIds: ['p-chen'],
  };
  const conflicts = findConflicts(candidate, state.items, ref);
  for (const locale of ['zh-CN', 'en']) {
    i18n._resetForTests();
    i18n.setLocale(locale);
    const result = conflictWarnings(conflicts, { state, refs: ref, viewerTz: 'Asia/Shanghai' });
    assert.equal(result.warnings.length, 2);
    assert.equal(
      result.warnings.every((text) => !text.includes('{')),
      true,
    );
    assert.equal(result.sheet.title, locale === 'en' ? 'Schedule conflict' : '发现日程冲突');
    assert.equal(result.sheet.submitAnywayText, locale === 'en' ? 'Submit anyway' : '仍然提交');
    assert.equal(result.sheet.backText, locale === 'en' ? 'Go back' : '返回修改');
  }
});
