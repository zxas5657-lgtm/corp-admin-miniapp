'use strict';

const crypto = require('crypto');

function newId() {
  return crypto.randomUUID();
}

module.exports = { newId };
