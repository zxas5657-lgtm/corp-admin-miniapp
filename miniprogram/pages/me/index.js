const i18nBehavior = require('../../behaviors/i18n');
const i18n = require('../../i18n/index');
const { getStore } = require('../../store/index');
const { ROLE_ORDER, personById, actorFor } = require('../../data/reference');
const { DEV_ROLE_SWITCH } = require('../../config');
const { changeLocale } = require('../../utils/locale');
const { refreshVehicleBadge } = require('../../utils/badge');
const { isDemo } = require('../../utils/env');
const { prepareTab } = require('../../utils/shell');
const { homeUrl } = require('../../utils/tabs');

function firstCharacter(value) {
  const chars = Array.from(value || '');
  return chars.length ? chars[0] : '';
}

function initialFor(person) {
  if (!person || !person.name) return '';
  if (i18n.getLocale() === 'en') {
    const letter = firstCharacter(person.name.en);
    return letter ? letter.toUpperCase() : '';
  }
  return firstCharacter(person.name['zh-CN']);
}

function noticeFor(page, result) {
  const code = result && result.code ? result.code : 'storage.writeFailed';
  return page.t('error.' + code);
}

function setTabBarHidden(page, hidden) {
  try {
    if (!page || typeof page.getTabBar !== 'function') return;
    const bar = page.getTabBar();
    if (bar && typeof bar.setHidden === 'function') bar.setHidden(hidden);
  } catch (err) {
    // A missing tab bar must not break the page.
  }
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['nav', 'me', 'lang', 'role', 'demo', 'common', 'a11y', 'error', 'state'],
    navTitleKey: 'nav.me',
    tabKey: 'me',
    authReady: false,
    devRoleSwitch: false,
    languageOpen: false,
    resetOpen: false,
    notice: '',
    roleId: '',
    initial: '',
    name: '',
    title: '',
    roleLabel: '',
    roles: []
  },
  observers: {
    locale() {
      this.rebuild();
    }
  },
  lifetimes: {
    attached() {
      if (!this._offStore) {
        const page = this;
        this._offStore = getStore().subscribe(function () {
          page.rebuild();
        });
      }
      this.rebuild();
    },
    detached() {
      if (typeof this._offStore === 'function') this._offStore();
      this._offStore = null;
    }
  },
  pageLifetimes: {
    show() {
      const page = this;
      prepareTab('me').then(function (ready) {
        if (!ready.ok) return;
        page.setData({ authReady: true });
        page.rebuild();
        setTabBarHidden(page, page.data.languageOpen || page.data.resetOpen);
      });
    },
    hide() {
      setTabBarHidden(this, false);
    }
  },
  methods: {
    rebuild() {
      refreshVehicleBadge(this);
      if (typeof this.t !== 'function') return;
      const roleId = getStore().getRole();
      const currentActor = actorFor(roleId);
      const person = currentActor ? personById(currentActor.personId) : null;
      const roles = ROLE_ORDER.map(function (id) {
        const actor = actorFor(id);
        const item = actor ? personById(actor.personId) : null;
        return {
          id: id,
          label: this.t('role.' + id + '.label'),
          name: i18n.localName(item),
          hint: this.t('role.' + id + '.hint'),
          selected: id === roleId
        };
      }, this);
      this.setData({
        roleId: roleId,
        initial: initialFor(person),
        name: i18n.localName(person),
        title: i18n.displayText(person && person.title),
        roleLabel: this.t('role.' + roleId + '.label'),
        roles: roles,
        devRoleSwitch: isDemo() && DEV_ROLE_SWITCH,
        showVehicleEntry: roleId === 'leader'
      });
    },
    onOpenLanguage() {
      this.setData({ languageOpen: true });
      setTabBarHidden(this, true);
    },
    onCloseLanguage() {
      this.setData({ languageOpen: false });
      setTabBarHidden(this, this.data.resetOpen);
    },
    onPickLocale(event) {
      const locale = event.currentTarget.dataset.locale;
      if (locale !== 'zh-CN' && locale !== 'en') return;
      const result = changeLocale(locale);
      const failed = !result || result.ok !== true;
      this.setData({
        languageOpen: false,
        notice: failed ? this.t('error.storage.writeFailed') : ''
      });
      setTabBarHidden(this, this.data.resetOpen);
    },
    onCloseNotice() {
      this.setData({ notice: '' });
    },
    onVehicles() {
      try {
        wx.switchTab({ url: '/pages/vehicles/index' });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onEntry(event) {
      const url = event.currentTarget.dataset.url;
      if (!url) return;
      try {
        wx.navigateTo({ url: url });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onRole(event) {
      const role = event.currentTarget.dataset.role;
      if (!role || role === this.data.roleId) return;
      const result = getStore().setRole(role);
      if (!result || result.ok !== true) {
        this.setData({ notice: noticeFor(this, result) });
        return;
      }
      this.setData({ notice: '' });
      try {
        wx.showToast({ title: this.t('demo.switched'), icon: 'none' });
      } catch (err) {
        // The toast must not block the role home tab.
      }
      const url = homeUrl(actorFor(role));
      try {
        wx.reLaunch({ url: url });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onOpenReset() {
      this.setData({ resetOpen: true });
      setTabBarHidden(this, true);
    },
    onCloseReset() {
      this.setData({ resetOpen: false });
      setTabBarHidden(this, this.data.languageOpen);
    },
    onConfirmReset() {
      const result = getStore().resetDemo();
      const failed = !result || result.ok !== true;
      this.setData({
        resetOpen: false,
        notice: failed ? noticeFor(this, result) : ''
      });
      setTabBarHidden(this, this.data.languageOpen);
      if (failed) return;
      try {
        wx.showToast({ title: this.t('demo.resetNotice'), icon: 'none' });
      } catch (err) {
        // The toast must not break the page.
      }
    }
  }
});
