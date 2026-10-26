'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDomain = path.join(root, 'miniprogram', 'domain');
const sourceData = path.join(root, 'miniprogram', 'data');
const functions = ['auth', 'directory', 'items', 'notes', 'vehicles', 'prefs', 'admin', 'devSeed'];

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

function copyFiles(source, target, names) {
  fs.mkdirSync(target, { recursive: true });
  for (const name of names) fs.copyFileSync(path.join(source, name), path.join(target, name));
}

function main() {
  const domainFiles = fs
    .readdirSync(sourceDomain)
    .filter((name) => name.endsWith('.js'))
    .sort();
  const dataFiles = ['seed.js', 'reference.js', 'zones.js', 'labels.js'];
  const libFiles = fs
    .readdirSync(path.join(root, 'cloudfunctions', '_lib'))
    .filter((name) => name.endsWith('.js'))
    .sort();
  for (const name of functions) {
    const shared = path.join(root, 'cloudfunctions', name, 'shared');
    resetDirectory(shared);
    copyFiles(sourceDomain, path.join(shared, 'domain'), domainFiles);
    copyFiles(path.join(root, 'cloudfunctions', '_lib'), path.join(shared, 'lib'), libFiles);
    copyFiles(sourceData, path.join(shared, 'data'), dataFiles);
    console.log(`synced ${name}`);
  }
}

main();
