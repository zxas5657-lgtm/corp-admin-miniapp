const i18nBehavior = require('../../behaviors/i18n');
const i18n = require('../../i18n/index');
const { getStore } = require('../../store/index');
// Demo role list only. Bound profiles use directory refs.
const { ROLE_ORDER, personById, actorFor } = require('../../data/reference');
const { DEV_ROLE_SWITCH } = require('../../config');
const { changeLocale } = require('../../utils/locale');
const { refreshVehicleBadge } = require('../../utils/badge');
const { session } = require('../../utils/session');
const { isDemo } = require('../../utils/env');
const { prepareTab } = require('../../utils/shell');
const { homeUrl } = require('../../utils/tabs');
const { currentMe } = require('../../utils/auth');
const data = require('../../utils/data');

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
    phase: 'loading',
    errorTitle: '',
    errorBody: '',
    errorCode: '',
    retryText: '',
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
      const page = this;
      this._gate = data.createGate();
      this._refs = null;
      if (!this._offStore) {
        this._offStore = getStore().subscribe(function () {
          if (page.data.phase === 'ready') page.rebuild();
        });
      }
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
        page.load();
        setTabBarHidden(page, page.data.languageOpen || page.data.resetOpen);
      });
    },
    hide() {
      setTabBarHidden(this, false);
    }
  },
  methods: {
    onLocaleChange() {
      if (this.data.phase === 'error') {
        this.setData(data.failurePatch(this.data.errorCode, this.t.bind(this)));
        return;
      }
      this.rebuild();
    },
    load(options) {
      const opts = options || {};
      const page = this;
      if (typeof this.t !== 'function') return;
      const token = this._gate.next();
      const hadReady = this.data.phase === 'ready';
      if (!hadReady) this.setData({ phase: 'loading' });
      const span = data.catalogWindow(session(getStore()).viewerTz);
      Promise.all([
        data.loadDirectory({ fresh: Boolean(opts.fresh) }),
        data.loadRange(span, { fresh: Boolean(opts.fresh) })
      ]).then(function (results) {
        if (!page._gate.isCurrent(token)) return;
        if (!results[0].ok || !results[1].ok) {
          if (hadReady) return;
          const code = !results[0].ok ? results[0].code : results[1].code;
          page.setData(data.failurePatch(code, page.t.bind(page)));
          return;
        }
        page._refs = results[0].refs;
        page.setData({ phase: 'ready', authReady: true });
        page.rebuild();
      });
    },
    onRetry() {
      this.load({ fresh: true });
    },
    shownPerson(roleId) {
      if (isDemo()) {
        const currentActor = actorFor(roleId);
        return currentActor ? personById(currentActor.personId) : null;
      }
      const me = currentMe();
      const actorId = me && me.personId;
      if (this._refs && actorId) {
        const fromDirectory = this._refs.personById(actorId);
        if (fromDirectory) return fromDirectory;
      }
      return me && me.employee ? me.employee : null;
    },
    rebuild() {
      refreshVehicleBadge(this);
      if (typeof this.t !== 'function') return;
      const roleId = isDemo()
        ? getStore().getRole()
        : ((currentMe() && currentMe().role) || '');
      const person = this.shownPerson(roleId);
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
      data.resetSession();
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
      if (!failed) data.resetSession();
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
