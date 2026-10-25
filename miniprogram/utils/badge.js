const { getStore } = require('../store/index');
const { ROLES } = require('../data/reference');
const { vehicleBadgeCount } = require('../domain/roles');

function refreshVehicleBadge(page) {
  try {
    if (!page || typeof page.getTabBar !== 'function') return;
    const bar = page.getTabBar();
    if (!bar || typeof bar.setBadge !== 'function') return;
    const store = getStore();
    const role = store.getRole();
    const state = store.getState() || {};
    bar.setBadge(2, vehicleBadgeCount(role, ROLES[role], state.vehicles || []));
  } catch (err) {
    // A missing tab bar must not break the page.
  }
}

module.exports = { refreshVehicleBadge };
