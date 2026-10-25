'use strict';

const reference = require('../data/reference');
const clock = require('../domain/clock');

function session(store) {
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
