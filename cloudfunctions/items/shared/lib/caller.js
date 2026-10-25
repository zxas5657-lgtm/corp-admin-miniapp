'use strict';

const { fail } = require('./result');

function isMissing(error) {
  if (!error) return false;
  if (error.errCode === -1 || error.code === 'DOCUMENT_NOT_FOUND') return true;
  // wx-server-sdk reports a missing doc as "document.get:fail ... does not exist".
  return /does not exist|not found/i.test(String(error.errMsg || error.message || ''));
}

async function getDoc(db, collection, id) {
  try {
    const result = await db.collection(collection).doc(id).get();
    return result && result.data ? result.data : null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function loadCaller(db, openid) {
  if (!openid) return fail('auth.notBound');
  const binding = await getDoc(db, 'bindings', openid);
  if (!binding) return fail('auth.notBound');
  const employee = await getDoc(db, 'employees', binding.employeeId);
  if (!employee) return fail('auth.notBound');
  if (employee.active === false || employee.status === 'disabled')
    return fail('auth.employeeDisabled');
  return {
    ok: true,
    actor: {
      personId: employee._id,
      role: employee.role,
      dispatcher: Boolean(employee.dispatcher),
      sysAdmin: Boolean(employee.sysAdmin),
    },
  };
}

async function loadSupports(db) {
  const result = await db.collection('supports').get();
  const supports = {};
  for (const record of result.data || []) supports[record._id] = [...(record.leaderIds || [])];
  return supports;
}

module.exports = { loadCaller, loadSupports, getDoc, isMissing };
