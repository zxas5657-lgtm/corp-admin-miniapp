const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const i18n = require('../../i18n/index');
const { transition } = require('../../domain/vehicle');
const { session } = require('../../utils/session');
const { ready } = require('../../utils/auth');
const { isDemo } = require('../../utils/env');
const data = require('../../utils/data');
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

const API_ACTIONS = {
  dispatch: 'dispatchVehicle',
  reject: 'rejectVehicle',
  complete: 'completeVehicle',
  withdraw: 'withdrawVehicle'
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
    i18nKeys: ['a11y', 'nav', 'state', 'error'],
    navTitleKey: 'nav.vehicleDetail',
    phase: 'loading',
    view: null,
    primaryAction: null,
    textActions: [],
    createdBanner: '',
    notice: '',
    writing: false,
    dispatchOpen: false,
    dispatchView: null,
    dispatchDrivers: [],
    driverLabel: '',
    driverError: '',
    rejectOpen: false,
    rejectView: null,
    rejectReason: '',
    rejectError: '',
    confirmOpen: false,
    confirmDanger: false,
    confirmSheet: null,
    errorTitle: '',
    errorBody: '',
    errorCode: '',
    retryText: ''
  },
  lifetimes: {
    attached() {
      const page = this;
      this._state = null;
      this._refs = null;
      this._gate = data.createGate();
      this._writing = false;
      this._offData = data.onChange(function () {
        if (page._shown && !page._writing) page.load();
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
    onLoad(query) {
      this._id = query && query.id ? query.id : '';
      this._created = Boolean(query && String(query.created) === '1');
      this._action = '';
      this._selectedCarId = '';
      this._selectedDriverId = '';
    },
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
    driverRows() {
      const selected = this._selectedDriverId;
      const refs = this._refs || { DRIVERS: [], personById: function () { return null; } };
      return (refs.DRIVERS || []).map(function (id) {
        const person = refs.personById(id);
        return {
          id: id,
          label: person ? i18n.localName(person) : '',
          selected: id === selected
        };
      });
    },
    dispatchState(carId) {
      const view = dispatchSheetView({
        state: this._state,
        refs: this._refs,
        id: this._id,
        selectedCarId: carId
      });
      if (!this._selectedDriverId) view.confirmDisabled = true;
      if (this._writing) view.confirmDisabled = true;
      return {
        dispatchView: view,
        dispatchDrivers: this.driverRows(),
        driverLabel: this.t('vehicle.dispatch.driverLabel'),
        driverError: ''
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
    render() {
      if (typeof this.t !== 'function' || !this._state) return;
      const current = session(getStore());
      const view = vehicleDetailView({
        state: this._state,
        refs: this._refs,
        id: this._id || '',
        now: clock.now(),
        actor: current.actor,
        viewerTz: current.viewerTz,
        ctx: current.ctx
      });
      const actions = splitActions(view && view.actions);
      const patch = {
        phase: 'ready',
        view: view,
        primaryAction: actions.primaryAction,
        textActions: actions.textActions
      };
      if (this._created) patch.createdBanner = this.t('vehicle.created');
      if (this.data.dispatchOpen) Object.assign(patch, this.dispatchState(this._selectedCarId));
      if (this.data.rejectOpen) patch.rejectView = rejectSheetView();
      if (this.data.confirmOpen && this._action) {
        patch.confirmSheet = this.confirmCopy(this._action);
      }
      this.setData(patch);
    },
    onRetry() {
      this.load({ fresh: true });
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
      if (this._writing) return;
      const key = event.currentTarget.dataset.key;
      if (key) this.openAction(key);
    },
    onPrimary() {
      if (this._writing) return;
      if (this.data.primaryAction) this.openAction(this.data.primaryAction.key);
    },
    openAction(key) {
      if (this._writing) return;
      this._action = key;
      const drivers = (this._refs && this._refs.DRIVERS) || [];
      if (key === 'dispatch' || key === 'reassign') {
        this._selectedCarId = '';
        this._selectedDriverId = drivers.length === 1 ? drivers[0] : '';
        this.setData(Object.assign({
          dispatchOpen: true,
          rejectOpen: false,
          confirmOpen: false,
          notice: ''
        }, this.dispatchState('')));
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
      if (this._writing) return;
      const id = event.currentTarget.dataset.id;
      const cars = (this.data.dispatchView && this.data.dispatchView.cars) || [];
      let car = null;
      for (let i = 0; i < cars.length; i += 1) {
        if (cars[i].id === id) car = cars[i];
      }
      if (!car || !car.available || car.selected) return;
      this._selectedCarId = id;
      this.setData(this.dispatchState(id));
    },
    onPickDriver(event) {
      if (this._writing) return;
      const id = event.currentTarget.dataset.id;
      const rows = this.data.dispatchDrivers || [];
      let driver = null;
      for (let i = 0; i < rows.length; i += 1) {
        if (rows[i].id === id) driver = rows[i];
      }
      if (!driver || driver.selected) return;
      this._selectedDriverId = id;
      this.setData(this.dispatchState(this._selectedCarId));
    },
    onRejectInput(event) {
      this.setData({
        rejectReason: event.detail.value,
        rejectError: ''
      });
    },
    onCloseSheets() {
      if (this._writing) return;
      this.setData({
        dispatchOpen: false,
        rejectOpen: false,
        confirmOpen: false
      });
    },
    onConfirmDispatch() {
      if (this._writing) return;
      if (!this._selectedDriverId) {
        this.setData({ driverError: this.t('error.vehicle.driver.required') });
        return;
      }
      this.runTransition({
        carId: this._selectedCarId,
        driverId: this._selectedDriverId
      });
    },
    onConfirmReject() {
      if (this._writing) return;
      this.runTransition({ reason: this.data.rejectReason });
    },
    onConfirmAction() {
      if (this._writing) return;
      this.runTransition({});
    },
    // reassign and cancelDispatch are not contract methods yet (see the lead note).
    localTransition(action, payload) {
      const vehicle = findVehicle(this._state, this._id);
      if (!vehicle) return Promise.resolve({ ok: false, code: 'vehicle.notFound' });
      const current = session(getStore());
      const refs = this._refs || {};
      const result = transition(vehicle, action, payload, {
        actor: current.actor,
        now: clock.now(),
        cars: refs.CARS || [],
        drivers: refs.DRIVERS || [],
        vehicles: this._state.vehicles || []
      });
      if (!result || result.ok !== true) return Promise.resolve(result);
      const saved = getStore().updateVehicle(result.vehicle);
      if (!saved || saved.ok !== true) {
        return Promise.resolve(saved || { ok: false, code: 'storage.writeFailed' });
      }
      data.invalidate();
      return Promise.resolve(result);
    },
    runTransition(payload) {
      const vehicle = findVehicle(this._state, this._id);
      if (!vehicle) {
        this.setData({
          dispatchOpen: false,
          rejectOpen: false,
          confirmOpen: false,
          notice: this.t('state.changedByOther')
        });
        this.load({ fresh: true });
        return;
      }
      const action = this._action;
      const method = API_ACTIONS[action];
      this._writing = true;
      this.setData({ writing: true });
      let pending;
      if (method) {
        pending = data.write(method, Object.assign({
          id: vehicle.id,
          expectedRev: vehicle.rev
        }, payload));
      } else if (isDemo()) {
        pending = this.localTransition(action, payload);
      } else {
        pending = Promise.resolve({ ok: false, code: 'action.unknown' });
      }
      const page = this;
      pending.then(function (result) {
        page.applyResult(result);
      });
    },
    applyResult(result) {
      this._writing = false;
      if (!result || result.ok !== true) {
        const code = result && result.code ? result.code : 'permission.denied';
        if (data.isRevConflict(code)) {
          this.setData({
            writing: false,
            dispatchOpen: false,
            rejectOpen: false,
            confirmOpen: false,
            notice: this.t('state.changedByOther')
          });
          this.load({ fresh: true });
          return;
        }
        if (code === 'vehicle.reject.reasonRequired') {
          this.setData({ writing: false, rejectError: this.t('error.' + code) });
          return;
        }
        if (code === 'vehicle.driver.required') {
          this.setData({ writing: false, driverError: this.t('error.' + code) });
          return;
        }
        this.setData({
          writing: false,
          dispatchOpen: false,
          rejectOpen: false,
          confirmOpen: false,
          notice: this.t('error.' + code)
        });
        return;
      }
      const action = this._action;
      this.setData({
        writing: false,
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
      this.load({ fresh: true });
    }
  }
});
