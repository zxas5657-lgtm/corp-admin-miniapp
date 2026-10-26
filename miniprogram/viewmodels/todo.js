'use strict';

const i18n = require('../i18n/index');
const reference = require('../data/reference');
const tz = require('../domain/tz');
const { noteVisibleTo } = require('../domain/notes');
const { canEditItem, visibleItems } = require('../domain/visibility');
const { normalizeRole } = require('../domain/permissions');

const HOME_TZ = 'Asia/Shanghai';

function asDate(value) {
  const result = value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function personName(id, refs) {
  const person = refs && typeof refs.personById === 'function' ? refs.personById(id) : null;
  return person ? i18n.localName(person) : id || '';
}

function leaderIdsFor(actor, refs, ctx) {
  const role = normalizeRole(actor && actor.role);
  if (role === 'secretary') {
    return [...new Set((ctx && ctx.supports && ctx.supports[actor.personId]) || [])];
  }
  if (role === 'secretaryAdmin') {
    const people = Array.isArray(refs && refs.PEOPLE) ? refs.PEOPLE : reference.PEOPLE;
    return (people || [])
      .filter((person) => person && person.role === 'leader')
      .map((person) => person.id);
  }
  return [];
}

function actorAllowed(actor, refs, ctx) {
  return (
    ['secretary', 'secretaryAdmin'].includes(normalizeRole(actor && actor.role)) &&
    leaderIdsFor(actor, refs, ctx).length > 0
  );
}

function leadersFor(item, allowed) {
  const allowedSet = new Set(allowed);
  return (item.leaders || []).filter((entry) => allowedSet.has(entry.leaderId));
}

function itemStart(item, viewerTz) {
  const instant = asDate(item && (item.startAt || item.departAt));
  if (instant) return instant;
  if (item && item.allDay && item.date) return tz.fromZoned(item.date, '00:00', viewerTz);
  return null;
}

function itemDate(item, viewerTz) {
  const instant = itemStart(item, viewerTz);
  return instant ? tz.toZoned(instant, viewerTz).date : item.date || '';
}

function itemTitle(item) {
  return i18n.displayText(item.kind === 'vehicle' ? item.reason : item.title);
}

function itemTimeLabel(item, viewerTz) {
  if (item.allDay) return i18n.t('week.allDay');
  const start = itemStart(item, viewerTz);
  if (!start) return '';
  const startLocal = tz.toZoned(start, viewerTz);
  const end = asDate(item.endAt);
  return end
    ? i18n.fmt.timeRange(startLocal.time, tz.toZoned(end, viewerTz).time)
    : startLocal.time;
}

function relativeCreated(value, now) {
  const created = asDate(value);
  const current = asDate(now) || new Date();
  if (!created) return '';
  const minutes = Math.max(0, Math.floor((current.getTime() - created.getTime()) / 60000));
  if (minutes < 1) return i18n.t('todo.relative.justNow');
  if (minutes < 60) return i18n.t('todo.relative.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('todo.relative.hours', { n: hours });
  return i18n.t('todo.relative.days', { n: Math.floor(hours / 24) });
}

function section(key, rows) {
  return {
    key,
    title: i18n.t(`todo.section.${key}`),
    count: rows.length,
    rows,
  };
}

function emptySection(reason) {
  return {
    key: 'empty',
    title: i18n.t('todo.emptyTitle'),
    count: 0,
    rows: [],
    ...(reason ? { reason } : {}),
  };
}

function todoView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const actor = config.actor || null;
  const viewerTz = config.viewerTz || HOME_TZ;
  const allowed = leaderIdsFor(actor, refs, config.ctx);
  const reason = actorAllowed(actor, refs, config.ctx) ? null : i18n.t('todo.staffOnly');
  if (reason) {
    return {
      sections: [emptySection(reason)],
      badgeCount: 0,
      reason,
      emptyReason: reason,
      empty: { title: i18n.t('todo.emptyTitle'), body: i18n.t('todo.emptyBody'), reason },
    };
  }

  const allowedSet = new Set(allowed);
  const notes = (state.notes || [])
    .filter(
      (note) =>
        note.status === 'open' &&
        allowedSet.has(note.leaderId) &&
        noteVisibleTo(actor, note, config.ctx),
    )
    .sort(
      (left, right) =>
        (asDate(right.createdAt) || new Date(0)).getTime() -
          (asDate(left.createdAt) || new Date(0)).getTime() ||
        String(right.id).localeCompare(String(left.id)),
    )
    .map((note) => {
      const relativeTime = relativeCreated(note.createdAt, config.now);
      return {
        id: note.id,
        leaderName: personName(note.leaderId, refs),
        text: i18n.displayText(note.text),
        relativeTime,
        createdLabel: relativeTime,
        canConvert: true,
        canClose: true,
      };
    });

  const visible = visibleItems(actor, state.items || [], config.ctx).filter((item) => {
    if (item.status === 'cancelled') return false;
    if (item.kind === 'stop') return false;
    if (!Array.isArray(item.leaderIds) || !item.leaderIds.some((id) => allowedSet.has(id)))
      return false;
    const entries = leadersFor(item, allowed);
    return entries.length > 0;
  });
  const pending = [];
  const declined = [];
  for (const item of visible) {
    const entries = leadersFor(item, allowed);
    const pendingEntries = entries.filter((entry) => entry.confirm === 'pending');
    const declinedEntries = entries.filter((entry) => entry.confirm === 'declined');
    const base = {
      id: item.id,
      leaderName: i18n.listJoin(
        pendingEntries.length
          ? pendingEntries.map((entry) => personName(entry.leaderId, refs))
          : declinedEntries.map((entry) => personName(entry.leaderId, refs)),
      ),
      title: itemTitle(item),
      timeLabel: itemTimeLabel(item, viewerTz),
      icon: item.kind === 'travel' || item.kind === 'trip' ? 'trip' : item.kind,
      rowKey: `${item.id}:${itemDate(item, viewerTz)}`,
    };
    if (pendingEntries.length) pending.push(base);
    if (declinedEntries.length) {
      declined.push({
        ...base,
        declineReason: declinedEntries
          .map((entry) => entry.declineReason || '')
          .filter(Boolean)
          .join('; '),
        canEdit: canEditItem(actor, item, config.ctx),
      });
    }
  }
  const bySoonest = (left, right) => {
    const a = visible.find((item) => item.id === left.id);
    const b = visible.find((item) => item.id === right.id);
    return (
      (itemStart(a, viewerTz) || new Date(0)).getTime() -
        (itemStart(b, viewerTz) || new Date(0)).getTime() ||
      String(left.id).localeCompare(String(right.id))
    );
  };
  pending.sort(bySoonest);
  declined.sort(bySoonest);

  const sections = [
    section('notes', notes),
    section('pending', pending),
    section('declined', declined),
  ].filter((entry) => entry.count > 0);
  const shownSections = sections.length ? sections : [emptySection()];
  return {
    sections: shownSections,
    badgeCount: notes.length + declined.length,
    reason: null,
    emptyReason: null,
    empty: sections.length
      ? null
      : { title: i18n.t('todo.emptyTitle'), body: i18n.t('todo.emptyBody') },
  };
}

module.exports = { todoView };
