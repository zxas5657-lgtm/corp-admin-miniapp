'use strict';

const ICONS = {
  schedule: '/assets/icons/schedule.svg',
  todo: '/assets/icons/todo.svg',
  visitors: '/assets/icons/visitors.svg',
  vehicles: '/assets/icons/vehicles.svg',
  trips: '/assets/icons/trips.svg',
  me: '/assets/icons/me.svg'
};

function tab(key, labelKey, iconKey) {
  const name = iconKey || key;
  return {
    key: key,
    url: '/pages/' + key + '/index',
    labelKey: labelKey || 'tab.' + key,
    icon: ICONS[name] || '',
    activeIcon: ICONS[name] || ''
  };
}

function tabsFor(actor) {
  const role = actor && actor.role;
  if (role === 'leader') {
    return [
      tab('week', 'tab.schedule', 'schedule'),
      { key: 'compose', url: '', labelKey: 'week.note.title', icon: '', activeIcon: '' },
      tab('me')
    ];
  }
  if (role === 'secretary' || role === 'secretaryAdmin') {
    return [tab('schedule'), tab('todo'), tab('vehicles'), tab('me')];
  }
  if (role === 'receptionist' || role === 'receptionAdmin') {
    return [tab('visitors'), tab('vehicles'), tab('me')];
  }
  if (role === 'driver') return [tab('vehicles', 'tab.trips', 'trips'), tab('me')];
  return [tab('schedule'), tab('me')];
}

function homeUrl(actor) {
  const tabs = tabsFor(actor);
  for (let i = 0; i < tabs.length; i += 1) {
    if (tabs[i].url) return tabs[i].url;
  }
  return '/pages/schedule/index';
}

function pagesFor(actor) {
  const role = actor && actor.role;
  if (role === 'leader') return ['week', 'schedule', 'me', 'vehicles', 'meetings'];
  if (role === 'driver') return ['vehicles', 'me'];
  if (role === 'receptionist' || role === 'receptionAdmin') {
    return ['visitors', 'vehicles', 'me', 'meetings'];
  }
  if (role === 'secretary' || role === 'secretaryAdmin') {
    return ['schedule', 'todo', 'vehicles', 'me', 'meetings'];
  }
  return ['schedule', 'me'];
}

function canOpen(actor, key) {
  return pagesFor(actor).indexOf(key) !== -1;
}

module.exports = { tabsFor, homeUrl, pagesFor, canOpen };
