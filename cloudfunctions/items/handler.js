'use strict';

const { fail, wrap } = require('./shared/lib/result');

function createHandler(config) {
  const log = config && config.log;
  return (event) =>
    wrap(async () => {
      if (
        !event ||
        !['list', 'get', 'create', 'edit', 'cancel', 'confirm', 'decline', 'seen'].includes(
          event.action,
        )
      )
        return fail('action.unknown');
      return fail('action.unknown');
    }, log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
