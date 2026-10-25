'use strict';

const tz = require('../domain/tz');
const reference = require('./reference');
const { createItem } = require('../domain/item');
const { createNote } = require('../domain/notes');
const { isLeader } = reference;
function wall(date, time) {
  return tz.fromZoned(date, time, 'Asia/Shanghai').toISOString();
}
function leadersFor(attendeeIds, organizerId, createdAt) {
  const leaderIds = [
    ...new Set([...(attendeeIds || []), organizerId].filter((id) => isLeader(id))),
  ];
  return {
    leaderIds,
    leaders: leaderIds.map((leaderId) => ({
      leaderId,
      confirm: 'confirmed',
      confirmedAt: createdAt,
      declineReason: '',
      changedAt: null,
      changeNote: '',
      seenAt: null,
    })),
  };
}
function meeting(
  id,
  title,
  date,
  start,
  end,
  roomId,
  attendeeIds,
  organizerId,
  agenda,
  created,
  extra,
) {
  const createdAt = wall(...created);
  return {
    id,
    kind: 'meeting',
    title,
    startAt: wall(date, start),
    endAt: wall(date, end),
    allDay: false,
    tz: 'Asia/Shanghai',
    location: '',
    roomId,
    attendeeIds,
    organizerId,
    category: 'regular',
    important: false,
    parentId: null,
    seriesId: null,
    notes: agenda,
    noteId: null,
    ...leadersFor(attendeeIds, organizerId, createdAt),
    status: 'active',
    createdBy: organizerId,
    createdAt,
    updatedAt: createdAt,
    updatedBy: organizerId,
    cancelledAt: null,
    cancelledBy: null,
    v: 1,
    rev: 0,
    ...(extra || {}),
  };
}
function vehicle(
  id,
  reason,
  destination,
  date,
  time,
  passengers,
  applicantId,
  note,
  status,
  carId,
  driverId,
  rejectReason,
  created,
  dispatched,
  dispatchedBy,
  completed,
  forLeaderId,
) {
  return {
    id,
    reason,
    destination,
    departAt: wall(date, time),
    tz: 'Asia/Shanghai',
    passengers,
    applicantId,
    forLeaderId: forLeaderId || null,
    itemId: null,
    note,
    status,
    carId,
    driverId,
    rejectReason,
    createdAt: wall(...created),
    dispatchedAt: dispatched ? wall(...dispatched) : null,
    dispatchedBy: dispatchedBy || null,
    completedAt: completed ? wall(...completed) : null,
    rev: 0,
  };
}
const items = [
  meeting(
    'm1',
    { 'zh-CN': '月度行政复盘', en: 'Monthly Administration Review' },
    '2026-10-23',
    '16:00',
    '17:00',
    'f3-small',
    ['p-lin', 'p-chen'],
    'p-lin',
    {
      'zh-CN': '复盘十月会议安排和用车情况。',
      en: 'Review October meeting plans and vehicle usage.',
    },
    ['2026-10-20', '09:00'],
  ),
  meeting(
    'm2',
    { 'zh-CN': '行政值班碰头会', en: 'Administration Duty Check-in' },
    '2026-10-24',
    '09:00',
    '09:40',
    'f3-small',
    ['p-lin', 'p-zhou'],
    'p-lin',
    {
      'zh-CN': '对齐周末值班，以及周一例会材料是否齐套。',
      en: 'Align weekend duty coverage and check Monday meeting materials.',
    },
    ['2026-10-21', '09:00'],
  ),
  meeting(
    'm3',
    { 'zh-CN': '下周材料核对', en: 'Next Week Materials Check' },
    '2026-10-24',
    '16:00',
    '16:30',
    'online',
    ['p-lin', 'p-ma'],
    'p-lin',
    {
      'zh-CN': '核对周一要印发的材料。',
      en: 'Check the materials to be printed on Monday.',
    },
    ['2026-10-22', '10:00'],
  ),
  meeting(
    'm4',
    { 'zh-CN': '周经营例会', en: 'Weekly Operations Review' },
    '2026-10-26',
    '09:00',
    '10:30',
    'f5-board',
    ['p-chen', 'p-lin', 'p-sun', 'p-ma'],
    'p-chen',
    {
      'zh-CN': '上周经营数据、本周重点、需要行政协调的事项。',
      en:
        "Review last week's results, this week's priorities, and items needing " +
        'administrative coordination.',
    },
    ['2026-10-22', '14:00'],
    { important: true },
  ),
  meeting(
    'm5',
    { 'zh-CN': '访客接待准备会', en: 'Visitor Reception Preparation' },
    '2026-10-26',
    '15:00',
    '15:45',
    'f1-reception',
    ['p-lin', 'p-zhou'],
    'p-zhou',
    {
      'zh-CN': '确认接待路线、茶歇和会议室。',
      en: 'Confirm the visitor route, refreshments, and meeting room.',
    },
    ['2026-10-23', '11:00'],
  ),
  meeting(
    'm6',
    { 'zh-CN': '董事会筹备会', en: 'Board Meeting Preparation' },
    '2026-10-26',
    '14:00',
    '15:00',
    'f5-board',
    ['p-wang', 'p-he'],
    'p-he',
    {
      'zh-CN': '准备董事会材料。',
      en: 'Prepare the board meeting materials.',
    },
    ['2026-10-23', '10:00'],
  ),
];
const extraNow = new Date('2026-10-24T01:20:00.000Z');
function extraItems() {
  const secretary = reference.actorFor('secretary');
  const receptionist = reference.actorFor('receptionist');
  const byId = {};
  const options = {
    actor: secretary,
    now: extraNow,
    tz: 'Asia/Shanghai',
    isLeader,
  };
  const travel = createItem(
    'travel',
    {
      title: { 'zh-CN': '深圳客户拜访', en: 'Shenzhen client visits' },
      date: '2026-10-28',
      start: '08:00',
      endDate: '2026-10-29',
      end: '18:00',
      leaderIds: ['p-chen'],
    },
    { ...options, id: 't1' },
  );
  byId.t1 = travel;
  const stops = [
    createItem(
      'stop',
      {
        title: { 'zh-CN': '出发', en: 'Departure' },
        parentId: 't1',
        stopType: 'depart',
        date: '2026-10-28',
        start: '08:00',
        end: '09:00',
        location: { 'zh-CN': '虹桥机场', en: 'Hongqiao Airport' },
      },
      { ...options, id: 't1-s1', itemById: (id) => byId[id] },
    ),
    createItem(
      'stop',
      {
        title: { 'zh-CN': '客户现场', en: 'Client site' },
        parentId: 't1',
        stopType: 'stop',
        date: '2026-10-28',
        start: '14:00',
        end: '16:00',
        location: { 'zh-CN': '南山物流园', en: 'Nanshan Logistics Park' },
        client: { 'zh-CN': '华南货运客户', en: 'South China freight client' },
      },
      { ...options, id: 't1-s2', itemById: (id) => byId[id] },
    ),
    createItem(
      'stop',
      {
        title: { 'zh-CN': '返程', en: 'Return' },
        parentId: 't1',
        stopType: 'return',
        date: '2026-10-29',
        start: '16:00',
        end: '18:00',
        location: { 'zh-CN': '宝安机场', en: "Bao'an Airport" },
      },
      { ...options, id: 't1-s3', itemById: (id) => byId[id] },
    ),
  ];
  const visit = createItem(
    'visit',
    {
      title: { 'zh-CN': '交通运输局调研组', en: 'Transport bureau review team' },
      date: '2026-10-27',
      start: '10:00',
      end: '11:00',
      leaderIds: ['p-chen'],
      visitorName: { 'zh-CN': '刘处长', en: 'Director Liu' },
      org: { 'zh-CN': '市交通运输局', en: 'Municipal Transport Bureau' },
      headcount: 3,
      purpose: { 'zh-CN': '例行调研', en: 'Routine review' },
      visitorType: 'government',
      receptionLevel: 'A',
      transport: 'selfDrive',
      plate: '沪A·D0001',
    },
    { ...options, id: 'vs1', actor: receptionist },
  );
  const milestone = createItem(
    'milestone',
    {
      title: { 'zh-CN': '年度航线合同签约', en: 'Annual route contract signing' },
      allDay: true,
      date: '2026-10-30',
      leaderIds: ['p-chen'],
      important: true,
    },
    { ...options, id: 'ms1' },
  );
  return [travel, ...stops, visit, milestone];
}
items.push(...extraItems());
const vehicles = [
  vehicle(
    'v1',
    { 'zh-CN': '临时外出办事', en: 'Temporary business trip' },
    { 'zh-CN': '金融街', en: 'Finance Street' },
    '2026-10-22',
    '11:00',
    1,
    'p-lin',
    '',
    'rejected',
    null,
    null,
    {
      'zh-CN': '当天公务车已排满，请改乘地铁或改期。',
      en: 'The company cars are fully booked; please take the metro or reschedule.',
    },
    ['2026-10-20', '10:00'],
  ),
  vehicle(
    'v2',
    { 'zh-CN': '园区设备巡检', en: 'Campus equipment inspection' },
    { 'zh-CN': '北区园区', en: 'North Campus' },
    '2026-10-23',
    '08:30',
    1,
    'p-zhou',
    '',
    'done',
    'gl8a',
    'p-zhao',
    '',
    ['2026-10-21', '09:00'],
    ['2026-10-21', '15:00'],
    'p-lin',
    ['2026-10-23', '10:00'],
  ),
  vehicle(
    'v3',
    {
      'zh-CN': '送材料至市政务中心',
      en: 'Deliver materials to the civic service center',
    },
    { 'zh-CN': '市政务服务中心', en: 'Civic Service Center' },
    '2026-10-24',
    '13:30',
    2,
    'p-lin',
    {
      'zh-CN': '需携带公章函件，预计两小时。',
      en: 'Bring the stamped letter; the trip should take about two hours.',
    },
    'assigned',
    'a6',
    'p-zhao',
    '',
    ['2026-10-22', '10:00'],
    ['2026-10-23', '10:00'],
    'p-zhao',
    null,
  ),
  vehicle(
    'v4',
    { 'zh-CN': '机场接客户', en: 'Pick up a client at the airport' },
    { 'zh-CN': '首都机场 T3', en: 'Capital Airport T3' },
    '2026-10-27',
    '09:20',
    3,
    'p-zhou',
    {
      'zh-CN': '客户两人，预留后备箱。',
      en: 'Two clients; leave room in the trunk.',
    },
    'pending',
    null,
    null,
    '',
    ['2026-10-23', '15:00'],
  ),
  vehicle(
    'v5',
    { 'zh-CN': '赴港口码头调研', en: 'Port terminal site visit' },
    { 'zh-CN': '外高桥港区', en: 'Waigaoqiao Port' },
    '2026-10-28',
    '08:30',
    2,
    'p-chen',
    '',
    'pending',
    null,
    null,
    '',
    ['2026-10-24', '10:00'],
    null,
    null,
    null,
    'p-chen',
  ),
];
function seed() {
  const created = createNote('placeholder', {
    id: 'n1',
    actor: reference.actorFor('leader'),
    now: extraNow,
  });
  const notes = [
    {
      ...created.note,
      // Demo text is bilingual like the rest of the seed; real notes are typed in one language.
      text: {
        'zh-CN': '下周想去趟深圳，见两个客户',
        en: 'Want to visit Shenzhen next week to see two clients',
      },
      status: 'converted',
      itemIds: ['t1'],
      handledBy: 'p-lin',
      handledAt: extraNow.toISOString(),
      rev: 1,
    },
  ];
  return {
    items: JSON.parse(JSON.stringify(items)),
    vehicles: JSON.parse(JSON.stringify(vehicles)),
    notes,
  };
}
module.exports = { seed };
