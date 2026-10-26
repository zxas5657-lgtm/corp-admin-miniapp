const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { meetingListView } = require('../../viewmodels/meetings');
const { refreshVehicleBadge } = require('../../utils/badge');
const { session } = require('../../utils/session');
const { ready } = require('../../utils/auth');
const data = require('../../utils/data');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['a11y', 'state'],
    navTitleKey: 'nav.meetings',
    phase: 'loading',
    filter: 'all',
    view: null,
    errorTitle: '',
    errorBody: '',
    errorCode: '',
    retryText: ''
  },
  lifetimes: {
    attached() {
      const page = this;
      this._filter = 'all';
      this._state = null;
      this._refs = null;
      this._gate = data.createGate();
      this._offData = data.onChange(function () {
        if (page._shown) page.load();
      });
    },
    detached() {
      if (typeof this._offData === 'function') this._offData();
      this._offData = null;
    }
  },
  pageLifetimes: {
    show() {
      const page = this;
      this._shown = true;
      ready().then(function (result) {
        if (!page._shown || !result || result.state !== 'bound') return;
        page.load();
      });
    },
    hide() {
      this._shown = false;
    }
  },
  methods: {
    onLocaleChange() {
      if (this.data.phase === 'error') {
        this.setData(data.failurePatch(this.data.errorCode, this.t.bind(this)));
        return;
      }
      if (this._state) this.render();
    },
    load(options) {
      const opts = options || {};
      const page = this;
      if (typeof this.t !== 'function') return;
      const token = this._gate.next();
      const hadView = Boolean(this.data.view) && this.data.phase === 'ready';
      if (!hadView) this.setData({ phase: 'loading' });
      const current = session(getStore());
      const span = data.catalogWindow(current.viewerTz);
      Promise.all([
        data.loadDirectory({ fresh: Boolean(opts.fresh) }),
        data.loadRange(span, { fresh: Boolean(opts.fresh) })
      ]).then(function (results) {
        if (!page._gate.isCurrent(token)) return;
        if (!results[0].ok || !results[1].ok) {
          const code = !results[0].ok ? results[0].code : results[1].code;
          if (hadView) return;
          page.setData(data.failurePatch(code, page.t.bind(page)));
          return;
        }
        page._refs = results[0].refs;
        page._state = results[1].state;
        page.render();
      });
    },
    render() {
      refreshVehicleBadge(this);
      if (typeof this.t !== 'function' || !this._state) return;
      const current = session(getStore());
      const view = meetingListView({
        state: this._state,
        refs: this._refs,
        now: clock.now(),
        actor: current.actor,
        viewerTz: current.viewerTz,
        ctx: current.ctx,
        filter: this._filter || 'all'
      });
      this.setData({ phase: 'ready', view: view, filter: this._filter || 'all' });
    },
    onFilter(event) {
      const key = event.currentTarget.dataset.key;
      if (!key || key === this._filter) return;
      this._filter = key;
      this.setData({ filter: key });
      if (this._state) this.render();
      else this.load();
    },
    onRetry() {
      this.load({ fresh: true });
    },
    onEmptyAction() {
      const empty = this.data.view && this.data.view.empty;
      if (empty && empty.kind === 'filtered') {
        this._filter = 'all';
        this.render();
        return;
      }
      this.onCreate();
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
