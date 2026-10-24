let i18n = {};
try {
  i18n = require('./i18n/index') || {};
} catch (err) {
  i18n = {};
}

App({
  globalData: {},

  onLaunch() {
    try {
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
      const normalize = typeof i18n.normalizeLocale === 'function'
        ? i18n.normalizeLocale
        : function (value) { return value; };
      if (typeof i18n.setLocale === 'function') {
        i18n.setLocale(normalize(lang));
      }
    } catch (err) {
      // Locale setup must not block launch. The i18n module default stands.
    }
  }
});
