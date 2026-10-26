const i18nBehavior = require('../../behaviors/i18n');
const { isDemo } = require('../../utils/env');
const { normalizeInviteCode, formatInviteCode } = require('../../utils/invite-code');
const auth = require('../../utils/auth');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['bind', 'a11y'],
    navTitleKey: 'nav.bind',
    demoOnly: false,
    display: '',
    code: '',
    canSubmit: false,
    submitting: false,
    locked: false,
    error: '',
    errorCode: '',
    demoLead: '',
    demoHome: '',
    title: '',
    lead: '',
    submitLabel: '',
    footer: ''
  },
  pageLifetimes: {
    show() {
      this.refresh();
    }
  },
  methods: {
    onLocaleChange() {
      this.refresh();
    },
    refresh() {
      const page = this;
      if (typeof page.t !== 'function') return;
      auth.ready().then(function (result) {
        const demoOnly = isDemo() && (!result || result.state === 'bound');
        page.setData({
          demoOnly: demoOnly,
          demoLead: page.t('bind.demoLead'),
          demoHome: page.t('bind.demoHome'),
          title: page.t('bind.title'),
          lead: page.t('bind.lead'),
          footer: page.t('bind.footer'),
          retryLabel: page.t('state.retry'),
          submitLabel: page.data.submitting
            ? page.t('bind.submitting')
            : page.t('bind.submit')
        });
      });
    },
    onCode(event) {
      if (this.data.locked) return;
      const code = normalizeInviteCode(event.detail.value);
      this.setData({
        code: code,
        display: formatInviteCode(code),
        canSubmit: code.length === 8,
        error: '',
        errorCode: ''
      });
    },
    onSubmit() {
      if (this.data.locked || this.data.submitting || !this.data.canSubmit) return;
      const page = this;
      page.setData({
        submitting: true,
        error: '',
        errorCode: '',
        submitLabel: page.t('bind.submitting')
      });
      auth.redeem(page.data.code).then(function (result) {
        page.applyRedeem(result);
      }, function () {
        page.applyRedeem({ ok: false, code: 'network.failed' });
      });
    },
    applyRedeem(result) {
      if (result && result.ok === true && result.bound !== false) {
        auth.accept(result);
        auth.bootstrap().then(function (next) {
          auth.open(next || { state: 'bound', me: auth.currentMe() });
        });
        return;
      }
      const code = result && result.code ? result.code : 'server.error';
      if (code === 'auth.alreadyBound') {
        auth.setAuthStub(null);
        auth.bootstrap().then(function (next) {
          auth.open(next);
        });
        return;
      }
      const known = code === 'auth.inviteInvalid'
        || code === 'auth.inviteExpired'
        || code === 'auth.tooManyAttempts'
        || code === 'network.failed';
      const shown = known ? code : 'server.error';
      this.setData({
        submitting: false,
        locked: code === 'auth.tooManyAttempts',
        canSubmit: code === 'auth.tooManyAttempts' ? false : this.data.code.length === 8,
        error: this.t('error.' + shown),
        errorCode: shown,
        submitLabel: this.t('bind.submit')
      });
    },
    onRetry() {
      this.onSubmit();
    },
    onHome() {
      auth.bootstrap().then(function (result) {
        auth.open(result);
      });
    }
  }
});
