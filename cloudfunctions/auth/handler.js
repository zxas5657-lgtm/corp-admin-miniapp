'use strict';

const { auditEntry, writeAudit } = require('./shared/lib/audit');
const { hashCode, normalizeCode } = require('./shared/lib/invite-code');
const { getDoc, isMissing, loadCaller } = require('./shared/lib/caller');
const { fail, ok, wrap } = require('./shared/lib/result');

const HOUR = 60 * 60 * 1000;

function activeEmployee(employee) {
  return employee && employee.active !== false && employee.status !== 'disabled';
}

function codedError(code) {
  const error = new Error(code);
  error.resultCode = code;
  return error;
}

async function txGet(tx, collection, id) {
  try {
    const result = await tx.collection(collection).doc(id).get();
    return result && result.data ? result.data : null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function createHandler(config) {
  const options = config || {};
  const db = options.db;
  const now = options.now || (() => new Date());
  const log = options.log;

  async function rateLimit(openid, at) {
    const record = await getDoc(db, 'rate_limits', openid);
    if (
      !record ||
      !record.windowStart ||
      at.getTime() - new Date(record.windowStart).getTime() >= HOUR
    )
      return { count: 0 };
    return { count: Number(record.count) || 0 };
  }

  async function failedAttempt(openid, at) {
    const record = await getDoc(db, 'rate_limits', openid);
    const fresh =
      record && record.windowStart && at.getTime() - new Date(record.windowStart).getTime() < HOUR;
    await db
      .collection('rate_limits')
      .doc(openid)
      .set({
        data: {
          count: fresh ? (Number(record.count) || 0) + 1 : 1,
          windowStart: fresh ? new Date(record.windowStart) : at,
          v: 1,
          rev: record && Number.isInteger(record.rev) ? record.rev + 1 : 0,
        },
      });
  }

  async function clearRateLimit(openid) {
    await db.collection('rate_limits').doc(openid).remove();
  }

  function whoamiResult(employee, actor) {
    return ok({
      bound: true,
      employee: {
        id: employee._id,
        name: employee.name,
        title: employee.title,
        role: employee.role,
      },
      dispatcher: actor.dispatcher,
      sysAdmin: actor.sysAdmin,
    });
  }

  async function redeemInvite(event, context) {
    const openid = context && context.openid;
    if (!openid) return fail('auth.notBound');
    if (await getDoc(db, 'bindings', openid)) return fail('auth.alreadyBound');
    const at = new Date(now());
    const limit = await rateLimit(openid, at);
    if (limit.count >= 5) return fail('auth.tooManyAttempts');
    const normalized = normalizeCode(event && event.code);
    if (!normalized) {
      await failedAttempt(openid, at);
      return fail('auth.inviteInvalid');
    }
    const codeHash = hashCode(normalized);
    const invite = await getDoc(db, 'invites', codeHash);
    if (!invite || invite.revokedAt || invite.usedAt) {
      await failedAttempt(openid, at);
      return fail('auth.inviteInvalid');
    }
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= at.getTime()) {
      await failedAttempt(openid, at);
      return fail('auth.inviteExpired');
    }
    const employee = await getDoc(db, 'employees', invite.employeeId);
    if (!activeEmployee(employee)) {
      await failedAttempt(openid, at);
      return fail('auth.employeeDisabled');
    }
    const existingEmployeeBinding = await db
      .collection('bindings')
      .where({ employeeId: invite.employeeId })
      .count();
    if (existingEmployeeBinding.total > 0) {
      await failedAttempt(openid, at);
      return fail('auth.inviteInvalid');
    }
    try {
      await db.runTransaction(async (tx) => {
        const currentInvite = await txGet(tx, 'invites', codeHash);
        if (!currentInvite || currentInvite.revokedAt || currentInvite.usedAt)
          throw codedError('auth.inviteInvalid');
        if (currentInvite.expiresAt && new Date(currentInvite.expiresAt).getTime() <= at.getTime())
          throw codedError('auth.inviteExpired');
        const currentEmployee = await txGet(tx, 'employees', currentInvite.employeeId);
        if (!activeEmployee(currentEmployee)) throw codedError('auth.employeeDisabled');
        if (await txGet(tx, 'bindings', openid)) throw codedError('auth.alreadyBound');
        await tx
          .collection('bindings')
          .doc(openid)
          .set({
            data: {
              employeeId: currentInvite.employeeId,
              inviteId: codeHash,
              boundAt: at,
            },
          });
        await tx
          .collection('invites')
          .doc(codeHash)
          .update({
            data: { usedAt: at, usedBy: openid, rev: (currentInvite.rev || 0) + 1 },
          });
        await writeAudit(
          tx,
          auditEntry(
            {
              actorId: currentInvite.employeeId,
              action: 'invite.redeem',
              entity: 'invite',
              entityId: codeHash,
              changes: { usedAt: at },
            },
            at,
          ),
        );
        return currentEmployee;
      });
    } catch (error) {
      const code = error.resultCode || 'server.error';
      if (code !== 'auth.alreadyBound') await failedAttempt(openid, at);
      return fail(code);
    }
    await clearRateLimit(openid);
    const caller = await loadCaller(db, openid);
    if (!caller.ok) return caller;
    const boundEmployee = await getDoc(db, 'employees', caller.actor.personId);
    if (!boundEmployee) return fail('auth.notBound');
    return whoamiResult(boundEmployee, caller.actor);
  }

  async function dispatch(event, context) {
    if (event && event.action === 'redeemInvite') return redeemInvite(event, context);
    if (!event || event.action !== 'whoami') return fail('action.unknown');
    const openid = context && context.openid;
    const caller = await loadCaller(db, openid);
    if (!caller.ok) {
      if (caller.code === 'auth.notBound') return ok({ bound: false });
      return caller;
    }
    const employee = await getDoc(db, 'employees', caller.actor.personId);
    if (!employee) return fail('auth.notBound');
    return whoamiResult(employee, caller.actor);
  }
  return (event, context) => wrap(() => dispatch(event, context), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
