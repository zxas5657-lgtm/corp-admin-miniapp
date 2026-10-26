'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RETIRED = ['--primary', '--warn', '--ok', '--danger', '--vehicle'];
const ROOT = path.join(__dirname, '..', 'miniprogram');

function wxssFiles(dir, found) {
  const names = fs.readdirSync(dir);
  for (let i = 0; i < names.length; i += 1) {
    const full = path.join(dir, names[i]);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) wxssFiles(full, found);
    else if (names[i].endsWith('.wxss')) found.push(full);
  }
  return found;
}

test('miniprogram wxss does not use retired color tokens', function () {
  const files = wxssFiles(ROOT, []);
  const hits = [];
  for (let i = 0; i < files.length; i += 1) {
    const text = fs.readFileSync(files[i], 'utf8');
    for (let j = 0; j < RETIRED.length; j += 1) {
      if (text.indexOf(RETIRED[j]) !== -1) {
        hits.push(path.relative(ROOT, files[i]) + ' ' + RETIRED[j]);
      }
    }
  }
  assert.deepEqual(hits, []);
});
