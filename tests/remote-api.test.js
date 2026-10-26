'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteApi } = require('../miniprogram/store/remote');

function apiFor(result, options) {
  return createRemoteApi({ call: async () => result, ...(options || {}) });
}

test('remote call failures normalize to network.failed', async () => {
  for (const result of [undefined, {}, { ok: 1 }]) {
    const api = apiFor(result);
    assert.deepEqual(await api.whoami(), { ok: false, code: 'network.failed' });
  }
  const rejected = createRemoteApi({
    call: async () => {
      throw new Error('offline');
    },
  });
  assert.deepEqual(await rejected.whoami(), { ok: false, code: 'network.failed' });
});

test('remote errors preserve known codes and map unknown codes to server.error', async () => {
  assert.deepEqual(await apiFor({ ok: false, code: 'prefs.invalid' }).getPrefs(), {
    ok: false,
    code: 'prefs.invalid',
  });
  assert.deepEqual(await apiFor({ ok: false, code: 'not.a.real.code' }).getPrefs(), {
    ok: false,
    code: 'server.error',
  });
});

test('remote auth loss hooks run once per occurrence and cannot break results', async () => {
  const seen = [];
  const api = apiFor(
    { ok: false, code: 'auth.notBound' },
    { onAuthLost: (code) => seen.push(code) },
  );
  assert.deepEqual(await api.whoami(), { ok: false, code: 'auth.notBound' });
  assert.deepEqual(await api.whoami(), { ok: false, code: 'auth.notBound' });
  const disabled = apiFor(
    { ok: false, code: 'auth.employeeDisabled' },
    {
      onAuthLost: () => {
        throw new Error('hook');
      },
    },
  );
  assert.deepEqual(await disabled.whoami(), { ok: false, code: 'auth.employeeDisabled' });
  assert.deepEqual(seen, ['auth.notBound', 'auth.notBound']);
});

test('remote payloads carry the action and server documents are converted', async () => {
  const calls = [];
  const api = createRemoteApi({
    call: async (fn, data) => {
      calls.push({ fn, data });
      return {
        ok: true,
        item: { _id: 'i-1', when: { $date: 0 }, leaders: [{ _id: 'p-1' }] },
      };
    },
  });
  const result = await api.editItem({
    id: 'i-1',
    patch: { title: 'Updated', createdAt: 'client-value', rev: 8 },
    expectedRev: 2,
  });
  assert.deepEqual(result.item, {
    id: 'i-1',
    when: '1970-01-01T00:00:00.000Z',
    leaders: [{ id: 'p-1' }],
  });
  assert.deepEqual(calls, [
    {
      fn: 'items',
      data: { action: 'edit', id: 'i-1', patch: { title: 'Updated' }, expectedRev: 2 },
    },
  ]);
});
