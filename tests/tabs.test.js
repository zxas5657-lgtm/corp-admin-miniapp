'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { tabsFor, homeUrl, canOpen, pagesFor } = require('../miniprogram/utils/tabs');

function keys(actor) {
  return tabsFor(actor).map(function (item) { return item.key; });
}

test('leader tabs are week, compose and me', function () {
  const tabs = tabsFor({ role: 'leader' });
  assert.deepEqual(keys({ role: 'leader' }), ['week', 'compose', 'me']);
  assert.equal(tabs[0].url, '/pages/week/index');
  assert.equal(tabs[0].labelKey, 'tab.schedule');
  assert.equal(tabs[0].icon, '/assets/icons/schedule.svg');
  assert.equal(tabs[1].url, '');
  assert.equal(tabs[1].labelKey, 'week.note.title');
  assert.equal(homeUrl({ role: 'leader' }), '/pages/week/index');
});

test('secretary roles share schedule, todo, vehicles and me', function () {
  for (const role of ['secretary', 'secretaryAdmin']) {
    assert.deepEqual(keys({ role: role }), ['schedule', 'todo', 'vehicles', 'me']);
    assert.equal(homeUrl({ role: role }), '/pages/schedule/index');
  }
});

test('reception roles open on visitors', function () {
  for (const role of ['receptionist', 'receptionAdmin']) {
    assert.deepEqual(keys({ role: role }), ['visitors', 'vehicles', 'me']);
    assert.equal(homeUrl({ role: role }), '/pages/visitors/index');
  }
});

test('driver tabs label trips and open on vehicles', function () {
  const tabs = tabsFor({ role: 'driver' });
  assert.deepEqual(keys({ role: 'driver' }), ['vehicles', 'me']);
  assert.equal(tabs[0].labelKey, 'tab.trips');
  assert.equal(tabs[0].url, '/pages/vehicles/index');
  assert.equal(homeUrl({ role: 'driver' }), '/pages/vehicles/index');
});

test('canOpen follows page access, not the tab bar', function () {
  assert.deepEqual(pagesFor({ role: 'leader' }), [
    'week', 'schedule', 'me', 'vehicles', 'meetings'
  ]);
  assert.equal(canOpen({ role: 'leader' }, 'vehicles'), true);
  assert.equal(canOpen({ role: 'leader' }, 'todo'), false);
  assert.equal(canOpen({ role: 'driver' }, 'meetings'), false);
  assert.equal(canOpen({ role: 'driver' }, 'vehicles'), true);
  assert.equal(canOpen({ role: 'receptionist' }, 'visitors'), true);
  assert.equal(canOpen({ role: 'receptionAdmin' }, 'meetings'), true);
  assert.equal(canOpen({ role: 'secretary' }, 'todo'), true);
  assert.equal(canOpen({ role: 'secretaryAdmin' }, 'meetings'), true);
  assert.equal(canOpen({ role: 'secretary' }, 'visitors'), false);
});

test('every real tab has an icon and a page url', function () {
  const tabs = tabsFor({ role: 'secretary' });
  for (const item of tabs) {
    assert.equal(item.labelKey.indexOf('tab.'), 0);
    assert.ok(item.icon);
    assert.ok(item.url);
  }
});
