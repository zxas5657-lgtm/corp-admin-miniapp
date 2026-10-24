'use strict';

const DEMO_NOW = '2026-10-24T09:20';

let demoMode = true;
let overrideNow = null;

function cloneDate(date) {
  return new Date(date.getTime());
}

function validDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function now() {
  if (overrideNow) return cloneDate(overrideNow);
  if (demoMode) return new Date(DEMO_NOW);
  return new Date();
}

function setDemoMode(value) {
  demoMode = Boolean(value);
}

function isDemoMode() {
  return demoMode;
}

function setNow(dateOrNull) {
  if (dateOrNull === null || dateOrNull === undefined) {
    overrideNow = null;
    return;
  }
  if (!validDate(dateOrNull)) throw new TypeError('setNow expects a valid Date or null');
  overrideNow = cloneDate(dateOrNull);
}

module.exports = {
  DEMO_NOW,
  now,
  setDemoMode,
  isDemoMode,
  setNow,
};
