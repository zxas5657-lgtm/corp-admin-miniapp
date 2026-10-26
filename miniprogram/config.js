'use strict';

module.exports = {
  DEV_ROLE_SWITCH: true,
  DATA_MODE: 'local',
  // env ids go here; not secrets (DATA_MODEL §3)
  CLOUD_ENVS: { dev: '', prod: '' },
  // owner inputs, not secrets (PLAN §7.4)
  PRIVACY: {
    version: 1,
    operatorName: '',
    contact: '',
    plateRetentionDays: 30,
    auditRetentionDays: 365,
  },
};
