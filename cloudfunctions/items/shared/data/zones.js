'use strict';

// Display names for the zones in domain/tz.js ZONES, used for dual-zone time labels.
const ZONE_CITIES = {
  UTC: { 'zh-CN': '世界协调时', en: 'UTC' },
  'Asia/Shanghai': { 'zh-CN': '上海', en: 'Shanghai' },
  'Asia/Hong_Kong': { 'zh-CN': '香港', en: 'Hong Kong' },
  'Asia/Singapore': { 'zh-CN': '新加坡', en: 'Singapore' },
  'Asia/Tokyo': { 'zh-CN': '东京', en: 'Tokyo' },
  'Asia/Seoul': { 'zh-CN': '首尔', en: 'Seoul' },
  'Asia/Dubai': { 'zh-CN': '迪拜', en: 'Dubai' },
  'Asia/Kolkata': { 'zh-CN': '加尔各答', en: 'Kolkata' },
  'Europe/London': { 'zh-CN': '伦敦', en: 'London' },
  'Europe/Amsterdam': { 'zh-CN': '阿姆斯特丹', en: 'Amsterdam' },
  'Europe/Berlin': { 'zh-CN': '柏林', en: 'Berlin' },
  'America/New_York': { 'zh-CN': '纽约', en: 'New York' },
  'America/Chicago': { 'zh-CN': '芝加哥', en: 'Chicago' },
  'America/Los_Angeles': { 'zh-CN': '洛杉矶', en: 'Los Angeles' },
  'Australia/Sydney': { 'zh-CN': '悉尼', en: 'Sydney' },
};

// Unknown zones fall back to the IANA id in both languages.
function zoneCity(tzId) {
  return ZONE_CITIES[tzId] || { 'zh-CN': tzId, en: tzId };
}

module.exports = { ZONE_CITIES, zoneCity };
