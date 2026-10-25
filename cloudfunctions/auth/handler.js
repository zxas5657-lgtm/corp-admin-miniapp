'use strict';

const { getDoc, loadCaller } = require('./shared/lib/caller');
const { fail, ok, wrap } = require('./shared/lib/result');

function createHandler(config) {
  const options = config || {};
  const db = options.db;
  const now = options.now || (() => new Date());
  const log = options.log;
  async function dispatch(event, context) {
    if (!event || event.action !== 'whoami') return fail('action.unknown');
    const openid = context && context.openid;
    const caller = await loadCaller(db, openid);
    if (!caller.ok) {
      if (caller.code === 'auth.notBound') return ok({ bound: false });
      return caller;
    }
    const employee = await getDoc(db, 'employees', caller.actor.personId);
    if (!employee) return fail('auth.notBound');
    return ok({
      bound: true,
      employee: {
        id: employee._id,
        name: employee.name,
        title: employee.title,
        role: employee.role,
      },
      dispatcher: caller.actor.dispatcher,
      sysAdmin: caller.actor.sysAdmin,
    });
  }
  return (event, context) => wrap(() => dispatch(event, context), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
