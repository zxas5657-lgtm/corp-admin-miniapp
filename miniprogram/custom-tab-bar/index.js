const i18n = require('../i18n/index');

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

function buildList(tab) {
  const source = tab && typeof tab === 'object' ? tab : {};
  const list = [];
  for (let i = 0; i < ITEMS.length; i += 1) {
    const value = source[ITEMS[i].key];
    list.push({
      key: ITEMS[i].key,
      url: ITEMS[i].url,
      icon: ITEMS[i].icon,
      activeIcon: ITEMS[i].activeIcon,
      text: typeof value === 'string' ? value : ''
    });
  }
  return list;
}

Component({
  data: {
    selected: 0,
    badges: [0, 0, 0, 0],
    list: buildList(i18n.dict('tab'))
  },

  lifetimes: {
    attached() {
      this._offLocale = null;
      this.setTexts(i18n.dict('tab'));
      this._subscribe();
    },
    detached() {
      this._unsubscribe();
    }
  },

  methods: {
    setTexts(tab) {
      this.setData({ list: buildList(tab) });
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
      if (this._offLocale) return;
      const bar = this;
      this._offLocale = i18n.onChange(function () {
        bar.setTexts(i18n.dict('tab'));
      });
    },

    _unsubscribe() {
      const off = this._offLocale;
      this._offLocale = null;
      if (typeof off === 'function') off();
    }
  }
});
