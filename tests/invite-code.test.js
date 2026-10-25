'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ALPHABET,
  generateCode,
  hashCode,
  normalizeCode,
} = require('../cloudfunctions/_lib/invite-code');

test('invite alphabet is unambiguous and code generation is deterministic', () => {
  assert.equal(ALPHABET.length, 32);
  assert.equal(/[0OI1]/.test(ALPHABET), false);
  assert.equal(
    generateCode(() => 0),
    'AAAAAAAA',
  );
  assert.equal(
    generateCode((max) => max - 1),
    '99999999',
  );
});

test('invite codes normalize case, spaces, and dashes', () => {
  assert.equal(normalizeCode('ab cd-23 45'), 'ABCD2345');
  assert.equal(normalizeCode('short'), null);
  assert.equal(normalizeCode('ABCD2340'), null);
  assert.equal(normalizeCode('ABCD23456'), null);
});

test('invite code hashes are stable SHA-256 values', () => {
  assert.equal(
    hashCode('abcd2345'),
    'a00d76646eba91b057841554d5c8334f498dc592ed744bce404f21fe271cd36e',
  );
  assert.equal(hashCode('abcd2345'), hashCode('ABCD2345'));
});
