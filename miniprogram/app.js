const i18n = require('./i18n/index');
const { getStore } = require('./store/index');
const { getApi } = require('./store/api');
const clock = require('./domain/clock');
const { DEV_ROLE_SWITCH } = require('./config');
const { changeLocale } = require('./utils/locale');
const { dataMode, isDemo, cloudEnv } = require('./utils/env');
const auth = require('./utils/auth');

function attachDevHook(app) {
  if (!isDemo() || !DEV_ROLE_SWITCH) return;
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
    addItem(record) {
      return getStore().addItem(record);
    },
    updateItem(record) {
      return getStore().updateItem(record);
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
    },
    setAuthStub(value) {
      auth.setAuthStub(value);
      return auth.bootstrap();
    },
    bootstrap() {
      return auth.bootstrap();
    }
  };
}

function initCloud() {
  if (dataMode() !== 'remote') return;
  const envId = cloudEnv();
  if (!envId) return;
  try {
    if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.init === 'function') {
      wx.cloud.init({ env: envId, traceUser: false });
    }
  } catch (err) {
    // An empty or rejected init leaves the unconfigured or offline state.
  }
}

App({
  globalData: {
    loadResult: null
  },

  onLaunch() {
    clock.setDemoMode(isDemo());
    initCloud();
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
    getApi({ mode: dataMode(), onAuthLost: auth.onAuthLost });
    attachDevHook(this);
    auth.bootstrap().then(function (result) {
      auth.open(result);
    });
  }
});
