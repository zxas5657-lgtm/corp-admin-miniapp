const i18nBehavior = require('../../behaviors/i18n');
const i18n = require('../../i18n/index');
const { getStore } = require('../../store/index');
const { ROLES, ROLE_ORDER, personById } = require('../../data/reference');
const { DEV_ROLE_SWITCH } = require('../../config');
const { changeLocale } = require('../../utils/locale');
const { refreshVehicleBadge } = require('../../utils/badge');

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

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['nav', 'me', 'lang', 'role', 'demo', 'common', 'a11y', 'error', 'state'],
    navTitleKey: 'nav.me',
    tabIndex: 3,
    devRoleSwitch: DEV_ROLE_SWITCH,
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
      this.rebuild();
    }
  },
  methods: {
    rebuild() {
      refreshVehicleBadge(this);
      if (typeof this.t !== 'function') return;
      const roleId = getStore().getRole();
      const person = personById(ROLES[roleId]);
      const roles = ROLE_ORDER.map(function (id) {
        const item = personById(ROLES[id]);
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
        roles: roles
      });
    },
    onOpenLanguage() {
      this.setData({ languageOpen: true });
    },
    onCloseLanguage() {
      this.setData({ languageOpen: false });
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
    },
    onCloseNotice() {
      this.setData({ notice: '' });
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
      const url = role === 'driver' ? '/pages/vehicles/index' : '/pages/schedule/index';
      try {
        wx.switchTab({ url: url });
      } catch (err) {
        // Navigation must not break the page.
      }
    },
    onOpenReset() {
      this.setData({ resetOpen: true });
    },
    onCloseReset() {
      this.setData({ resetOpen: false });
    },
    onConfirmReset() {
      const result = getStore().resetDemo();
      const failed = !result || result.ok !== true;
      this.setData({
        resetOpen: false,
        notice: failed ? noticeFor(this, result) : ''
      });
      if (failed) return;
      try {
        wx.showToast({ title: this.t('demo.resetNotice'), icon: 'none' });
      } catch (err) {
        // The toast must not break the page.
      }
    }
  }
});
