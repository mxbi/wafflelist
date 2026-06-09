// Verifies src/pkjs/crypto.js byte-for-byte against Node's crypto/WebCrypto,
// including an end-to-end interop test replicating the Wafflelist web
// client's key derivation (src/lib/crypto.ts). Run with: node test/crypto.test.cjs

'use strict';

const assert = require('node:assert');
const nodeCrypto = require('node:crypto');
const { subtle } = nodeCrypto.webcrypto;
const c = require('../src/pkjs/crypto.js');

const hex = (u8) => Buffer.from(u8).toString('hex');
let passed = 0;

function ok(name) {
  passed++;
  console.log('ok ' + passed + ' - ' + name);
}

function randBytes(n) {
  return new Uint8Array(nodeCrypto.randomBytes(n));
}

async function main() {
  // --- encoding helpers ---
  for (const s of ['', 'hello', 'héllo wörld', '日本語テスト', 'emoji 🧇✅', 'a'.repeat(300)]) {
    assert.strictEqual(hex(c.utf8Encode(s)), Buffer.from(s, 'utf8').toString('hex'), 'utf8 encode: ' + s.slice(0, 20));
    assert.strictEqual(c.utf8Decode(c.utf8Encode(s)), s, 'utf8 roundtrip');
  }
  ok('utf8 encode/decode');

  for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 31, 100]) {
    const b = randBytes(n);
    assert.strictEqual(c.bytesToBase64(b), Buffer.from(b).toString('base64'), 'b64 encode len ' + n);
    assert.strictEqual(hex(c.base64ToBytes(Buffer.from(b).toString('base64'))), hex(b), 'b64 decode len ' + n);
  }
  ok('base64 encode/decode');

  assert.strictEqual(hex(c.hexToBytes('00ff10ab')), '00ff10ab');
  assert.strictEqual(c.bytesToHex(new Uint8Array([0, 255, 16, 171])), '00ff10ab');
  ok('hex encode/decode');

  // --- hashes ---
  for (const n of [0, 1, 3, 55, 56, 63, 64, 65, 127, 128, 129, 1000, 10000]) {
    const m = randBytes(n);
    assert.strictEqual(hex(c.sha256(m)), nodeCrypto.createHash('sha256').update(m).digest('hex'), 'sha256 len ' + n);
  }
  ok('sha256 vs node');

  for (const n of [0, 1, 3, 111, 112, 127, 128, 129, 255, 256, 1000]) {
    const m = randBytes(n);
    assert.strictEqual(hex(c.sha512(m)), nodeCrypto.createHash('sha512').update(m).digest('hex'), 'sha512 len ' + n);
  }
  ok('sha512 vs node');

  // --- HMAC ---
  for (const [klen, mlen] of [[0, 0], [1, 5], [32, 32], [64, 100], [65, 200], [100, 1000]]) {
    const k = randBytes(klen), m = randBytes(mlen);
    assert.strictEqual(hex(c.hmacSha256(k, m)), nodeCrypto.createHmac('sha256', k).update(m).digest('hex'), `hmac k=${klen} m=${mlen}`);
  }
  ok('hmac-sha256 vs node');

  // --- PBKDF2 ---
  for (const iters of [1, 2, 10, 1000]) {
    const pw = c.utf8Encode('test password');
    const salt = c.utf8Encode('wafflelist-user-id-v1');
    const expected = nodeCrypto.pbkdf2Sync(pw, salt, iters, 32, 'sha256').toString('hex');
    assert.strictEqual(hex(c.pbkdf2Sha256(pw, salt, iters)), expected, 'pbkdf2 iters ' + iters);
  }
  ok('pbkdf2-sha256 vs node');

  // async chunked variant matches sync
  await new Promise((resolve) => {
    const pw = c.utf8Encode('abandon ability able about above absent absorb abstract absurd abuse access accident');
    const salt = c.utf8Encode('wafflelist-user-id-v1');
    c.pbkdf2Sha256Async(pw, salt, 60000, (result) => {
      const expected = nodeCrypto.pbkdf2Sync(pw, salt, 60000, 32, 'sha256').toString('hex');
      assert.strictEqual(hex(result), expected, 'pbkdf2 async 60000');
      ok('pbkdf2 async chunked matches');
      resolve();
    });
  });

  // --- HKDF ---
  for (const [ikm, salt, info] of [
    ['some seed phrase here', 'wafflelist-encryption-v1', 'encryption'],
    ['another phrase', 'wafflelist-signing-v1', 'signing'],
    ['', 'salt', 'info']
  ]) {
    const expected = Buffer.from(nodeCrypto.hkdfSync('sha256', Buffer.from(ikm), Buffer.from(salt), Buffer.from(info), 32)).toString('hex');
    assert.strictEqual(hex(c.hkdfSha256(c.utf8Encode(ikm), c.utf8Encode(salt), c.utf8Encode(info))), expected, 'hkdf ' + salt);
  }
  ok('hkdf-sha256 vs node');

  // --- AES-256-GCM ---
  for (const n of [0, 1, 15, 16, 17, 31, 32, 100, 1000, 5000]) {
    const key = randBytes(32), iv = randBytes(12), pt = randBytes(n);
    const wkey = await subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const expected = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, wkey, pt));
    assert.strictEqual(hex(c.aesGcmEncrypt(key, iv, pt)), hex(expected), 'gcm encrypt len ' + n);
    // decrypt our own + webcrypto's output
    assert.strictEqual(hex(c.aesGcmDecrypt(key, iv, expected)), hex(pt), 'gcm decrypt len ' + n);
    // tamper detection
    const bad = new Uint8Array(expected);
    bad[bad.length - 1] ^= 1;
    assert.strictEqual(c.aesGcmDecrypt(key, iv, bad), null, 'gcm tamper len ' + n);
  }
  ok('aes-256-gcm vs webcrypto (encrypt/decrypt/tamper)');

  // --- Ed25519 ---
  const ED25519_PKCS8_PREFIX = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
  ]);
  for (let t = 0; t < 8; t++) {
    const seed = randBytes(32);
    const pkcs8 = new Uint8Array(48);
    pkcs8.set(ED25519_PKCS8_PREFIX);
    pkcs8.set(seed, 16);
    const priv = await subtle.importKey('pkcs8', pkcs8, 'Ed25519', true, ['sign']);
    const jwk = await subtle.exportKey('jwk', priv);
    const expectedPub = Buffer.from(jwk.x, 'base64url').toString('hex');
    assert.strictEqual(hex(c.ed25519PublicKey(seed)), expectedPub, 'ed25519 pubkey ' + t);

    const msg = randBytes(10 + t * 37);
    const expectedSig = new Uint8Array(await subtle.sign('Ed25519', priv, msg));
    assert.strictEqual(hex(c.ed25519Sign(seed, msg)), hex(expectedSig), 'ed25519 sig ' + t);
  }
  ok('ed25519 pubkey + signatures vs webcrypto');

  // --- randomness sanity ---
  const r1 = c.randomBytes(48), r2 = c.randomBytes(48);
  assert.notStrictEqual(hex(r1), hex(r2), 'randomBytes repeats');
  const u = c.uuid4();
  assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'uuid4 format');
  ok('randomBytes/uuid4 sanity');

  // --- end-to-end interop with the web client (src/lib/crypto.ts) ---
  const phrase = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

  // deriveUserId: PBKDF2-SHA256 600k — use fewer iterations for test speed,
  // verified at full count by the pbkdf2 tests above + a 600k smoke below.
  const expectedUserId = nodeCrypto.pbkdf2Sync(
    Buffer.from(phrase), Buffer.from('wafflelist-user-id-v1'), 600000, 32, 'sha256').toString('hex');

  // deriveEncryptionKey: HKDF-SHA256
  const encKey = c.deriveEncryptionKey(phrase);
  const keyMaterial = await subtle.importKey('raw', Buffer.from(phrase), 'HKDF', false, ['deriveKey']);
  const webEncKey = await subtle.deriveKey(
    { name: 'HKDF', salt: Buffer.from('wafflelist-encryption-v1'), info: Buffer.from('encryption'), hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

  // web client encrypts a todo -> pebble decrypts it
  const todo = {
    user_id: 'u', list_id: null, title: 'bûy waffles 🧇', notes: null,
    due_date: null, reminder_date: null, snoozed_until: null,
    completed_at: null, sort_order: -3, created_at: 1700000000000
  };
  const iv = randBytes(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, webEncKey, Buffer.from(JSON.stringify(todo))));
  const blob = Buffer.concat([iv, ct]).toString('base64');
  assert.deepStrictEqual(c.decryptBlob(encKey, blob), todo, 'decrypt web-client blob');

  // pebble encrypts a todo -> web client decrypts it
  const blob2 = c.encryptBlob(encKey, todo);
  const combined = Buffer.from(blob2, 'base64');
  const pt2 = new Uint8Array(await subtle.decrypt(
    { name: 'AES-GCM', iv: combined.subarray(0, 12) }, webEncKey, combined.subarray(12)));
  assert.deepStrictEqual(JSON.parse(Buffer.from(pt2).toString('utf8')), todo, 'web client decrypts pebble blob');

  // signing: derive seed, sign a request exactly like stores/todos.ts api(),
  // verify like server verify.ts does
  const signSeed = c.deriveSigningSeed(phrase);
  const timestamp = Date.now();
  const body = JSON.stringify({ id: 'x', encrypted_blob: blob2 });
  const message = `POST\n/api/todos\n${timestamp}\n${body}`;
  const sig = c.ed25519Sign(signSeed, c.utf8Encode(message));
  const pub = c.ed25519PublicKey(signSeed);
  const pubKey = await subtle.importKey('raw', pub, 'Ed25519', false, ['verify']);
  assert.strictEqual(await subtle.verify('Ed25519', pubKey, sig, Buffer.from(message)), true, 'server-side verify');

  // and the public key must match what the web client would register at login
  const pkcs8 = new Uint8Array(48);
  pkcs8.set(ED25519_PKCS8_PREFIX);
  pkcs8.set(signSeed, 16);
  const webPriv = await subtle.importKey('pkcs8', pkcs8, 'Ed25519', true, ['sign']);
  const webJwk = await subtle.exportKey('jwk', webPriv);
  assert.strictEqual(Buffer.from(pub).toString('base64'), Buffer.from(webJwk.x, 'base64url').toString('base64'), 'registered pubkey matches web client');
  ok('end-to-end wafflelist interop (blobs + signing)');

  // --- full 600k-iteration user id derivation (slow path users actually hit) ---
  const t0 = Date.now();
  await new Promise((resolve) => {
    c.deriveUserIdAsync(phrase, (userId) => {
      assert.strictEqual(userId, expectedUserId, 'deriveUserId 600k');
      ok('deriveUserId @ 600k iterations matches web client (' + (Date.now() - t0) + 'ms)');
      resolve();
    });
  });

  console.log('\nAll ' + passed + ' test groups passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
