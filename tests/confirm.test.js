'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ref = require('../miniprogram/data/reference');
const { createMeeting } = require('../miniprogram/domain/meeting');
const { createSeries } = require('../miniprogram/domain/item');
const { confirmItem, declineItem, markSeen, changeItem } = require('../miniprogram/domain/confirm');

const now = new Date('2026-10-24T01:20:00.000Z');
const ctx = { supports: ref.SUPPORTS, isLeader: ref.isLeader };

function meeting() {
  return createMeeting(
    {
      title: 'Review',
      date: '2026-10-28',
      start: '09:00',
      end: '10:00',
      roomId: 'f3-small',
      attendeeIds: ['p-chen'],
    },
    { id: 'meeting', actor: ref.actorFor('secretary'), now, isLeader: ref.isLeader },
  );
}

test('leaders confirm, decline with a reason, and mark only their own entry seen', () => {
  const item = meeting();
  const leader = ref.actorFor('leader');
  const confirmed = confirmItem(item, { actor: leader, now });
  assert.equal(confirmed.ok, true);
  assert.equal(
    confirmed.item.leaders.find((entry) => entry.leaderId === 'p-chen').confirm,
    'confirmed',
  );
  assert.deepEqual(declineItem(item, { actor: leader, now }), {
    ok: false,
    code: 'item.decline.reasonRequired',
  });
  const withReason = declineItem(item, { actor: leader, now, reason: 'Schedule conflict' });
  assert.equal(withReason.item.leaders[0].confirm, 'declined');
  assert.equal(withReason.item.leaders[0].declineReason, 'Schedule conflict');
  const seen = markSeen(item, { actor: leader, now });
  assert.equal(seen.item.leaders[0].seenAt, now.toISOString());
  assert.deepEqual(confirmItem(item, { actor: ref.actorFor('secretary'), now }), {
    ok: false,
    code: 'permission.denied',
  });
});

test('leader and secretary changes apply confirmation choices and stale revisions', () => {
  const item = meeting();
  const leaderChange = changeItem(
    item,
    { title: 'Leader edit' },
    { actor: ref.actorFor('leader'), now, ctx, expectedRev: 0 },
  );
  assert.equal(leaderChange.ok, true);
  assert.equal(leaderChange.item.title, 'Leader edit');
  assert.equal(leaderChange.item.leaders[0].confirm, 'confirmed');
  const pending = changeItem(
    item,
    { title: 'Secretary edit' },
    {
      actor: ref.actorFor('secretary'),
      now,
      ctx,
      needsConfirm: true,
      changeNote: 'Please review',
    },
  );
  assert.equal(pending.ok, true);
  assert.equal(pending.item.leaders[0].confirm, 'pending');
  assert.equal(pending.item.leaders[0].changeNote, 'Please review');
  const noConfirm = changeItem(
    item,
    { title: 'Secretary edit without confirmation' },
    { actor: ref.actorFor('secretary'), now, ctx, needsConfirm: false },
  );
  assert.equal(noConfirm.item.leaders[0].confirm, 'none');
  assert.deepEqual(
    changeItem(item, { title: 'Missing choice' }, { actor: ref.actorFor('secretary'), now, ctx }),
    { ok: false, code: 'item.needsConfirm.required' },
  );
  assert.deepEqual(
    changeItem(
      item,
      { title: 'Stale' },
      {
        actor: ref.actorFor('secretary'),
        now,
        ctx,
        needsConfirm: true,
        expectedRev: 4,
      },
    ),
    { ok: false, code: 'item.alreadyChanged' },
  );
  assert.equal(
    changeItem(item, { title: 'No access' }, { actor: ref.actorFor('receptionist'), now, ctx }).ok,
    false,
  );
});

test('declining the second occurrence affects only that occurrence and later ones', () => {
  const items = createSeries(
    'travel',
    {
      title: 'Weekly trip',
      date: '2026-10-25',
      start: '09:00',
      end: '10:00',
      leaderIds: ['p-chen'],
    },
    {
      id: 'trip',
      seriesId: 'series-1',
      until: '2026-11-15',
      actor: ref.actorFor('leader'),
      now,
      tz: 'America/Los_Angeles',
      isLeader: ref.isLeader,
    },
  );
  const result = declineItem(items[1], {
    actor: ref.actorFor('leader'),
    now,
    reason: 'No longer needed',
    items,
  });
  assert.equal(result.ok, true);
  assert.equal(result.items[0].leaders[0].confirm, 'confirmed');
  assert.equal(result.items[1].leaders[0].confirm, 'declined');
  assert.equal(result.items[2].leaders[0].confirm, 'declined');
  assert.equal(result.items[3].leaders[0].confirm, 'declined');
});
