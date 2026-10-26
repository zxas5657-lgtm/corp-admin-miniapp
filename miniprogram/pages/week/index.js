const i18nBehavior = require('../../behaviors/i18n');
const i18n = require('../../i18n/index');
const reference = require('../../data/reference');
const clock = require('../../domain/clock');
const dates = require('../../domain/dates');
const { leaderWeekView } = require('../../viewmodels/week');
const { getStore } = require('../../store/index');
const { session } = require('../../utils/session');
const { prepareTab } = require('../../utils/shell');
const { refreshVehicleBadge } = require('../../utils/badge');
const data = require('../../utils/data');

const TILE_ICON = {
  meetings: 'meeting',
  trips: 'trip',
  visits: 'visit'
};

function activeZone(fallback) {
  try {
    const app = getApp();
    const zone = app && app.globalData && app.globalData.viewerTzOverride;
    if (zone) return zone;
  } catch (err) {
    // The demo override is optional.
  }
  return fallback;
}

function profileOf() {
  const actor = session(getStore()).actor;
  const person = actor ? reference.personById(actor.personId) : null;
  const name = person ? i18n.localName(person) : '';
  const chars = Array.from(name);
  let initial = '';
  if (chars.length) {
    initial = i18n.getLocale() === 'en' ? chars[0].toUpperCase() : chars[0];
  }
  return { name: name, initial: initial };
}

function readChrome() {
  const fallback = {
    statusBarHeight: 20,
    navHeight: 64,
    padRight: 96,
    menuHeight: 32
  };
  try {
    const sys = wx.getSystemInfoSync();
    const width = sys.windowWidth || 375;
    const statusBarHeight = sys.statusBarHeight || 20;
    let menu = null;
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      menu = wx.getMenuButtonBoundingClientRect();
    }
    if (!menu || !menu.height) {
      return {
        statusBarHeight: statusBarHeight,
        navHeight: statusBarHeight + 44,
        padRight: 96,
        menuHeight: 32
      };
    }
    const gap = Math.max(menu.top - statusBarHeight, 4);
    return {
      statusBarHeight: statusBarHeight,
      navHeight: menu.bottom + gap,
      padRight: Math.max(width - menu.left + 8, 12),
      menuHeight: menu.height
    };
  } catch (err) {
    return fallback;
  }
}

function readLoadFailed() {
  try {
    const app = getApp();
    const result = app && app.globalData && app.globalData.loadResult;
    return Boolean(result && result.ok === false);
  } catch (err) {
    return false;
  }
}

function writeLoadResult(result) {
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.loadResult = result;
  } catch (err) {
    // The error flag must not break the page.
  }
}

function storagePatch(page) {
  return {
    phase: 'error',
    loadFailed: true,
    authReady: true,
    errorCode: 'storage.readFailed',
    errorTitle: page.t('state.genericErrorTitle'),
    errorBody: page.t('state.genericErrorBody'),
    retryText: page.t('state.retry')
  };
}

function spanKey(date, zone) {
  const window = data.weekWindow(date, zone);
  if (!window) return '';
  return window.from + '|' + window.to;
}

function joinParts(parts) {
  const values = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i]) values.push(parts[i]);
  }
  return values.join(' · ');
}

function metaLine(typeLabel, place) {
  if (typeLabel && place) return typeLabel + ' · ' + place;
  return typeLabel || place || '';
}

function stopLine(key, label, stop) {
  if (!stop) return null;
  const value = joinParts([stop.time, stop.place, stop.client]);
  if (!value) return null;
  return { key: key, label: label, value: value };
}

function tripLines(detail, translate) {
  const lines = [];
  const departure = stopLine(
    'depart',
    translate('week.detail.departure'),
    detail.departure
  );
  if (departure) lines.push(departure);
  const stops = detail.stops || [];
  for (let i = 0; i < stops.length; i += 1) {
    const row = stopLine('stop-' + i, translate('week.detail.stop'), stops[i]);
    if (row) lines.push(row);
  }
  const returning = stopLine('return', translate('week.detail.return'), detail.return);
  if (returning) lines.push(returning);
  const meetings = detail.meetings || [];
  for (let i = 0; i < meetings.length; i += 1) {
    const meeting = meetings[i];
    const value = joinParts([meeting.title, meeting.time, meeting.room]);
    if (!value) continue;
    lines.push({
      key: 'meet-' + (meeting.id || i),
      label: translate('week.detail.meetings'),
      value: value
    });
  }
  return lines;
}

