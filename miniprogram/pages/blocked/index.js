const i18nBehavior = require('../../behaviors/i18n');
const { envVersion } = require('../../utils/env');
const auth = require('../../utils/auth');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['blocked', 'state', 'error'],
    navTitleKey: 'nav.blocked',
    kind: 'empty',
    title: '',
    body: '',
    actionText: ''
  },
  methods: {
    onLoad(query) {
      this._state = query && query.state ? query.state : 'disabled';
      this.render();
    },
    onLocaleChange() {
      this.render();
    },
    render() {
      if (typeof this.t !== 'function') return;
      let state = this._state || 'disabled';
      if (state === 'unconfigured' && envVersion() === 'release') state = 'offline';
      if (state === 'offline') {
        this.setData({
          kind: 'error',
          title: this.t('error.network.failed'),
          body: '',
          actionText: this.t('state.retry')
        });
        return;
      }
      if (state === 'unconfigured') {
        this.setData({
          kind: 'empty',
          title: this.t('blocked.unconfiguredTitle'),
          body: this.t('blocked.unconfiguredBody'),
          actionText: ''
        });
        return;
      }
      this.setData({
        kind: 'empty',
        title: this.t('blocked.disabledTitle'),
        body: this.t('blocked.disabledBody'),
        actionText: ''
      });
    },
    onRetry() {
      const page = this;
      auth.bootstrap().then(function (result) {
        if (result && result.state === 'offline') {
          page._state = 'offline';
          page.render();
          return;
        }
        if (result && result.state === 'unconfigured') {
          page._state = 'unconfigured';
          page.render();
          return;
        }
        auth.open(result);
      });
    }
  }
});
