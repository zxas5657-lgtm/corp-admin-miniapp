'use strict';

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(randomInt) {
  const choose = randomInt || crypto.randomInt;
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += ALPHABET[choose(ALPHABET.length)];
  }
  return code;
}

function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== 8 || !new RegExp(`^[${ALPHABET}]+$`).test(code)) return null;
  return code;
}

function hashCode(code) {
  return crypto
    .createHash('sha256')
    .update(normalizeCode(code) || '')
    .digest('hex');
}

module.exports = { ALPHABET, generateCode, normalizeCode, hashCode };
