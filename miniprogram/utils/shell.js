'use strict';

const { getStore } = require('../store/index');
const { ready } = require('./auth');
const privacy = require('./privacy');
const { session } = require('./session');
const { canOpen, homeUrl } = require('./tabs');

function prepareTab(key) {
  return ready().then(function (result) {
    if (!result || result.state !== 'bound') return { ok: false };
    const actor = session(getStore()).actor;
    if (!canOpen(actor, key)) {
      try {
        wx.reLaunch({ url: homeUrl(actor) });
      } catch (err) {
        // The launch page stays on its loading state.
      }
      return { ok: false };
    }
    privacy.presentForBound();
    return { ok: true };
  });
}

module.exports = { prepareTab };
