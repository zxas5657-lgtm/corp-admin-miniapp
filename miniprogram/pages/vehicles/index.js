const i18nBehavior = require('../../behaviors/i18n');

Page({
  behaviors: [i18nBehavior],
  i18nKeys: ['tab', 'nav', 'state'],
  navTitleKey: 'nav.vehicles',
  tabIndex: 2,
  data: {
    i18nKeys: ['tab', 'nav', 'state'],
    navTitleKey: 'nav.vehicles',
    tabIndex: 2,
    i18n: {
      tab: {},
      nav: {},
      state: {}
    },
    locale: 'zh-CN'
  },
  onShow() {
    try {
      const bar = this.getTabBar && this.getTabBar();
      if (bar && typeof bar.setSelected === 'function') bar.setSelected(2);
    } catch (err) {
      // Tab bar may not be mounted yet.
    }
  }
});
