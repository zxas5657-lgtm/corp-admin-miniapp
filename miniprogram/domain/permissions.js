'use strict';

const ROLE_ALIASES = { admin: 'secretary', reception: 'receptionist' };
const ROLE_CAPS = {
  leader: ['meeting.create', 'item.create', 'note.create', 'vehicle.request'],
  secretary: ['meeting.create', 'item.create', 'vehicle.request'],
  secretaryAdmin: ['meeting.create', 'item.create', 'vehicle.request'],
  receptionist: ['vehicle.request', 'visit.create'],
  receptionAdmin: ['vehicle.request', 'visit.create'],
  driver: ['vehicle.complete'],
};
const caps = [];
for (const role of Object.keys(ROLE_CAPS)) {
  for (const capability of ROLE_CAPS[role]) if (!caps.includes(capability)) caps.push(capability);
}
caps.push('vehicle.dispatch', 'vehicle.reject', 'admin.manage');
const CAPS = Object.freeze(caps);
function normalizeRole(role) {
  return ROLE_ALIASES[role] || role;
}
function can(actorOrRole, capability) {
  const actor =
    typeof actorOrRole === 'string'
      ? { role: normalizeRole(actorOrRole), dispatcher: false, sysAdmin: false }
      : actorOrRole || {};
  const role = normalizeRole(actor.role);
  if (ROLE_CAPS[role] && ROLE_CAPS[role].includes(capability)) return true;
  if (actor.dispatcher && (capability === 'vehicle.dispatch' || capability === 'vehicle.reject'))
    return true;
  if (actor.sysAdmin && capability === 'admin.manage') return true;
  return false;
}
function meetingVisibleTo() {
  return true;
}
module.exports = { ROLE_CAPS, CAPS, can, meetingVisibleTo, normalizeRole };
