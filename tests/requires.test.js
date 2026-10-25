'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The WeChat module loader does not resolve a directory to its index.js the
// way Node does, so require('../i18n') boots fine in tests but crashes App().
const ROOT = path.join(__dirname, '..', 'miniprogram');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(function (entry) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('every relative require in miniprogram/ names a .js file, not a directory', () => {
  const bad = [];
  for (const file of jsFiles(ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const target = path.resolve(path.dirname(file), match[1]);
      const resolved = target.endsWith('.js') ? target : target + '.js';
      if (!fs.existsSync(resolved)) bad.push(path.relative(ROOT, file) + ": require('" + match[1] + "')");
    }
  }
  assert.deepEqual(bad, []);
});
