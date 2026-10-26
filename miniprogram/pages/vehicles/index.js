const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const { vehicleListView } = require('../../viewmodels/vehicles');
const { refreshVehicleBadge } = require('../../utils/badge');
const { session } = require('../../utils/session');
const { prepareTab } = require('../../utils/shell');
const data = require('../../utils/data');

function activeScope(view) {
  const scopes = (view && view.scopes) || [];
  for (let i = 0; i < scopes.length; i += 1) {
    if (scopes[i].active) return scopes[i].key;
  }
  return '';
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['a11y', 'state', 'type'],
    navTitleKey: 'nav.vehicles',
    tabKey: 'vehicles',
    authReady: false,
    phase: 'loading',
    view: null,
    errorTitle: '',
    errorBody: '',
    errorCode: '',
    retryText: ''
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
      if (typeof this._offData === 'function') this._offData();
      this._offData = null;
    }
  },
  pageLifetimes: {
    show() {
      const page = this;
      this._shown = true;
      prepareTab('vehicles').then(function (ready) {
        if (!page._shown || !ready.ok) return;
        page.setData({ authReady: true });
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
      if (!hadView) this.setData({ phase: 'loading', authReady: true });
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
          page.setData(Object.assign(
            { authReady: true },
            data.failurePatch(code, page.t.bind(page))
          ));
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
      const role = current.actor ? current.actor.role : '';
      if (this._role !== role) {
        this._role = role;
        this._scope = '';
      }
      const view = vehicleListView({
        state: this._state,
        refs: this._refs,
        actor: current.actor,
        viewerTz: current.viewerTz,
        ctx: current.ctx,
        scope: this._scope || undefined
      });
      if (!this._scope) this._scope = activeScope(view);
      this.setData({ phase: 'ready', authReady: true, view: view });
    },
    onScope(event) {
      const key = event.currentTarget.dataset.key;
      if (!key || key === this._scope) return;
      this._scope = key;
      if (this._state) this.render();
      else this.load();
    },
    onRetry() {
      this.load({ fresh: true });
    },
    onOpen(event) {
      const id = event.currentTarget.dataset.id;
      if (!id) return;
      try {
        wx.navigateTo({
          url: '/pages/vehicle-detail/index?id=' + id,
          fail: function () {}
        });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onCreate() {
      try {
        wx.navigateTo({
          url: '/pages/vehicle-form/index',
          fail: function () {}
        });
      } catch (err) {
        // Navigation must not break the page.
      }
    }
  }
});
