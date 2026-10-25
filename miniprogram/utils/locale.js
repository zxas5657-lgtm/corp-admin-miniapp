'use strict';

const i18n = require('../i18n/index');
const { getStore } = require('../store/index');

function changeLocale(locale) {
  const next = i18n.normalizeLocale(locale);
  i18n.setLocale(next);
  return getStore().setLocale(next);
}

module.exports = { changeLocale };
