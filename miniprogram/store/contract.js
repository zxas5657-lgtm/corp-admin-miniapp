'use strict';

// Payloads are documented here so local and remote implementations stay interchangeable.
const CONTRACT = Object.freeze([
  // Success includes employee, dispatcher, sysAdmin, and supports for secretary callers.
  { method: 'whoami', fn: 'auth', action: 'whoami' },
  { method: 'redeemInvite', fn: 'auth', action: 'redeemInvite' },
  { method: 'directory', fn: 'directory', action: 'list' },
  { method: 'listItems', fn: 'items', action: 'list' },
  { method: 'createItem', fn: 'items', action: 'create' },
  { method: 'createSeries', fn: 'items', action: 'createSeries' },
  { method: 'editItem', fn: 'items', action: 'edit' },
  { method: 'cancelItem', fn: 'items', action: 'cancel' },
  { method: 'confirmItem', fn: 'items', action: 'confirm' },
  { method: 'declineItem', fn: 'items', action: 'decline' },
  { method: 'markSeen', fn: 'items', action: 'seen' },
  { method: 'markArrived', fn: 'items', action: 'arrived' },
  { method: 'busySlots', fn: 'items', action: 'busy' },
  { method: 'listNotes', fn: 'notes', action: 'list' },
  { method: 'createNote', fn: 'notes', action: 'create' },
  { method: 'convertNote', fn: 'notes', action: 'convert' },
  { method: 'closeNote', fn: 'notes', action: 'close' },
  { method: 'listVehicles', fn: 'vehicles', action: 'list' },
  { method: 'requestVehicle', fn: 'vehicles', action: 'request' },
  { method: 'dispatchVehicle', fn: 'vehicles', action: 'dispatch' },
  { method: 'reassignVehicle', fn: 'vehicles', action: 'reassign' },
  { method: 'cancelDispatchVehicle', fn: 'vehicles', action: 'cancelDispatch' },
  { method: 'rejectVehicle', fn: 'vehicles', action: 'reject' },
  { method: 'completeVehicle', fn: 'vehicles', action: 'complete' },
  { method: 'withdrawVehicle', fn: 'vehicles', action: 'withdraw' },
  { method: 'getPrefs', fn: 'prefs', action: 'get' },
  { method: 'updatePrefs', fn: 'prefs', action: 'update' },
]);

const METHODS = Object.freeze(CONTRACT.map((entry) => entry.method));
const BY_METHOD = Object.freeze(
  CONTRACT.reduce((result, entry) => {
    result[entry.method] = entry;
    return result;
  }, {}),
);

module.exports = { CONTRACT, METHODS, BY_METHOD, TABLE: CONTRACT };
