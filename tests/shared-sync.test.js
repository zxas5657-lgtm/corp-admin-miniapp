'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const functions = ['auth', 'directory', 'items', 'notes', 'vehicles', 'prefs', 'admin', 'devSeed'];

function bytes(file) {
  return fs.readFileSync(file);
}

test('committed CloudBase shared copies match their sources', () => {
  const domainFiles = fs
    .readdirSync(path.join(root, 'miniprogram', 'domain'))
    .filter((name) => name.endsWith('.js'));
  const libFiles = fs
    .readdirSync(path.join(root, 'cloudfunctions', '_lib'))
    .filter((name) => name.endsWith('.js'));
  for (const name of functions) {
    for (const file of domainFiles) {
      const source = path.join(root, 'miniprogram', 'domain', file);
      const copy = path.join(root, 'cloudfunctions', name, 'shared', 'domain', file);
      assert.ok(fs.existsSync(copy), `missing ${copy}; run npm run sync`);
      assert.deepEqual(bytes(copy), bytes(source), `${copy} differs; run npm run sync`);
    }
    for (const file of libFiles) {
      const source = path.join(root, 'cloudfunctions', '_lib', file);
      const copy = path.join(root, 'cloudfunctions', name, 'shared', 'lib', file);
      assert.ok(fs.existsSync(copy), `missing ${copy}; run npm run sync`);
      assert.deepEqual(bytes(copy), bytes(source), `${copy} differs; run npm run sync`);
    }
    if (name !== 'devSeed') continue;
    for (const file of ['seed.js', 'reference.js', 'zones.js']) {
      const source = path.join(root, 'miniprogram', 'data', file);
      const copy = path.join(root, 'cloudfunctions', name, 'shared', 'data', file);
      assert.ok(fs.existsSync(copy), `missing ${copy}; run npm run sync`);
      assert.deepEqual(bytes(copy), bytes(source), `${copy} differs; run npm run sync`);
    }
  }
});
