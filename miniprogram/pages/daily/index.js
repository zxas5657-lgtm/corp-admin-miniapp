const i18nBehavior = require('../../behaviors/i18n');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['daily', 'common'],
    navTitleKey: 'nav.daily'
  }
});
