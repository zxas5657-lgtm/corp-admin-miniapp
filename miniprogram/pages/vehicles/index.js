const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const { vehicleListView } = require('../../viewmodels/vehicles');
const { refreshVehicleBadge } = require('../../utils/badge');
const { session } = require('../../utils/session');
const { prepareTab } = require('../../utils/shell');

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
    i18nKeys: ['a11y'],
    navTitleKey: 'nav.vehicles',
    tabKey: 'vehicles',
    authReady: false,
    view: null
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
      if (typeof this._offStore === 'function') this._offStore();
      this._offStore = null;
    }
  },
  pageLifetimes: {
    show() {
      const page = this;
      prepareTab('vehicles').then(function (ready) {
        if (!ready.ok) return;
        page.setData({ authReady: true });
        page.refresh();
      });
    }
  },
  methods: {
    onLocaleChange() {
      this.refresh();
    },
    refresh() {
      refreshVehicleBadge(this);
      if (typeof this.t !== 'function') return;
      const store = getStore();
      const current = session(store);
      const role = current.actor ? current.actor.role : '';
      if (this._role !== role) {
        this._role = role;
        this._scope = '';
      }
      const view = vehicleListView({
        state: store.getState(),
        actor: current.actor,
        viewerTz: current.viewerTz,
        ctx: current.ctx,
        scope: this._scope || undefined
      });
      if (!this._scope) this._scope = activeScope(view);
      this.setData({ view: view });
    },
    onScope(event) {
      const key = event.currentTarget.dataset.key;
      if (!key || key === this._scope) return;
      this._scope = key;
      this.refresh();
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
