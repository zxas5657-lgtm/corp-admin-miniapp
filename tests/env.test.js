'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const env = require('../miniprogram/utils/env');

test('without WeChat the build is a local develop demo', function () {
  const previous = global.wx;
  delete global.wx;
  try {
    assert.equal(env.envVersion(), 'develop');
    assert.equal(env.dataMode(), 'local');
    assert.equal(env.isDemo(), true);
    assert.equal(env.cloudEnv(), '');
  } finally {
    if (previous === undefined) delete global.wx;
    else global.wx = previous;
  }
});

test('release always uses the remote prod env id', function () {
  const previous = global.wx;
  global.wx = {
    getAccountInfoSync: function () {
      return { miniProgram: { envVersion: 'release' } };
    },
  };
  try {
    assert.equal(env.envVersion(), 'release');
    assert.equal(env.dataMode(), 'remote');
    assert.equal(env.isDemo(), false);
    assert.equal(env.cloudEnv(), '');
  } finally {
    if (previous === undefined) delete global.wx;
    else global.wx = previous;
  }
});
