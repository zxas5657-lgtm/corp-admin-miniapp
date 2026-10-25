'use strict';

const { fail, wrap } = require('./shared/lib/result');

function createHandler(config) {
  const log = config && config.log;
  return (event) => wrap(async () => fail('action.unknown'), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
