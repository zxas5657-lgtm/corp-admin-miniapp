const { getStore } = require('../store/index');
const { vehicleBadgeCount } = require('../domain/roles');
const { visibleVehicles } = require('../domain/visibility');
const { session } = require('./session');

function refreshVehicleBadge(page) {
  try {
    if (!page || typeof page.getTabBar !== 'function') return;
    const bar = page.getTabBar();
    if (!bar || typeof bar.setBadge !== 'function') return;
    const store = getStore();
    const current = session(store);
    const state = store.getState() || {};
    const visible = visibleVehicles(current.actor, state.vehicles || [], current.ctx);
    bar.setBadge('vehicles', vehicleBadgeCount(current.actor, visible));
  } catch (err) {
    // A missing tab bar must not break the page.
  }
}

module.exports = { refreshVehicleBadge };
