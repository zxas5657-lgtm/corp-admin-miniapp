'use strict';

const i18nBehavior = require('../../behaviors/i18n');
const privacy = require('../../utils/privacy');

function shown(page, name) {
  return privacy.ownerField(name) || page.t('privacy.pending');
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['privacy'],
    navTitleKey: 'nav.privacy',
    title: '',
    sections: [],
  },
  methods: {
    onLocaleChange() {
      this.render();
    },
    render() {
      if (typeof this.t !== 'function') return;
      const operator = shown(this, 'operatorName');
      const contact = shown(this, 'contact');
      const plateDays = privacy.retentionDays('plateRetentionDays');
      const auditDays = privacy.retentionDays('auditRetentionDays');
      this.setData({
        title: this.t('nav.privacy'),
        sections: [
          {
            id: 'operator',
            heading: this.t('privacy.operatorHeading'),
            body: this.t('privacy.operatorBody', {
              operator: operator,
              contact: contact,
            }),
          },
          {
            id: 'staff',
            heading: this.t('privacy.staffHeading'),
            body: this.t('privacy.staffBody'),
          },
          {
            id: 'visitor',
            heading: this.t('privacy.visitorHeading'),
            body: this.t('privacy.visitorBody', { plateDays: plateDays }),
          },
          {
            id: 'purpose',
            heading: this.t('privacy.purposeHeading'),
            body: this.t('privacy.purposeBody'),
          },
          {
            id: 'retention',
            heading: this.t('privacy.retentionHeading'),
            body: this.t('privacy.retentionBody', { auditDays: auditDays }),
          },
          {
            id: 'choices',
            heading: this.t('privacy.choicesHeading'),
            body: this.t('privacy.choicesBody', { contact: contact }),
          },
          {
            id: 'privacy-end',
            heading: this.t('privacy.versionHeading'),
            body: this.t('privacy.versionBody', {
              version: privacy.policyVersion(),
              date: this.t('privacy.effectiveDate'),
            }),
          },
        ],
      });
    },
  },
});
