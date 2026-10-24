const i18nBehavior = require('../../behaviors/i18n');
const i18n = require('../../i18n/index');
const { statusTone } = require('../../utils/status-tone');
const { pseudo } = require('../../utils/pseudo');

const MEETING_STATUSES = ['upcoming', 'ongoing', 'done', 'cancelled'];
const VEHICLE_STATUSES = ['pending', 'assigned', 'done', 'rejected'];
const FORM_FIELDS = ['title', 'date', 'start', 'end', 'room', 'attendees', 'agenda'];

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['nav', 'state', 'status', 'error', 'meeting', 'schedule', 'a11y', 'lang', 'me'],
    navTitleKey: 'nav.devGallery',
    pseudoOn: false,
    progressOn: false,
    sheetOpen: false,
    sheetDanger: false,
    sheetLocked: false,
    closed: {},
    names: { zh: '', en: '', pseudo: '' },
    view: {
      states: [],
      pills: [],
      cells: [],
      notices: [],
      buttons: {},
      sheet: {}
    }
  },
  observers: {
    'i18n.state.loading, pseudoOn': function () {
      this.rebuild();
    }
  },
  pageLifetimes: {
    show() {
      this.rebuild();
    }
  },
  methods: {
    rebuild() {
      const state = this.data.i18n && this.data.i18n.state;
      if (!state || !state.loading || typeof this.t !== 'function') return;
      const page = this;
      const show = function (key, params) {
        const text = page.t(key, params);
        return page.data.pseudoOn ? pseudo(text) : text;
      };
      const pills = [];
      MEETING_STATUSES.forEach(function (status) {
        pills.push({
          key: 'meeting-' + status,
          text: show('status.meeting.' + status),
          tone: statusTone('meeting', status)
        });
      });
      VEHICLE_STATUSES.forEach(function (status) {
        pills.push({
          key: 'vehicle-' + status,
          text: show('status.vehicle.' + status),
          tone: statusTone('vehicle', status)
        });
      });
      const attendeeCount = this.tn('meeting.attendeeCount', 2);
      const cells = FORM_FIELDS.map(function (field) {
        return {
          key: field,
          label: show('meeting.form.' + field),
          value: field === 'attendees' ? (page.data.pseudoOn ? pseudo(attendeeCount) : attendeeCount) : '',
          stacked: field === 'agenda',
          arrow: field === 'attendees',
          requiredError: field === 'title',
          errorText: field === 'title' ? show('error.meeting.title.required') : '',
          slotText: field === 'room' ? show('status.meeting.ongoing') : ''
        };
      });
      cells.push({
        key: 'lock',
        label: show('error.permission.denied'),
        value: '',
        stacked: false,
        arrow: true,
        requiredError: false,
        errorText: '',
        slotText: ''
      });
      const created = show('meeting.created', { date: '10-26' });
      this.setData({
        names: {
          zh: this.t('lang.zh'),
          en: this.t('lang.en'),
          pseudo: this.t('me.language')
        },
        view: {
          states: [
            {
              kind: 'empty',
              title: show('schedule.emptyTitle'),
              body: show('schedule.emptyBody'),
              actionText: show('meeting.form.submit'),
              secondaryText: ''
            },
            {
              kind: 'error',
              title: show('state.genericErrorTitle'),
              body: show('state.genericErrorBody'),
              actionText: show('state.retry'),
              secondaryText: show('state.reset')
            },
            {
              kind: 'loading',
              title: show('state.loading'),
              body: '',
              actionText: '',
              secondaryText: ''
            },
            {
              kind: 'success',
              title: created,
              body: '',
              actionText: '',
              secondaryText: ''
            }
          ],
          pills: pills,
          cells: cells,
          notices: [
            { id: 'success', kind: 'success', text: created, closable: true },
            { id: 'error', kind: 'error', text: show('error.storage.writeFailed'), closable: true },
            { id: 'info', kind: 'info', text: show('schedule.emptyBody'), closable: false }
          ],
          buttons: {
            text: show('meeting.form.submit'),
            reason: show('error.permission.denied'),
            loadingText: show('state.submitting')
          },
          sheet: {
            title: show('nav.meetingNew'),
            dangerTitle: show('state.genericErrorTitle'),
            confirmText: show('meeting.form.submit'),
            dangerConfirm: show('state.reset'),
            cancelText: show('nav.back'),
            maskLabel: show('a11y.closeSheet'),
            closeLabel: show('a11y.closeSheet'),
            body: show('schedule.emptyBody'),
            dangerBody: show('state.genericErrorBody')
          }
        }
      });
    },
    onLocale(event) {
      const locale = event.currentTarget.dataset.locale;
      if (locale === 'zh-CN' || locale === 'en') i18n.setLocale(locale);
    },
    onTogglePseudo() {
      this.setData({ pseudoOn: !this.data.pseudoOn });
    },
    onStateAction(event) {
      if (event.currentTarget.dataset.kind === 'empty') {
        this.setData({ progressOn: !this.data.progressOn });
      }
    },
    onStateSecondary() {
      this.setData({ sheetOpen: true, sheetDanger: true });
    },
    onPrimary() {
      this.setData({ sheetOpen: true, sheetDanger: false });
    },
    onSheetClose() {
      this.setData({ sheetOpen: false });
    },
    onSheetConfirm() {
      this.setData({ sheetOpen: false });
    },
    onCellTap(event) {
      const id = event.currentTarget.dataset.id;
      if (id === 'lock') {
        this.setData({ sheetLocked: !this.data.sheetLocked });
        return;
      }
      this.setData({ sheetOpen: true, sheetDanger: false });
    },
    onNoticeClose(event) {
      const id = event.currentTarget.dataset.id;
      if (!id) return;
      const closed = Object.assign({}, this.data.closed);
      closed[id] = true;
      this.setData({ closed: closed });
    }
  }
});
