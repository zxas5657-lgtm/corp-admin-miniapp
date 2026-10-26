const i18nBehavior = require('../../behaviors/i18n');
const { refreshVehicleBadge } = require('../../utils/badge');
const { prepareTab } = require('../../utils/shell');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['visitors', 'common'],
    navTitleKey: 'nav.visitors',
    tabKey: 'visitors',
    authReady: false
  },
  pageLifetimes: {
    show() {
      const page = this;
      prepareTab('visitors').then(function (ready) {
        if (!ready.ok) return;
        page.setData({ authReady: true });
        refreshVehicleBadge(page);
      });
    }
  }
});
