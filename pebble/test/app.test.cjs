// Behavioral test of src/pkjs/index.js against a mocked Pebble environment
// and a mocked Wafflelist server. The mock server behaves like the real one
// (src/lib/server/crud.ts + verify.ts): it verifies every Ed25519 signature
// with WebCrypto against the registered public key, and the test reads blobs
// with WebCrypto exactly like the web client would.
//
// Run with: node test/app.test.cjs

'use strict';

const assert = require('node:assert');
const nodeCrypto = require('node:crypto');
const { subtle } = nodeCrypto.webcrypto;

const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const SERVER = 'http://test.local';

/* ---------------- web-client-equivalent crypto (WebCrypto) ---------------- */

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

async function webDeriveEncryptionKey(phrase) {
  const km = await subtle.importKey('raw', Buffer.from(phrase), 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', salt: Buffer.from('wafflelist-encryption-v1'), info: Buffer.from('encryption'), hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function webEncryptBlob(key, obj) {
  const iv = nodeCrypto.randomBytes(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, Buffer.from(JSON.stringify(obj))));
  return Buffer.concat([iv, ct]).toString('base64');
}

async function webDecryptBlob(key, blobB64) {
  const combined = Buffer.from(blobB64, 'base64');
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: combined.subarray(0, 12) }, key, combined.subarray(12));
  return JSON.parse(Buffer.from(pt).toString('utf8'));
}

/* ---------------- mock Wafflelist server ---------------- */

const server = {
  users: {},        // user_id -> public key (base64)
  todos: new Map(), // id -> {id, user_id, encrypted_blob, updated_at}
  requests: []      // log of {method, path}
};

async function verifySignature(method, pathname, headers, body) {
  const userId = headers['x-user-id'];
  const ts = Number(headers['x-timestamp']);
  assert.ok(Math.abs(Date.now() - ts) < 5 * 60 * 1000, 'timestamp fresh');
  const pubB64 = server.users[userId];
  if (!pubB64) return null;
  const pub = await subtle.importKey('raw', Buffer.from(pubB64, 'base64'), 'Ed25519', false, ['verify']);
  const message = `${method}\n${pathname}\n${ts}\n${body}`;
  const ok = await subtle.verify('Ed25519', pub, Buffer.from(headers['x-signature'], 'base64'), Buffer.from(message));
  return ok ? userId : null;
}

async function handleRequest(method, url, headers, body) {
  const u = new URL(url);
  assert.strictEqual(u.origin, SERVER, 'request goes to configured server');
  const path = u.pathname;
  server.requests.push({ method, path });

  if (method === 'POST' && path === '/api/auth/login') {
    const { user_id, signing_public_key } = JSON.parse(body);
    if (!server.users[user_id]) server.users[user_id] = signing_public_key;
    return { status: 200, text: JSON.stringify({ ok: true }) };
  }

  const userId = await verifySignature(method, path, headers, body);
  if (!userId) return { status: 401, text: 'Invalid signature' };

  if (method === 'GET' && path === '/api/todos') {
    const rows = [...server.todos.values()]
      .filter((t) => t.user_id === userId && t.encrypted_blob !== null)
      .map(({ id, encrypted_blob, updated_at }) => ({ id, encrypted_blob, updated_at }));
    return { status: 200, text: JSON.stringify(rows) };
  }

  if (method === 'POST' && path === '/api/todos') {
    const { id, encrypted_blob } = JSON.parse(body);
    const now = Date.now();
    server.todos.set(id, { id, user_id: userId, encrypted_blob, updated_at: now });
    return { status: 201, text: JSON.stringify({ id, encrypted_blob, updated_at: now }) };
  }

  const patchMatch = path.match(/^\/api\/todos\/([^/]+)$/);
  if (method === 'PATCH' && patchMatch) {
    const existing = server.todos.get(patchMatch[1]);
    if (!existing || existing.encrypted_blob === null) return { status: 404, text: 'Todo not found' };
    const ifUnmod = headers['if-unmodified-since'];
    if (ifUnmod && existing.updated_at > Number(ifUnmod)) {
      return { status: 409, text: JSON.stringify({ id: existing.id, encrypted_blob: existing.encrypted_blob, updated_at: existing.updated_at }) };
    }
    existing.encrypted_blob = JSON.parse(body).encrypted_blob;
    existing.updated_at = Date.now();
    return { status: 200, text: JSON.stringify({ id: existing.id, encrypted_blob: existing.encrypted_blob, updated_at: existing.updated_at }) };
  }

  return { status: 404, text: 'not found' };
}

/* ---------------- mock PebbleKit JS environment ---------------- */

const storage = {};
global.localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};

