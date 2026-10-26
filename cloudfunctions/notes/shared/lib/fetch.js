'use strict';

async function fetchAll(query, options) {
  const config = options || {};
  const max = config.max === undefined ? 1000 : Math.max(0, Number(config.max) || 0);
  const rows = [];
  let skip = 0;
  while (rows.length < max) {
    const limit = Math.min(100, max - rows.length);
    if (!limit) break;
    const result = await query.skip(skip).limit(limit).get();
    const page = (result && result.data) || [];
    rows.push(...page);
    if (page.length < limit) break;
    skip += page.length;
  }
  return rows.slice(0, max);
}

module.exports = { fetchAll };
