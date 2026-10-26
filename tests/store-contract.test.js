'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CONTRACT, METHODS } = require('../miniprogram/store/contract');

test('contract methods match the table and use unique function actions', () => {
  assert.deepEqual(
    METHODS,
    CONTRACT.map((entry) => entry.method),
  );
  assert.equal(new Set(METHODS).size, METHODS.length);
  const actions = CONTRACT.map((entry) => `${entry.fn}.${entry.action}`);
  assert.equal(new Set(actions).size, actions.length);
});

test('every contract function names a CloudBase function folder', () => {
  for (const entry of CONTRACT) {
    assert.equal(
      fs.existsSync(path.join(__dirname, '..', 'cloudfunctions', entry.fn)),
      true,
      entry.fn,
    );
  }
});
