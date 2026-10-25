'use strict';

const crypto = require('crypto');

const { auditEntry, writeAudit } = require('./shared/lib/audit');
const {
  getDoc,
  loadCaller,
  requireSupportsEditor,
  requireSysAdmin,
} = require('./shared/lib/caller');
const { generateCode, hashCode } = require('./shared/lib/invite-code');
const { fail, ok, wrap } = require('./shared/lib/result');

const OPEN_INVITE = (db) => ({
  usedAt: db.command.exists(false),
  revokedAt: db.command.exists(false),
});

function isActive(employee) {
  return employee && employee.active !== false && employee.status !== 'disabled';
}

function dateFrom(now) {
  return new Date(now());
}

function changedFlags(employee, event) {
  const changes = {};
  for (const field of ['dispatcher', 'sysAdmin']) {
    if (event[field] !== undefined && event[field] !== employee[field])
      changes[field] = event[field];
  }
  return changes;
}

function createHandler(config) {
  const options = config || {};
  const db = options.db;
  const now = options.now || (() => new Date());
  const log = options.log;
  const randomInt = options.randomInt || crypto.randomInt;

  async function revokeOpenInvites(employeeId, at) {
    const result = await db
      .collection('invites')
      .where({ employeeId, ...OPEN_INVITE(db) })
      .update({ data: { revokedAt: at } });
    return result.stats && result.stats.updated ? result.stats.updated : 0;
  }

  async function issueInvite(employeeId, actorId) {
    const employee = await getDoc(db, 'employees', employeeId);
    if (!employee) return fail('admin.employeeNotFound');
    if (!isActive(employee)) return fail('auth.employeeDisabled');
    const binding = await db.collection('bindings').where({ employeeId }).count();
    if (binding.total > 0) return fail('admin.alreadyBound');
    const at = dateFrom(now);
    await revokeOpenInvites(employeeId, at);
    let code;
    let codeHash;
    let stored = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateCode(randomInt);
      codeHash = hashCode(code);
      if (await getDoc(db, 'invites', codeHash)) continue;
      try {
        await db.collection('invites').add({
          data: {
            _id: codeHash,
            codeHash,
            employeeId,
            createdBy: actorId,
            createdAt: at,
            expiresAt: new Date(at.getTime() + 7 * 24 * 60 * 60 * 1000),
            v: 1,
            rev: 0,
          },
        });
        stored = true;
        break;
      } catch (error) {
        if (!/duplicate|exists/i.test(String(error.message || error))) throw error;
      }
    }
    if (!stored) return fail('server.error');
    await writeAudit(
      db,
      auditEntry(
        {
          actorId,
          action: 'invite.issue',
          entity: 'invite',
          entityId: codeHash,
          changes: { employeeId },
        },
        at,
      ),
    );
    return ok({
      code,
      expiresAt: new Date(at.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  async function dispatch(event, context) {
    const action = event && event.action;
    if (!action) return fail('action.unknown');
    if (
      ![
        'bootstrapInvite',
        'updateSupports',
        'issueInvite',
        'revokeInvite',
        'disableEmployee',
        'setFlags',
      ].includes(action)
    )
      return fail('action.unknown');
    if (action === 'bootstrapInvite') {
      if (event.confirm !== 'bootstrap') return fail('permission.denied');
      const bindings = await db.collection('bindings').count();
      if (bindings.total > 0) return fail('permission.denied');
      const employee = await getDoc(db, 'employees', event.employeeId);
      if (!isActive(employee) || !employee.sysAdmin) return fail('permission.denied');
      return issueInvite(event.employeeId, employee._id);
    }

    const caller = await loadCaller(db, context && context.openid);
    if (!caller.ok) return caller;
    const actor = caller.actor;
    if (action === 'updateSupports') {
      const denied = requireSupportsEditor(actor);
      if (denied) return denied;
      const secretary = await getDoc(db, 'employees', event.secretaryId);
      if (!isActive(secretary) || secretary.role !== 'secretary')
        return fail('supports.notSecretary');
      const leaderIds = event.leaderIds;
      if (!Array.isArray(leaderIds) || new Set(leaderIds).size !== leaderIds.length)
        return fail('supports.leaderInvalid');
      const leaders = await db.collection('employees').where({ role: 'leader' }).get();
      const activeLeaders = new Set(
        (leaders.data || [])
          .filter((employee) => isActive(employee))
          .map((employee) => employee._id),
      );
      if (leaderIds.some((id) => !activeLeaders.has(id))) return fail('supports.leaderInvalid');
      const at = dateFrom(now);
      const current = await getDoc(db, 'supports', event.secretaryId);
      await db
        .collection('supports')
        .doc(event.secretaryId)
        .set({
          data: {
            leaderIds: [...leaderIds],
            updatedAt: at,
            updatedBy: actor.personId,
            v: current && current.v ? current.v : 1,
            rev: current && Number.isInteger(current.rev) ? current.rev + 1 : 0,
          },
        });
      await writeAudit(
        db,
        auditEntry(
          {
            actorId: actor.personId,
            action: 'supports.update',
            entity: 'supports',
            entityId: event.secretaryId,
            changes: { leaderIds: [...leaderIds] },
          },
          at,
        ),
      );
      return ok({ secretaryId: event.secretaryId, leaderIds: [...leaderIds] });
    }

    const denied = requireSysAdmin(actor);
    if (denied) return denied;
    if (action === 'issueInvite') return issueInvite(event.employeeId, actor.personId);
    const employee = await getDoc(db, 'employees', event.employeeId);
    if (!employee) return fail('admin.employeeNotFound');

    if (action === 'revokeInvite') {
      const at = dateFrom(now);
      const revoked = await revokeOpenInvites(event.employeeId, at);
      await writeAudit(
        db,
        auditEntry(
          {
            actorId: actor.personId,
            action: 'invite.revoke',
            entity: 'employee',
            entityId: event.employeeId,
            changes: { revoked },
          },
          at,
        ),
      );
      return ok({ revoked });
    }
    if (action === 'disableEmployee') {
      if (event.employeeId === actor.personId) return fail('admin.cannotDisableSelf');
      if (!isActive(employee)) return fail('auth.employeeDisabled');
      const at = dateFrom(now);
      await db
        .collection('employees')
        .doc(event.employeeId)
        .update({
          data: {
            status: 'disabled',
            active: false,
            disabledAt: at,
            updatedAt: at,
            rev: (Number.isInteger(employee.rev) ? employee.rev : 0) + 1,
          },
        });
      await db.collection('bindings').where({ employeeId: event.employeeId }).remove();
      await revokeOpenInvites(event.employeeId, at);
      await writeAudit(
        db,
        auditEntry(
          {
            actorId: actor.personId,
            action: 'employee.disable',
            entity: 'employee',
            entityId: event.employeeId,
            changes: { status: 'disabled' },
          },
          at,
        ),
      );
      return ok({});
    }
    if (action === 'setFlags') {
      if (
        (event.dispatcher !== undefined && typeof event.dispatcher !== 'boolean') ||
        (event.sysAdmin !== undefined && typeof event.sysAdmin !== 'boolean') ||
        (event.dispatcher === undefined && event.sysAdmin === undefined)
      )
        return fail('admin.invalid');
      if (event.sysAdmin === false && employee.sysAdmin) {
        const admins = await db.collection('employees').where({ sysAdmin: true }).get();
        const activeAdmins = (admins.data || []).filter((candidate) => isActive(candidate));
        if (activeAdmins.length <= 1) return fail('admin.lastSysAdmin');
      }
      const changes = changedFlags(employee, event);
      const at = dateFrom(now);
      await db
        .collection('employees')
        .doc(event.employeeId)
        .update({
          data: {
            ...(event.dispatcher === undefined ? {} : { dispatcher: event.dispatcher }),
            ...(event.sysAdmin === undefined ? {} : { sysAdmin: event.sysAdmin }),
            updatedAt: at,
            rev: (Number.isInteger(employee.rev) ? employee.rev : 0) + 1,
          },
        });
      await writeAudit(
        db,
        auditEntry(
          {
            actorId: actor.personId,
            action: 'employee.flags',
            entity: 'employee',
            entityId: event.employeeId,
            changes,
          },
          at,
        ),
      );
      return ok({});
    }
    return fail('action.unknown');
  }

  return (event, context) => wrap(() => dispatch(event, context), log);
}

module.exports = createHandler;
module.exports.createHandler = createHandler;
