'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../miniprogram/i18n');
const zhCN = require('../miniprogram/i18n/zh-CN');
const en = require('../miniprogram/i18n/en');

test.beforeEach(() => {
  i18n._resetForTests();
  i18n.setDevMode(false);
});

test('interpolates named parameters', () => {
  i18n.setLocale('en');
  assert.equal(
    i18n.t('meeting.created', { date: 'Monday' }),
    'Meeting created and added to the Monday schedule',
  );
});

test('keeps a missing parameter visible', () => {
  i18n.setLocale('en');
  assert.equal(
    i18n.t('meeting.created'),
    'Meeting created and added to the {date} schedule',
  );
});

test('falls back to zh-CN when an en key is missing', () => {
  const original = en.demo.resetNotice;
  delete en.demo.resetNotice;
  try {
    i18n.setLocale('en');
    assert.equal(i18n.t('demo.resetNotice'), zhCN.demo.resetNotice);
  } finally {
    en.demo.resetNotice = original;
  }
});

test('returns an unknown key when neither locale has it', () => {
  assert.equal(i18n.t('unknown.key'), 'unknown.key');
});

test('selects plural forms in both locales', () => {
  i18n.setLocale('zh-CN');
  assert.equal(i18n.tn('schedule.count', 1), '1 项');
  assert.equal(i18n.tn('schedule.count', 2), '2 项');

  i18n.setLocale('en');
  assert.equal(i18n.tn('schedule.count', 1), '1 item');
  assert.equal(i18n.tn('schedule.count', 2), '2 items');
});

test('joins one, two, and three items in both locales', () => {
  i18n.setLocale('zh-CN');
  assert.equal(i18n.listJoin(['a']), 'a');
  assert.equal(i18n.listJoin(['a', 'b']), 'a、b');
  assert.equal(i18n.listJoin(['a', 'b', 'c']), 'a、b、c');

  i18n.setLocale('en');
  assert.equal(i18n.listJoin(['a']), 'a');
  assert.equal(i18n.listJoin(['a', 'b']), 'a and b');
  assert.equal(i18n.listJoin(['a', 'b', 'c']), 'a, b, and c');
});

test('formats Monday and Saturday headings from locale templates', () => {
  i18n.setLocale('zh-CN');
  assert.equal(i18n.fmt.dayHeading('2026-10-26'), '10月26日 周一');
  assert.equal(i18n.fmt.dayHeading('2026-10-24'), '10月24日 周六');

  i18n.setLocale('en');
  assert.equal(i18n.fmt.dayHeading('2026-10-26'), 'Mon, Oct 26');
  assert.equal(i18n.fmt.dayHeading('2026-10-24'), 'Sat, Oct 24');
});

test('normalizes locale names', () => {
  assert.equal(i18n.normalizeLocale('zh'), 'zh-CN');
  assert.equal(i18n.normalizeLocale('ZH-cn'), 'zh-CN');
  assert.equal(i18n.normalizeLocale('zh_CN'), 'zh-CN');
  assert.equal(i18n.normalizeLocale('zh-Hans'), 'zh-CN');
  assert.equal(i18n.normalizeLocale('en-US'), 'en');
  assert.equal(i18n.normalizeLocale(''), 'en');
  assert.equal(i18n.normalizeLocale(null), 'en');
});

test('notifies listeners once per real change and supports unsubscribe', () => {
  const changes = [];
  const unsubscribe = i18n.onChange((locale) => changes.push(locale));
  i18n.setLocale('en');
  i18n.setLocale('en');
  assert.deepEqual(changes, ['en']);

  unsubscribe();
  i18n.setLocale('zh-CN');
  assert.deepEqual(changes, ['en']);
});

test('keeps the error code keys in both locales', () => {
  assert.deepEqual(Object.keys(zhCN.error).sort(), Object.keys(en.error).sort());
  for (const code of Object.keys(zhCN.error)) {
    assert.notEqual(i18n.t(`error.${code}`), `error.${code}`);
    i18n.setLocale('en');
    assert.notEqual(i18n.t(`error.${code}`), `error.${code}`);
    i18n.setLocale('zh-CN');
  }
});

test('formats ranges, reads week starts, and merges dictionaries', () => {
  assert.equal(i18n.fmt.timeRange('09:00', '09:40'), '09:00–09:40');
  assert.equal(i18n.firstDayOfWeek(), 1);
  i18n.setLocale('en');
  assert.equal(i18n.firstDayOfWeek(), 0);
  assert.equal(i18n.dict('meeting').form.title, 'Meeting subject');
  assert.equal(i18n.localName({ name: { en: 'Room', 'zh-CN': '房间' } }), 'Room');
  assert.equal(i18n.displayText({ en: 'Typed', 'zh-CN': '已输入' }), 'Typed');
});
