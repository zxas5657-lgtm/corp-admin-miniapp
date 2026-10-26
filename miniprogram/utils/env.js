'use strict';

const config = require('../config');

function envVersion() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
      const info = wx.getAccountInfoSync();
      const version = info && info.miniProgram && info.miniProgram.envVersion;
      if (version === 'develop' || version === 'trial' || version === 'release') return version;
    }
  } catch (err) {
    // Node and the automator have no account info.
  }
  return 'develop';
}

function dataMode() {
  if (envVersion() === 'release') return 'remote';
  return config.DATA_MODE === 'remote' ? 'remote' : 'local';
}

function isDemo() {
  return dataMode() === 'local';
}

function cloudEnv() {
  const envs = config.CLOUD_ENVS || {};
  const id = envVersion() === 'release' ? envs.prod : envs.dev;
  return typeof id === 'string' ? id : '';
}

module.exports = { envVersion, dataMode, isDemo, cloudEnv };
