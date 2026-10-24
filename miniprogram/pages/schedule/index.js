const i18nBehavior = require('../../behaviors/i18n');

Page({
  behaviors: [i18nBehavior],
  i18nKeys: ['tab', 'nav', 'state'],
  navTitleKey: 'nav.schedule',
  tabIndex: 0,
  data: {
    i18nKeys: ['tab', 'nav', 'state'],
    navTitleKey: 'nav.schedule',
    tabIndex: 0,
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
      if (bar && typeof bar.setSelected === 'function') bar.setSelected(0);
    } catch (err) {
      // Tab bar may not be mounted yet.
    }
  }
});
