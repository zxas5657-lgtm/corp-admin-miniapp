const i18n = require('../i18n/index');
const { tabsFor } = require('../utils/tabs');

function buildList(actor) {
  const tabs = tabsFor(actor);
  const list = [];
  for (let i = 0; i < tabs.length; i += 1) {
    const item = tabs[i];
    list.push({
      key: item.key,
      url: item.url,
      icon: item.icon,
      activeIcon: item.activeIcon,
      text: i18n.t(item.labelKey),
      plus: item.key === 'compose'
    });
  }
  return list;
}

Component({
  data: {
    selected: -1,
    badges: [],
    hidden: false,
    list: []
  },

  lifetimes: {
    attached() {
      this._offLocale = null;
      this._selectedKey = '';
      this._badges = {};
      this._actor = null;
      this.sync(null);
      this._subscribe();
    },
    detached() {
      this._unsubscribe();
    }
  },

  methods: {
    sync(actor) {
      this._actor = actor || null;
      const list = buildList(this._actor);
      const badges = [];
      let selected = -1;
      for (let i = 0; i < list.length; i += 1) {
        badges.push(Number(this._badges[list[i].key]) || 0);
        if (list[i].key === this._selectedKey) selected = i;
      }
      this.setData({ list: list, badges: badges, selected: selected });
    },

    setSelected(key) {
      this._selectedKey = key || '';
      const list = this.data.list || [];
      let selected = -1;
      for (let i = 0; i < list.length; i += 1) {
        if (list[i].key === this._selectedKey) selected = i;
      }
      if (this.data.selected === selected) return;
      this.setData({ selected: selected });
    },

    setHidden(hidden) {
      const next = Boolean(hidden);
      if (this.data.hidden === next) return;
      this.setData({ hidden: next });
    },

    setBadge(key, n) {
      if (!key) return;
      if (!this._badges) this._badges = {};
      let count = Number(n);
      if (!count || count < 0) count = 0;
      this._badges[key] = count;
      const list = this.data.list || [];
      const badges = [];
      for (let i = 0; i < list.length; i += 1) {
        badges.push(Number(this._badges[list[i].key]) || 0);
      }
      this.setData({ badges: badges });
    },

    onTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item) return;
      if (item.plus) {
        try {
          wx.showToast({ title: i18n.t('common.comingSoon'), icon: 'none' });
        } catch (err) {
          // The toast must not break the tab bar.
        }
        return;
      }
      if (!item.url) return;
      this.setSelected(item.key);
      wx.switchTab({ url: item.url });
    },

    _subscribe() {
      if (this._offLocale) return;
      const bar = this;
      this._offLocale = i18n.onChange(function () {
        bar.sync(bar._actor);
      });
    },

    _unsubscribe() {
      const off = this._offLocale;
      this._offLocale = null;
      if (typeof off === 'function') off();
    }
  }
});
