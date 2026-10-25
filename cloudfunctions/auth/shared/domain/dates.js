'use strict';

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseDateStr(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return date;
}

function isDateStr(value) {
  return parseDateStr(value) !== null;
}

function isTimeStr(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function parseLocalDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [datePart, timePart] = value.split('T');
  if (!isDateStr(datePart) || !isTimeStr(timePart)) return null;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function requireDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('Expected a valid Date');
  }
  return value;
}

function toDateStr(date) {
  const value = requireDate(date);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toTimeStr(date) {
  const value = requireDate(date);
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function nowParts(date) {
  return { date: toDateStr(date), time: toTimeStr(date) };
}

function addDays(dateStr, amount) {
  const value = parseDateStr(dateStr);
  if (!value || !Number.isInteger(amount)) throw new RangeError('Expected a valid date and integer day count');
  value.setDate(value.getDate() + amount);
  return toDateStr(value);
}

function compareDate(left, right) {
  if (!isDateStr(left) || !isDateStr(right)) throw new RangeError('Expected valid date strings');
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toMinutes(value) {
  if (!isTimeStr(value)) throw new RangeError('Expected a valid time string');
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function weekdayOf(dateStr) {
  const value = parseDateStr(dateStr);
  if (!value) throw new RangeError('Expected a valid date string');
  return value.getDay();
}

function weekStart(dateStr, firstDay) {
  if (firstDay !== 0 && firstDay !== 1) throw new RangeError('firstDay must be 0 or 1');
  const offset = (weekdayOf(dateStr) - firstDay + 7) % 7;
  return addDays(dateStr, -offset);
}

function weekDays(dateStr, firstDay) {
  const start = weekStart(dateStr, firstDay);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function dayValue(value) {
  if (value instanceof Date) return toDateStr(value);
  if (isDateStr(value)) return value;
  throw new RangeError('Expected a Date or date string');
}

function isSameDay(left, right) {
  return dayValue(left) === dayValue(right);
}

module.exports = {
  isDateStr,
  isTimeStr,
  parseLocalDateTime,
  toDateStr,
  toTimeStr,
  nowParts,
  addDays,
  compareDate,
  toMinutes,
  weekdayOf,
  weekStart,
  weekDays,
  isSameDay,
};