function meetingLines(detail, translate) {
  const lines = [];
  if (detail.time) {
    lines.push({
      key: 'time',
      label: translate('meeting.detail.time'),
      value: detail.time
    });
  }
  if (detail.room) {
    lines.push({
      key: 'room',
      label: translate('meeting.detail.room'),
      value: detail.room
    });
  }
  if (detail.organizer) {
    lines.push({
      key: 'organizer',
      label: translate('meeting.detail.organizer'),
      value: detail.organizer
    });
  }
  if (detail.attendees && detail.attendees.length) {
    lines.push({
      key: 'attendees',
      label: translate('meeting.detail.attendees'),
      value: i18n.listJoin(detail.attendees)
    });
  }
  return lines;
}

function visitLines(detail, translate) {
  const lines = [];
  if (detail.visitorName) {
    lines.push({
      key: 'visitor',
      label: translate('week.detail.visitor'),
      value: detail.visitorName
    });
  }
  if (detail.organisation) {
    lines.push({
      key: 'org',
      label: translate('week.detail.organisation'),
      value: detail.organisation
    });
  }
  if (detail.host) {
    lines.push({
      key: 'host',
      label: translate('week.detail.host'),
      value: detail.host
    });
  }
  return lines;
}

function vehicleLines(detail, translate) {
  const lines = [];
  if (detail.destination) {
    lines.push({
      key: 'destination',
      label: translate('week.detail.destination'),
      value: detail.destination
    });
  }
  if (detail.car) {
    lines.push({
      key: 'car',
      label: translate('week.detail.car'),
      value: detail.car
    });
  }
  if (detail.driver) {
    lines.push({
      key: 'driver',
      label: translate('week.detail.driver'),
      value: detail.driver
    });
  }
  return lines;
}

function detailLines(item, translate) {
  const detail = item.detail || {};
  if (item.kind === 'travel' || item.kind === 'trip') return tripLines(detail, translate);
  if (item.kind === 'meeting') return meetingLines(detail, translate);
  if (item.kind === 'visit') return visitLines(detail, translate);
  if (item.kind === 'vehicle') return vehicleLines(detail, translate);
  return [];
}

function decorate(view, translate) {
  const overview = view.overview || [];
  for (let i = 0; i < overview.length; i += 1) {
    overview[i].icon = TILE_ICON[overview[i].key] || '';
  }
  const days = view.days || [];
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    day.key = day.date || ('e' + i);
    const items = day.items || [];
    for (let j = 0; j < items.length; j += 1) {
      const item = items[j];
      const markers = item.markers || [];
      item.showPending = markers.indexOf('pending') !== -1;
      item.showUpdated = markers.indexOf('updated') !== -1;
      item.showImportant = markers.indexOf('important') !== -1;
      item.showCancelled = markers.indexOf('cancelled') !== -1;
      item.meta = metaLine(translate('type.' + item.icon), item.place);
      item.lines = detailLines(item, translate);
    }
  }
  return view;
}

function filledDates(view) {
  const found = {};
  const days = view.days || [];
  for (let i = 0; i < days.length; i += 1) {
    if (days[i].date && !days[i].empty) found[days[i].date] = true;
  }
  return found;
}

function buildStrip(full, selected, translate) {
  const names = translate('date.weekdayShort') || [];
  const filled = filledDates(full);
  const source = full.weekDates || [];
  const days = [];
  for (let i = 0; i < source.length; i += 1) {
    const date = source[i];
    days.push({
      date: date,
      weekday: names[dates.weekdayOf(date)] || '',
      dayNum: Number(date.slice(-2)),
      isToday: date === full.todayDate,
      isSelected: date === selected,
      hasItems: Boolean(filled[date])
    });
  }
  return {
    days: days,
    prevDate: dates.addDays(selected, -7),
    nextDate: dates.addDays(selected, 7)
  };
}

function motionStyles(view) {
  let count = 0;
  function next() {
    const index = count;
    count += 1;
    if (index >= 8) return '';
    return 'animation-delay:' + (index * 60) + 'ms;';
  }
  const hero = next();
  const modes = next();
  const strip = next();
  const tiles = [];
  const overview = view.overview || [];
  for (let i = 0; i < overview.length; i += 1) tiles.push(next());
  const groups = [];
  const days = view.days || [];
  for (let i = 0; i < days.length; i += 1) groups.push(next());
  return { hero: hero, modes: modes, strip: strip, tiles: tiles, days: groups };
}

function weekStamp(view) {
  return (view.weekDates || []).join(',');
}

