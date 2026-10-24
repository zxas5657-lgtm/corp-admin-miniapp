let i18n = {};
try {
  i18n = require('../i18n/index') || {};
} catch (err) {
  i18n = {};
}

function copyPlain(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    out[keys[i]] = value[keys[i]];
  }
  return out;
}

function safeDict(prefix) {
  if (!prefix || typeof i18n.dict !== 'function') return {};
  try {
    return copyPlain(i18n.dict(prefix));
  } catch (err) {
    return {};
  }
}

function safeLocale() {
  if (typeof i18n.getLocale !== 'function') return 'zh-CN';
  try {
    const locale = i18n.getLocale();
    return locale ? String(locale) : 'zh-CN';
  } catch (err) {
    return 'zh-CN';
  }
}

function readKeys(page) {
  if (page.data && Array.isArray(page.data.i18nKeys)) return page.data.i18nKeys;
  if (Array.isArray(page.i18nKeys)) return page.i18nKeys;
  return [];
}

function readTitleKey(page) {
  if (page.data && typeof page.data.navTitleKey === 'string') return page.data.navTitleKey;
  if (typeof page.navTitleKey === 'string') return page.navTitleKey;
  return '';
}

function readTabIndex(page) {
  if (page.data && typeof page.data.tabIndex === 'number') return page.data.tabIndex;
  if (typeof page.tabIndex === 'number') return page.tabIndex;
  return null;
}

module.exports = Behavior({
  data: {
    i18n: {},
    locale: 'zh-CN'
  },

  definitionFilter(defFields) {
    try {
      if (!defFields.data) defFields.data = {};
      const data = defFields.data;
      if (Array.isArray(defFields.i18nKeys) && !Array.isArray(data.i18nKeys)) {
        data.i18nKeys = defFields.i18nKeys;
      }
      if (typeof defFields.navTitleKey === 'string' && !data.navTitleKey) {
        data.navTitleKey = defFields.navTitleKey;
      }
      if (typeof defFields.tabIndex === 'number' && typeof data.tabIndex !== 'number') {
        data.tabIndex = defFields.tabIndex;
      }
    } catch (err) {
      // Page data is already declared on each screen. Keep going if this hook cannot write.
    }
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
      if (typeof i18n.t !== 'function') return key == null ? '' : String(key);
      try {
        const value = i18n.t(key, params);
        if (value == null || value === '') return key == null ? '' : String(key);
        return String(value);
      } catch (err) {
        return key == null ? '' : String(key);
      }
    },

    tn(key, n, params) {
      if (typeof i18n.tn !== 'function') return key == null ? '' : String(key);
      try {
        const value = i18n.tn(key, n, params);
        if (value == null || value === '') return key == null ? '' : String(key);
        return String(value);
      } catch (err) {
        return key == null ? '' : String(key);
      }
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
        bundle[prefix] = safeDict(prefix);
      }
      if (typeof this.setData === 'function') {
        this.setData({
          i18n: bundle,
          locale: safeLocale()
        });
      }
      // setNavigationBarTitle changes the visible page, so a hidden tab must not call it.
      // This page applies its own title on show, and again when the locale changes while it is visible.
      if (this._shown) this._applyNavTitle();
      this._refreshTabBar();
    },

    _applyNavTitle() {
      const key = readTitleKey(this);
      if (!key || typeof i18n.t !== 'function') return;
      let title = '';
      try {
        const value = i18n.t(key);
        title = value == null ? '' : String(value);
      } catch (err) {
        return;
      }
      if (!title || typeof wx === 'undefined' || typeof wx.setNavigationBarTitle !== 'function') return;
      try {
        wx.setNavigationBarTitle({ title: title });
      } catch (err) {
        // Title refresh must not break the page.
      }
    },

    _refreshTabBar() {
      let bar = null;
      try {
        bar = this.getTabBar && this.getTabBar();
      } catch (err) {
        return;
      }
      if (!bar) return;
      if (typeof bar.setTexts === 'function') {
        try {
          bar.setTexts(safeDict('tab'));
        } catch (err) {
          // Tab text refresh must not break the page.
        }
      }
      // Only the visible page may change the selected index. A hidden tab still
      // refreshes its labels above so the bar is current when the user returns.
      if (!this._shown) return;
      const index = readTabIndex(this);
      if (typeof index !== 'number' || typeof bar.setSelected !== 'function') return;
      try {
        bar.setSelected(index);
      } catch (err) {
        // Selected-tab refresh must not break the page.
      }
    },

    _subscribe() {
      if (this._offLocale || typeof i18n.onChange !== 'function') return;
      const page = this;
      try {
        const off = i18n.onChange(function () {
          page.applyI18n();
        });
        if (typeof off === 'function') this._offLocale = off;
      } catch (err) {
        this._offLocale = null;
      }
    },

    _unsubscribe() {
      const off = this._offLocale;
      this._offLocale = null;
      if (typeof off !== 'function') return;
      try {
        off();
      } catch (err) {
        // Unsubscribe is best-effort.
      }
    }
  }
});
