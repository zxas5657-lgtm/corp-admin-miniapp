const i18nBehavior = require('../../behaviors/i18n');
const i18n = require('../../i18n/index');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { can } = require('../../domain/permissions');
const { validateVehicle, createVehicleRequest } = require('../../domain/vehicle');
const { ROLES } = require('../../data/reference');
const { vehicleFormLabels, vehicleFormDefaults } = require('../../viewmodels/vehicles');

const FIELD_IDS = {
  reason: 'field-reason',
  destination: 'field-destination',
  date: 'field-date',
  time: 'field-time',
  passengers: 'field-passengers',
  note: 'field-note'
};

function fieldErrorMap(errors, translate) {
  const byField = {};
  let first = null;
  const list = errors || [];
  for (let i = 0; i < list.length; i += 1) {
    const error = list[i];
    if (byField[error.field] === undefined) byField[error.field] = translate('error.' + error.code);
    if (first === null) first = error.field;
  }
  return { byField: byField, first: first };
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['a11y', 'nav'],
    navTitleKey: 'nav.vehicleNew',
    allowed: true,
    deniedText: '',
    form: null,
    labels: null,
    dirtyLeave: null,
    errors: {},
    submitting: false,
    notice: '',
    dirtyOpen: false,
    guardBack: false,
    dateLabel: '',
    reasonPlaceholder: '',
    destinationPlaceholder: ''
  },
  lifetimes: {
    created() {
      this._alive = true;
      this._leaving = false;
      this._submitting = false;
      this._guardBack = false;
      this._defaults = null;
      this._personId = '';
      this._writeTimer = null;
    },
    attached() {
      const page = this;
      this._offStore = getStore().subscribe(function () {
        page.refreshCopy();
      });
    },
    detached() {
      this._alive = false;
      this._submitting = false;
      if (this._writeTimer) {
        clearTimeout(this._writeTimer);
        this._writeTimer = null;
      }
      if (typeof this._offStore === 'function') this._offStore();
      this._offStore = null;
    }
  },
  pageLifetimes: {
    show() {
      this.refreshCopy();
    }
  },
  methods: {
    onLoad() {
      const role = getStore().getRole();
      this._personId = ROLES[role] || '';
      if (!can(role, 'vehicle.request')) {
        this.setData({
          allowed: false,
          deniedText: this.t('error.permission.denied')
        });
        return;
      }
      const defaults = vehicleFormDefaults({ now: clock.now() });
      this._defaults = defaults;
      const form = {
        reason: defaults.reason,
        destination: defaults.destination,
        date: defaults.date,
        time: defaults.time,
        passengers: defaults.passengers,
        note: defaults.note
      };
      this.setData({
        allowed: true,
        form: form,
        labels: vehicleFormLabels(),
        dirtyLeave: this.dirtyLeaveCopy(),
        dateLabel: i18n.fmt.dayHeading(form.date),
        reasonPlaceholder: this.t('vehicle.form.reasonPlaceholder'),
        destinationPlaceholder: this.t('vehicle.form.destinationPlaceholder')
      });
    },
    onLocaleChange() {
      this.refreshCopy();
    },
    dirtyLeaveCopy() {
      return {
        title: this.t('vehicle.form.dirtyLeave.title'),
        body: this.t('vehicle.form.dirtyLeave.body'),
        leave: this.t('vehicle.form.dirtyLeave.leave'),
        stay: this.t('vehicle.form.dirtyLeave.stay')
      };
    },
    refreshCopy() {
      if (typeof this.t !== 'function') return;
      if (!this.data.allowed) {
        this.setData({ deniedText: this.t('error.permission.denied') });
        return;
      }
      if (!this.data.form) return;
      this.setData({
        labels: vehicleFormLabels(),
        dirtyLeave: this.dirtyLeaveCopy(),
        dateLabel: i18n.fmt.dayHeading(this.data.form.date),
        reasonPlaceholder: this.t('vehicle.form.reasonPlaceholder'),
        destinationPlaceholder: this.t('vehicle.form.destinationPlaceholder')
      });
    },
    isDirty(form) {
      const defaults = this._defaults;
      const current = form || this.data.form;
      if (!defaults || !current) return false;
      return current.reason !== defaults.reason
        || current.destination !== defaults.destination
        || current.date !== defaults.date
        || current.time !== defaults.time
        || current.passengers !== defaults.passengers
        || current.note !== defaults.note;
    },
    syncGuard(form) {
      if (this._leaving) return;
      const nextGuard = this.isDirty(form) || this._submitting;
      if (nextGuard === this._guardBack) return;
      this._guardBack = nextGuard;
      this.setData({ guardBack: nextGuard });
    },
    setForm(patch) {
      if (this._submitting || this.data.submitting) return;
      const form = Object.assign({}, this.data.form, patch);
      const errors = Object.assign({}, this.data.errors);
      const fields = Object.keys(patch);
      for (let i = 0; i < fields.length; i += 1) delete errors[fields[i]];
      this.setData({
        form: form,
        errors: errors,
        dateLabel: i18n.fmt.dayHeading(form.date)
      });
      this.syncGuard(form);
    },
    onReason(event) {
      this.setForm({ reason: event.detail.value });
    },
    onDestination(event) {
      this.setForm({ destination: event.detail.value });
    },
    onDate(event) {
      this.setForm({ date: event.detail.value });
    },
    onTime(event) {
      this.setForm({ time: event.detail.value });
    },
    onPassengers(event) {
      const step = Number(event.currentTarget.dataset.step);
      if (!step) return;
      const next = this.data.form.passengers + step;
      if (next < 1 || next > 6) return;
      this.setForm({ passengers: next });
    },
    onNote(event) {
      this.setForm({ note: event.detail.value });
    },
    onCloseNotice() {
      this.setData({ notice: '' });
    },
    scrollToField(field) {
      const id = FIELD_IDS[field];
      if (!id) return;
      try {
        wx.pageScrollTo({
          selector: '#' + id,
          duration: 300,
          fail: function () {}
        });
      } catch (err) {
        // Scrolling to a field must not break the page.
      }
    },
    onSubmit() {
      if (this._submitting || this.data.submitting || !this.data.allowed) return;
      const form = this.data.form;
      const errors = validateVehicle(form);
      if (errors.length) {
        const mapped = fieldErrorMap(errors, this.t.bind(this));
        this.setData({ errors: mapped.byField, notice: '' });
        this.scrollToField(mapped.first);
        return;
      }
      this.setData({ errors: {} });
      this.beginWrite(form);
    },
    cancelWrite() {
      this._submitting = false;
      if (this._writeTimer) {
        clearTimeout(this._writeTimer);
        this._writeTimer = null;
      }
      this.setData({ submitting: false });
    },
    beginWrite(form) {
      if (this._submitting) return;
      this._submitting = true;
      this._guardBack = true;
      this.setData({ submitting: true, notice: '', guardBack: true });
      const page = this;
      const run = function () {
        page._writeTimer = null;
        if (!page._alive || !page._submitting) return;
        const record = createVehicleRequest(form, {
          id: 'v' + Date.now().toString(36),
          applicantId: page._personId,
          now: clock.now()
        });
        if (!page._alive || !page._submitting) return;
        const saved = getStore().updateVehicle(record);
        if (!page._alive || !page._submitting) return;
        if (!saved || saved.ok !== true) {
          page._submitting = false;
          page._guardBack = page.isDirty();
          page.setData({
            submitting: false,
            guardBack: page._guardBack,
            notice: page.t('error.storage.writeFailed')
          });
          return;
        }
        page._submitting = false;
        page._leaving = true;
        page._guardBack = false;
        page.setData({ guardBack: false, submitting: false });
        try {
          wx.redirectTo({
            url: '/pages/vehicle-detail/index?id=' + record.id + '&created=1',
            fail: function () {}
          });
        } catch (err) {
          // Navigation must not break the page.
        }
      };
      if (clock.isDemoMode()) {
        this._writeTimer = setTimeout(run, 300);
      } else {
        run();
      }
    },
    onBeforeLeave() {
      if (this._submitting || this.data.submitting) this.cancelWrite();
      if (!this.isDirty()) {
        this._leaving = true;
        this._guardBack = false;
        this.setData({ dirtyOpen: false, guardBack: false, submitting: false });
        try {
          wx.navigateBack({ fail: function () {} });
        } catch (err) {
          // Navigation must not break the page.
        }
        return;
      }
      this._guardBack = false;
      this.setData({ dirtyOpen: true, guardBack: false });
      const page = this;
      setTimeout(function () {
        if (!page._leaving && page._alive) {
          page._guardBack = true;
          page.setData({ guardBack: true });
        }
      }, 50);
    },
    onDirtyStay() {
      this._guardBack = this.isDirty() || this._submitting;
      this.setData({ dirtyOpen: false, guardBack: this._guardBack });
    },
    onDirtyLeave() {
      this.cancelWrite();
      this._alive = false;
      this._leaving = true;
      this._guardBack = false;
      this.setData({ dirtyOpen: false, guardBack: false, submitting: false });
      try {
        wx.navigateBack({ fail: function () {} });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onBack() {
      try {
        wx.navigateBack({ fail: function () {} });
      } catch (err) {
        // Navigation must not break the page.
      }
    }
  }
});
