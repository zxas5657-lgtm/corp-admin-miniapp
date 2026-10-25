const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { cancelMeeting } = require('../../domain/meeting');
const { ROLES } = require('../../data/reference');
const { meetingDetailView } = require('../../viewmodels/meetings');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['a11y', 'nav'],
    navTitleKey: 'nav.meetingDetail',
    view: null,
    agendaLabel: '',
    cancelOpen: false,
    notice: ''
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
      this.refresh();
    },
    onLocaleChange() {
      this.refresh();
    },
    refresh() {
      if (typeof this.t !== 'function') return;
      const store = getStore();
      const role = store.getRole();
      const view = meetingDetailView({
        state: store.getState(),
        id: this._id || '',
        now: clock.now(),
        role: role,
        personId: ROLES[role]
      });
      this.setData({
        view: view,
        agendaLabel: this.t('meeting.detail.agenda')
      });
    },
    onBack() {
      try {
        wx.navigateBack();
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onViewSchedule() {
      const link = this.data.view && this.data.view.viewInSchedule;
      if (!link) return;
      const store = getStore();
      store.ui.setSelectedDate(link.date);
      store.ui.setPendingFocus({ date: link.date, meetingId: link.meetingId });
      try {
        wx.switchTab({ url: '/pages/schedule/index' });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onOpenCancel() {
      this.setData({ cancelOpen: true, notice: '' });
    },
    onCloseCancel() {
      this.setData({ cancelOpen: false });
    },
    onCloseNotice() {
      this.setData({ notice: '' });
    },
    onConfirmCancel() {
      const store = getStore();
      const state = store.getState();
      const meetings = state.meetings || [];
      let meeting = null;
      for (let i = 0; i < meetings.length; i += 1) {
        if (meetings[i].id === this._id) meeting = meetings[i];
      }
      if (!meeting) {
        this.setData({ cancelOpen: false });
        this.refresh();
        return;
      }
      const role = store.getRole();
      const result = cancelMeeting(meeting, {
        role: role,
        personId: ROLES[role],
        now: clock.now()
      });
      if (!result || result.ok !== true) {
        const code = result && result.code ? result.code : 'meeting.cancel.notAllowed';
        this.setData({
          cancelOpen: false,
          notice: this.t('error.' + code)
        });
        return;
      }
      const saved = store.updateMeeting(result.meeting);
      if (!saved || saved.ok !== true) {
        this.setData({
          cancelOpen: false,
          notice: this.t('error.storage.writeFailed')
        });
        return;
      }
      this.setData({ cancelOpen: false, notice: '' });
      try {
        wx.showToast({ title: this.t('meeting.detail.cancelledToast'), icon: 'none' });
      } catch (err) {
        // The toast must not break the page.
      }
      this.refresh();
    }
  }
});
