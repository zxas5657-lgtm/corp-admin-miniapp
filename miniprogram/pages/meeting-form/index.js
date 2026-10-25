const i18nBehavior = require('../../behaviors/i18n');
const i18n = require('../../i18n/index');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { can } = require('../../domain/permissions');
const { validateMeeting, createMeeting, findConflicts } = require('../../domain/meeting');
const reference = require('../../data/reference');
const {
  formOptions,
  formDefaults,
  fieldErrors,
  conflictWarnings,
  labels
} = require('../../viewmodels/meeting-form');

const { ROLES } = reference;

const FIELD_IDS = {
  title: 'field-title',
  date: 'field-date',
  start: 'field-start',
  end: 'field-end',
  roomId: 'field-room',
  attendeeIds: 'field-attendees',
  agenda: 'field-agenda'
};

function sameSet(left, right) {
  const a = (left || []).slice().sort();
  const b = (right || []).slice().sort();
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['a11y', 'nav'],
    navTitleKey: 'nav.meetingNew',
    allowed: true,
    deniedText: '',
    form: null,
    labels: null,
    options: null,
    people: [],
    roomLabel: '',
    roomIndex: 0,
    dateLabel: '',
    errors: {},
    submitting: false,
    notice: '',
    conflictOpen: false,
    conflictList: [],
    conflictSheet: null,
    dirtyOpen: false,
    guardBack: false
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
      const store = getStore();
      const role = store.getRole();
      this._personId = ROLES[role] || '';
      if (!can(role, 'meeting.create')) {
        this.setData({
          allowed: false,
          deniedText: this.t('error.permission.denied')
        });
        return;
      }
      const defaults = formDefaults({ now: clock.now(), personId: this._personId });
      this._defaults = defaults;
      this._options = formOptions();
      const form = {
        title: defaults.title,
        date: defaults.date,
        start: defaults.start,
        end: defaults.end,
        roomId: defaults.roomId,
        attendeeIds: defaults.attendeeIds.slice(),
        agenda: defaults.agenda
      };
      this.setData({
        allowed: true,
        form: form,
        labels: labels(),
        options: this._options
      });
      this.syncDerived(form, this._options);
    },
    onLocaleChange() {
      this.refreshCopy();
    },
    refreshCopy() {
      if (typeof this.t !== 'function') return;
      if (!this.data.allowed) {
        this.setData({ deniedText: this.t('error.permission.denied') });
        return;
      }
      if (!this.data.form) return;
      this._options = formOptions();
      this.setData({
        labels: labels(),
        options: this._options
      });
      this.syncDerived(this.data.form, this._options);
      if (this.data.conflictOpen) this.openConflicts(this.data.form);
    },
    isDirty(form) {
      const defaults = this._defaults;
      const current = form || this.data.form;
      if (!defaults || !current) return false;
      return current.title !== defaults.title
        || current.date !== defaults.date
        || current.start !== defaults.start
        || current.end !== defaults.end
        || current.roomId !== defaults.roomId
        || current.agenda !== defaults.agenda
        || !sameSet(current.attendeeIds, defaults.attendeeIds);
    },
    syncDerived(form, options) {
      const current = form || this.data.form;
      const source = options || this._options || this.data.options || { rooms: [], people: [] };
      const rooms = source.rooms || [];
      const roster = source.people || [];
      let roomLabel = '';
      let roomIndex = 0;
      for (let i = 0; i < rooms.length; i += 1) {
        if (rooms[i].id === current.roomId) {
          roomLabel = rooms[i].label;
          roomIndex = i;
        }
      }
      const selected = {};
      const ids = current.attendeeIds || [];
      for (let i = 0; i < ids.length; i += 1) selected[ids[i]] = true;
      const people = roster.map(function (person) {
        return {
          id: person.id,
          label: person.label,
          selected: Boolean(selected[person.id])
        };
      });
      const patch = {
        people: people,
        roomLabel: roomLabel,
        roomIndex: roomIndex,
        dateLabel: current && current.date ? i18n.fmt.dayHeading(current.date) : ''
      };
      const nextGuard = this._leaving ? false : (this.isDirty(current) || this._submitting);
      if (nextGuard !== this._guardBack) {
        this._guardBack = nextGuard;
        patch.guardBack = nextGuard;
      }
      this.setData(patch);
    },
    setForm(patch) {
      if (this._submitting || this.data.submitting) return;
      const form = Object.assign({}, this.data.form, patch);
      if (patch.attendeeIds) form.attendeeIds = patch.attendeeIds.slice();
      const errors = Object.assign({}, this.data.errors);
      const fields = Object.keys(patch);
      for (let i = 0; i < fields.length; i += 1) delete errors[fields[i]];
      this.setData({ form: form, errors: errors });
      this.syncDerived(form, this._options);
    },
    onTitle(event) {
      this.setForm({ title: event.detail.value });
    },
    onDate(event) {
      this.setForm({ date: event.detail.value });
    },
    onStart(event) {
      this.setForm({ start: event.detail.value });
    },
    onEnd(event) {
      this.setForm({ end: event.detail.value });
    },
    onRoom(event) {
      const index = Number(event.detail.value);
      const rooms = (this._options && this._options.rooms) || [];
      const room = rooms[index];
      if (!room) return;
      this.setForm({ roomId: room.id });
    },
    onAgenda(event) {
      this.setForm({ agenda: event.detail.value });
    },
    onTogglePerson(event) {
      if (this._submitting || this.data.submitting) return;
      const id = event.currentTarget.dataset.id;
      if (!id) return;
      const ids = (this.data.form.attendeeIds || []).slice();
      const index = ids.indexOf(id);
      if (index >= 0) ids.splice(index, 1);
      else ids.push(id);
      this.setForm({ attendeeIds: ids });
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
      const errors = validateMeeting(form, reference);
      if (errors.length) {
        const mapped = fieldErrors(errors);
        this.setData({ errors: mapped.byField, notice: '' });
        this.scrollToField(mapped.first);
        return;
      }
      this.setData({ errors: {} });
      const state = getStore().getState() || {};
      const conflicts = findConflicts(form, state.meetings || [], reference);
      const conflictView = conflictWarnings(conflicts, {
        state: getStore().getState(),
        refs: reference
      });
      if (conflictView.warnings.length) {
        this.setData({
          conflictOpen: true,
          conflictList: conflictView.warnings,
          conflictSheet: conflictView.sheet
        });
        return;
      }
      this.beginWrite(form);
    },
    openConflicts(form) {
      const state = getStore().getState() || {};
      const conflicts = findConflicts(form, state.meetings || [], reference);
      const conflictView = conflictWarnings(conflicts, {
        state: getStore().getState(),
        refs: reference
      });
      this.setData({
        conflictList: conflictView.warnings,
        conflictSheet: conflictView.sheet
      });
    },
    onConflictBack() {
      this.setData({ conflictOpen: false });
    },
    onConflictSubmit() {
      this.setData({ conflictOpen: false });
      this.beginWrite(this.data.form);
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
        const record = createMeeting(form, {
          id: 'm' + Date.now().toString(36),
          organizerId: page._personId,
          now: clock.now()
        });
        if (!page._alive || !page._submitting) return;
        const saved = getStore().addMeeting(record);
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
        const store = getStore();
        store.ui.setSelectedDate(record.date);
        store.ui.setPendingFocus({
          date: record.date,
          meetingId: record.id,
          banner: true
        });
        page._submitting = false;
        page._leaving = true;
        page._guardBack = false;
        page.setData({ guardBack: false, submitting: false });
        try {
          wx.switchTab({ url: '/pages/schedule/index' });
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
          wx.navigateBack();
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
        wx.navigateBack();
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onBack() {
      try {
        wx.navigateBack();
      } catch (err) {
        // Navigation must not break the page.
      }
    }
  }
});
