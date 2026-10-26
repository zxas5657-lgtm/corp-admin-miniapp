const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { scheduleView } = require('../../viewmodels/schedule');
const { session } = require('../../utils/session');
const { refreshVehicleBadge } = require('../../utils/badge');
const { prepareTab } = require('../../utils/shell');
const data = require('../../utils/data');

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

function storagePatch(page) {
  return {
    phase: 'error',
    loadFailed: true,
    authReady: true,
    errorCode: 'storage.readFailed',
    errorTitle: page.t('state.genericErrorTitle'),
    errorBody: page.t('state.genericErrorBody'),
    retryText: page.t('state.retry')
  };
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['state', 'a11y', 'error', 'type'],
    navTitleKey: 'nav.schedule',
    tabKey: 'schedule',
    authReady: false,
    phase: 'loading',
    view: null,
    loadFailed: false,
    errorTitle: '',
    errorBody: '',
    errorCode: '',
    retryText: '',
    banner: ''
  },
  lifetimes: {
    attached() {
      const page = this;
      this._role = '';
      this._scope = '';
      this._state = null;
      this._refs = null;
      this._gate = data.createGate();
      this._offData = data.onChange(function () {
        if (page._shown) page.load();
      });
    },
    detached() {
      this.stopClock();
      this.clearHighlight();
      this.clearBannerTimer();
      if (typeof this._offData === 'function') this._offData();
      this._offData = null;
    }
  },
  pageLifetimes: {
    show() {
      const page = this;
      this._shown = true;
      prepareTab('schedule').then(function (ready) {
        if (!page._shown || !ready.ok) return;
        page.setData({ authReady: true });
        const focus = getStore().ui.takePendingFocus();
        const pending = focus && typeof focus === 'object' ? focus : null;
        if (pending && pending.date) getStore().ui.setSelectedDate(pending.date);
        page._focusId = pending && pending.meetingId ? pending.meetingId : null;
        page.clearHighlight();
        if (page._focusId) page.armHighlight();
        page.load({
          banner: Boolean(pending && pending.banner === true),
          clearBanner: !(pending && pending.banner === true),
          scrollId: page._focusId || ''
        });
        page.startClock();
      });
    },
    hide() {
      this._shown = false;
      this.stopClock();
      this.clearHighlight();
      this.clearBannerTimer();
      this._focusId = null;
      this.setData({ banner: '' });
    }
  },
  methods: {
    onMeetings() {
      try {
        wx.navigateTo({ url: '/pages/meetings/index' });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onLocaleChange() {
      if (this.data.loadFailed) {
        this.setData(storagePatch(this));
        return;
      }
      if (this.data.phase === 'error') {
        this.setData(data.failurePatch(this.data.errorCode, this.t.bind(this)));
        return;
      }
      if (this._state) this.render({ refreshBanner: true });
    },
    refresh(options) {
      if (this._state && !readLoadFailed()) this.render(options);
      else this.load(options);
    },
    load(options) {
      const opts = options || {};
      const page = this;
      if (typeof this.t !== 'function') return;
      if (readLoadFailed()) {
        this.setData(storagePatch(this));
        return;
      }
      const token = this._gate.next();
      const hadView = Boolean(this.data.view) && this.data.phase === 'ready';
      if (!hadView) this.setData({ phase: 'loading', loadFailed: false, authReady: true });
      const store = getStore();
      const current = session(store);
      const span = data.weekWindow(store.ui.getSelectedDate(), current.viewerTz);
      Promise.all([
        data.loadDirectory({ fresh: Boolean(opts.fresh) }),
        data.loadRange(span, { fresh: Boolean(opts.fresh) })
      ]).then(function (results) {
        if (!page._gate.isCurrent(token)) return;
        const directory = results[0];
        const range = results[1];
        if (!directory.ok || !range.ok) {
          const code = !directory.ok ? directory.code : range.code;
          if (hadView) return;
          page.setData(Object.assign(
            { authReady: true, loadFailed: false },
            data.failurePatch(code, page.t.bind(page))
          ));
          return;
        }
        page._refs = directory.refs;
        page._state = range.state;
        page.render(opts);
      });
    },
    render(options) {
      const opts = options || {};
      this._renderOpts = opts;
      refreshVehicleBadge(this);
      if (typeof this.t !== 'function' || !this._state) return;
      const store = getStore();
      const current = session(store);
      const role = current.actor ? current.actor.role : '';
      if (this._role !== role) {
        this._role = role;
        this._scope = '';
      }
      const view = scheduleView({
        state: this._state,
        refs: this._refs,
        date: store.ui.getSelectedDate(),
        now: clock.now(),
        focusId: this._focusId || '',
        actor: current.actor,
        viewerTz: current.viewerTz,
        ctx: current.ctx,
        scope: this._scope || undefined
      });
      if (!this._scope) this._scope = activeScope(view);
      const patch = {
        phase: 'ready',
        authReady: true,
        loadFailed: false,
        view: view,
        meetingsLink: this.t('me.meetings')
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
      this.load();
    },
    onBackToday() {
      const today = this.data.view && this.data.view.todayDate;
      if (!today) return;
      this._focusId = null;
      this.clearHighlight();
      getStore().ui.setSelectedDate(today);
      this.load();
    },
    onPickDate(event) {
      const date = event.detail && event.detail.value;
      if (!date) return;
      this._focusId = null;
      this.clearHighlight();
      getStore().ui.setSelectedDate(date);
      this.load();
    },
    onScope(event) {
      const key = event.currentTarget.dataset.key;
      if (!key || key === this._scope) return;
      this._scope = key;
      this._focusId = null;
      this.clearHighlight();
      this.render();
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
      if (this.data.loadFailed) {
        const result = getStore().load();
        writeLoadResult(result);
        if (!result || result.ok !== true) {
          this.setData(storagePatch(this));
          return;
        }
        data.resetSession();
      }
      this.load({ fresh: true });
    },
    onReset() {
      const result = getStore().resetDemo();
      if (result && result.ok === true) {
        writeLoadResult({ ok: true });
        data.resetSession();
      }
      this.load({ fresh: true });
    },
    onCloseBanner() {
      this.clearBannerTimer();
      this.setData({ banner: '' });
    },
    startClock() {
      this.stopClock();
      const page = this;
      this._clock = setInterval(function () {
        if (typeof page.applySeason === 'function') page.applySeason();
        if (page._state && page.data.phase === 'ready') page.render();
        else page.load();
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
        page.render();
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
