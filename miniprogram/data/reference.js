'use strict';

const ROOMS = [
  { id: 'f3-small', name: { 'zh-CN': '3楼小会议室', en: '3F Small Meeting Room' } },
  { id: 'f5-board', name: { 'zh-CN': '5楼董事会会议室', en: '5F Boardroom' } },
  { id: 'f1-reception', name: { 'zh-CN': '1楼接待室', en: '1F Reception Room' } },
  { id: 'online', name: { 'zh-CN': '线上会议', en: 'Online meeting' }, online: true },
];

const PEOPLE = [
  { id: 'p-chen', name: { 'zh-CN': '陈启明', en: 'Chen Qiming' }, title: { 'zh-CN': '总经理', en: 'General Manager' } },
  { id: 'p-lin', name: { 'zh-CN': '林晓雯', en: 'Lin Xiaowen' }, title: { 'zh-CN': '总裁办公室', en: "President's Office" } },
  { id: 'p-zhao', name: { 'zh-CN': '赵磊', en: 'Zhao Lei' }, title: { 'zh-CN': '车队', en: 'Fleet' } },
  { id: 'p-zhou', name: { 'zh-CN': '周宁', en: 'Zhou Ning' }, title: { 'zh-CN': '前台', en: 'Front Desk' } },
  { id: 'p-sun', name: { 'zh-CN': '孙倩', en: 'Sun Qian' }, title: { 'zh-CN': '财务部', en: 'Finance' } },
  { id: 'p-ma', name: { 'zh-CN': '马凯', en: 'Ma Kai' }, title: { 'zh-CN': '综合部', en: 'General Affairs' } },
];

const ROLES = {
  leader: 'p-chen',
  admin: 'p-lin',
  driver: 'p-zhao',
  reception: 'p-zhou',
};

const ROLE_ORDER = ['leader', 'admin', 'driver', 'reception'];

const CARS = [
  { id: 'gl8a', plate: '京A·D8821', model: { 'zh-CN': '别克 GL8', en: 'Buick GL8' }, kind: { 'zh-CN': '商务', en: 'MPV' }, seats: 6 },
  { id: 'a6', plate: '京A·E1902', model: { 'zh-CN': '奥迪 A6L', en: 'Audi A6L' }, kind: { 'zh-CN': '轿车', en: 'Sedan' }, seats: 4 },
  { id: 'gl8b', plate: '京A·F3308', model: { 'zh-CN': '别克 GL8', en: 'Buick GL8' }, kind: { 'zh-CN': '商务', en: 'MPV' }, seats: 6 },
];

const DRIVERS = ['p-zhao'];

function findById(items, id) {
  return items.find((item) => item.id === id) || null;
}

function roomById(id) {
  return findById(ROOMS, id);
}

function personById(id) {
  return findById(PEOPLE, id);
}

function carById(id) {
  return findById(CARS, id);
}

module.exports = {
  ROOMS,
  PEOPLE,
  ROLES,
  ROLE_ORDER,
  CARS,
  DRIVERS,
  roomById,
  personById,
  carById,
};
