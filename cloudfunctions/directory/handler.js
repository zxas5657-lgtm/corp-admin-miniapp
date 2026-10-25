'use strict';

const { loadCaller } = require('./shared/lib/caller');
const { fail, ok, wrap } = require('./shared/lib/result');

function createHandler(config) {
  const options = config || {};
  const db = options.db;
  const log = options.log;
  async function dispatch(event, context) {
    if (!event || event.action !== 'list') return fail('action.unknown');
    const caller = await loadCaller(db, context && context.openid);
    if (!caller.ok) return caller;
    const [roomsResult, carsResult, employeesResult] = await Promise.all([
      db.collection('rooms').where({ active: true }).orderBy('sort', 'asc').get(),
      db.collection('cars').where({ active: true }).orderBy('sort', 'asc').get(),
      db.collection('employees').get(),
    ]);
    const employees = (employeesResult.data || [])
      .filter((employee) => employee.active !== false && employee.status !== 'disabled')
      .map((employee) => ({
        id: employee._id,
        name: employee.name,
        title: employee.title,
        role: employee.role,
      }));
    return ok({
      rooms: roomsResult.data || [],
      cars: carsResult.data || [],
      employees,
    });
  }
  return (event, context) => wrap(() => dispatch(event, context), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
