'use strict';

const i18n = require('../i18n/index.js');
const reference = require('../data/reference');
const zones = require('../data/zones');
const dates = require('../domain/dates');
const tz = require('../domain/tz');
const { visibleItems, visibleVehicles, canEditItem } = require('../domain/visibility');
const { normalizeRole } = require('../domain/permissions');

const HOME_TZ = 'Asia/Shanghai';

function asDate(value) {
  const result = value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function text(value) {
  return i18n.displayText(value);
}

function personName(id, refs) {
  const person = refs && typeof refs.personById === 'function' ? refs.personById(id) : null;
  return person ? i18n.localName(person) : id || '';
}

function roomName(id, refs) {
  const room = refs && typeof refs.roomById === 'function' ? refs.roomById(id) : null;
  return room ? i18n.localName(room) : '';
}

function carName(id, refs) {
  const car = refs && typeof refs.carById === 'function' ? refs.carById(id) : null;
  if (!car) return '';
  return car.plate || i18n.localName(car.model) || id;
}

function ownLeader(item, actor) {
  if (!item || !actor || !Array.isArray(item.leaderIds)) return null;
  if (!item.leaderIds.includes(actor.personId)) return null;
  return (item.leaders || []).find((entry) => entry.leaderId === actor.personId) || null;
}

function isLeaderActor(actor) {
  return normalizeRole(actor && actor.role) === 'leader';
}

function isStaffActor(actor) {
  return ['secretary', 'secretaryAdmin'].includes(normalizeRole(actor && actor.role));
}

function leaderDirectory(refs) {
  const people = Array.isArray(refs && refs.PEOPLE) ? refs.PEOPLE : reference.PEOPLE;
  return (people || []).filter((person) => person && person.role === 'leader');
}

function staffLeaderList(actor, refs, ctx) {
  const role = normalizeRole(actor && actor.role);
  const supported =
    role === 'secretary'
      ? (ctx && ctx.supports && ctx.supports[actor.personId]) || []
      : leaderDirectory(refs).map((person) => person.id);
  const allowed = new Set(supported);
  return leaderDirectory(refs)
    .filter((person) => allowed.has(person.id))
    .map((person) => ({ id: person.id, name: personName(person.id, refs) }));
}

function leaderVisibleItems(actor, items, ctx) {
  const visible = actor ? visibleItems(actor, items, ctx) : items || [];
  // Leaders have a private itinerary. Direct attendee/organizer visibility is useful to
  // staff, but must not make another leader's item appear on a leader's home page.
  if (isLeaderActor(actor))
    return visible.filter((item) => (item.leaderIds || []).includes(actor.personId));
  return visible;
}

function leaderVisibleVehicles(actor, vehicles, ctx) {
  const visible = actor ? visibleVehicles(actor, vehicles, ctx) : vehicles || [];
  if (isLeaderActor(actor)) {
    return visible.filter(
      (vehicle) => vehicle.forLeaderId === actor.personId || vehicle.applicantId === actor.personId,
    );
  }
  return visible;
}

function itemZone(item) {
  return item.tz || HOME_TZ;
}

function itemDates(item, viewerTz) {
  if (item.allDay) return item.date ? [item.date] : [];
  const start = asDate(item.startAt);
  const end = asDate(item.endAt || item.startAt);
  if (!start) return [];
  if (!end) return [tz.dayKey(start, viewerTz)];
  return tz.spanDays(start, end, viewerTz);
}

function vehicleDates(vehicle, viewerTz) {
  const start = asDate(vehicle.departAt);
  return start ? [tz.dayKey(start, viewerTz)] : [];
}

function typeOf(item) {
  if (item.kind === 'travel' || item.kind === 'trip') return 'trip';
  return item.kind;
}

function startInstant(item) {
  return asDate(item.startAt || item.departAt);
}

function formatTime(item, viewerTz) {
  if (item.allDay) return i18n.t('week.allDay');
  const start = startInstant(item);
  if (!start) return '';
  const startParts = tz.toZoned(start, viewerTz);
  const end = asDate(item.endAt);
  if (end) return i18n.fmt.timeRange(startParts.time, tz.toZoned(end, viewerTz).time);
  return startParts.time;
}

function relativeWord(localDate, rowDate) {
  if (localDate === rowDate) return '';
  return localDate > rowDate ? i18n.t('week.relative.next') : i18n.t('week.relative.previous');
}

function zonePart(instant, zone, rowDate) {
  const local = tz.toZoned(instant, zone);
  const city = zones.zoneCity(zone)[i18n.getLocale()] || zone;
  const relative = relativeWord(local.date, rowDate);
  return `${city} ${local.time}${relative ? ` (${relative})` : ''}`;
}

function zoneLine(item, rowDate, viewerTz) {
  const itemTz = itemZone(item);
  if (!startInstant(item) || itemTz === viewerTz) return null;
  const parts = [zonePart(startInstant(item), itemTz, rowDate)];
  if (HOME_TZ !== viewerTz && HOME_TZ !== itemTz)
    parts.push(zonePart(startInstant(item), HOME_TZ, rowDate));
  return parts.join(' · ');
}

function markerList(item, own) {
  const markers = [];
  if (own && own.confirm === 'pending') markers.push('pending');
  // DATA_MODEL §5 (owner decision): a secretary's change sets the leader entry's changedAt,
  // and the leader sees "updated" until seenAt is later than changedAt.
  const changedAt = own && own.changedAt ? asDate(own.changedAt) : null;
  const seenAt = own && own.seenAt ? asDate(own.seenAt) : null;
  if (changedAt && (!seenAt || seenAt.getTime() < changedAt.getTime())) markers.push('updated');
  if (item.important === true) markers.push('important');
  if (item.status === 'cancelled' || item.cancelled === true) markers.push('cancelled');
  return markers;
}

function itemPlace(item, refs) {
  if (item.kind === 'meeting') return roomName(item.roomId, refs) || text(item.location);
  return text(item.location || item.destination);
}

function stopDetail(stop, viewerTz) {
  const start = asDate(stop.startAt);
  const end = asDate(stop.endAt);
  return {
    place: text(stop.location),
    client: text(stop.client),
    time: start
      ? end
        ? i18n.fmt.timeRange(tz.toZoned(start, viewerTz).time, tz.toZoned(end, viewerTz).time)
        : tz.toZoned(start, viewerTz).time
      : '',
  };
}

function tripDetail(item, allItems, viewerTz, refs) {
  const children = (allItems || []).filter((candidate) => candidate.parentId === item.id);
  const stops = children.filter((candidate) => candidate.kind === 'stop');
  const departure = stops.find((stop) => stop.stopType === 'depart');
  const returning = stops.find((stop) => stop.stopType === 'return');
  const tripStart = asDate(item.startAt);
  const tripEnd = asDate(item.endAt);
  const meetings = (allItems || [])
    .filter((candidate) => {
      if (candidate.kind !== 'meeting') return false;
      if (candidate.parentId === item.id) return true;
      const start = asDate(candidate.startAt);
      const end = asDate(candidate.endAt || candidate.startAt);
      return Boolean(
        tripStart && tripEnd && start && end && tz.overlaps(tripStart, tripEnd, start, end),
      );
    })
    .map((meeting) => meetingDetail(meeting, viewerTz, refs));
  return {
    departure: departure ? stopDetail(departure, viewerTz) : null,
    stops: stops
      .filter((stop) => stop !== departure && stop !== returning)
      .map((stop) => stopDetail(stop, viewerTz)),
    return: returning ? stopDetail(returning, viewerTz) : null,
    meetings,
  };
}

function meetingDetail(item, viewerTz, refs) {
  const attendees = (item.attendeeIds || []).map((id) => personName(id, refs)).filter(Boolean);
  return {
    id: item.id,
    title: text(item.title),
    time: formatTime(item, viewerTz),
    room: roomName(item.roomId, refs) || text(item.location),
    organizer: personName(item.organizerId, refs),
    attendees,
  };
}

function detailFor(item, allItems, viewerTz, refs) {
  if (item.kind === 'travel' || item.kind === 'trip')
    return tripDetail(item, allItems, viewerTz, refs);
  if (item.kind === 'meeting') return meetingDetail(item, viewerTz, refs);
  if (item.kind === 'visit') {
    return {
      visitorName: text(item.visitorName),
      organisation: text(item.org),
      host: personName((item.leaderIds || [])[0], refs),
    };
  }
  if (item.kind === 'vehicle') {
    return {
      destination: text(item.destination),
      car: item.carId ? carName(item.carId, refs) : null,
      driver: item.driverId ? personName(item.driverId, refs) : null,
    };
  }
  return {};
}

function viewItem(item, kind, rowDate, config, allItems) {
  const record = item;
  const staff = Boolean(config.staffLeaderId);
  const own = staff
    ? (record.leaders || []).find((entry) => entry.leaderId === config.staffLeaderId) || null
    : ownLeader(record, config.actor);
  const isVehicle = kind === 'vehicle';
  const icon = isVehicle ? 'vehicle' : typeOf(record);
  const title = isVehicle ? text(record.reason) : text(record.title);
  const place = isVehicle ? text(record.destination) : itemPlace(record, config.refs);
  const visibleRecord = isVehicle ? { ...record, kind: 'vehicle' } : record;
  const declined = Boolean(staff && own && own.confirm === 'declined');
  const result = {
    id: record.id,
    rowKey: `${record.id}:${rowDate}`,
    kind: isVehicle ? 'vehicle' : record.kind,
    icon,
    timeLabel: formatTime(isVehicle ? record : visibleRecord, config.viewerTz),
    title,
    place,
    zoneLine: zoneLine(
      isVehicle ? { ...record, startAt: record.departAt } : record,
      rowDate,
      config.viewerTz,
    ),
    markers: markerList(record, own),
    canConfirm: Boolean(
      !staff && own && own.confirm === 'pending' && record.status !== 'cancelled',
    ),
    canDecline: Boolean(
      !staff && own && own.confirm === 'pending' && record.status !== 'cancelled',
    ),
    expectedRev: record.rev,
    detail: detailFor(
      isVehicle ? { ...record, kind: 'vehicle', startAt: record.departAt } : record,
      allItems,
      config.viewerTz,
      config.refs,
    ),
  };
  if (declined) {
    result.markers = [...result.markers, 'declined'];
  }
  if (staff) {
    result.declineReason = declined ? own.declineReason || '' : null;
    result.canEdit = canEditItem(config.actor, record, config.ctx);
    result.canCancel = Boolean(result.canEdit && record.status !== 'cancelled');
  }
  return result;
}

function rangeLabel(days) {
  const first = days[0];
  const last = days[days.length - 1];
  const month = i18n.dict('date').monthShort || [];
  const format = (date) => {
    const parts = date.split('-').map(Number);
    return i18n.getLocale() === 'en'
      ? `${month[parts[1] - 1] || parts[1]} ${parts[2]}`
      : i18n.t('week.monthDay', { month: parts[1], day: parts[2] });
  };
  return i18n.t('week.range', { start: format(first), end: format(last) });
}

function emptyLabel(start, end) {
  if (start === end) return i18n.t('week.emptyOne', { day: i18n.fmt.dayHeading(start) });
  return i18n.t('week.emptyDays', {
    start: i18n.fmt.dayHeading(start),
    end: i18n.fmt.dayHeading(end),
  });
}

function leaderWeekView(options) {
  const config = options || {};
  const state = config.state || {};
  const refs = config.refs || reference;
  const viewerTz = config.viewerTz || HOME_TZ;
  const now = asDate(config.now) || new Date();
  const actor = config.actor || null;
  const staff = isStaffActor(actor);
  const leaders = staff ? staffLeaderList(actor, refs, config.ctx) : [];
  const requestedLeaderId = config.leaderId;
  const activeLeaderId = staff
    ? (leaders.some((leader) => leader.id === requestedLeaderId)
        ? requestedLeaderId
        : leaders[0] && leaders[0].id) || null
    : null;
  const leaderSwitcher = leaders.map((leader) => ({
    ...leader,
    active: leader.id === activeLeaderId,
  }));
  const todayDate = tz.toZoned(now, viewerTz).date;
  const requestedDate = config.date || todayDate;
  const weekDates = dates.weekDays(requestedDate, i18n.firstDayOfWeek());
  const sourceItems = leaderVisibleItems(actor, state.items || [], config.ctx).filter(
    (item) => !staff || (activeLeaderId && (item.leaderIds || []).includes(activeLeaderId)),
  );
  const sourceVehicles = leaderVisibleVehicles(actor, state.vehicles || [], config.ctx).filter(
    (vehicle) => !staff || (activeLeaderId && vehicle.forLeaderId === activeLeaderId),
  );
  // The leader entry that drives markers and the pending filter: the viewer's own entry, or
  // for staff the selected leader's entry.
  const ownPending = (record) => {
    const own = staff
      ? (record.leaders || []).find((entry) => entry.leaderId === activeLeaderId)
      : ownLeader(record, actor);
    return Boolean(own && own.confirm === 'pending');
  };
  const nonStops = sourceItems.filter((item) => item.kind !== 'stop');
  const entries = [
    ...nonStops.map((record) => ({
      record,
      kind: record.kind,
      dates: itemDates(record, viewerTz),
    })),
    ...sourceVehicles.map((record) => ({
      record,
      kind: 'vehicle',
      dates: vehicleDates(record, viewerTz),
    })),
  ].filter((entry) => entry.dates.some((date) => weekDates.includes(date)));
  const visibleEntries = entries.filter((entry) => {
    if (!config.filter) return true;
    const normalized =
      config.filter === 'meeting'
        ? 'meetings'
        : config.filter === 'travel'
          ? 'trips'
          : ['pendingConfirmation', 'pending-confirmation', 'confirmation'].includes(config.filter)
            ? 'pending'
            : config.filter;
    if (normalized === 'pending') return ownPending(entry.record);
    if (normalized === 'meetings') return entry.kind === 'meeting';
    if (normalized === 'trips') return entry.kind === 'travel' || entry.kind === 'trip';
    if (normalized === 'visits') return entry.kind === 'visit';
    return true;
  });
  const orderedDates = (() => {
    if (!weekDates.includes(todayDate)) return weekDates;
    // The home view puts today first, then later week days, then the earlier days.
    const index = weekDates.indexOf(todayDate);
    return weekDates.slice(index).concat(weekDates.slice(0, index));
  })();
  const rawDays = orderedDates.map((date) => {
    const dayEntries = visibleEntries
      .filter((entry) => entry.dates.includes(date))
      .sort((left, right) => {
        const a = startInstant(left.record) || asDate(left.record.departAt);
        const b = startInstant(right.record) || asDate(right.record.departAt);
        return (
          (a ? a.getTime() : 0) - (b ? b.getTime() : 0) ||
          String(left.record.id).localeCompare(String(right.record.id))
        );
      });
    return {
      date,
      heading: i18n.fmt.dayHeading(date),
      isToday: date === todayDate,
      empty: dayEntries.length === 0,
      items: dayEntries.map((entry) =>
        viewItem(
          entry.record,
          entry.kind,
          date,
          { ...config, refs, viewerTz, actor, staffLeaderId: activeLeaderId },
          sourceItems,
        ),
      ),
    };
  });
  const days = [];
  for (let index = 0; index < rawDays.length; index += 1) {
    if (!rawDays[index].empty) {
      days.push(rawDays[index]);
      continue;
    }
    let end = index;
    // Merge only calendar-consecutive days: the today-first order wraps around the week.
    while (
      end + 1 < rawDays.length &&
      rawDays[end + 1].empty &&
      rawDays[end + 1].date === dates.addDays(rawDays[end].date, 1)
    )
      end += 1;
    days.push({ empty: true, label: emptyLabel(rawDays[index].date, rawDays[end].date) });
    index = end;
  }
  // Tiles count the whole week, so choosing one tile does not hide the others.
  const count = (kind) =>
    entries.filter((entry) => {
      if (kind === 'pending') return ownPending(entry.record);
      if (kind === 'meetings') return entry.kind === 'meeting';
      if (kind === 'trips') return entry.kind === 'travel' || entry.kind === 'trip';
      return entry.kind === 'visit';
    }).length;
  const tileDefs = [
    ['pending', 'week.overview.pending', 'pending'],
    ['meetings', 'week.overview.meetings', 'meetings'],
    ['trips', 'week.overview.trips', 'trips'],
    ['visits', 'week.overview.visits', 'visits'],
  ];
  const overview = tileDefs
    .map(([key, labelKey, countKey]) => ({
      key,
      labelKey,
      label: i18n.t(labelKey),
      count: count(countKey),
      active: config.filter === key,
    }))
    .filter((tile) => tile.count > 0);
  const mode = config.mode === 'today' ? 'today' : 'week';
  // Today mode keeps the day object even when it has no items; empty-row compaction
  // is a week-only presentation concern.
  const shownDays = mode === 'today' ? rawDays.filter((day) => day.date === todayDate) : days;
  const result = {
    title: i18n.t('week.title'),
    rangeLabel: rangeLabel(weekDates),
    mode,
    todayDate,
    weekDates,
    overview,
    days: shownDays,
    leaders: leaderSwitcher,
  };
  if (staff && !activeLeaderId) result.emptyReason = i18n.t('week.noSupportedLeaders');
  return result;
}

module.exports = { leaderWeekView };