function weekEmpty(days) {
  if (!days || !days.length) return true;
  for (let i = 0; i < days.length; i += 1) {
    if (!days[i].empty) return false;
  }
  return true;
}

function findItem(view, id) {
  const days = view && view.days ? view.days : [];
  for (let i = 0; i < days.length; i += 1) {
    const items = days[i].items || [];
    for (let j = 0; j < items.length; j += 1) {
      if (items[j].id === id) return items[j];
    }
  }
  return null;
}

Component({
  behaviors: [i18nBehavior],
  data: {
    i18nKeys: ['week', 'type', 'state', 'a11y', 'common'],
    tabKey: 'week',
    tabSurface: 'canvas',
    authReady: false,
    phase: 'loading',
    view: null,
    strip: null,
    motion: { hero: '', modes: '', strip: '', tiles: [], days: [] },
    motionOn: false,
    weekEmpty: false,
    loadFailed: false,
    errorTitle: '',
    errorBody: '',
    errorCode: '',
    retryText: '',
    notice: '',
    name: '',
    initial: '',
    backText: '',
    selectedDate: '',
    expandedId: '',
    writing: false,
    noteOpen: false,
    noteText: '',
    noteCount: 0,
    noteCounter: '',
    noteError: '',
    questionOpen: false,
    questionId: '',
    questionRev: 0,
    questionReason: '',
    questionError: '',
    chrome: {
      statusBarHeight: 20,
      navHeight: 64,
      padRight: 96,
      menuHeight: 32
    }
  },
  lifetimes: {
    attached() {
      const page = this;
      this._mode = 'week';
      this._filter = '';
      this._anchor = '';
      this._state = null;
      this._refs = null;
      this._seeing = {};
      this._writing = false;
      this._motionKey = null;
      this._motionReady = false;
      this._gate = data.createGate();
      this.setData({ chrome: readChrome() });
      this._offData = data.onChange(function () {
        if (page._shown) page.load();
      });
    },
    detached() {
      this.stopClock();
      if (typeof this._offData === 'function') this._offData();
      this._offData = null;
    }
  },
  pageLifetimes: {
    show() {
      const page = this;
      this._shown = true;
      this.setData({ chrome: readChrome() });
      prepareTab('week').then(function (ready) {
        if (!page._shown || !ready.ok) return;
        page.setData({ authReady: true });
        refreshVehicleBadge(page);
        page.load();
        page.startClock();
        page.consumeNoteFlag();
      });
    },
    hide() {
      this._shown = false;
      this.stopClock();
    }
  },
  methods: {
    onLocaleChange() {
      const who = profileOf();
      const patch = { name: who.name, initial: who.initial };
      if (this.data.noteOpen) {
        patch.noteCounter = this.t('week.note.counter', {
          n: this.data.noteCount || 0
        });
      }
      if (this.data.questionOpen && this.data.questionError) {
        patch.questionError = this.t('error.item.decline.reasonRequired');
      }
      if (this.data.loadFailed) {
        Object.assign(patch, storagePatch(this));
      } else if (this.data.phase === 'error') {
        Object.assign(patch, data.failurePatch(this.data.errorCode, this.t.bind(this)));
      }
      this.setData(patch);
      if (this._state && this.data.phase === 'ready') this.render();
    },
    consumeNoteFlag() {
      let open = false;
      try {
        const app = getApp();
        if (app && app.globalData && app.globalData.openLeaderNote) {
          app.globalData.openLeaderNote = false;
          open = true;
        }
      } catch (err) {
        open = false;
      }
      if (open) this.openLeaderNote();
    },
    load(options) {
      const opts = options || {};
      const page = this;
      if (typeof this.t !== 'function') return;
      if (readLoadFailed()) {
        this.setData(storagePatch(this));
        return;
      }
      const token = this._gate.next();
      const hadView = Boolean(this.data.view) && this.data.phase === 'ready';
      if (!hadView) this.setData({ phase: 'loading', loadFailed: false, authReady: true });
      const store = getStore();
      const current = session(store);
      const zone = activeZone(current.viewerTz);
      const span = data.weekWindow(store.ui.getSelectedDate(), zone);
      Promise.all([
        data.loadDirectory({ fresh: Boolean(opts.fresh) }),
        data.loadRange(span, { fresh: Boolean(opts.fresh) })
      ]).then(function (results) {
        if (!page._gate.isCurrent(token)) return;
        const directory = results[0];
        const range = results[1];
        if (!directory.ok || !range.ok) {
          const code = !directory.ok ? directory.code : range.code;
          if (hadView) return;
          page.setData(Object.assign(
            { authReady: true, loadFailed: false },
            data.failurePatch(code, page.t.bind(page))
          ));
          return;
        }
        page._refs = directory.refs;
        page._state = range.state;
        page.render();
      });
    },
    render() {
      if (typeof this.t !== 'function' || !this._state) return;
      const store = getStore();
      const current = session(store);
      const zone = activeZone(current.viewerTz);
      const selected = store.ui.getSelectedDate();
      this._anchor = selected;
      const config = {
        state: this._state,
        refs: this._refs,
        date: selected,
        now: clock.now(),
        actor: current.actor,
        viewerTz: zone,
        ctx: current.ctx
      };
      const full = leaderWeekView(Object.assign({}, config, {
        mode: 'week',
        filter: ''
      }));
      const view = decorate(leaderWeekView(Object.assign({}, config, {
        mode: this._mode,
        filter: this._filter || ''
      })), this.t.bind(this));
      this.releaseSeen(view);
      const who = profileOf();
      const stamp = weekStamp(full);
      const replay = this._motionKey !== stamp;
      this._motionKey = stamp;
      const patch = {
        phase: 'ready',
        authReady: true,
        loadFailed: false,
        view: view,
        strip: buildStrip(full, selected, this.t.bind(this)),
        weekEmpty: this._mode !== 'today' && !this._filter && weekEmpty(full.days),
        backText: selected === full.todayDate ? '' : this.t('week.backToToday'),
        selectedDate: selected,
        name: who.name,
        initial: who.initial,
        motion: motionStyles(view)
      };
      const page = this;
      if (!this._motionReady) {
        this._motionReady = true;
        patch.motionOn = true;
        this.setData(patch);
        return;
      }
      if (replay) {
        patch.motionOn = false;
        this.setData(patch, function () {
          page.setData({ motionOn: true });
        });
        return;
      }
      this.setData(patch);
    },
    releaseSeen(view) {
      const days = view.days || [];
      for (let i = 0; i < days.length; i += 1) {
        const items = days[i].items || [];
        for (let j = 0; j < items.length; j += 1) {
          if (!items[j].showUpdated) delete this._seeing[items[j].id];
        }
      }
    },
    shiftDate(date) {
      if (!date || date === this._anchor) return;
      const zone = activeZone(session(getStore()).viewerTz);
      const prev = spanKey(this._anchor || date, zone);
      getStore().ui.setSelectedDate(date);
      this._anchor = date;
      if (spanKey(date, zone) === prev && this._state) this.render();
      else this.load();
    },
    onSelectDate(event) {
      const date = event.currentTarget.dataset.date;
      this.shiftDate(date);
    },
    onPickDate(event) {
      const date = event.detail && event.detail.value;
      this.shiftDate(date);
    },
    onBackToday() {
      const today = this.data.view && this.data.view.todayDate;
      this.shiftDate(today);
    },
    onMode(event) {
      const mode = event.currentTarget.dataset.mode;
      if (mode !== 'today' && mode !== 'week') return;
      if (this._mode === mode) return;
      this._mode = mode;
      if (this._state) this.render();
    },
    onTile(event) {
      const key = event.currentTarget.dataset.key;
      if (!key) return;
      this._filter = this._filter === key ? '' : key;
      if (this._state) this.render();
    },
    onToggle(event) {
      const id = event.currentTarget.dataset.id;
      if (!id) return;
      const next = this.data.expandedId === id ? '' : id;
      this.setData({ expandedId: next });
      if (!next || this._writing || this._seeing[id]) return;
      const item = findItem(this.data.view, id);
      if (!item || !item.showUpdated) return;
      this._seeing[id] = true;
      this.runWrite('markSeen', { id: id, expectedRev: item.expectedRev });
    },
    onHold() {},
    onConfirm(event) {
      if (this._writing) return;
      const id = event.currentTarget.dataset.id;
      const item = findItem(this.data.view, id);
      if (!item) return;
      this.runWrite('confirmItem', { id: id, expectedRev: item.expectedRev });
    },
    onQuestion(event) {
      if (this._writing) return;
      const id = event.currentTarget.dataset.id;
      const item = findItem(this.data.view, id);
      if (!item) return;
      this.setData({
        questionOpen: true,
        questionId: id,
        questionRev: item.expectedRev,
        questionReason: '',
        questionError: ''
      });
      this.syncBars(true);
    },
    onQuestionInput(event) {
      const value = event.detail && event.detail.value ? event.detail.value : '';
      this.setData({ questionReason: value, questionError: '' });
    },
    onCloseQuestion() {
      if (this._writing) return;
      this.setData({ questionOpen: false, questionError: '' });
      this.syncBars(false);
    },
    onSendQuestion() {
      if (this._writing) return;
      const reason = (this.data.questionReason || '').trim();
      if (!reason) {
        this.setData({ questionError: this.t('error.item.decline.reasonRequired') });
        return;
      }
      const item = findItem(this.data.view, this.data.questionId);
      const rev = item ? item.expectedRev : this.data.questionRev;
      this.runWrite('declineItem', {
        id: this.data.questionId,
        expectedRev: rev,
        reason: reason
      });
    },
    openLeaderNote() {
      if (this._writing) return;
      this.setData({
        noteOpen: true,
        noteText: '',
        noteCount: 0,
        noteCounter: this.t('week.note.counter', { n: 0 }),
        noteError: ''
      });
      this.syncBars(true);
    },
    onNoteInput(event) {
      const raw = event.detail && event.detail.value ? event.detail.value : '';
      const text = raw.length > 200 ? raw.slice(0, 200) : raw;
      this.setData({
        noteText: text,
        noteCount: text.length,
        noteCounter: this.t('week.note.counter', { n: text.length }),
        noteError: ''
      });
    },
    onCloseNote() {
      if (this._writing) return;
      this.setData({ noteOpen: false, noteError: '' });
      this.syncBars(false);
    },
    onSendNote() {
      if (this._writing) return;
      const text = this.data.noteText || '';
      if (!text.trim()) {
        this.setData({ noteError: this.t('error.note.text.required') });
        return;
      }
      if (text.trim().length > 200) {
        this.setData({ noteError: this.t('error.note.text.tooLong') });
        return;
      }
      this.runWrite('createNote', { text: text });
    },
    runWrite(method, payload) {
      if (this._writing) return;
      this._writing = true;
      this.setData({ writing: true });
      const page = this;
      data.write(method, payload).then(function (result) {
        page._writing = false;
        if (!result || result.ok !== true) {
          const code = result && result.code ? result.code : 'network.failed';
          if (method === 'markSeen') delete page._seeing[payload.id];
          if (data.isRevConflict(code)) {
            page.setData({
              writing: false,
              questionOpen: false,
              noteOpen: false,
              notice: page.t('state.changedByOther')
            });
            page.syncBars(false);
            page.load({ fresh: true });
            return;
          }
          const patch = { writing: false };
          if (method === 'createNote' && page.data.noteOpen) {
            patch.noteError = page.t('error.' + code);
          } else if (method === 'declineItem' && page.data.questionOpen) {
            patch.questionError = page.t('error.' + code);
          } else {
            patch.notice = page.t('error.' + code);
            patch.questionOpen = false;
            patch.noteOpen = false;
            page.syncBars(false);
          }
          page.setData(patch);
          return;
        }
        if (method === 'createNote') {
          page.setData({
            writing: false,
            noteOpen: false,
            noteText: '',
            noteError: ''
          });
          page.syncBars(false);
          try {
            wx.showToast({ title: page.t('week.note.sent'), icon: 'none' });
          } catch (err) {
            // The toast must not break the page.
          }
          return;
        }
        page.setData({
          writing: false,
          questionOpen: false,
          questionError: '',
          questionReason: ''
        });
        page.syncBars(false);
        page.load({ fresh: true });
      });
    },
    syncBars(hidden) {
      try {
        const bar = this.getTabBar && this.getTabBar();
        if (bar && typeof bar.setHidden === 'function') bar.setHidden(Boolean(hidden));
      } catch (err) {
        // A missing tab bar must not break the page.
      }
    },
    onCloseNotice() {
      this.setData({ notice: '' });
    },
    onRetry() {
      if (this.data.loadFailed) {
        const result = getStore().load();
        writeLoadResult(result);
        if (!result || result.ok !== true) {
          this.setData(storagePatch(this));
          return;
        }
        data.resetSession();
      }
      this.load({ fresh: true });
    },
    onReset() {
      const result = getStore().resetDemo();
      if (result && result.ok === true) {
        writeLoadResult({ ok: true });
        data.resetSession();
      }
      this.load({ fresh: true });
    },
    startClock() {
      this.stopClock();
      const page = this;
      this._clock = setInterval(function () {
        if (typeof page.applySeason === 'function') page.applySeason();
        if (page._state && page.data.phase === 'ready') page.render();
        else page.load();
      }, 60000);
    },
    stopClock() {
      if (this._clock) {
        clearInterval(this._clock);
        this._clock = null;
      }
    }
  }
});
