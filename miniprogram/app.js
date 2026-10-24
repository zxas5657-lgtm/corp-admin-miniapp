const i18n = require('./i18n/index');
const { getStore } = require('./store/index');

App({
  globalData: {
    loadResult: null
  },

  onLaunch() {
    const store = getStore();
    this.globalData.loadResult = store.load();

    let lang = store.getLocale();
    if (!lang) {
      try {
        const base = wx.getAppBaseInfo();
        lang = base && base.language ? base.language : '';
      } catch (err) {
        lang = '';
      }
      if (!lang) {
        try {
          const system = wx.getSystemInfoSync();
          lang = system && system.language ? system.language : '';
        } catch (err) {
          lang = '';
        }
      }
    }
    i18n.setLocale(i18n.normalizeLocale(lang));
  }
});
