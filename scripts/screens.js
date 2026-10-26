'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const automator = require('miniprogram-automator');
const tz = require('../miniprogram/domain/tz');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'screenshots');
const CLI_PATH = process.env.WX_CLI || 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const LOCALES = ['zh-CN', 'en'];
const DATA_KEY = 'corp-admin-v2';
const PAUSE_MS = 500;
const AUTO_PORT = Number(process.env.WX_AUTO_PORT) || 9420;
let currentMini = null;

function wall(date, time) {
  return tz.fromZoned(date, time, 'Asia/Shanghai').toISOString();
}

const SHOT_DATE = '2026-10-24';
const SHOT_CREATED = wall('2026-10-24', '09:20');
const SHOT_MEETING = {
  id: 'm-shot',
  kind: 'meeting',
  title: { 'zh-CN': '截图会议', en: 'Screenshot meeting' },
  startAt: wall(SHOT_DATE, '11:00'),
  endAt: wall(SHOT_DATE, '12:00'),
  allDay: false,
  tz: 'Asia/Shanghai',
  location: '',
  roomId: 'f1-reception',
  attendeeIds: ['p-lin', 'p-chen'],
  organizerId: 'p-lin',
  category: 'regular',
  important: false,
  parentId: null,
  seriesId: null,
  notes: { 'zh-CN': '截图用', en: 'For the screenshot pass' },
  noteId: null,
  leaderIds: ['p-chen'],
  leaders: [{
    leaderId: 'p-chen',
    confirm: 'pending',
    confirmedAt: null,
    declineReason: '',
    changedAt: null,
    changeNote: '',
    seenAt: null,
  }],
  status: 'active',
  createdBy: 'p-lin',
  createdAt: SHOT_CREATED,
  updatedAt: SHOT_CREATED,
  updatedBy: 'p-lin',
  cancelledAt: null,
  cancelledBy: null,
  v: 1,
  rev: 0,
};

const BUSY_VEHICLE = {
  id: 'v-busy',
  reason: { 'zh-CN': '重叠行程', en: 'Overlapping trip' },
  destination: { 'zh-CN': '园区', en: 'Campus' },
  departAt: wall('2026-10-27', '09:20'),
  tz: 'Asia/Shanghai',
  passengers: 1,
  applicantId: 'p-lin',
  forLeaderId: null,
  itemId: null,
  note: '',
  status: 'assigned',
  carId: 'gl8a',
  driverId: 'p-zhao',
  rejectReason: '',
  createdAt: SHOT_CREATED,
  dispatchedAt: SHOT_CREATED,
  dispatchedBy: 'p-lin',
  completedAt: null,
  rev: 0,
};

function dev(mini, method, value) {
  return mini.evaluate(function (name, payload) {
    var hook = getApp().globalData.__dev;
    if (!hook || typeof hook[name] !== 'function') {
      throw new Error('dev hook missing: ' + name);
    }
    if (payload === undefined) return hook[name]();
    return hook[name](payload);
  }, method, value);
}

async function openInSeason(mini, locale, setting, url) {
  await resetSeed(mini, locale, 'secretary');
  const saved = await dev(mini, 'setSeason', setting);
  if (!saved || saved.ok !== true) {
    throw new Error('setSeason failed: ' + setting);
  }
  const page = await openPage(mini, url);
  const expected = setting === 'brand' ? 'season-summer' : 'season-' + setting;
  let actual = '';
  for (let i = 0; i < 25; i += 1) {
    actual = await page.data('seasonClass');
    if (actual === expected && await page.data('phase') === 'ready') return page;
    await page.waitFor(200);
  }
  throw new Error(url + ' season ' + actual + ' expected ' + expected);
}

async function resetSeed(mini, locale, role) {
  await dev(mini, 'setApiStub', null);
  await mini.callWxMethod('clearStorageSync');
  const loaded = await dev(mini, 'reload');
  if (!loaded || loaded.ok !== true) {
    throw new Error('reload did not restore seed: ' + JSON.stringify(loaded));
  }
  const localeResult = await dev(mini, 'setLocale', locale);
  if (!localeResult || localeResult.ok !== true) {
    throw new Error('setLocale failed for ' + locale);
  }
  const roleResult = await dev(mini, 'setRole', role);
  if (!roleResult || roleResult.ok !== true) {
    throw new Error('setRole failed for ' + role);
  }
  await dev(mini, 'clearFocus');
  await dev(mini, 'setAuthStub', null);
  await dev(mini, 'setPrivacyAccepted', true);
}

