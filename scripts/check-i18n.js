'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LOCALE_FILES = [
  ['zh-CN', 'miniprogram/i18n/zh-CN.js'],
  ['en', 'miniprogram/i18n/en.js'],
];
const CJK_DIRECTORIES = [
  'miniprogram/domain',
  'miniprogram/pages',
  'miniprogram/components',
  'miniprogram/behaviors',
  'miniprogram/custom-tab-bar',
  'miniprogram/store',
];
const CJK_ROOT_FILES = [
  'miniprogram/app.js',
  'miniprogram/app.json',
  'miniprogram/app.wxss',
];
const SCANNED_EXTENSIONS = new Set(['.js', '.wxml', '.wxss', '.json']);
const PLURAL_SUFFIXES = new Set(['one', 'other']);
const PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_.-]+)\}/g;

/**
 * Flatten nested locale objects into dot-separated keys. Arrays are leaves.
 *
 * @param {unknown} value
 * @param {string} prefix
 * @returns {Record<string, unknown>}
 */
function flattenKeys(value, prefix = '') {
  const result = {};

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) result[prefix] = value;
    return result;
  }

  for (const [key, child] of Object.entries(value)) {
    const flattenedKey = prefix ? `${prefix}.${key}` : key;
    if (
      child !== null &&
      typeof child === 'object' &&
      !Array.isArray(child)
    ) {
      Object.assign(result, flattenKeys(child, flattenedKey));
    } else {
      result[flattenedKey] = child;
    }
  }

  return result;
}

function localeValue(value) {
  if (
    value &&
    typeof value === 'object' &&
    value.default &&
    Object.keys(value).every((key) => key === 'default' || key === '__esModule')
  ) {
    return value.default;
  }
  return value;
}

function pluralGroups(locale) {
  const flattened = flattenKeys(localeValue(locale));
  const groups = new Map();

  for (const [key, value] of Object.entries(flattened)) {
    const match = /^(.*)_(one|other)$/.exec(key);
    const base = match ? match[1] : key;
    const group = groups.get(base) || { forms: new Map() };
    group.forms.set(match ? match[2] : 'base', { key, value });
    groups.set(base, group);
  }

  return groups;
}

function placeholderSet(value) {
  const placeholders = new Set();
  const text = typeof value === 'string' ? value : '';
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1]);
  }
  return placeholders;
}

function formatSet(values) {
  return `{${[...values].sort().join(', ')}}`;
}

function sameSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

/**
 * Compare the flattened key and placeholder contracts of two locale objects.
 * The returned array contains human-readable errors; an empty array means
 * the locales are compatible. Plural `_one`/`_other` keys are compared as a
 * single base key, while English requires both forms.
 *
 * @param {unknown} zhLocale
 * @param {unknown} enLocale
 * @returns {string[]}
 */
function compareLocales(zhLocale, enLocale) {
  const zhGroups = pluralGroups(zhLocale);
  const enGroups = pluralGroups(enLocale);
  const errors = [];
  const allBases = new Set([...zhGroups.keys(), ...enGroups.keys()]);

  for (const base of [...allBases].sort()) {
    const zhGroup = zhGroups.get(base);
    const enGroup = enGroups.get(base);

    if (!zhGroup) {
      errors.push(`Missing key in zh-CN: ${base}`);
      continue;
    }
    if (!enGroup) {
      errors.push(`Missing key in en: ${base}`);
      continue;
    }

    const zhForms = new Set(zhGroup.forms.keys());
    const enForms = new Set(enGroup.forms.keys());
    const zhPlural = [...zhForms].some((form) => PLURAL_SUFFIXES.has(form));
    const enPlural = [...enForms].some((form) => PLURAL_SUFFIXES.has(form));

    if (zhForms.has('base') && enPlural) {
      errors.push(`Plural form mismatch for key "${base}".`);
      continue;
    }
    if (enForms.has('base') && zhPlural) {
      errors.push(`Plural form mismatch for key "${base}".`);
      continue;
    }

    if (enPlural && (!enForms.has('one') || !enForms.has('other'))) {
      errors.push(
        `English plural key "${base}" must include both "${base}_one" and "${base}_other".`,
      );
    }
    if (zhForms.has('one') && !zhForms.has('other')) {
      errors.push(
        `Chinese plural key "${base}" has "${base}_one" but is missing "${base}_other".`,
      );
    }

    const sharedForms = new Set([...zhForms].filter((form) => enForms.has(form)));
    for (const form of sharedForms) {
      const zhEntry = zhGroup.forms.get(form);
      const enEntry = enGroup.forms.get(form);
      const zhPlaceholders = placeholderSet(zhEntry.value);
      const enPlaceholders = placeholderSet(enEntry.value);
      if (!sameSet(zhPlaceholders, enPlaceholders)) {
        const key = form === 'base' ? base : `${base}_${form}`;
        errors.push(
          `Placeholder mismatch for key "${key}": zh-CN ${formatSet(zhPlaceholders)}; en ${formatSet(enPlaceholders)}.`,
        );
      }
    }
  }

  return errors;
}

