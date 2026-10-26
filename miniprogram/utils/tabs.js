'use strict';

const ICONS = {
  schedule: '/assets/icons/schedule.svg',
  todo: '/assets/icons/meetings.svg',
  visitors: '/assets/icons/meetings.svg',
  vehicles: '/assets/icons/vehicles.svg',
  me: '/assets/icons/me.svg'
};

const ACTIVE = {
  schedule: '/assets/icons/schedule-active.svg',
  todo: '/assets/icons/meetings-active.svg',
  visitors: '/assets/icons/meetings-active.svg',
  vehicles: '/assets/icons/vehicles-active.svg',
  me: '/assets/icons/me-active.svg'
};

function tab(key, labelKey) {
  return {
    key: key,
    url: '/pages/' + key + '/index',
    labelKey: labelKey || 'tab.' + key,
    icon: ICONS[key] || '',
    activeIcon: ACTIVE[key] || ''
  };
}

function tabsFor(actor) {
  const role = actor && actor.role;
  if (role === 'leader') {
    return [
      tab('schedule'),
      { key: 'compose', url: '', labelKey: 'common.comingSoon', icon: '', activeIcon: '' },
      tab('me')
    ];
  }
  if (role === 'secretary' || role === 'secretaryAdmin') {
    return [tab('schedule'), tab('todo'), tab('vehicles'), tab('me')];
  }
  if (role === 'receptionist' || role === 'receptionAdmin') {
    return [tab('visitors'), tab('vehicles'), tab('me')];
  }
  if (role === 'driver') return [tab('vehicles', 'tab.trips'), tab('me')];
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
  if (role === 'leader') return ['schedule', 'me', 'vehicles', 'meetings'];
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
