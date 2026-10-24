'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { compareLocales, findCjk, flattenKeys } = require('../scripts/check-i18n.js');

test('flattenKeys flattens nested objects and keeps arrays as leaves', () => {
  assert.deepEqual(flattenKeys({
    tab: { schedule: 'Schedule' },
    weekdays: ['Sun', 'Mon'],
    empty: null,
  }), {
    'tab.schedule': 'Schedule',
    weekdays: ['Sun', 'Mon'],
    empty: null,
  });
});

test('compareLocales pairs plural keys and permits zh-CN to have only _other', () => {
  const errors = compareLocales(
    { item: { count_other: '{n} items' } },
    { item: { count_one: '{n} item', count_other: '{n} items' } },
  );
  assert.deepEqual(errors, []);

  assert.match(
    compareLocales(
      { item: { count_other: '{n} items' } },
      { item: { count_other: '{n} items' } },
    ).join('\n'),
    /must include both/,
  );
});

test('compareLocales reports placeholder mismatches', () => {
  const errors = compareLocales(
    { greeting: 'Hello {name}' },
    { greeting: 'Hello {user}' },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Placeholder mismatch/);
});

test('findCjk reports CJK, punctuation, and fullwidth characters with lines', () => {
  const findings = findCjk('ok\n中文，Ａ');
  assert.deepEqual(findings.map(({ char, line }) => ({ char, line })), [
    { char: '中', line: 2 },
    { char: '文', line: 2 },
    { char: '，', line: 2 },
    { char: 'Ａ', line: 2 },
  ]);
});
