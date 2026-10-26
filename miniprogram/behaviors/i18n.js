const i18n = require('../i18n/index');
const season = require('../utils/season');
const { getStore } = require('../store/index');
const { session } = require('../utils/session');

function readKeys(page) {
  const keys = page.data && page.data.i18nKeys;
  return Array.isArray(keys) ? keys : [];
}

function readTitleKey(page) {
  const key = page.data && page.data.navTitleKey;
  return typeof key === 'string' ? key : '';
}

function readTabKey(page) {
  const key = page.data && page.data.tabKey;
  return typeof key === 'string' ? key : '';
}

module.exports = Behavior({
  data: {
    i18n: {},
    locale: 'zh-CN',
    seasonClass: 'season-autumn'
  },

  lifetimes: {
    created() {
      this._shown = false;
      this._offLocale = null;
      this._offSeason = null;
    },
    attached() {
      this._subscribe();
      this.applyI18n();
      this.applySeason();
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
      this.applySeason();
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

    applySeason() {
      const next = season.seasonClass();
      if (this.data.seasonClass !== next) this.setData({ seasonClass: next });
      const bar = this.getTabBar && this.getTabBar();
      if (bar && typeof bar.setSeasonClass === 'function') bar.setSeasonClass(next);
      if (typeof this.onSeasonChange === 'function') this.onSeasonChange();
    },

    _refreshTabBar() {
      const bar = this.getTabBar && this.getTabBar();
      if (!bar) return;
      if (typeof bar.sync === 'function') bar.sync(session(getStore()).actor);
      if (typeof bar.setSeasonClass === 'function') {
        bar.setSeasonClass(this.data.seasonClass || season.seasonClass());
      }
      if (!this._shown) return;
      const key = readTabKey(this);
      if (!key || typeof bar.setSelected !== 'function') return;
      bar.setSelected(key);
    },

    _subscribe() {
      if (this._offLocale) return;
      const page = this;
      this._offLocale = i18n.onChange(function () {
        page.applyI18n();
      });
      this._offSeason = season.onChange(function () {
        page.applySeason();
      });
    },

    _unsubscribe() {
      const off = this._offLocale;
      this._offLocale = null;
      if (typeof off === 'function') off();
      const offSeason = this._offSeason;
      this._offSeason = null;
      if (typeof offSeason === 'function') offSeason();
    }
  }
});
