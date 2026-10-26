'use strict';

const reference = require('../data/reference');
const clock = require('../domain/clock');
const { isDemo } = require('./env');
const { currentMe, actorFrom } = require('./auth');

function session(store) {
  if (!isDemo()) {
    const me = currentMe();
    return {
      actor: actorFrom(me),
      viewerTz: clock.viewerZone(),
      ctx: {
        supports: me && me.supports ? me.supports : {},
        isLeader: reference.isLeader
      }
    };
  }
  return {
    actor: reference.actorFor(store.getRole()),
    viewerTz: clock.viewerZone(),
    ctx: {
      supports: reference.SUPPORTS,
      isLeader: reference.isLeader
    }
  };
}

module.exports = { session };
