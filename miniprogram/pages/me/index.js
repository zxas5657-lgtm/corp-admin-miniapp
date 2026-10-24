const i18nBehavior = require('../../behaviors/i18n');

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['tab', 'nav', 'state'],
    navTitleKey: 'nav.me',
    tabIndex: 3
  }
});
