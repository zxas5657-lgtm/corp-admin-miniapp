'use strict';

const i18n = require('../../i18n/index');
const privacy = require('../../utils/privacy');

function syncTabBar(open) {
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const page = pages.length ? pages[pages.length - 1] : null;
    if (!page || typeof page.getTabBar !== 'function') return;
    const bar = page.getTabBar();
    if (!bar || typeof bar.setHidden !== 'function') return;
    if (open) {
      bar.setHidden(true);
      return;
    }
    const data = page.data || {};
    bar.setHidden(Boolean(data.languageOpen || data.resetOpen));
  } catch (err) {
    // The sheet still blocks the page if the tab bar cannot be hidden.
  }
}

Component({
  data: {
    open: false,
    title: '',
    summary: '',
    viewPolicy: '',
    agreeLabel: '',
    disagreeLabel: '',
  },
  lifetimes: {
    attached() {
      const sheet = this;
      this._offLocale = i18n.onChange(function () {
        sheet.paint();
      });
      this._offSheet = privacy.subscribe(function () {
        sheet.paint();
      });
      this.paint();
    },
    detached() {
      if (typeof this._offLocale === 'function') this._offLocale();
      if (typeof this._offSheet === 'function') this._offSheet();
      this._offLocale = null;
      this._offSheet = null;
    },
  },
  methods: {
    paint() {
      const open = privacy.isSheetOpen();
      this.setData({
        open: open,
        title: i18n.t('privacy.sheetTitle'),
        summary: i18n.t('privacy.sheetSummary'),
        viewPolicy: i18n.t('privacy.viewPolicy'),
        agreeLabel: i18n.t('privacy.agree'),
        disagreeLabel: i18n.t('privacy.disagree'),
      });
      syncTabBar(open);
    },
    preventMove() {},
    onPolicy() {
      try {
        wx.navigateTo({ url: '/pages/privacy/index' });
      } catch (err) {
        // Leaving the link tappable must not close the sheet.
      }
    },
    onAgree() {
      privacy.agree(privacy.AGREE_BUTTON_ID);
    },
    onDisagree() {
      privacy.disagree();
    },
  },
});
