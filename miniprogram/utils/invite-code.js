'use strict';

function normalizeInviteCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

function formatInviteCode(code) {
  const value = normalizeInviteCode(code);
  if (value.length <= 4) return value;
  return value.slice(0, 4) + '-' + value.slice(4);
}

module.exports = { normalizeInviteCode, formatInviteCode };
