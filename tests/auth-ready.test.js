'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const auth = require('../miniprogram/utils/auth');

test('ready returns the cached sign-in until bootstrap runs again', async function () {
  const stub = { whoami: { ok: true, bound: false } };
  auth.setAuthStub(stub);
  const first = await auth.bootstrap();
  assert.equal(first.state, 'unbound');
  stub.whoami = { ok: false, code: 'auth.employeeDisabled' };
  const cached = await auth.ready();
  assert.equal(cached.state, 'unbound');
  const again = await auth.bootstrap();
  assert.equal(again.state, 'disabled');
  const still = await auth.ready();
  assert.equal(still.state, 'disabled');
  auth.setAuthStub(null);
});
