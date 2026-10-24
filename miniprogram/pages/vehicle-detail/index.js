const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { transition } = require('../../domain/vehicle');
const { ROLES, DRIVERS } = require('../../data/reference');
const {
  vehicleDetailView,
  dispatchSheetView,
  rejectSheetView
} = require('../../viewmodels/vehicles');

const CONFIRM_ACTIONS = {
  complete: true,
  withdraw: true,
  cancelDispatch: true
};

function findVehicle(state, id) {
  const list = (state && state.vehicles) || [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function splitActions(actions) {
  let primaryAction = null;
  const textActions = [];
  const list = actions || [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].kind === 'primary' && !primaryAction) primaryAction = list[i];
    else textActions.push(list[i]);
  }
  return { primaryAction: primaryAction, textActions: textActions };
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['a11y', 'nav'],
    navTitleKey: 'nav.vehicleDetail',
    view: null,
    primaryAction: null,
    textActions: [],
    createdBanner: '',
    notice: '',
    dispatchOpen: false,
    dispatchView: null,
    rejectOpen: false,
    rejectView: null,
    rejectReason: '',
    rejectError: '',
    confirmOpen: false,
    confirmDanger: false,
    confirmSheet: null
  },
  lifetimes: {
    attached() {
      const page = this;
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
    onLoad(query) {
      this._id = query && query.id ? query.id : '';
      this._created = Boolean(query && String(query.created) === '1');
      this._action = '';
      this._selectedCarId = '';
      this.refresh();
    },
    onLocaleChange() {
      this.refresh();
    },
    actorOptions(store) {
      const role = store.getRole();
      const state = store.getState() || {};
      return {
        role: role,
        personId: ROLES[role],
        now: clock.now(),
        drivers: DRIVERS,
        vehicles: state.vehicles || []
      };
    },
    confirmCopy(action) {
      return {
        title: this.t('vehicle.sheet.' + action + '.title'),
        body: this.t('vehicle.sheet.' + action + '.body'),
        confirmText: this.t('vehicle.sheet.' + action + '.confirm'),
        cancelText: this.t('vehicle.sheet.' + action + '.cancel')
      };
    },
    refresh() {
      if (typeof this.t !== 'function') return;
      const store = getStore();
      const role = store.getRole();
      const view = vehicleDetailView({
        state: store.getState(),
        id: this._id || '',
        now: clock.now(),
        role: role,
        personId: ROLES[role]
      });
      const actions = splitActions(view && view.actions);
      const patch = {
        view: view,
        primaryAction: actions.primaryAction,
        textActions: actions.textActions
      };
      if (this._created) patch.createdBanner = this.t('vehicle.created');
      if (this.data.dispatchOpen) {
        patch.dispatchView = dispatchSheetView({
          state: store.getState(),
          id: this._id,
          selectedCarId: this._selectedCarId
        });
      }
      if (this.data.rejectOpen) patch.rejectView = rejectSheetView();
      if (this.data.confirmOpen && this._action) patch.confirmSheet = this.confirmCopy(this._action);
      this.setData(patch);
    },
    onBack() {
      try {
        wx.navigateBack({ fail: function () {} });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onCloseBanner() {
      this._created = false;
      this.setData({ createdBanner: '' });
    },
    onCloseNotice() {
      this.setData({ notice: '' });
    },
    onAction(event) {
      const key = event.currentTarget.dataset.key;
      if (key) this.openAction(key);
    },
    onPrimary() {
      if (this.data.primaryAction) this.openAction(this.data.primaryAction.key);
    },
    openAction(key) {
      this._action = key;
      if (key === 'dispatch' || key === 'reassign') {
        this._selectedCarId = '';
        this.setData({
          dispatchOpen: true,
          dispatchView: dispatchSheetView({
            state: getStore().getState(),
            id: this._id,
            selectedCarId: ''
          }),
          rejectOpen: false,
          confirmOpen: false,
          notice: ''
        });
        return;
      }
      if (key === 'reject') {
        this.setData({
          rejectOpen: true,
          rejectView: rejectSheetView(),
          rejectReason: '',
          rejectError: '',
          dispatchOpen: false,
          confirmOpen: false,
          notice: ''
        });
        return;
      }
      if (CONFIRM_ACTIONS[key]) {
        this.setData({
          confirmOpen: true,
          confirmDanger: key !== 'complete',
          confirmSheet: this.confirmCopy(key),
          dispatchOpen: false,
          rejectOpen: false,
          notice: ''
        });
      }
    },
    onPickCar(event) {
      const id = event.currentTarget.dataset.id;
      const cars = (this.data.dispatchView && this.data.dispatchView.cars) || [];
      let car = null;
      for (let i = 0; i < cars.length; i += 1) {
        if (cars[i].id === id) car = cars[i];
      }
      if (!car || !car.available || car.selected) return;
      this._selectedCarId = id;
      this.setData({
        dispatchView: dispatchSheetView({
          state: getStore().getState(),
          id: this._id,
          selectedCarId: id
        })
      });
    },
    onRejectInput(event) {
      this.setData({
        rejectReason: event.detail.value,
        rejectError: ''
      });
    },
    onCloseSheets() {
      this.setData({
        dispatchOpen: false,
        rejectOpen: false,
        confirmOpen: false
      });
    },
    onConfirmDispatch() {
      this.runTransition({ carId: this._selectedCarId });
    },
    onConfirmReject() {
      this.runTransition({ reason: this.data.rejectReason });
    },
    onConfirmAction() {
      this.runTransition({});
    },
    runTransition(payload) {
      const store = getStore();
      const vehicle = findVehicle(store.getState(), this._id);
      if (!vehicle) {
        this.setData({
          dispatchOpen: false,
          rejectOpen: false,
          confirmOpen: false,
          notice: this.t('error.vehicle.alreadyHandled')
        });
        this.refresh();
        return;
      }
      const result = transition(vehicle, this._action, payload, this.actorOptions(store));
      this.applyResult(result);
    },
    applyResult(result) {
      if (!result || result.ok !== true) {
        const code = result && result.code ? result.code : 'permission.denied';
        if (code === 'vehicle.alreadyHandled') {
          this.setData({
            dispatchOpen: false,
            rejectOpen: false,
            confirmOpen: false,
            notice: this.t('error.' + code)
          });
          this.refresh();
          return;
        }
        if (code === 'vehicle.reject.reasonRequired') {
          this.setData({ rejectError: this.t('error.' + code) });
          return;
        }
        this.setData({ notice: this.t('error.' + code) });
        return;
      }
      const saved = getStore().updateVehicle(result.vehicle);
      if (!saved || saved.ok !== true) {
        this.setData({ notice: this.t('error.storage.writeFailed') });
        return;
      }
      const action = this._action;
      this.setData({
        dispatchOpen: false,
        rejectOpen: false,
        confirmOpen: false,
        rejectError: '',
        notice: ''
      });
      try {
        wx.showToast({ title: this.t('vehicle.toast.' + action), icon: 'none' });
      } catch (err) {
        // The toast must not break the page.
      }
      this.refresh();
    }
  }
});
