'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../miniprogram/i18n');
const ref = require('../miniprogram/data/reference');
const { seed } = require('../miniprogram/data/seed');
const { todoView } = require('../miniprogram/viewmodels/todo');

const now = new Date('2026-10-24T01:20:00.000Z');
const ctx = { supports: ref.SUPPORTS, isLeader: ref.isLeader };

function stateWith(ids) {
  const source = seed();
  return {
    items: ids.map((id) => source.items.find((item) => item.id === id)),
    vehicles: [],
    notes: [],
  };
}

function entry(state, itemId, leaderId) {
  return state.items
    .find((item) => item.id === itemId)
    .leaders.find((leader) => leader.leaderId === leaderId);
}

function options(state, actor, extra) {
  return {
    state,
    refs: ref,
    now,
    actor,
    viewerTz: 'Asia/Shanghai',
    ctx,
    ...(extra || {}),
  };
}

test.afterEach(() => i18n._resetForTests());

test('todo sections include visible notes, pending items, and declined items in order', () => {
  i18n.setLocale('en');
  const state = stateWith(['m1', 'm4', 'm6']);
  entry(state, 'm1', 'p-chen').confirm = 'pending';
  entry(state, 'm4', 'p-chen').confirm = 'declined';
  entry(state, 'm4', 'p-chen').declineReason = 'Schedule conflict';
  entry(state, 'm6', 'p-wang').confirm = 'pending';
  state.notes = [
    {
      id: 'n-old',
      leaderId: 'p-chen',
      text: { 'zh-CN': '旧留言', en: 'Older note' },
      status: 'open',
      createdAt: '2026-10-22T01:20:00.000Z',
    },
    {
      id: 'n-new',
      leaderId: 'p-chen',
      text: { 'zh-CN': '新留言', en: 'Newer note' },
      status: 'open',
      createdAt: '2026-10-23T01:20:00.000Z',
    },
    {
      id: 'n-unsupported',
      leaderId: 'p-wang',
      text: { 'zh-CN': '不支持', en: 'Unsupported' },
      status: 'open',
      createdAt: '2026-10-24T00:20:00.000Z',
    },
  ];
  const result = todoView(options(state, ref.actorFor('secretary')));
  assert.deepEqual(
    result.sections.map((section) => [section.key, section.count]),
    [
      ['notes', 2],
      ['pending', 1],
      ['declined', 1],
    ],
  );
  assert.deepEqual(
    result.sections[0].rows.map((row) => row.id),
    ['n-new', 'n-old'],
  );
  assert.equal(result.sections[0].rows[0].canConvert, true);
  assert.equal(result.sections[0].rows[0].canClose, true);
  assert.equal(result.sections[1].rows[0].id, 'm1');
  assert.equal(result.sections[1].rows[0].leaderName, 'Chen Qiming');
  assert.equal(result.sections[1].rows[0].rowKey, 'm1:2026-10-23');
  assert.equal(result.sections[2].rows[0].declineReason, 'Schedule conflict');
  assert.equal(result.sections[2].rows[0].canEdit, true);
  assert.equal(result.badgeCount, 3);
});

test('secretary inbox filters unsupported leaders and secretary admin sees all leaders', () => {
  const state = stateWith(['m1', 'm6']);
  entry(state, 'm1', 'p-chen').confirm = 'pending';
  entry(state, 'm6', 'p-wang').confirm = 'pending';
  state.notes = [
    {
      id: 'n-chen',
      leaderId: 'p-chen',
      text: 'Chen note',
      status: 'open',
      createdAt: '2026-10-23T01:20:00.000Z',
    },
    {
      id: 'n-wang',
      leaderId: 'p-wang',
      text: 'Wang note',
      status: 'open',
      createdAt: '2026-10-24T00:20:00.000Z',
    },
  ];
  const secretary = todoView(options(state, ref.actorFor('secretary')));
  assert.equal(secretary.sections.find((section) => section.key === 'pending').count, 1);
  assert.equal(secretary.sections.find((section) => section.key === 'pending').rows[0].id, 'm1');
  assert.deepEqual(
    secretary.sections.find((section) => section.key === 'notes').rows.map((row) => row.id),
    ['n-chen'],
  );

  const admin = todoView(options(state, ref.actorFor('secretaryAdmin')));
  assert.equal(admin.sections.find((section) => section.key === 'pending').count, 2);
  assert.deepEqual(
    admin.sections.find((section) => section.key === 'notes').rows.map((row) => row.id),
    ['n-wang', 'n-chen'],
  );
});

test('todo returns one empty block for empty or unauthorized views', () => {
  const emptyState = { items: [], vehicles: [], notes: [] };
  const empty = todoView(options(emptyState, ref.actorFor('secretary')));
  assert.deepEqual(
    empty.sections.map((section) => section.key),
    ['empty'],
  );
  assert.equal(empty.sections[0].count, 0);
  assert.equal(empty.badgeCount, 0);
  assert.ok(empty.empty);

  const leader = todoView(options(emptyState, ref.actorFor('leader')));
  assert.deepEqual(
    leader.sections.map((section) => section.key),
    ['empty'],
  );
  assert.ok(leader.reason);

  const unsupported = todoView(
    options(emptyState, ref.actorFor('secretary'), {
      ctx: { supports: { 'p-lin': [] }, isLeader: ref.isLeader },
    }),
  );
  assert.ok(unsupported.emptyReason);
});

test('todo section titles and note text follow both locales', () => {
  const state = { items: [], vehicles: [], notes: [] };
  i18n.setLocale('en');
  const english = todoView(options(state, ref.actorFor('secretary')));
  assert.equal(english.sections[0].title, 'Nothing waiting here');

  i18n.setLocale('zh-CN');
  const chinese = todoView(options(state, ref.actorFor('secretary')));
  assert.notEqual(chinese.sections[0].title, english.sections[0].title);

  const noteState = stateWith(['m1']);
  entry(noteState, 'm1', 'p-chen').confirm = 'pending';
  noteState.notes = [
    {
      id: 'n-zh',
      leaderId: 'p-chen',
      text: { 'zh-CN': '中文留言', en: 'Chinese note' },
      status: 'open',
      createdAt: '2026-10-24T01:00:00.000Z',
    },
  ];
  const localized = todoView(options(noteState, ref.actorFor('secretary')));
  assert.equal(localized.sections[0].rows[0].text, '中文留言');
});
