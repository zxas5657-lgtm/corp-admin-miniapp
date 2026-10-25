'use strict';

function auditEntry(entry, at) {
  const source = entry || {};
  return {
    at: at instanceof Date ? new Date(at) : new Date(at || Date.now()),
    actorId: source.actorId,
    action: source.action,
    entity: source.entity,
    entityId: source.entityId,
    changes: source.changes || {},
    needsConfirm: source.needsConfirm,
  };
}

async function writeAudit(dbOrTx, entry) {
  return dbOrTx.collection('audit_log').add({ data: entry });
}

module.exports = { auditEntry, writeAudit };
