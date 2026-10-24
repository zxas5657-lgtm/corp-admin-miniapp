const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { meetingListView } = require('../../viewmodels/meetings');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['a11y'],
    navTitleKey: 'nav.meetings',
    tabIndex: 1,
    filter: 'all',
    view: null
  },
  lifetimes: {
    attached() {
      const page = this;
      this._filter = 'all';
      if (!this._offStore) {
        this._offStore = getStore().subscribe(function () {
          page.refresh();
        });
      }
    },
    detached() {
      if (typeof this._offStore === 'function') this._offStore();
      this._offStore = null;
    }
  },
  pageLifetimes: {
    show() {
      this.refresh();
    }
  },
  methods: {
    onLocaleChange() {
      this.refresh();
    },
    refresh() {
      if (typeof this.t !== 'function') return;
      const store = getStore();
      const view = meetingListView({
        state: store.getState(),
        now: clock.now(),
        role: store.getRole(),
        filter: this._filter || 'all'
      });
      this.setData({ view: view, filter: this._filter || 'all' });
    },
    onFilter(event) {
      const key = event.currentTarget.dataset.key;
      if (!key || key === this._filter) return;
      this._filter = key;
      this.refresh();
    },
    onOpen(event) {
      const id = event.currentTarget.dataset.id;
      if (!id) return;
      try {
        wx.navigateTo({ url: '/pages/meeting-detail/index?id=' + id });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onCreate() {
      try {
        wx.navigateTo({ url: '/pages/meeting-form/index' });
      } catch (err) {
        // Navigation must not break the page.
      }
    }
  }
});
