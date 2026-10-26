const { getStore } = require('../store/index');
const { vehicleBadgeCount } = require('../domain/roles');
const { visibleVehicles } = require('../domain/visibility');
const { session } = require('./session');
const { catalogWindow, loadRange } = require('./data');

function refreshVehicleBadge(page) {
  try {
    if (!page || typeof page.getTabBar !== 'function') return;
    const bar = page.getTabBar();
    if (!bar || typeof bar.setBadge !== 'function') return;
    const current = session(getStore());
    const span = catalogWindow(current.viewerTz);
    loadRange(span).then(function (result) {
      if (!result || result.ok !== true) return;
      const vehicles = result.state && result.state.vehicles ? result.state.vehicles : [];
      const visible = visibleVehicles(current.actor, vehicles, current.ctx);
      try {
        bar.setBadge('vehicles', vehicleBadgeCount(current.actor, visible));
      } catch (err) {
        // A detached tab bar must not break the page.
      }
    });
  } catch (err) {
    // A missing tab bar must not break the page.
  }
}

module.exports = { refreshVehicleBadge };
