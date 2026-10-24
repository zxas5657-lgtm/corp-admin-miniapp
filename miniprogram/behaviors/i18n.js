const i18n = require('../i18n/index');

function readKeys(page) {
  const keys = page.data && page.data.i18nKeys;
  return Array.isArray(keys) ? keys : [];
}

function readTitleKey(page) {
  const key = page.data && page.data.navTitleKey;
  return typeof key === 'string' ? key : '';
}

function readTabIndex(page) {
  const index = page.data && page.data.tabIndex;
  return typeof index === 'number' ? index : null;
}

module.exports = Behavior({
  data: {
    i18n: {},
    locale: 'zh-CN'
  },

  lifetimes: {
    created() {
      this._shown = false;
      this._offLocale = null;
    },
    attached() {
      this._subscribe();
      this.applyI18n();
    },
    ready() {
      this._refreshTabBar();
      if (this._shown) this._applyNavTitle();
    },
    detached() {
      this._unsubscribe();
    }
  },

  pageLifetimes: {
    show() {
      this._shown = true;
      this.applyI18n();
    },
    hide() {
      this._shown = false;
    }
  },

  methods: {
    t(key, params) {
      return i18n.t(key, params);
    },

    tn(key, n, params) {
      return i18n.tn(key, n, params);
    },

    onUnload() {
      this._unsubscribe();
    },

    applyI18n() {
      const keys = readKeys(this);
      const bundle = {};
      for (let i = 0; i < keys.length; i += 1) {
        const prefix = keys[i];
        if (typeof prefix !== 'string' || !prefix) continue;
        bundle[prefix] = i18n.dict(prefix);
      }
      this.setData({
        i18n: bundle,
        locale: i18n.getLocale()
      });
      // setNavigationBarTitle affects the visible page, so a hidden tab must not call it.
      if (this._shown) this._applyNavTitle();
      this._refreshTabBar();
      if (typeof this.onLocaleChange === 'function') this.onLocaleChange();
    },

    _applyNavTitle() {
      const key = readTitleKey(this);
      if (!key) return;
      const title = i18n.t(key);
      if (!title) return;
      try {
        wx.setNavigationBarTitle({ title: title });
      } catch (err) {
        // Title refresh must not break the page.
      }
    },

    _refreshTabBar() {
      const bar = this.getTabBar && this.getTabBar();
      if (!bar) return;
      bar.setTexts(i18n.dict('tab'));
      if (!this._shown) return;
      const index = readTabIndex(this);
      if (typeof index !== 'number') return;
      bar.setSelected(index);
    },

    _subscribe() {
      if (this._offLocale) return;
      const page = this;
      this._offLocale = i18n.onChange(function () {
        page.applyI18n();
      });
    },

    _unsubscribe() {
      const off = this._offLocale;
      this._offLocale = null;
      if (typeof off === 'function') off();
    }
  }
});
