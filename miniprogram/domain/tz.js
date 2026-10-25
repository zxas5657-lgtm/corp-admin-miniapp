'use strict';

const { isDateStr, isTimeStr } = require('./dates');

const ZONES = Object.freeze([
  { id: 'UTC', city: { 'zh-CN': '\u4e16\u754c\u534f\u8c03\u65f6', en: 'UTC' }, std: 0, dst: null },
  { id: 'Asia/Shanghai', city: { 'zh-CN': '\u4e0a\u6d77', en: 'Shanghai' }, std: 480, dst: null },
  { id: 'Asia/Hong_Kong', city: { 'zh-CN': '\u9999\u6e2f', en: 'Hong Kong' }, std: 480, dst: null },
  { id: 'Asia/Singapore', city: { 'zh-CN': '\u65b0\u52a0\u5761', en: 'Singapore' }, std: 480, dst: null },
  { id: 'Asia/Tokyo', city: { 'zh-CN': '\u4e1c\u4eac', en: 'Tokyo' }, std: 540, dst: null },
  { id: 'Asia/Seoul', city: { 'zh-CN': '\u9996\u5c14', en: 'Seoul' }, std: 540, dst: null },
  { id: 'Asia/Dubai', city: { 'zh-CN': '\u8fea\u62dc', en: 'Dubai' }, std: 240, dst: null },
  { id: 'Asia/Kolkata', city: { 'zh-CN': '\u52a0\u5c14\u5404\u7b54', en: 'Kolkata' }, std: 330, dst: null },
  { id: 'Europe/London', city: { 'zh-CN': '\u4f26\u6566', en: 'London' }, std: 0, dst: { kind: 'eu' } },
  { id: 'Europe/Amsterdam', city: { 'zh-CN': '\u963f\u59c6\u65af\u7279\u4e39', en: 'Amsterdam' }, std: 60, dst: { kind: 'eu' } },
  { id: 'Europe/Berlin', city: { 'zh-CN': '\u67cf\u6797', en: 'Berlin' }, std: 60, dst: { kind: 'eu' } },
  { id: 'America/New_York', city: { 'zh-CN': '\u7ebd\u7ea6', en: 'New York' }, std: -300, dst: { kind: 'us' } },
  { id: 'America/Chicago', city: { 'zh-CN': '\u829d\u52a0\u54e5', en: 'Chicago' }, std: -360, dst: { kind: 'us' } },
  { id: 'America/Los_Angeles', city: { 'zh-CN': '\u6d1b\u6749\u77f6', en: 'Los Angeles' }, std: -480, dst: { kind: 'us' } },
  { id: 'Australia/Sydney', city: { 'zh-CN': '\u6089\u5c3c', en: 'Sydney' }, std: 600, dst: { kind: 'au' } },
]);

const ZONE_BY_ID = new Map(ZONES.map((zone) => [zone.id, zone]));
let intlOverride = null;
const intlZoneCache = new Map();
const intlFormatterCache = new Map();
const intlZoneSupport = (() => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' });
    return typeof formatter.formatToParts === 'function';
  } catch (error) {
    return false;
  }
})();

function canUseIntl() {
  return intlOverride === false ? false : intlZoneSupport;
}

function intlAccepts(tz) {
  if (!intlZoneSupport) return false;
  if (intlZoneCache.has(tz)) return intlZoneCache.get(tz);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format();
    intlZoneCache.set(tz, true);
    return true;
  } catch (error) {
    intlZoneCache.set(tz, false);
    return false;
  }
}

function isValidZone(tz) {
  return ZONE_BY_ID.has(tz) || (canUseIntl() && intlAccepts(tz));
}

function zoneInfo(tz) {
  if (!isValidZone(tz)) throw new RangeError(`Unknown time zone: ${tz}`);
  return ZONE_BY_ID.get(tz) || null;
}

function validInstant(instant) {
  return instant instanceof Date && !Number.isNaN(instant.getTime());
}

function requireInstant(instant) {
  if (!validInstant(instant)) throw new TypeError('Expected a valid Date instant');
  return instant;
}

function utcDateParts(instant) {
  const value = requireInstant(instant);
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes(),
    second: value.getUTCSeconds(),
  };
}

function nthSunday(year, month, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (nth - 1) * 7;
}

function lastSunday(year, month) {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - last.getUTCDay();
}

function transitionUtc(year, month, day, hour) {
  return Date.UTC(year, month - 1, day, hour);
}

function euTransitions(year, std) {
  return {
    start: transitionUtc(year, 3, lastSunday(year, 3), 1),
    end: transitionUtc(year, 10, lastSunday(year, 10), 1),
    std,
  };
}

function usTransitions(year, std, dst) {
  const startDay = nthSunday(year, 3, 2);
  const endDay = nthSunday(year, 11, 1);
  return {
    start: transitionUtc(year, 3, startDay, 2 - std / 60),
    end: transitionUtc(year, 11, endDay, 2 - dst / 60),
  };
}

function auTransitions(year, std, dst) {
  return {
    start: transitionUtc(year, 10, nthSunday(year, 10, 1), 2 - std / 60),
    end: transitionUtc(year, 4, nthSunday(year, 4, 1), 3 - dst / 60),
  };
}

function tableOffsetAt(instant, zone) {
  if (!zone.dst) return zone.std;
  const parts = utcDateParts(instant);
  let inDst = false;
  if (zone.dst.kind === 'eu') {
    const transitions = euTransitions(parts.year, zone.std);
    inDst = instant.getTime() >= transitions.start && instant.getTime() < transitions.end;
  } else if (zone.dst.kind === 'us') {
    const transitions = usTransitions(parts.year, zone.std, zone.std + 60);
    inDst = instant.getTime() >= transitions.start && instant.getTime() < transitions.end;
  } else if (zone.dst.kind === 'au') {
    const transitions = auTransitions(parts.year, zone.std, zone.std + 60);
    inDst = instant.getTime() >= transitions.start || instant.getTime() < transitions.end;
  }
  return inDst ? zone.std + 60 : zone.std;
}

