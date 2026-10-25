const i18n = require('./i18n/index');
const { getStore } = require('./store/index');
const { DEV_ROLE_SWITCH } = require('./config');
const { changeLocale } = require('./utils/locale');

function attachDevHook(app) {
  if (!DEV_ROLE_SWITCH) return;
  app.globalData.__dev = {
    setLocale(locale) {
      return changeLocale(locale);
    },
    setRole(role) {
      return getStore().setRole(role);
    },
    setDate(date) {
      getStore().ui.setSelectedDate(date);
      return date;
    },
    reload() {
      const result = getStore().load();
      app.globalData.loadResult = result;
      return result;
    },
    addMeeting(record) {
      return getStore().addMeeting(record);
    },
    updateVehicle(record) {
      return getStore().updateVehicle(record);
    },
    focus(payload) {
      const store = getStore();
      if (payload && payload.date) store.ui.setSelectedDate(payload.date);
      store.ui.setPendingFocus(payload);
    },
    clearFocus() {
      getStore().ui.setPendingFocus(null);
    },
    getState() {
      return getStore().getState();
    }
  };
}

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
    attachDevHook(this);
  }
});