const handlers = {};
const sentToWatch = [];
global.Pebble = {
  addEventListener: (ev, fn) => { handlers[ev] = fn; },
  sendAppMessage: (msg, ok) => {
    sentToWatch.push(msg);
    setImmediate(() => ok && ok(msg));
  },
  openURL: (url) => { global.Pebble.lastUrl = url; }
};

global.XMLHttpRequest = class {
  constructor() { this.headers = {}; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(k, v) { this.headers[k.toLowerCase()] = v; }
  send(body) {
    handleRequest(this.method, this.url, this.headers, body || '').then((res) => {
      this.status = res.status;
      this.responseText = res.text;
      if (this.onload) this.onload();
    }, (e) => {
      console.error('mock server error:', e);
      if (this.onerror) this.onerror();
    });
  }
};

/* ---------------- helpers ---------------- */

function waitFor(fn, desc, ms = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      Promise.resolve(fn()).then((v) => {
        if (v) return resolve(v);
        if (Date.now() - start > ms) return reject(new Error('timeout waiting for: ' + desc));
        setTimeout(poll, 10);
      }, reject);
    })();
  });
}

// The watch list = the last Count message and the Index/Title messages after it.
function watchList() {
  let countIdx = -1;
  for (let i = sentToWatch.length - 1; i >= 0; i--) {
    if (sentToWatch[i].Count !== undefined) { countIdx = i; break; }
  }
  if (countIdx === -1) return null;
  const count = sentToWatch[countIdx].Count;
  const titles = new Array(count).fill(null);
  for (let i = countIdx + 1; i < sentToWatch.length; i++) {
    if (sentToWatch[i].Index !== undefined) titles[sentToWatch[i].Index] = sentToWatch[i].Title;
  }
  return { count, titles, status: sentToWatch[countIdx].Status, complete: titles.every((t) => t !== null) };
}

function countMessages() {
  return sentToWatch.filter((m) => m.Count !== undefined).length;
}

let passed = 0;
function ok(name) {
  passed++;
  console.log('ok ' + passed + ' - ' + name);
}

/* ---------------- the test ---------------- */

