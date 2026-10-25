const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { ROLES } = require('../../data/reference');
const { scheduleView } = require('../../viewmodels/schedule');
const { refreshVehicleBadge } = require('../../utils/badge');

function activeScope(view) {
  const scopes = (view && view.scopes) || [];
  for (let i = 0; i < scopes.length; i += 1) {
    if (scopes[i].active) return scopes[i].key;
  }
  return '';
}

function readLoadFailed() {
  try {
    const app = getApp();
    const result = app && app.globalData && app.globalData.loadResult;
    return Boolean(result && result.ok === false);
  } catch (err) {
    return false;
  }
}

function writeLoadResult(result) {
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.loadResult = result;
  } catch (err) {
    // The error flag must not break the page.
  }
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['state', 'a11y'],
    navTitleKey: 'nav.schedule',
    tabIndex: 0,
    view: null,
    loadFailed: false,
    banner: ''
  },
  lifetimes: {
    attached() {
      const page = this;
      this._role = '';
      this._scope = '';
      if (!this._offStore) {
        this._offStore = getStore().subscribe(function () {
          page.refresh();
        });
      }
    },
    detached() {
      this.stopClock();
      this.clearHighlight();
      this.clearBannerTimer();
      if (typeof this._offStore === 'function') this._offStore();
      this._offStore = null;
    }
  },
  pageLifetimes: {
    show() {
      const focus = getStore().ui.takePendingFocus();
      const pending = focus && typeof focus === 'object' ? focus : null;
      if (pending && pending.date) getStore().ui.setSelectedDate(pending.date);
      this._focusId = pending && pending.meetingId ? pending.meetingId : null;
      this.clearHighlight();
      if (this._focusId) this.armHighlight();
      this.refresh({
        banner: Boolean(pending && pending.banner === true),
        clearBanner: !(pending && pending.banner === true),
        scrollId: this._focusId || ''
      });
      this.startClock();
    },
    hide() {
      this.stopClock();
      this.clearHighlight();
      this.clearBannerTimer();
      this._focusId = null;
      this.setData({ banner: '' });
    }
  },
  methods: {
    onLocaleChange() {
      this.refresh({ refreshBanner: true });
    },
    refresh(options) {
      const opts = options || {};
      refreshVehicleBadge(this);
      if (typeof this.t !== 'function') return;
      const store = getStore();
      const role = store.getRole();
      if (this._role !== role) {
        this._role = role;
        this._scope = '';
      }
      const view = scheduleView({
        state: store.getState(),
        date: store.ui.getSelectedDate(),
        now: clock.now(),
        focusId: this._focusId || '',
        role: role,
        personId: ROLES[role],
        scope: this._scope || undefined
      });
      if (!this._scope) this._scope = activeScope(view);
      const patch = {
        view: view,
        loadFailed: readLoadFailed()
      };
      if (opts.banner) {
        patch.banner = this.t('meeting.created', { date: view.dayHeading });
        this.armBanner();
      } else if (opts.refreshBanner && this.data.banner) {
        patch.banner = this.t('meeting.created', { date: view.dayHeading });
      } else if (opts.clearBanner) {
        patch.banner = '';
        this.clearBannerTimer();
      }
      const scrollId = opts.scrollId || '';
      const keepBanner = Boolean(opts.banner || (opts.refreshBanner && this.data.banner));
      const page = this;
      this.setData(patch, function () {
        if (!scrollId) return;
        page.scrollToItem(scrollId, keepBanner);
      });
    },
    scrollToItem(scrollId, keepBanner) {
      if (!keepBanner) {
        try {
          wx.pageScrollTo({
            selector: '#item-' + scrollId,
            duration: 300,
            fail: function () {}
          });
        } catch (err) {
          // A missing detail card must not break the page.
        }
        return;
      }
      const query = this.createSelectorQuery();
      query.select('#item-' + scrollId).boundingClientRect();
      query.select('#created-banner').boundingClientRect();
      query.selectViewport().scrollOffset();
      query.selectViewport().boundingClientRect();
      query.exec(function (rects) {
        const item = rects && rects[0];
        const banner = rects && rects[1];
        const scroll = rects && rects[2] ? rects[2] : { scrollTop: 0 };
        const viewport = rects && rects[3] ? rects[3] : { height: 0 };
        if (!item) return;
        const scrollTop = scroll.scrollTop || 0;
        const docTop = scrollTop + item.top;
        const docBottom = docTop + item.height;
        const bannerHeight = banner && banner.height ? banner.height : 0;
        const viewHeight = viewport.height || 0;
        let target = 0;
        if (docBottom > viewHeight) {
          target = Math.max(0, docTop - bannerHeight - 8);
        }
        try {
          wx.pageScrollTo({
            scrollTop: target,
            duration: 300,
            fail: function () {}
          });
        } catch (err) {
          // A missing detail card must not break the page.
        }
      });
    },
    onSelectDate(event) {
      const date = event.currentTarget.dataset.date;
      if (!date) return;
      if (this.data.view && date === this.data.view.date) return;
      this._focusId = null;
      this.clearHighlight();
      getStore().ui.setSelectedDate(date);
      this.refresh();
    },
    onBackToday() {
      const today = this.data.view && this.data.view.todayDate;
      if (!today) return;
      this._focusId = null;
      this.clearHighlight();
      getStore().ui.setSelectedDate(today);
      this.refresh();
    },
    onPickDate(event) {
      const date = event.detail && event.detail.value;
      if (!date) return;
      this._focusId = null;
      this.clearHighlight();
      getStore().ui.setSelectedDate(date);
      this.refresh();
    },
    onScope(event) {
      const key = event.currentTarget.dataset.key;
      if (!key || key === this._scope) return;
      this._scope = key;
      this._focusId = null;
      this.clearHighlight();
      this.refresh();
    },
    onOpenItem(event) {
      const url = event.currentTarget.dataset.url;
      if (!url) return;
      try {
        wx.navigateTo({
          url: url,
          fail: function () {}
        });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onRetry() {
      const result = getStore().load();
      writeLoadResult(result);
      this.refresh();
    },
    onReset() {
      const result = getStore().resetDemo();
      if (result && result.ok === true) writeLoadResult({ ok: true });
      this.refresh();
    },
    onCloseBanner() {
      this.clearBannerTimer();
      this.setData({ banner: '' });
    },
    startClock() {
      this.stopClock();
      const page = this;
      this._clock = setInterval(function () {
        page.refresh();
      }, 60000);
    },
    stopClock() {
      if (this._clock) {
        clearInterval(this._clock);
        this._clock = null;
      }
    },
    armHighlight() {
      this.clearHighlight();
      const page = this;
      this._highlightTimer = setTimeout(function () {
        page._highlightTimer = null;
        page._focusId = null;
        page.refresh();
      }, 1200);
    },
    clearHighlight() {
      if (this._highlightTimer) {
        clearTimeout(this._highlightTimer);
        this._highlightTimer = null;
      }
    },
    armBanner() {
      this.clearBannerTimer();
      const page = this;
      this._bannerTimer = setTimeout(function () {
        page._bannerTimer = null;
        page.setData({ banner: '' });
      }, 4000);
    },
    clearBannerTimer() {
      if (this._bannerTimer) {
        clearTimeout(this._bannerTimer);
        this._bannerTimer = null;
      }
    }
  }
});
