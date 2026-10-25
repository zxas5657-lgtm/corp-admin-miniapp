'use strict';

function pseudo(value) {
  const text = value == null ? '' : String(value);
  if (!text) return text;
  const extraLen = Math.max(1, Math.round(text.length * 0.4));
  let extra = '';
  for (let i = 0; i < extraLen; i += 1) extra += '~';
  return '[!! ' + text + ' ' + extra + ' !!]';
}

module.exports = {
  pseudo
};
