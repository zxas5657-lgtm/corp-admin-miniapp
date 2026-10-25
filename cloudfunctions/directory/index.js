'use strict';

const cloud = require('wx-server-sdk');
const createHandler = require('./handler');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const handler = createHandler({ db });

exports.main = (event) =>
  handler(event, {
    db,
    openid: cloud.getWXContext().OPENID,
    env: cloud.getWXContext().ENV,
  });
