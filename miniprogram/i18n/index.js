'use strict';

const zhCN = require('./zh-CN');
const en = require('./en');

const LOCALES = Object.freeze(['zh-CN', 'en']);
const DEFAULT_LOCALE = 'zh-CN';
const HAS_OWN = Object.prototype.hasOwnProperty;
const PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_.-]+)\}/g;

let currentLocale = DEFAULT_LOCALE;
let listeners = new Set();
let devMode = true;
let warnedMissingKeys = new Set();

function normalizeLocale(lang) {
  const value = lang === null || lang === undefined ? '' : String(lang).trim();
  return /^zh/i.test(value) ? 'zh-CN' : 'en';
}

function localeData(locale) {
  return locale === 'en' ? en : zhCN;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function lookup(source, key) {
  if (source === null || source === undefined) return { found: false };
  const name = String(key);
  if (isObject(source) && HAS_OWN.call(source, name)) {
    return { found: true, value: source[name] };
  }

  const parts = name.split('.');
  let current = source;
  for (let index = 0; index < parts.length; index += 1) {
    if (!isObject(current)) return { found: false };
    const part = parts[index];
    if (HAS_OWN.call(current, part)) {
      current = current[part];
      continue;
    }
    const literalRemainder = parts.slice(index).join('.');
    if (HAS_OWN.call(current, literalRemainder)) {
      return { found: true, value: current[literalRemainder] };
    }
    return { found: false };
  }
  return { found: true, value: current };
}

function hasKey(data, key) {
  const result = lookup(data, key);
  return result.found && result.value !== undefined && result.value !== null;
}

function interpolate(value, params) {
  if (typeof value !== 'string') return value;
  const values = params && typeof params === 'object' ? params : {};
  return value.replace(PLACEHOLDER_PATTERN, (token, name) => {
    if (!HAS_OWN.call(values, name) || values[name] === undefined) return token;
    return String(values[name]);
  });
}

function warnMissing(key) {
  if (!devMode || warnedMissingKeys.has(key)) return;
  warnedMissingKeys.add(key);
  console.warn(`[i18n] Missing translation key: ${key}`);
}

function t(key, params) {
  const name = String(key);
  const current = lookup(localeData(currentLocale), name);
  let result = current;

  if (!result.found || result.value === undefined || result.value === null) {
    if (currentLocale !== DEFAULT_LOCALE) {
      result = lookup(localeData(DEFAULT_LOCALE), name);
    }
    warnMissing(name);
  }

  if (!result.found || result.value === undefined || result.value === null) {
    return name;
  }
  return interpolate(result.value, params);
}

function tn(key, n, params) {
  const base = String(key);
  const oneKey = `${base}_one`;
  const otherKey = `${base}_other`;
  const selectedKey = n === 1 && hasKey(localeData(currentLocale), oneKey)
    ? oneKey
    : otherKey;
  return t(selectedKey, { ...(params || {}), n });
}

function getLocale() {
  return currentLocale;
}

function setLocale(locale) {
  const normalized = normalizeLocale(locale);
  if (normalized === currentLocale) return currentLocale;
  currentLocale = normalized;
  for (const listener of [...listeners]) listener(currentLocale);
  return currentLocale;
}

function onChange(fn) {
  if (typeof fn !== 'function') throw new TypeError('onChange requires a function');
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function listJoin(items) {
  const values = Array.isArray(items) ? items.map((item) => String(item)) : [];
  if (values.length < 2) return values.join('');
  if (currentLocale === DEFAULT_LOCALE) return values.join('、');
  const and = t('fmt.and');
  if (values.length === 2) return `${values[0]} ${and} ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, ${and} ${values[values.length - 1]}`;
}

function localizedName(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (HAS_OWN.call(value, currentLocale) && value[currentLocale] !== undefined) {
    return value[currentLocale];
  }
  if (HAS_OWN.call(value, 'zh-CN') && value['zh-CN'] !== undefined) {
    return value['zh-CN'];
  }
  if (currentLocale === DEFAULT_LOCALE && HAS_OWN.call(value, 'zh')) return value.zh;
  return '';
}

function localName(entity) {
  if (!entity) return '';
  if (typeof entity.name === 'string') return entity.name;
  return localizedName(entity.name);
}

function displayText(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return localizedName(value);
}

function localizedValue(key) {
  const current = lookup(localeData(currentLocale), key);
  if (current.found && current.value !== undefined && current.value !== null) {
    return current.value;
  }
  const fallback = lookup(localeData(DEFAULT_LOCALE), key);
  return fallback.found ? fallback.value : undefined;
}

function dayHeading(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekdayShort = localizedValue('date.weekdayShort') || [];
  const monthShort = localizedValue('date.monthShort') || [];
  const template = localizedValue('date.dayHeading') || '{m}/{d}';
  return interpolate(template, {
    m: monthShort[month - 1] === undefined ? month : monthShort[month - 1],
    d: day,
    w: weekdayShort[date.getDay()] === undefined ? date.getDay() : weekdayShort[date.getDay()],
    wd: weekdayShort[date.getDay()] === undefined ? date.getDay() : weekdayShort[date.getDay()],
    mon: monthShort[month - 1] === undefined ? month : monthShort[month - 1],
  });
}

function timeRange(start, end) {
  return `${start}–${end}`;
}

function firstDayOfWeek() {
  const value = Number(localizedValue('date.firstDayOfWeek'));
  return Number.isInteger(value) ? value : 1;
}

function clone(value) {
  if (Array.isArray(value)) return value.slice();
  if (!isObject(value)) return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = clone(child);
  return result;
}

function merge(fallback, current) {
  if (!isObject(fallback) || !isObject(current)) {
    return current === undefined ? clone(fallback) : clone(current);
  }
  const result = clone(fallback);
  for (const [key, value] of Object.entries(current)) {
    result[key] = HAS_OWN.call(result, key) ? merge(result[key], value) : clone(value);
  }
  return result;
}

function dict(prefix) {
  const fallback = lookup(localeData(DEFAULT_LOCALE), prefix);
  const current = lookup(localeData(currentLocale), prefix);
  const fallbackValue = fallback.found ? fallback.value : {};
  const currentValue = current.found ? current.value : {};
  return merge(fallbackValue, currentValue);
}

const fmt = { dayHeading, timeRange };

function setDevMode(value) {
  devMode = Boolean(value);
}

function _resetForTests() {
  currentLocale = DEFAULT_LOCALE;
  listeners = new Set();
  devMode = true;
  warnedMissingKeys = new Set();
}

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  normalizeLocale,
  getLocale,
  setLocale,
  onChange,
  setDevMode,
  t,
  tn,
  listJoin,
  localName,
  displayText,
  fmt,
  firstDayOfWeek,
  dict,
  _resetForTests,
};