async function openPage(mini, url) {
  const page = await mini.reLaunch(url);
  if (!page) throw new Error('reLaunch returned no page: ' + url);
  await page.waitFor(PAUSE_MS);
  return page;
}

// page.callMethod cannot see methods on Component()-built pages, so call the
// method on the top page instance from getCurrentPages() instead.
async function callPage(page, method, arg) {
  await page.waitFor(0);
  await currentMini.evaluate(function (name, payload) {
    var pages = getCurrentPages();
    var top = pages[pages.length - 1];
    if (!top || typeof top[name] !== 'function') throw new Error('page method missing: ' + name);
    if (payload === undefined) top[name]();
    else top[name](payload);
  }, method, arg);
  await page.waitFor(PAUSE_MS);
}

async function saveShot(mini, locale, fileName) {
  const dir = path.join(OUT_DIR, locale);
  fs.mkdirSync(dir, { recursive: true });
  await mini.screenshot({ path: path.join(dir, fileName) });
}

function eventWith(key, value) {
  return { currentTarget: { dataset: { [key]: value } } };
}

async function tabKeys(mini) {
  return mini.evaluate(function () {
    var pages = getCurrentPages();
    var page = pages[pages.length - 1];
    var bar = page && page.getTabBar && page.getTabBar();
    var list = bar && bar.data && bar.data.list ? bar.data.list : [];
    return list.map(function (item) { return item.key; });
  });
}

function scheduleIds(view) {
  return ((view && view.items) || []).map(function (item) { return item.id; });
}

function vehicleIds(view) {
  const ids = [];
  ((view && view.groups) || []).forEach(function (group) {
    (group.items || []).forEach(function (item) { ids.push(item.id); });
  });
  return ids;
}

async function stageBusyCar(mini, passengers) {
  const saved = await dev(mini, 'updateVehicle', BUSY_VEHICLE);
  if (!saved || saved.ok !== true) {
    throw new Error('could not stage the busy car');
  }
  if (!passengers) return;
  const state = await dev(mini, 'getState');
  const vehicles = state && state.vehicles ? state.vehicles : [];
  const current = vehicles.find(function (item) { return item.id === 'v4'; });
  if (!current) throw new Error('seed vehicle v4 is missing');
  current.passengers = passengers;
  const updated = await dev(mini, 'updateVehicle', current);
  if (!updated || updated.ok !== true) {
    throw new Error('could not raise v4 passengers');
  }
}

async function rearmCreatedMeeting(mini) {
  await mini.evaluate(function (id) {
    var pages = getCurrentPages();
    var page = pages[pages.length - 1];
    if (!page || typeof page.refresh !== 'function' || typeof page.armHighlight !== 'function') {
      throw new Error('schedule page methods are not callable from getCurrentPages');
    }
    page._focusId = id;
    page.armHighlight();
    page.refresh({ banner: true, scrollId: id });
  }, SHOT_MEETING.id);
}

