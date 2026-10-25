'use strict';

const ROOMS = [
  {
    id: 'f3-small',
    name: { 'zh-CN': '\u0033楼小会议室', en: '3F Small Meeting Room' },
  },
  {
    id: 'f5-board',
    name: { 'zh-CN': '\u0035楼董事会议室', en: '5F Boardroom' },
  },
  {
    id: 'f1-reception',
    name: { 'zh-CN': '\u0031楼接待室', en: '1F Reception Room' },
  },
  {
    id: 'online',
    name: { 'zh-CN': '线上会议', en: 'Online meeting' },
    online: true,
  },
];

const PEOPLE = [
  {
    id: 'p-chen',
    name: { 'zh-CN': '陈启明', en: 'Chen Qiming' },
    title: { 'zh-CN': '总经理', en: 'General Manager' },
    role: 'leader',
    dispatcher: false,
    sysAdmin: false,
  },
  {
    id: 'p-wang',
    name: { 'zh-CN': '王志远', en: 'Wang Zhiyuan' },
    title: { 'zh-CN': '副总经理', en: 'Deputy General Manager' },
    role: 'leader',
    dispatcher: false,
    sysAdmin: false,
  },
  {
    id: 'p-lin',
    name: { 'zh-CN': '林晓雯', en: 'Lin Xiaowen' },
    title: { 'zh-CN': '总裁办公室', en: "President's Office" },
    role: 'secretary',
    dispatcher: true,
    sysAdmin: false,
  },
  {
    id: 'p-he',
    name: { 'zh-CN': '何静', en: 'He Jing' },
    title: { 'zh-CN': '秘书处主管', en: 'Head of Secretariat' },
    role: 'secretaryAdmin',
    dispatcher: false,
    sysAdmin: true,
  },
  {
    id: 'p-zhou',
    name: { 'zh-CN': '周宁', en: 'Zhou Ning' },
    title: { 'zh-CN': '前台', en: 'Front Desk' },
    role: 'receptionist',
    dispatcher: false,
    sysAdmin: false,
  },
  {
    id: 'p-guo',
    name: { 'zh-CN': '郭敏', en: 'Guo Min' },
    title: { 'zh-CN': '前台主管', en: 'Front Desk Lead' },
    role: 'receptionAdmin',
    dispatcher: false,
    sysAdmin: false,
  },
  {
    id: 'p-zhao',
    name: { 'zh-CN': '赵磊', en: 'Zhao Lei' },
    title: { 'zh-CN': '车队', en: 'Fleet' },
    role: 'driver',
    dispatcher: false,
    sysAdmin: false,
  },
  {
    id: 'p-qian',
    name: { 'zh-CN': '钱涛', en: 'Qian Tao' },
    title: { 'zh-CN': '车队', en: 'Fleet' },
    role: 'driver',
    dispatcher: false,
    sysAdmin: false,
  },
  {
    id: 'p-sun',
    name: { 'zh-CN': '孙倩', en: 'Sun Qian' },
    title: { 'zh-CN': '财务部', en: 'Finance' },
    role: null,
    dispatcher: false,
    sysAdmin: false,
  },
  {
    id: 'p-ma',
    name: { 'zh-CN': '马凯', en: 'Ma Kai' },
    title: { 'zh-CN': '综合部', en: 'General Affairs' },
    role: null,
    dispatcher: false,
    sysAdmin: false,
  },
];

const SUPPORTS = { 'p-lin': ['p-chen'] };
const ROLES = {
  leader: 'p-chen',
  secretary: 'p-lin',
  secretaryAdmin: 'p-he',
  receptionist: 'p-zhou',
  receptionAdmin: 'p-guo',
  driver: 'p-zhao',
};
const ROLE_ORDER = [
  'leader',
  'secretary',
  'secretaryAdmin',
  'receptionist',
  'receptionAdmin',
  'driver',
];
const CARS = [
  {
    id: 'gl8a',
    plate: '京A·D8821',
    model: { 'zh-CN': '别克 GL8', en: 'Buick GL8' },
    kind: { 'zh-CN': '商务', en: 'MPV' },
    seats: 6,
  },
  {
    id: 'a6',
    plate: '京A·E1902',
    model: { 'zh-CN': '奥迪 A6L', en: 'Audi A6L' },
    kind: { 'zh-CN': '轿车', en: 'Sedan' },
    seats: 4,
  },
  {
    id: 'gl8b',
    plate: '京A·F3308',
    model: { 'zh-CN': '别克 GL8', en: 'Buick GL8' },
    kind: { 'zh-CN': '商务', en: 'MPV' },
    seats: 6,
  },
];
const DRIVERS = PEOPLE.filter((person) => person.role === 'driver').map((person) => person.id);

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
function actorFor(role) {
  const personId = ROLES[role];
  const person = personById(personId);
  return person
    ? { personId, role, dispatcher: Boolean(person.dispatcher), sysAdmin: Boolean(person.sysAdmin) }
    : null;
}
function isLeader(personId) {
  const person = personById(personId);
  return Boolean(person && person.role === 'leader');
}

module.exports = {
  ROOMS,
  PEOPLE,
  SUPPORTS,
  ROLES,
  ROLE_ORDER,
  CARS,
  DRIVERS,
  roomById,
  personById,
  carById,
  actorFor,
  isLeader,
};
