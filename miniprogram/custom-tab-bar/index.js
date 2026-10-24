let i18n = {};
try {
  i18n = require('../i18n/index') || {};
} catch (err) {
  i18n = {};
}

const ITEMS = [
  {
    key: 'schedule',
    url: '/pages/schedule/index',
    icon: '/assets/icons/schedule.svg',
    activeIcon: '/assets/icons/schedule-active.svg'
  },
  {
    key: 'meetings',
    url: '/pages/meetings/index',
    icon: '/assets/icons/meetings.svg',
    activeIcon: '/assets/icons/meetings-active.svg'
  },
  {
    key: 'vehicles',
    url: '/pages/vehicles/index',
    icon: '/assets/icons/vehicles.svg',
    activeIcon: '/assets/icons/vehicles-active.svg'
  },
  {
    key: 'me',
    url: '/pages/me/index',
    icon: '/assets/icons/me.svg',
    activeIcon: '/assets/icons/me-active.svg'
  }
];

function blankList() {
  const list = [];
  for (let i = 0; i < ITEMS.length; i += 1) {
    list.push({
      key: ITEMS[i].key,
      url: ITEMS[i].url,
      icon: ITEMS[i].icon,
      activeIcon: ITEMS[i].activeIcon,
      text: ''
    });
  }
  return list;
}

function tabDict() {
  if (typeof i18n.dict !== 'function') return {};
  try {
    const value = i18n.dict('tab');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
  } catch (err) {
    return {};
  }
}

Component({
  data: {
    selected: 0,
    badges: [0, 0, 0, 0],
    list: blankList()
  },

  lifetimes: {
    attached() {
      this._offLocale = null;
      this.setTexts(tabDict());
      this._subscribe();
    },
    detached() {
      this._unsubscribe();
    }
  },

  methods: {
    setTexts(tab) {
      const source = tab && typeof tab === 'object' && !Array.isArray(tab) ? tab : {};
      const current = this.data.list && this.data.list.length ? this.data.list : blankList();
      const list = [];
      for (let i = 0; i < current.length; i += 1) {
        const item = current[i];
        const value = source[item.key];
        list.push({
          key: item.key,
          url: item.url,
          icon: item.icon,
          activeIcon: item.activeIcon,
          text: typeof value === 'string' ? value : ''
        });
      }
      this.setData({ list: list });
    },

    setSelected(index) {
      const i = Number(index);
      if (i !== 0 && i !== 1 && i !== 2 && i !== 3) return;
      if (this.data.selected === i) return;
      this.setData({ selected: i });
    },

    setBadge(index, n) {
      const i = Number(index);
      if (i !== 0 && i !== 1 && i !== 2 && i !== 3) return;
      let count = Number(n);
      if (!count || count < 0) count = 0;
      const prev = this.data.badges || [];
      const badges = [0, 0, 0, 0];
      for (let b = 0; b < 4; b += 1) badges[b] = Number(prev[b]) || 0;
      badges[i] = count;
      this.setData({ badges: badges });
    },

    onTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item || !item.url) return;
      this.setSelected(index);
      wx.switchTab({ url: item.url });
    },

    _subscribe() {
      if (this._offLocale || typeof i18n.onChange !== 'function') return;
      const bar = this;
      try {
        const off = i18n.onChange(function () {
          bar.setTexts(tabDict());
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
