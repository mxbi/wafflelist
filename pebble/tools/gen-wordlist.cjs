// Regenerates src/pkjs/wordlist.js from the web client's BIP39 wordlist.
// Run from the pebble/ directory: node tools/gen-wordlist.cjs

'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../src/lib/bip39-wordlist.ts'), 'utf8');
const m = src.match(/=\s*(\[[\s\S]*\])/);
const words = JSON.parse(m[1]);
if (words.length !== 2048) throw new Error('expected 2048 words, got ' + words.length);

const out = '/* BIP39 English wordlist, generated from src/lib/bip39-wordlist.ts by tools/gen-wordlist.cjs */\n' +
  "'use strict';\n\nmodule.exports = " + JSON.stringify(words) + ';\n';
fs.writeFileSync(path.join(__dirname, '../src/pkjs/wordlist.js'), out);
console.log('wrote', words.length, 'words');