/**
 * Find CJK, CJK punctuation, and fullwidth characters in a string.
 * Results use one-based line numbers and zero-based string indexes.
 *
 * @param {string} text
 * @returns {{char: string, index: number, line: number}[]}
 */
function findCjk(text) {
  const findings = [];
  const source = String(text);
  let line = 1;

  for (let index = 0; index < source.length; index += 1) {
    const codePoint = source.charCodeAt(index);
    if (
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0x3000 && codePoint <= 0x303f) ||
      (codePoint >= 0xff00 && codePoint <= 0xffef)
    ) {
      findings.push({ char: source[index], index, line });
    }
    if (source[index] === '\n') line += 1;
  }

  return findings;
}

function collectSourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }
  return files;
}

function collectCjkSourceFiles(root) {
  const files = [];
  for (const relativeDirectory of CJK_DIRECTORIES) {
    files.push(...collectSourceFiles(path.join(root, relativeDirectory)));
  }
  for (const relativeFile of CJK_ROOT_FILES) {
    const filePath = path.join(root, relativeFile);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function loadLocale(label, relativePath) {
  const filePath = path.resolve(__dirname, '..', relativePath);
  try {
    delete require.cache[require.resolve(filePath)];
    return { value: require(filePath), filePath };
  } catch (error) {
    return {
      error: `Could not load ${label} locale at ${relativePath}: ${error.message}`,
      filePath,
    };
  }
}

function main() {
  const root = path.resolve(__dirname, '..');
  const localePaths = LOCALE_FILES.map(([, relativePath]) => path.join(root, relativePath));
  const localeFilesExist = localePaths.every((filePath) => fs.existsSync(filePath));
  let failed = false;

  if (localeFilesExist) {
    const zh = loadLocale(...LOCALE_FILES[0]);
    const en = loadLocale(...LOCALE_FILES[1]);
    for (const loaded of [zh, en]) {
      if (loaded.error) {
        console.error(`ERROR: ${loaded.error}`);
        failed = true;
      }
    }
    if (!zh.error && !en.error) {
      for (const error of compareLocales(zh.value, en.value)) {
        console.error(`ERROR: ${error}`);
        failed = true;
      }
    }
  } else {
    console.warn(
      'WARNING: miniprogram/i18n/zh-CN.js and miniprogram/i18n/en.js are not both present; skipping locale parity.',
    );
  }

  for (const filePath of collectCjkSourceFiles(root)) {
    const source = fs.readFileSync(filePath, 'utf8');
    const findings = findCjk(source);
    for (const finding of findings) {
      const relativePath = path.relative(root, filePath).replaceAll(path.sep, '/');
      console.error(
        `ERROR: ${relativePath}:${finding.line}: CJK/fullwidth literal "${finding.char}".`,
      );
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log('OK');
}

module.exports = {
  flattenKeys,
  compareLocales,
  findCjk,
  collectCjkSourceFiles,
};

if (require.main === module) {
  main();
}
