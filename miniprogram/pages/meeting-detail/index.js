const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { cancelMeeting } = require('../../domain/meeting');
const { meetingDetailView } = require('../../viewmodels/meetings');
const { session } = require('../../utils/session');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['a11y', 'nav'],
    navTitleKey: 'nav.meetingDetail',
    view: null,
    agendaLabel: '',
    cancelAction: '',
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
      const current = session(store);
      const view = meetingDetailView({
        state: store.getState(),
        id: this._id || '',
        now: clock.now(),
        actor: current.actor,
        viewerTz: current.viewerTz,
        ctx: current.ctx
      });
      this.setData({
        view: view,
        agendaLabel: this.t('meeting.detail.agenda'),
        cancelAction: this.t('meeting.detail.cancelAction')
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
      const items = state.items || [];
      let meeting = null;
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].id === this._id) meeting = items[i];
      }
      if (!meeting) {
        this.setData({ cancelOpen: false });
        this.refresh();
        return;
      }
      const current = session(store);
      const result = cancelMeeting(meeting, {
        actor: current.actor,
        now: clock.now(),
        ctx: current.ctx
      });
      if (!result || result.ok !== true) {
        const code = result && result.code ? result.code : 'meeting.cancel.notAllowed';
        this.setData({
          cancelOpen: false,
          notice: this.t('error.' + code)
        });
        return;
      }
      const saved = store.updateItem(result.item);
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