async function main() {
  require('../src/pkjs/index.js');

  // 1. Launch before any configuration
  handlers.ready();
  await waitFor(() => sentToWatch.some((m) => /settings/i.test(m.Status || '')), 'unconfigured status');
  ok('unconfigured launch tells user to open settings');

  // 2. Configuration page opens and the seed phrase round-trips
  handlers.showConfiguration();
  assert.match(global.Pebble.lastUrl, /^data:text\/html/, 'config page is a data: URL');

  // invalid phrase is rejected
  handlers.webviewclosed({ response: encodeURIComponent(JSON.stringify({ phrase: 'legal winner thank year wave sausage worth useful legal winner thank thank', server: SERVER })) });
  await waitFor(() => sentToWatch.some((m) => /invalid/i.test(m.Status || '')), 'invalid phrase status');
  assert.strictEqual(Object.keys(server.users).length, 0, 'no user registered for bad phrase');
  ok('bad checksum phrase rejected');

  // valid phrase: derives keys (real 600k PBKDF2), registers, fetches
  handlers.webviewclosed({ response: encodeURIComponent(JSON.stringify({ phrase: '  Legal winner thank year wave sausage worth useful legal winner thank yellow ', server: SERVER + '/' })) });
  await waitFor(() => Object.keys(server.users).length === 1, 'user registered');

  const expectedUserId = nodeCrypto.pbkdf2Sync(
    Buffer.from(PHRASE), Buffer.from('wafflelist-user-id-v1'), 600000, 32, 'sha256').toString('hex');
  assert.ok(server.users[expectedUserId], 'registered under the web client user id');

  // registered public key must equal what the web client derives via PKCS8
  const signSeed = Buffer.from(nodeCrypto.hkdfSync('sha256', Buffer.from(PHRASE), Buffer.from('wafflelist-signing-v1'), Buffer.from('signing'), 32));
  const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, signSeed]);
  const priv = await subtle.importKey('pkcs8', pkcs8, 'Ed25519', true, ['sign']);
  const jwk = await subtle.exportKey('jwk', priv);
  assert.strictEqual(server.users[expectedUserId], Buffer.from(jwk.x, 'base64url').toString('base64'));
  ok('key derivation + registration matches the web client (incl. normalization)');

  await waitFor(() => { const l = watchList(); return l && l.count === 0; }, 'empty inbox sent');
  ok('empty inbox synced to watch (signed GET verified by server)');

  // 3. Inbox filtering: seed the server as the web client would
  const encKey = await webDeriveEncryptionKey(PHRASE);
  const t = (id, fields) => ({
    user_id: expectedUserId, list_id: null, title: id, notes: null, due_date: null,
    reminder_date: null, snoozed_until: null, completed_at: null,
    sort_order: 0, created_at: Date.now(), ...fields
  });
  const seed = {
    Alpha: t('Alpha', { sort_order: 2 }),
    Beta: t('Beta', { sort_order: -1 }),
    Done: t('Done', { completed_at: new Date().toISOString() }),
    Listed: t('Listed', { list_id: 'some-list' }),
    SnoozedFuture: t('SnoozedFuture', { snoozed_until: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0] }),
    SnoozedPast: t('SnoozedPast', { sort_order: 0, snoozed_until: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0] })
  };
  for (const [id, plain] of Object.entries(seed)) {
    server.todos.set(id, { id, user_id: expectedUserId, encrypted_blob: await webEncryptBlob(encKey, plain), updated_at: Date.now() });
  }

  handlers.appmessage({ payload: { Request: 1 } });
  await waitFor(() => { const l = watchList(); return l && l.count === 3 && l.complete; }, 'inbox of 3');
  assert.deepStrictEqual(watchList().titles, ['Beta', 'SnoozedPast', 'Alpha'], 'inbox filter + sort_order order');
  ok('inbox excludes completed/listed/snoozed todos and sorts by sort_order');

  // 4. Add a todo from dictation
  handlers.appmessage({ payload: { AddTodo: '  Buy waffles  ' } });
  await waitFor(() => { const l = watchList(); return l && l.count === 4 && l.complete; }, 'optimistic add');
  assert.strictEqual(watchList().titles[0], 'Buy waffles', 'new todo at the top');
  const created = await waitFor(() => [...server.todos.values()].find((r) => !seed[r.id]), 'todo stored on server');
  const createdPlain = await webDecryptBlob(encKey, created.encrypted_blob);
  assert.strictEqual(createdPlain.title, 'Buy waffles', 'title trimmed');
  assert.strictEqual(createdPlain.sort_order, -2, 'placed above all active todos');
  assert.strictEqual(createdPlain.list_id, null);
  assert.strictEqual(createdPlain.completed_at, null);
  assert.strictEqual(createdPlain.user_id, expectedUserId);
  assert.match(created.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  ok('dictated todo encrypted + POSTed, readable by the web client');

  // 5. Complete by index; indices must stay aligned after the splice
  const countMsgsBefore = countMessages();
  handlers.appmessage({ payload: { Complete: 1 } }); // 'Beta'
  await waitFor(async () => {
    const row = server.todos.get('Beta');
    return (await webDecryptBlob(encKey, row.encrypted_blob)).completed_at;
  }, 'Beta completed');
  // watch list is now [Buy waffles, SnoozedPast, Alpha]; index 1 = SnoozedPast
  handlers.appmessage({ payload: { Complete: 1 } });
  await waitFor(async () => {
    const row = server.todos.get('SnoozedPast');
    return (await webDecryptBlob(encKey, row.encrypted_blob)).completed_at;
  }, 'SnoozedPast completed');
  const alphaPlain = await webDecryptBlob(encKey, server.todos.get('Alpha').encrypted_blob);
  assert.strictEqual(alphaPlain.completed_at, null, 'Alpha untouched');
  assert.strictEqual(countMessages(), countMsgsBefore, 'no list re-send on successful complete');
  ok('double-press complete PATCHes the right todos after index splice');

  // 6. Conflict: another client edits Alpha, then the watch tries to complete it
  await new Promise((r) => setTimeout(r, 5)); // ensure a newer updated_at
  const editedAlpha = { ...alphaPlain, title: 'Alpha v2' };
  server.todos.get('Alpha').encrypted_blob = await webEncryptBlob(encKey, editedAlpha);
  server.todos.get('Alpha').updated_at = Date.now();

  handlers.appmessage({ payload: { Complete: 1 } }); // stale view: index 1 = Alpha
  await waitFor(() => { const l = watchList(); return l && l.count === 2 && l.complete; }, 'refetch after 409');
  assert.deepStrictEqual(watchList().titles, ['Buy waffles', 'Alpha v2'], 'fresh list after conflict');
  const alphaAfter = await webDecryptBlob(encKey, server.todos.get('Alpha').encrypted_blob);
  assert.strictEqual(alphaAfter.completed_at, null, 'conflicting complete not applied');
  assert.strictEqual(alphaAfter.title, 'Alpha v2', 'concurrent edit preserved');
  ok('409 conflict triggers resync instead of clobbering');

  // 7. Relaunch with cached keys: no key derivation, straight to fetch
  const loginCalls = server.requests.filter((r) => r.path === '/api/auth/login').length;
  handlers.ready();
  await waitFor(() => server.requests.filter((r) => r.method === 'GET' && r.path === '/api/todos').length >= 4, 'fetch on relaunch');
  assert.strictEqual(server.requests.filter((r) => r.path === '/api/auth/login').length, loginCalls, 'no re-login on relaunch');
  ok('relaunch uses cached keys from localStorage');

  console.log('\nAll ' + passed + ' app test groups passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
