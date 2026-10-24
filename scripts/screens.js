'use strict';

const fs = require('node:fs');
const path = require('node:path');
const automator = require('miniprogram-automator');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'screenshots');
const CLI_PATH = process.env.WX_CLI || 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const LOCALES = ['zh-CN', 'en'];
const DATA_KEY = 'corp-admin-v2';
const PAUSE_MS = 500;

const SHOT_MEETING = {
  id: 'm-shot',
  title: { 'zh-CN': '截图会议', en: 'Screenshot meeting' },
  date: '2026-10-24',
  start: '11:00',
  end: '12:00',
  roomId: 'f1-reception',
  attendeeIds: ['p-lin'],
  organizerId: 'p-lin',
  agenda: { 'zh-CN': '截图用', en: 'For the screenshot pass' },
  cancelled: false,
  createdAt: '2026-10-24T09:20',
};

const BUSY_VEHICLE = {
  id: 'v-busy',
  reason: { 'zh-CN': '重叠行程', en: 'Overlapping trip' },
  destination: { 'zh-CN': '园区', en: 'Campus' },
  date: '2026-10-27',
  time: '09:20',
  passengers: 1,
  applicantId: 'p-lin',
  note: '',
  status: 'assigned',
  carId: 'gl8a',
  driverId: 'p-zhao',
  rejectReason: '',
  createdAt: '2026-10-24T09:20',
  dispatchedAt: '2026-10-24T09:20',
  dispatchedBy: 'p-zhao',
  completedAt: null,
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

async function resetSeed(mini, locale, role) {
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
}

async function openPage(mini, url) {
  const page = await mini.reLaunch(url);
  if (!page) throw new Error('reLaunch returned no page: ' + url);
  await page.waitFor(PAUSE_MS);
  return page;
}

async function callPage(page, method, arg) {
  if (arg === undefined) await page.callMethod(method);
  else await page.callMethod(method, arg);
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
    title: 'Schedule 2026-10-24, admin',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
      await dev(mini, 'setDate', '2026-10-24');
      await openPage(mini, '/pages/schedule/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '02-schedule-1025',
    title: 'Schedule 2026-10-25, empty',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
      await dev(mini, 'setDate', '2026-10-25');
      await openPage(mini, '/pages/schedule/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '03-schedule-created',
    title: 'Schedule after creating a meeting',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
      const saved = await dev(mini, 'addMeeting', SHOT_MEETING);
      if (!saved || saved.ok !== true) throw new Error('addMeeting failed');
      await dev(mini, 'focus', {
        date: SHOT_MEETING.date,
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
    id: '04-meetings-admin',
    title: 'Meetings list, admin',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
      await openPage(mini, '/pages/meetings/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '05-meetings-filtered-empty',
    title: 'Meetings list filtered to empty',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
      await openPage(mini, '/pages/meeting-form/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '12-meeting-form-errors',
    title: 'Meeting form, inline errors',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
      const page = await openPage(mini, '/pages/meeting-form/index');
      await callPage(page, 'setForm', { title: 'Draft' });
      await callPage(page, 'onBeforeLeave');
      if (await page.data('dirtyOpen') !== true) throw new Error('dirty-leave sheet did not open');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '15-vehicles-admin',
    title: 'Vehicles, admin mine',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
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
    id: '17-vehicles-reception',
    title: 'Vehicles, reception',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'reception');
      await openPage(mini, '/pages/vehicles/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '18-vehicle-v4-dispatch-busy',
    title: 'Vehicle v4 dispatch sheet, busy car',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'driver');
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
      await resetSeed(mini, locale, 'driver');
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
      await resetSeed(mini, locale, 'driver');
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
      if (await page.data('confirmOpen') !== true || !await page.data('notice')) {
        throw new Error('complete refusal is missing');
      }
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '22-vehicle-v1-rejected',
    title: 'Vehicle v1 rejected',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
      const page = await openPage(mini, '/pages/vehicle-form/index');
      await callPage(page, 'onSubmit');
      const errors = await page.data('errors');
      if (!errors || !errors.reason) throw new Error('vehicle inline errors are missing');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '24-me-admin',
    title: 'Me, admin',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
      await openPage(mini, '/pages/me/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '25-me-language',
    title: 'Me, language sheet',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
      await openPage(mini, '/pages/visitors/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '28-daily',
    title: 'Daily skeleton',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
      await openPage(mini, '/pages/daily/index');
      await saveShot(mini, locale, this.id + '.png');
    },
  },
  {
    id: '29-dev-gallery-pseudo',
    title: 'Dev gallery, pseudo-locale',
    async run(mini, locale) {
      await resetSeed(mini, locale, 'admin');
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
      await resetSeed(mini, locale, 'admin');
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
];

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

async function main() {
  const results = [];
  let mini = null;
  try {
    mini = await automator.launch({
      cliPath: CLI_PATH,
      projectPath: ROOT,
      timeout: 120000,
      trustProject: true,
    });
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