const SCENARIOS = [
  {
    id: '01-schedule-1024',
    title: 'Schedule 2026-10-24, secretary',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setDate', '2026-10-24');
      await openPage(mini, '/pages/schedule/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '02-schedule-1025',
    title: 'Schedule 2026-10-25, empty',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setDate', '2026-10-25');
      await openPage(mini, '/pages/schedule/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '03-schedule-created',
    title: 'Schedule after creating a meeting',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const saved = await dev(mini, 'addItem', SHOT_MEETING);
      if (!saved || saved.ok !== true) throw new Error('addItem failed');
      await dev(mini, 'focus', {
        date: SHOT_DATE,
        meetingId: SHOT_MEETING.id,
        banner: true,
      });
      const page = await openPage(mini, '/pages/schedule/index');
      await rearmCreatedMeeting(mini);
      await page.waitFor(400);
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '04-meetings-secretary',
    title: 'Meetings list, secretary',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await openPage(mini, '/pages/meetings/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '05-meetings-filtered-empty',
    title: 'Meetings list filtered to empty',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/meetings/index');
      await callPage(page, 'onFilter', eventWith('key', 'cancelled'));
      if (await page.data('filter') !== 'cancelled') {
        throw new Error('cancelled filter was not applied');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '06-meetings-driver',
    title: 'Meetings list, driver',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'driver');
      const page = await openPage(mini, '/pages/meetings/index');
      const button = await page.data('view.createButton');
      if (!button || button.disabled !== true || !button.reason) {
        throw new Error('driver create button is not disabled with a reason');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '07-meeting-m3',
    title: 'Meeting m3, organizer can cancel',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/meeting-detail/index?id=m3');
      const view = await page.data('view');
      if (!view || view.canCancel !== true) throw new Error('m3 cancel action is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '08-meeting-m3-cancel-sheet',
    title: 'Meeting m3 cancel sheet',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/meeting-detail/index?id=m3');
      await callPage(page, 'onOpenCancel');
      if (await page.data('cancelOpen') !== true) throw new Error('cancel sheet did not open');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '09-meeting-m2-cancel-refused',
    title: 'Meeting m2 cancel refused',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/meeting-detail/index?id=m2');
      await callPage(page, 'onConfirmCancel');
      const notice = await page.data('notice');
      if (!notice) throw new Error('cancel refusal notice is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '10-meeting-not-found',
    title: 'Meeting detail, missing id',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/meeting-detail/index?id=missing');
      const view = await page.data('view');
      if (!view || view.notFound !== true) throw new Error('not-found state is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '11-meeting-form-empty',
    title: 'Meeting form, empty',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await openPage(mini, '/pages/meeting-form/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '12-meeting-form-errors',
    title: 'Meeting form, inline errors',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/meeting-form/index');
      await callPage(page, 'onSubmit');
      const errors = await page.data('errors');
      if (!errors || !errors.title) throw new Error('meeting inline errors are missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '13-meeting-form-conflict',
    title: 'Meeting form, 5F Boardroom conflict',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/meeting-form/index');
      await callPage(page, 'setForm', {
        title: 'Board clash',
        date: '2026-10-26',
        start: '09:00',
        end: '10:00',
        roomId: 'f5-board',
      });
      await callPage(page, 'onSubmit');
      if (await page.data('conflictOpen') !== true) throw new Error('conflict sheet did not open');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '14-meeting-form-dirty',
    title: 'Meeting form, dirty-leave sheet',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/meeting-form/index');
      await callPage(page, 'setForm', { title: 'Draft' });
      await callPage(page, 'onBeforeLeave');
      if (await page.data('dirtyOpen') !== true) throw new Error('dirty-leave sheet did not open');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '15-vehicles-secretary',
    title: 'Vehicles, secretary mine',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await openPage(mini, '/pages/vehicles/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '16-vehicles-driver',
    title: 'Vehicles, driver to-do',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'driver');
      await openPage(mini, '/pages/vehicles/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '17-vehicles-receptionist',
    title: 'Vehicles, receptionist',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'receptionist');
      await openPage(mini, '/pages/vehicles/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '18-vehicle-v4-dispatch-busy',
    title: 'Vehicle v4 dispatch sheet, busy car',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await stageBusyCar(mini);
      const page = await openPage(mini, '/pages/vehicle-detail/index?id=v4');
      await callPage(page, 'openAction', 'dispatch');
      const view = await page.data('dispatchView');
      const busy = view && view.cars && view.cars.some(function (car) { return car.busyText; });
      if (await page.data('dispatchOpen') !== true || !busy) {
        throw new Error('dispatch sheet has no busy car');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '19-vehicle-v4-seat-warning',
    title: 'Vehicle v4 dispatch sheet, seat warning',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await stageBusyCar(mini, 5);
      const page = await openPage(mini, '/pages/vehicle-detail/index?id=v4');
      await callPage(page, 'openAction', 'dispatch');
      await callPage(page, 'onPickCar', eventWith('id', 'a6'));
      const view = await page.data('dispatchView');
      if (!view || !view.seatWarning) throw new Error('seat warning is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '20-vehicle-v4-reject-error',
    title: 'Vehicle v4 reject sheet, empty reason',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/vehicle-detail/index?id=v4');
      await callPage(page, 'openAction', 'reject');
      await callPage(page, 'onConfirmReject');
      if (await page.data('rejectOpen') !== true || !await page.data('rejectError')) {
        throw new Error('empty-reason error is missing');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '21-vehicle-v3-complete-refused',
    title: 'Vehicle v3 complete refused',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'driver');
      const page = await openPage(mini, '/pages/vehicle-detail/index?id=v3');
      await callPage(page, 'openAction', 'complete');
      await callPage(page, 'onConfirmAction');
      if (await page.data('confirmOpen') !== false || !await page.data('notice')) {
        throw new Error('complete refusal is missing');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '22-vehicle-v1-rejected',
    title: 'Vehicle v1 rejected',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/vehicle-detail/index?id=v1');
      const view = await page.data('view');
      if (!view || !view.rejectBanner) throw new Error('reject banner is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '23-vehicle-form-errors',
    title: 'Vehicle form, inline errors',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/vehicle-form/index');
      await callPage(page, 'onSubmit');
      const errors = await page.data('errors');
      if (!errors || !errors.reason) throw new Error('vehicle inline errors are missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '24-me-secretary',
    title: 'Me, secretary',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await openPage(mini, '/pages/me/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '25-me-language',
    title: 'Me, language sheet',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/me/index');
      await callPage(page, 'onOpenLanguage');
      if (await page.data('languageOpen') !== true) throw new Error('language sheet did not open');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '26-me-reset',
    title: 'Me, reset sheet',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/me/index');
      await callPage(page, 'onOpenReset');
      if (await page.data('resetOpen') !== true) throw new Error('reset sheet did not open');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '27-visitors',
    title: 'Visitors skeleton',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'receptionist');
      await openPage(mini, '/pages/visitors/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '28-daily',
    title: 'Daily skeleton',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await openPage(mini, '/pages/daily/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '29-dev-gallery-pseudo',
    title: 'Dev gallery, pseudo-locale',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/dev-gallery/index');
      await callPage(page, 'onTogglePseudo');
      if (await page.data('pseudoOn') !== true) throw new Error('pseudo-locale did not turn on');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '30-schedule-load-error',
    title: 'Schedule load error',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await mini.callWxMethod('setStorageSync', DATA_KEY, { version: 99 });
      const loaded = await dev(mini, 'reload');
      if (!loaded || loaded.ok !== false) {
        throw new Error('expected a failed reload, got ' + JSON.stringify(loaded));
      }
      const page = await openPage(mini, '/pages/schedule/index');
      if (await page.data('loadFailed') !== true) throw new Error('load-error state is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '31-schedule-1026-leader',
    title: 'Schedule 2026-10-26, leader',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'leader');
      await dev(mini, 'setDate', '2026-10-26');
      const page = await openPage(mini, '/pages/schedule/index');
      const ids = scheduleIds(await page.data('view'));
      if (!ids.includes('m4') || ids.includes('m6')) {
        throw new Error('leader schedule ids: ' + ids.join(','));
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '32-schedule-1026-secretary-admin',
    title: 'Schedule 2026-10-26, secretary admin',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretaryAdmin');
      await dev(mini, 'setDate', '2026-10-26');
      const page = await openPage(mini, '/pages/schedule/index');
      const ids = scheduleIds(await page.data('view'));
      if (!ids.includes('m6')) throw new Error('secretary admin schedule ids: ' + ids.join(','));
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '33-vehicles-leader',
    title: 'Vehicles, leader',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'leader');
      const page = await openPage(mini, '/pages/vehicles/index');
      const ids = vehicleIds(await page.data('view'));
      if (ids.length !== 1 || ids[0] !== 'v5') {
        throw new Error('leader vehicle ids: ' + ids.join(','));
      }
      const selected = await mini.evaluate(function () {
        var pages = getCurrentPages();
        var top = pages[pages.length - 1];
        var bar = top && top.getTabBar && top.getTabBar();
        return bar && bar.data ? bar.data.selected : 0;
      });
      if (selected !== -1) throw new Error('leader vehicles tab is selected');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '34-vehicle-v4-dispatch-drivers',
    title: 'Vehicle v4 dispatch sheet, driver row',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/vehicle-detail/index?id=v4');
      await callPage(page, 'openAction', 'dispatch');
      const drivers = await page.data('dispatchDrivers');
      const view = await page.data('dispatchView');
      if (await page.data('dispatchOpen') !== true || !drivers || drivers.length < 2) {
        throw new Error('driver row is missing');
      }
      if (!view || view.confirmDisabled !== true) {
        throw new Error('confirm should stay disabled until a driver is chosen');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '35-vehicles-driver-todo',
    title: 'Vehicles, driver assigned to-do',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'driver');
      const page = await openPage(mini, '/pages/vehicles/index');
      const ids = vehicleIds(await page.data('view'));
      if (!ids.includes('v3') || ids.includes('v4') || ids.includes('v5')) {
        throw new Error('driver to-do ids: ' + ids.join(','));
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '36-home-leader',
    title: 'Leader home tab set',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'leader');
      await openPage(mini, '/pages/schedule/index');
      const keys = await tabKeys(mini);
      if (keys.join(',') !== 'schedule,compose,me') {
        throw new Error('leader tabs: ' + keys.join(','));
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '37-home-secretary',
    title: 'Secretary home tab set',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await openPage(mini, '/pages/schedule/index');
      const keys = await tabKeys(mini);
      if (keys.join(',') !== 'schedule,todo,vehicles,me') {
        throw new Error('secretary tabs: ' + keys.join(','));
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '38-home-receptionist',
    title: 'Receptionist home tab set',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'receptionist');
      await openPage(mini, '/pages/visitors/index');
      const keys = await tabKeys(mini);
      if (keys.join(',') !== 'visitors,vehicles,me') {
        throw new Error('receptionist tabs: ' + keys.join(','));
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '39-home-driver',
    title: 'Driver home tab set',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'driver');
      await openPage(mini, '/pages/vehicles/index');
      const keys = await tabKeys(mini);
      if (keys.join(',') !== 'vehicles,me') {
        throw new Error('driver tabs: ' + keys.join(','));
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '40-todo-placeholder',
    title: 'To-do placeholder',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/todo/index');
      if (await page.data('authReady') !== true) throw new Error('todo did not open');
      const title = await page.data('i18n.todo.emptyTitle');
      if (!title) throw new Error('todo empty copy is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '41-bind-empty',
    title: 'Bind page, empty',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setAuthStub', { whoami: { ok: true, bound: false } });
      const page = await openPage(mini, '/pages/bind/index');
      if (await page.data('demoOnly') !== false) throw new Error('demo copy replaced the form');
      if (await page.data('canSubmit') !== false) throw new Error('empty code can submit');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '42-bind-typed',
    title: 'Bind page, code typed',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setAuthStub', { whoami: { ok: true, bound: false } });
      const page = await openPage(mini, '/pages/bind/index');
      await callPage(page, 'onCode', { detail: { value: 'ab cd-2345' } });
      if (await page.data('display') !== 'ABCD-2345') {
        throw new Error('code display: ' + await page.data('display'));
      }
      await callPage(page, 'onToggleConsent');
      if (await page.data('canSubmit') !== true) throw new Error('complete code stays disabled');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '43-bind-invalid',
    title: 'Bind page, invalid invite',
    async run(mini, locale) {
      await showBindError(mini, locale, 'auth.inviteInvalid');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '44-bind-expired',
    title: 'Bind page, expired invite',
    async run(mini, locale) {
      await showBindError(mini, locale, 'auth.inviteExpired');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '45-bind-locked',
    title: 'Bind page, too many attempts',
    async run(mini, locale) {
      const page = await showBindError(mini, locale, 'auth.tooManyAttempts');
      if (await page.data('locked') !== true || await page.data('canSubmit') !== false) {
        throw new Error('too many attempts did not disable submit');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '46-bind-offline',
    title: 'Bind page, network error',
    async run(mini, locale) {
      await showBindError(mini, locale, 'network.failed');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '47-bind-submitting',
    title: 'Bind page, submitting',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setAuthStub', {
        whoami: { ok: true, bound: false },
        redeemInvite: { pending: true },
      });
      const page = await openPage(mini, '/pages/bind/index');
      await callPage(page, 'onCode', { detail: { value: 'ABCD2345' } });
      await callPage(page, 'onToggleConsent');
      await callPage(page, 'onSubmit');
      if (await page.data('submitting') !== true) throw new Error('submit did not start');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '48-blocked-disabled',
    title: 'Blocked, disabled account',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/blocked/index');
      if (await page.data('actionText')) throw new Error('disabled state has an action');
      if (!await page.data('title')) throw new Error('disabled copy is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '49-blocked-offline',
    title: 'Blocked, offline',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/blocked/index?state=offline');
      if (await page.data('kind') !== 'error' || !await page.data('actionText')) {
        throw new Error('offline retry is missing');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '50-blocked-unconfigured',
    title: 'Blocked, service not configured',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/blocked/index?state=unconfigured');
      if (await page.data('kind') === 'error') {
        throw new Error('unconfigured used the offline copy');
      }
      if (!await page.data('title')) throw new Error('unconfigured copy is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '51-schedule-loading',
    title: 'Schedule first load pending',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setApiStub', { listItems: { pending: true } });
      const page = await openPage(mini, '/pages/schedule/index');
      if (await page.data('phase') !== 'loading' || await page.data('view')) {
        throw new Error('schedule did not stay on the first-load skeleton');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '52-schedule-network',
    title: 'Schedule network error with Retry',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setApiStub', { listItems: { ok: false, code: 'network.failed' } });
      const page = await openPage(mini, '/pages/schedule/index');
      const title = await page.data('errorTitle');
      const retry = await page.data('retryText');
      if (await page.data('phase') !== 'error' || !title || !retry) {
        throw new Error('schedule network error is missing a Retry action');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '53-vehicles-server-error',
    title: 'Vehicles server error',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setApiStub', { listVehicles: { ok: false, code: 'server.error' } });
      const page = await openPage(mini, '/pages/vehicles/index');
      if (await page.data('phase') !== 'error' || await page.data('errorCode') !== 'server.error') {
        throw new Error('vehicles server error is missing');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '54-meeting-cancel-network',
    title: 'Meeting cancel, network failure',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setApiStub', { cancelItem: { ok: false, code: 'network.failed' } });
      const page = await openPage(mini, '/pages/meeting-detail/index?id=m3');
      await callPage(page, 'onOpenCancel');
      await callPage(page, 'onConfirmCancel');
      const notice = await page.data('notice');
      if (!notice || await page.data('writing') === true) {
        throw new Error('cancel network failure did not surface');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '55-meeting-cancel-conflict',
    title: 'Meeting cancel, someone else changed it',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setApiStub', { cancelItem: { ok: false, code: 'item.alreadyChanged' } });
      const page = await openPage(mini, '/pages/meeting-detail/index?id=m3');
      await callPage(page, 'onOpenCancel');
      await callPage(page, 'onConfirmCancel');
      const notice = await page.data('notice');
      const expected = locale === 'en'
        ? 'This was changed by someone else; reloaded'
        : '这条已被他人修改，已重新加载';
      if (notice !== expected) throw new Error('rev-conflict notice: ' + notice);
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '56-vehicle-form-submitting',
    title: 'Vehicle form submitting, button disabled',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setApiStub', { requestVehicle: { pending: true } });
      const page = await openPage(mini, '/pages/vehicle-form/index');
      await callPage(page, 'setForm', { reason: 'Airport', destination: 'Airport' });
      await callPage(page, 'onSubmit');
      if (await page.data('submitting') !== true) {
        throw new Error('submit did not disable the button');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '57-privacy-top',
    title: 'Privacy policy, top',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/privacy/index');
      const sections = await page.data('sections');
      if (!sections || sections.length !== 7) {
        throw new Error('privacy sections: ' + (sections && sections.length));
      }
      const pending = locale === 'en' ? 'To be provided' : '待填写';
      if (sections[0].body.indexOf(pending) < 0) {
        throw new Error('operator placeholder missing: ' + sections[0].body);
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '58-privacy-end',
    title: 'Privacy policy, scrolled to the end',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/privacy/index');
      await mini.evaluate(function () {
        return new Promise(function (resolve) {
          wx.pageScrollTo({
            selector: '#privacy-end',
            duration: 0,
            complete: function () { resolve(true); },
          });
        });
      });
      await page.waitFor(PAUSE_MS);
      const sections = await page.data('sections');
      const last = sections && sections[sections.length - 1];
      const dateText = locale === 'en'
        ? 'Effective date: To be provided'
        : '生效日期：待填写';
      if (!last || last.id !== 'privacy-end' || last.body.indexOf(dateText) < 0) {
        throw new Error('effective date placeholder missing');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '59-bind-consent-off',
    title: 'Bind page, consent unchecked',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setAuthStub', { whoami: { ok: true, bound: false } });
      const page = await openPage(mini, '/pages/bind/index');
      await callPage(page, 'onCode', { detail: { value: 'ABCD2345' } });
      if (await page.data('agreed') !== false || await page.data('canSubmit') !== false) {
        throw new Error('unchecked consent can still submit');
      }
      if (!await page.data('consentLead')) throw new Error('consent line is missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '60-bind-consent-on',
    title: 'Bind page, consent checked',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setAuthStub', { whoami: { ok: true, bound: false } });
      const page = await openPage(mini, '/pages/bind/index');
      await callPage(page, 'onCode', { detail: { value: 'ABCD2345' } });
      await callPage(page, 'onToggleConsent');
      if (await page.data('agreed') !== true || await page.data('canSubmit') !== true) {
        throw new Error('checked consent did not enable submit');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '61-consent-sheet',
    title: 'Home tab, privacy consent sheet',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      await dev(mini, 'setPrivacyAccepted', false);
      const page = await openPage(mini, '/pages/schedule/index');
      let open = false;
      for (let i = 0; i < 25 && !open; i += 1) {
        open = await mini.evaluate(function () {
          var pages = getCurrentPages();
          var top = pages[pages.length - 1];
          var sheet = top && top.selectComponent && top.selectComponent('#privacy-sheet');
          return Boolean(sheet && sheet.data && sheet.data.open);
        });
        if (!open) await page.waitFor(200);
      }
      if (!open) throw new Error('consent sheet did not open');
      const title = await mini.evaluate(function () {
        var pages = getCurrentPages();
        var top = pages[pages.length - 1];
        var sheet = top.selectComponent('#privacy-sheet');
        return sheet && sheet.data ? sheet.data.title : '';
      });
      const expected = locale === 'en' ? 'Privacy policy' : '隐私政策';
      if (title !== expected) throw new Error('consent title: ' + title);
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '62-me-privacy',
    title: 'Me, privacy policy row',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/me/index');
      let label = '';
      for (let i = 0; i < 25; i += 1) {
        label = await page.data('i18n.me.privacy');
        if (label && await page.data('phase') === 'ready') break;
        await page.waitFor(200);
      }
      const expected = locale === 'en' ? 'Privacy policy' : '隐私政策';
      if (label !== expected) throw new Error('privacy row: ' + label);
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '63-schedule-spring',
    title: 'Schedule, spring',
    async run(mini, locale) {
      await openInSeason(mini, locale, 'spring', '/pages/schedule/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '64-schedule-summer',
    title: 'Schedule, summer',
    async run(mini, locale) {
      await openInSeason(mini, locale, 'summer', '/pages/schedule/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '65-schedule-winter',
    title: 'Schedule, winter',
    async run(mini, locale) {
      await openInSeason(mini, locale, 'winter', '/pages/schedule/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '66-schedule-brand',
    title: 'Schedule, brand blue',
    async run(mini, locale) {
      await openInSeason(mini, locale, 'brand', '/pages/schedule/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '67-vehicles-spring',
    title: 'Vehicles, spring',
    async run(mini, locale) {
      await openInSeason(mini, locale, 'spring', '/pages/vehicles/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '68-vehicles-summer',
    title: 'Vehicles, summer',
    async run(mini, locale) {
      await openInSeason(mini, locale, 'summer', '/pages/vehicles/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '69-vehicles-winter',
    title: 'Vehicles, winter',
    async run(mini, locale) {
      await openInSeason(mini, locale, 'winter', '/pages/vehicles/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '70-vehicles-brand',
    title: 'Vehicles, brand blue',
    async run(mini, locale) {
      await openInSeason(mini, locale, 'brand', '/pages/vehicles/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '71-me-appearance',
    title: 'Me, appearance sheet',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'secretary');
      const page = await openPage(mini, '/pages/me/index');
      let label = '';
      for (let i = 0; i < 25; i += 1) {
        label = await page.data('i18n.me.appearance');
        if (label && await page.data('phase') === 'ready') break;
        await page.waitFor(200);
      }
      const expected = locale === 'en' ? 'Appearance' : '外观';
      if (label !== expected) throw new Error('appearance row: ' + label);
      await callPage(page, 'onOpenAppearance');
      if (await page.data('appearanceOpen') !== true) {
        throw new Error('appearance sheet did not open');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
];

async function showBindError(mini, locale, code) {
  await resetSeed(mini, locale, 'secretary');
  await dev(mini, 'setAuthStub', {
    whoami: { ok: true, bound: false },
    redeemInvite: { ok: false, code: code },
  });
  const page = await openPage(mini, '/pages/bind/index');
  await callPage(page, 'onCode', { detail: { value: 'ABCD2345' } });
  await callPage(page, 'onToggleConsent');
  await callPage(page, 'onSubmit');
  if (await page.data('errorCode') !== code) {
    throw new Error('expected ' + code + ', got ' + await page.data('errorCode'));
  }
  return page;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function writeIndex(results) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const byKey = new Map();
  for (const result of results) byKey.set(result.locale + '/' + result.id, result);
  const launch = results.find(function (result) { return result.id === 'launch' && !result.ok; });
  const launchNote = launch
    ? '<p class="missing">' + escapeHtml(launch.error) + '</p>'
    : '';
  const rows = SCENARIOS.map(function (scenario) {
    const cells = LOCALES.map(function (locale) {
      const result = byKey.get(locale + '/' + scenario.id);
      const src = locale + '/' + scenario.id + '.png';
      const image = '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(locale + ' ' + scenario.title) + '">';
      const error = result && !result.ok
        ? '<p class="missing">' + escapeHtml(result.error) + '</p>'
        : '';
      return '<td>' + image + error + '</td>';
    }).join('');
    return '<tr><th>' + escapeHtml(scenario.id) + '<br>' + escapeHtml(scenario.title) + '</th>' + cells + '</tr>';
  }).join('\n');
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Screenshot contact sheet</title>',
    '<style>',
    'body { font-family: sans-serif; margin: 24px; color: #1c2430; }',
    'table { border-collapse: collapse; width: 100%; }',
    'th, td { border-bottom: 1px solid #d8dee8; padding: 12px; vertical-align: top; text-align: left; }',
    'img { width: 100%; max-width: 320px; background: #f3f5f8; }',
    '.missing { color: #8a3b3b; }',
    '</style>',
    '</head>',
    '<body>',
    '<h1>zh-CN | en</h1>',
    launchNote,
    '<table>',
    '<thead><tr><th>Scenario</th><th>zh-CN</th><th>en</th></tr></thead>',
    '<tbody>',
    rows,
    '</tbody>',
    '</table>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');
}

function printSummary(results) {
  const failed = results.filter(function (result) { return !result.ok; });
  console.log('Screenshot summary: ' + results.length + ' runs, ' + failed.length + ' failed.');
  for (const result of failed) {
    console.log('FAIL ' + result.locale + '/' + result.id + ': ' + result.error);
  }
}

// automator.launch() spawns cli.bat without a shell, which Node >= 18.20
// refuses on Windows (EINVAL). Start automation mode ourselves, then connect.
async function launchDevTools() {
  const args = ['auto', '--project', ROOT, '--auto-port', String(AUTO_PORT), '--trust-project'];
  const quoted = [CLI_PATH].concat(args).map(function (arg) { return '"' + arg + '"'; }).join(' ');
  let output = '';
  const exitCode = await new Promise(function (resolve, reject) {
    const child = childProcess.spawn(quoted, [], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', function (chunk) { output += chunk; });
    child.stderr.on('data', function (chunk) { output += chunk; });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (exitCode !== 0) {
    throw new Error('cli auto exited with ' + exitCode + '\n' + output.trim().slice(-2000));
  }
  try {
    return await automator.connect({ wsEndpoint: 'ws://127.0.0.1:' + AUTO_PORT });
  } catch (error) {
    // cli auto exits 0 even when it fails (e.g. APPID_ERROR), so show its output.
    throw new Error(error.message + '\ncli output:\n' + output.trim().slice(-2000));
  }
}

async function main() {
  const results = [];
  let mini = null;
  try {
    mini = await launchDevTools();
    currentMini = mini;
    try {
      await mini.reLaunch('/pages/schedule/index');
    } catch (error) {
      // The first route after DevTools starts can time out. Later scenarios still run.
    }
    for (const locale of LOCALES) {
      for (const scenario of SCENARIOS) {
        try {
          await scenario.run(mini, locale);
          results.push({ locale: locale, id: scenario.id, ok: true, error: '' });
          console.log('ok ' + locale + '/' + scenario.id);
        } catch (error) {
          const message = error && error.stack ? error.stack : String(error);
          results.push({ locale: locale, id: scenario.id, ok: false, error: message });
          console.error('FAIL ' + locale + '/' + scenario.id);
          console.error(message);
        }
      }
    }
  } catch (error) {
    const message = error && error.stack ? error.stack : String(error);
    results.push({ locale: 'launch', id: 'launch', ok: false, error: message });
    console.error('FAIL launch');
    console.error(message);
  } finally {
    try {
      writeIndex(results);
    } catch (error) {
      console.error(error && error.stack ? error.stack : error);
    }
    if (mini) {
      try {
        await mini.close();
      } catch (error) {
        console.error(error && error.stack ? error.stack : error);
      }
    }
  }
  printSummary(results);
  const failed = results.some(function (result) { return !result.ok; });
  process.exitCode = failed ? 1 : 0;
}

main();
