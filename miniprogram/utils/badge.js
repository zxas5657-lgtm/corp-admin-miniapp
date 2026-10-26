const { getStore } = require('../store/index');
const { vehicleBadgeCount } = require('../domain/roles');
const { visibleVehicles } = require('../domain/visibility');
const { session } = require('./session');
const { catalogWindow, loadRange } = require('./data');

function tabBarOf(page) {
  if (!page) return null;
  if (typeof page.getTabBar === 'function') {
    const native = page.getTabBar();
    if (native) return native;
  }
  if (typeof page.selectComponent === 'function') return page.selectComponent('#app-tab-bar');
  return null;
}

function refreshVehicleBadge(page) {
  try {
    const bar = tabBarOf(page);
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
