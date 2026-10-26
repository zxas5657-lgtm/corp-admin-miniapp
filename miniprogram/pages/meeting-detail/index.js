const i18nBehavior = require('../../behaviors/i18n');
const { getStore } = require('../../store/index');
const clock = require('../../domain/clock');
const { meetingDetailView } = require('../../viewmodels/meetings');
const { session } = require('../../utils/session');
const { ready } = require('../../utils/auth');
const data = require('../../utils/data');

function findItem(state, id) {
  const items = (state && state.items) || [];
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].id === id) return items[i];
  }
  return null;
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['a11y', 'nav', 'state', 'error'],
    navTitleKey: 'nav.meetingDetail',
    phase: 'loading',
    view: null,
    agendaLabel: '',
    cancelAction: '',
    cancelOpen: false,
    writing: false,
    notice: '',
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
    render() {
      if (typeof this.t !== 'function' || !this._state) return;
      const current = session(getStore());
      const view = meetingDetailView({
        state: this._state,
        refs: this._refs,
        id: this._id || '',
        now: clock.now(),
        actor: current.actor,
        viewerTz: current.viewerTz,
        ctx: current.ctx
      });
      this.setData({
        phase: 'ready',
        view: view,
        agendaLabel: this.t('meeting.detail.agenda'),
        cancelAction: this.t('meeting.detail.cancelAction')
      });
    },
    onRetry() {
      this.load({ fresh: true });
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
      if (this._writing) return;
      this.setData({ cancelOpen: true, notice: '' });
    },
    onCloseCancel() {
      if (this._writing) return;
      this.setData({ cancelOpen: false });
    },
    onCloseNotice() {
      this.setData({ notice: '' });
    },
    onConfirmCancel() {
      if (this._writing) return;
      const meeting = findItem(this._state, this._id);
      if (!meeting) {
        this.setData({ cancelOpen: false });
        this.load({ fresh: true });
        return;
      }
      this._writing = true;
      this.setData({ writing: true });
      const page = this;
      const saved = data.write('cancelItem', {
        id: meeting.id,
        expectedRev: meeting.rev
      });
      saved.then(function (result) {
        page._writing = false;
        if (!result || result.ok !== true) {
          const code = result && result.code ? result.code : 'network.failed';
          if (data.isRevConflict(code)) {
            page.setData({
              writing: false,
              cancelOpen: false,
              notice: page.t('state.changedByOther')
            });
            page.load({ fresh: true });
            return;
          }
          page.setData({
            writing: false,
            cancelOpen: false,
            notice: page.t('error.' + code)
          });
          return;
        }
        page.setData({ writing: false, cancelOpen: false, notice: '' });
        try {
          wx.showToast({ title: page.t('meeting.detail.cancelledToast'), icon: 'none' });
        } catch (err) {
          // The toast must not break the page.
        }
        page.load({ fresh: true });
      });
    }
  }
});
