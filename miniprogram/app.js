const i18n = require('./i18n/index');

App({
  globalData: {},

  onLaunch() {
    let lang = '';
    // TODO(S1-B5): Read the persisted locale from storage key `corp-admin-locale`
    // first (store/ owns that read). When the key is present, use it as `lang`
    // and skip the system lookup below. Resetting demo data must not clear it.
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
    i18n.setLocale(i18n.normalizeLocale(lang));
  }
});
