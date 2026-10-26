const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const { refreshVehicleBadge } = require('../../utils/badge');
const { prepareTab } = require('../../utils/shell');
const { session } = require('../../utils/session');
const data = require('../../utils/data');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['visitors', 'common', 'state'],
    navTitleKey: 'nav.visitors',
    tabKey: 'visitors',
    authReady: false,
    phase: 'loading',
    errorTitle: '',
    errorBody: '',
    errorCode: '',
    retryText: ''
  },
  lifetimes: {
    attached() {
      const page = this;
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
      prepareTab('visitors').then(function (ready) {
        if (!page._shown || !ready.ok) return;
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
      }
    },
    load(options) {
      const opts = options || {};
      const page = this;
      if (typeof this.t !== 'function') return;
      const token = this._gate.next();
      const hadReady = this.data.phase === 'ready';
      if (!hadReady) this.setData({ phase: 'loading' });
      const current = session(getStore());
      const span = data.catalogWindow(current.viewerTz);
      Promise.all([
        data.loadDirectory({ fresh: Boolean(opts.fresh) }),
        data.loadRange(span, { fresh: Boolean(opts.fresh) })
      ]).then(function (results) {
        if (!page._gate.isCurrent(token)) return;
        if (!results[0].ok || !results[1].ok) {
          const code = !results[0].ok ? results[0].code : results[1].code;
          if (hadReady) return;
          page.setData(data.failurePatch(code, page.t.bind(page)));
          return;
        }
        page.setData({ phase: 'ready', authReady: true });
        refreshVehicleBadge(page);
      });
    },
    onRetry() {
      this.load({ fresh: true });
    }
  }
});