function intlOffset(instant, tz) {
  let formatter = intlFormatterCache.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    intlFormatterCache.set(tz, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const values = {};
  for (const part of parts) values[part.type] = Number(part.value);
  // Older engines may ignore hourCycle and report midnight as 24.
  const wall = Date.UTC(values.year, values.month - 1, values.day, values.hour % 24, values.minute, values.second);
  return Math.round((wall - instant.getTime()) / 60000);
}

function offsetMinutes(instant, tz) {
  const value = requireInstant(instant);
  const zone = zoneInfo(tz);
  if (canUseIntl() && intlAccepts(tz)) return intlOffset(value, tz);
  return tableOffsetAt(value, zone);
}

function formatDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function toZoned(instant, tz) {
  const value = requireInstant(instant);
  const offset = offsetMinutes(value, tz);
  const shifted = new Date(value.getTime() + offset * 60000);
  const parts = utcDateParts(shifted);
  return {
    date: formatDate(parts.year, parts.month, parts.day),
    time: formatTime(parts.hour, parts.minute),
    weekday: new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay(),
    offset,
  };
}

function wallTimeMs(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
}

function candidateOffsets(wallMs, tz) {
  const zone = zoneInfo(tz);
  if (zone) return [zone.std, zone.dst ? zone.std + 60 : null].filter((value) => value !== null);
  const samples = [0, -6, 6, -24, 24, -48, 48, -370 * 24, 370 * 24];
  return [...new Set(samples.map((hours) => offsetMinutes(new Date(wallMs + hours * 3600000), tz)))];
}

function fromZoned(dateStr, timeStr, tz) {
  if (!isDateStr(dateStr) || !isTimeStr(timeStr)) return null;
  zoneInfo(tz);
  const wallMs = wallTimeMs(dateStr, timeStr);
  const offsets = candidateOffsets(wallMs, tz);
  const candidates = offsets
    .map((offset) => new Date(wallMs - offset * 60000))
    .filter((instant) => {
      const local = toZoned(instant, tz);
      return local.date === dateStr && local.time === timeStr;
    })
    .sort((left, right) => left.getTime() - right.getTime());
  if (candidates.length > 0) return candidates[0];

  const before = offsetMinutes(new Date(wallMs - 6 * 3600000), tz);
  const after = offsetMinutes(new Date(wallMs + 6 * 3600000), tz);
  if (after > before) return new Date(wallMs - before * 60000);
  return new Date(wallMs - offsets[0] * 60000);
}

function dayKey(instant, tz) {
  return toZoned(instant, tz).date;
}

function dateSerial(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function spanDays(startAt, endAt, tz) {
  const start = requireInstant(startAt);
  const end = requireInstant(endAt);
  const first = dayKey(start, tz);
  const last = end.getTime() <= start.getTime() ? first : dayKey(new Date(end.getTime() - 1), tz);
  const days = [];
  const cursor = new Date(Date.UTC(...first.split('-').map(Number).map((value, index) => index === 1 ? value - 1 : value)));
  const lastSerial = dateSerial(last);
  while (cursor.getTime() / 86400000 <= lastSerial) {
    const parts = utcDateParts(cursor);
    days.push(formatDate(parts.year, parts.month, parts.day));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function dualTime(instant, itemTz, viewerTz) {
  const viewer = toZoned(instant, viewerTz);
  const own = toZoned(instant, itemTz);
  if (viewer.offset === own.offset) return null;
  const zone = ZONE_BY_ID.get(itemTz);
  const difference = dateSerial(own.date) - dateSerial(viewer.date);
  return {
    viewer: { date: viewer.date, time: viewer.time },
    own: {
      date: own.date,
      time: own.time,
      dayShift: difference < 0 ? -1 : difference > 0 ? 1 : 0,
      city: zone ? zone.city : { 'zh-CN': itemTz, en: itemTz },
    },
  };
}

function season(instant, tz) {
  const month = Number(toZoned(instant, tz).date.slice(5, 7));
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function deviceZone() {
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && (ZONE_BY_ID.has(resolved) || intlAccepts(resolved))) return resolved;
  } catch (error) {
    // Fall through to the bundled table.
  }
  const current = new Date();
  const currentOffset = -current.getTimezoneOffset();
  const preferred = ['Asia/Shanghai', ...ZONES.map((zone) => zone.id).filter((id) => id !== 'Asia/Shanghai')];
  for (const id of preferred) {
    const zone = ZONE_BY_ID.get(id);
    if (zone && tableOffsetAt(current, zone) === currentOffset) return id;
  }
  return 'Asia/Shanghai';
}

function probe() {
  let intlZone = null;
  if (intlZoneSupport) {
    try {
      intlZone = new Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch (error) {
      intlZone = null;
    }
  }
  const instant = new Date();
  const offsets = {};
  for (const zone of ZONES) offsets[zone.id] = offsetMinutes(instant, zone.id);
  return { intl: canUseIntl(), intlZone, deviceZone: deviceZone(), offsets };
}

function _setIntl(enabled) {
  intlOverride = enabled === null || enabled === undefined ? null : Boolean(enabled);
}

module.exports = {
  ZONES,
  isValidZone,
  offsetMinutes,
  toZoned,
  fromZoned,
  dayKey,
  spanDays,
  overlaps,
  dualTime,
  season,
  deviceZone,
  probe,
  _setIntl,
};
