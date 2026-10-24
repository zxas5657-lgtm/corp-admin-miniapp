const i18nBehavior = require('../../behaviors/i18n');

Page({
  behaviors: [i18nBehavior],
  i18nKeys: ['tab', 'nav', 'state'],
  navTitleKey: 'nav.me',
  tabIndex: 3,
  data: {
    i18nKeys: ['tab', 'nav', 'state'],
    navTitleKey: 'nav.me',
    tabIndex: 3,
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
      if (bar && typeof bar.setSelected === 'function') bar.setSelected(3);
    } catch (err) {
      // Tab bar may not be mounted yet.
    }
  }
});
