const i18nBehavior = require('../../behaviors/i18n');
const { isDemo } = require('../../utils/env');
const { normalizeInviteCode, formatInviteCode } = require('../../utils/invite-code');
const auth = require('../../utils/auth');
const privacy = require('../../utils/privacy');

function canSend(page) {
  return page.data.code.length === 8 && page.data.agreed === true && !page.data.locked;
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['bind', 'a11y'],
    navTitleKey: 'nav.bind',
    demoOnly: false,
    display: '',
    code: '',
    canSubmit: false,
    agreed: false,
    consentLead: '',
    consentPolicy: '',
    consentA11y: '',
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
          consentLead: page.t('bind.consentLead'),
          consentPolicy: page.t('bind.consentPolicy'),
          consentA11y: page.t('bind.consentA11y'),
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
        canSubmit: code.length === 8 && this.data.agreed === true && !this.data.locked,
        error: '',
        errorCode: ''
      });
    },
    onToggleConsent() {
      if (this.data.locked || this.data.submitting) return;
      const agreed = !this.data.agreed;
      this.setData({ agreed: agreed, canSubmit: this.data.code.length === 8 && agreed });
    },
    onOpenPolicy() {
      try {
        wx.navigateTo({ url: '/pages/privacy/index' });
      } catch (err) {
        // Navigation must not break the form.
      }
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
        privacy.accept();
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
        canSubmit: code === 'auth.tooManyAttempts' ? false : canSend(this),
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
