'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeInviteCode, formatInviteCode } = require('../miniprogram/utils/invite-code');

test('invite codes drop spaces and dashes and keep eight characters', function () {
  assert.equal(normalizeInviteCode(' ab-cd 2345 extra '), 'ABCD2345');
  assert.equal(formatInviteCode('abcd2345'), 'ABCD-2345');
  assert.equal(formatInviteCode('ab'), 'AB');
});

test('invite codes ignore symbols', function () {
  assert.equal(normalizeInviteCode('ab_cd.23'), 'ABCD23');
});
