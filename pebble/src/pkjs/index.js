/* Wafflelist for Pebble - phone-side (PebbleKit JS) component.
 *
 * Holds the keys derived from the seed phrase and does all crypto and API
 * traffic; the watch only ever sees plaintext todo titles over AppMessage.
 *
 * Watch -> phone:  Request (refresh), AddTodo (title), Complete (index)
 * Phone -> watch:  Count + Status, then one {Index, Title} per inbox todo
 */

'use strict';

var crypto = require('./crypto');
var wordlist = require('./wordlist');

var DEFAULT_SERVER = 'https://wafflelist.mxbi.net';
var MAX_ITEMS = 20;       // must match MAX_TODOS in wafflelist.c
var MAX_TITLE_BYTES = 47; // must fit the C side's 48-byte buffers

/* ---------------- config ---------------- */

var cfg = {
  server: localStorage.getItem('wl-server') || DEFAULT_SERVER,
  userId: localStorage.getItem('wl-user-id'),
  encKey: localStorage.getItem('wl-enc-key'),
  signSeed: localStorage.getItem('wl-sign-seed')
};

function isConfigured() {
  return !!(cfg.userId && cfg.encKey && cfg.signSeed);
}

function saveConfig() {
  localStorage.setItem('wl-server', cfg.server);
  localStorage.setItem('wl-user-id', cfg.userId);
  localStorage.setItem('wl-enc-key', cfg.encKey);
  localStorage.setItem('wl-sign-seed', cfg.signSeed);
}

/* ---------------- watch messaging ---------------- */

var sendQueue = [];
var sending = false;

function pumpQueue() {
  if (sending || sendQueue.length === 0) return;
  sending = true;
  var msg = sendQueue.shift();
  Pebble.sendAppMessage(msg, function () {
    sending = false;
    pumpQueue();
  }, function () {
    // Drop the message rather than stalling the queue.
    sending = false;
    pumpQueue();
  });
}

function enqueue(msg) {
  sendQueue.push(msg);
  pumpQueue();
}

function sendStatus(text) {
  enqueue({ Status: text });
}

/* ---------------- todo state ---------------- */

// All decrypted todos from the last fetch: {id, updated_at, plain}
var allTodos = [];
// Ids in the order last sent to the watch; Complete messages index into this.
var lastSentIds = [];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Same filter as the web client's 'inbox' view (src/lib/filters.ts).
function inboxTodos() {
  var t = todayStr();
  return allTodos.filter(function (item) {
    var p = item.plain;
    return !p.completed_at && !p.list_id && (!p.snoozed_until || p.snoozed_until <= t);
  }).sort(function (a, b) {
    return a.plain.sort_order - b.plain.sort_order;
  });
}

function truncateTitle(title) {
  var bytes = crypto.utf8Encode(title);
  if (bytes.length <= MAX_TITLE_BYTES) return title;
  var n = MAX_TITLE_BYTES - 3; // room for a 3-byte ellipsis
  while (n > 0 && (bytes[n] & 0xc0) === 0x80) n--; // back up to a char boundary
  return crypto.utf8Decode(bytes.subarray(0, n)) + '…';
}

function sendTodoList(statusText) {
  var inbox = inboxTodos().slice(0, MAX_ITEMS);
  lastSentIds = inbox.map(function (item) { return item.id; });

  // A fresh list supersedes anything still queued.
  sendQueue = [];
  enqueue({
    Count: inbox.length,
    Status: statusText || (inbox.length === 0 ? 'Inbox empty' : '')
  });
  for (var i = 0; i < inbox.length; i++) {
    enqueue({ Index: i, Title: truncateTitle(inbox[i].plain.title) });
  }
}

/* ---------------- signed API requests ---------------- */

function apiRequest(method, path, bodyObj, extraHeaders, cb) {
  var body = bodyObj ? JSON.stringify(bodyObj) : '';
  var timestamp = Date.now();
  // Sign only the pathname, matching the web client and server verify.ts
  var pathname = path.split('?')[0];
  var message = method + '\n' + pathname + '\n' + timestamp + '\n' + body;
  var sig = crypto.ed25519Sign(crypto.hexToBytes(cfg.signSeed), crypto.utf8Encode(message));

  var xhr = new XMLHttpRequest();
  xhr.open(method, cfg.server + path);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('X-User-Id', cfg.userId);
  xhr.setRequestHeader('X-Timestamp', String(timestamp));
  xhr.setRequestHeader('X-Signature', crypto.bytesToBase64(sig));
  for (var h in extraHeaders) {
    if (extraHeaders.hasOwnProperty(h)) xhr.setRequestHeader(h, extraHeaders[h]);
  }
  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) {
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { /* empty body is fine */ }
      cb(null, data);
    } else {
      cb({ status: xhr.status, text: xhr.responseText });
    }
  };
  xhr.onerror = function () {
    cb({ status: 0, text: 'network error' });
  };
  xhr.timeout = 15000;
  xhr.ontimeout = function () {
    cb({ status: 0, text: 'timeout' });
  };
  xhr.send(body || null);
}

function errorStatus(err, what) {
  if (err.status === 0) return 'No connection';
  if (err.status === 401) return 'Auth failed - check seed phrase';
  return what + ' failed (' + err.status + ')';
}

/* ---------------- actions ---------------- */

function fetchTodos() {
  apiRequest('GET', '/api/todos', null, null, function (err, rows) {
    if (err) {
      sendStatus(errorStatus(err, 'Sync'));
      return;
    }
    var encKey = crypto.hexToBytes(cfg.encKey);
    allTodos = [];
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].encrypted_blob) continue; // tombstone
      var plain = null;
      try { plain = crypto.decryptBlob(encKey, rows[i].encrypted_blob); } catch (e) { /* skip */ }
      if (plain && typeof plain.title === 'string') {
        allTodos.push({ id: rows[i].id, updated_at: rows[i].updated_at, plain: plain });
      }
    }
    sendTodoList();
  });
}

function addTodo(title) {
  title = (title || '').trim();
  if (!title) return;
  if (!isConfigured()) {
    sendStatus('Set seed phrase in settings');
    return;
  }

  // Same placement as the web client: above all active todos.
  var min = 0;
  var haveActive = false;
  for (var i = 0; i < allTodos.length; i++) {
    var p = allTodos[i].plain;
    if (!p.completed_at) {
      if (!haveActive || p.sort_order < min) min = p.sort_order;
      haveActive = true;
    }
  }
  var plain = {
    user_id: cfg.userId,
    list_id: null,
    title: title,
    notes: null,
    due_date: null,
    reminder_date: null,
    snoozed_until: null,
    completed_at: null,
    sort_order: haveActive ? min - 1 : 0,
    created_at: Date.now()
  };
  var id = crypto.uuid4();
  var blob = crypto.encryptBlob(crypto.hexToBytes(cfg.encKey), plain);

  // Optimistic: show it on the watch immediately.
  allTodos.push({ id: id, updated_at: plain.created_at, plain: plain });
  sendTodoList();

  apiRequest('POST', '/api/todos', { id: id, encrypted_blob: blob }, null, function (err, item) {
    if (err) {
      allTodos = allTodos.filter(function (t) { return t.id !== id; });
      sendTodoList(errorStatus(err, 'Add'));
    } else if (item && item.updated_at) {
      for (var j = 0; j < allTodos.length; j++) {
        if (allTodos[j].id === id) allTodos[j].updated_at = item.updated_at;
      }
    }
  });
}

function completeTodo(index) {
  var id = lastSentIds[index];
  if (!id) return;
  var item = null;
  for (var i = 0; i < allTodos.length; i++) {
    if (allTodos[i].id === id) { item = allTodos[i]; break; }
  }
  if (!item || item.plain.completed_at) return;

  item.plain.completed_at = new Date().toISOString();
  var blob = crypto.encryptBlob(crypto.hexToBytes(cfg.encKey), item.plain);

  // The watch already removed the row optimistically; mirror that here so
  // later Complete indices stay aligned, without re-sending the list.
  lastSentIds.splice(index, 1);

  apiRequest('PATCH', '/api/todos/' + id, { encrypted_blob: blob },
    { 'If-Unmodified-Since': String(item.updated_at) },
    function (err, updated) {
      if (err) {
        // 409 = modified elsewhere; any failure -> resync with the server
        item.plain.completed_at = null;
        fetchTodos();
        if (err.status !== 409) sendStatus(errorStatus(err, 'Complete'));
      } else if (updated && updated.updated_at) {
        item.updated_at = updated.updated_at;
      }
    });
}

/* ---------------- seed phrase setup ---------------- */

// Same checksum validation as the web client (src/lib/crypto.ts).
function validateMnemonic(phrase) {
  var words = phrase.trim().toLowerCase().split(/\s+/);
  if (words.length !== 12) return false;
  var bits = '';
  for (var i = 0; i < 12; i++) {
    var idx = wordlist.indexOf(words[i]);
    if (idx === -1) return false;
    var b = idx.toString(2);
    while (b.length < 11) b = '0' + b;
    bits += b;
  }
  var entropy = new Uint8Array(16);
  for (i = 0; i < 16; i++) {
    entropy[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  var hash = crypto.sha256(entropy);
  var expected = hash[0].toString(2);
  while (expected.length < 8) expected = '0' + expected;
  return bits.substr(128) === expected.substr(0, 4);
}

function setupFromPhrase(phrase, server) {
  cfg.server = (server || DEFAULT_SERVER).replace(/\/+$/, '');

  if (!validateMnemonic(phrase)) {
    sendStatus('Invalid seed phrase');
    return;
  }
  phrase = phrase.trim().toLowerCase().split(/\s+/).join(' ');

  sendStatus('Deriving keys...');
  var encKey = crypto.deriveEncryptionKey(phrase);
  var signSeed = crypto.deriveSigningSeed(phrase);

  var lastPct = -1;
  crypto.deriveUserIdAsync(phrase, function (userIdHex) {
    cfg.userId = userIdHex;
    cfg.encKey = crypto.bytesToHex(encKey);
    cfg.signSeed = crypto.bytesToHex(signSeed);

    // Register the signing key (no-op if this user already exists).
    var pub = crypto.bytesToBase64(crypto.ed25519PublicKey(signSeed));
    var xhr = new XMLHttpRequest();
    xhr.open('POST', cfg.server + '/api/auth/login');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        saveConfig();
        sendStatus('Loading...');
        fetchTodos();
      } else {
        sendStatus('Login failed (' + xhr.status + ')');
      }
    };
    xhr.onerror = function () { sendStatus('No connection'); };
    xhr.send(JSON.stringify({ user_id: cfg.userId, signing_public_key: pub }));
  }, function (done, total) {
    var pct = Math.floor(done * 100 / total);
    if (pct >= lastPct + 20 && pct < 100) {
      lastPct = pct;
      sendStatus('Deriving keys ' + pct + '%');
    }
  });
}

/* ---------------- configuration page ---------------- */

function configPageHtml() {
  return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>body{font-family:sans-serif;margin:1em;background:#f5f1e8;color:#333}' +
    'h1{font-size:1.3em}label{display:block;margin:1em 0 .3em;font-weight:bold}' +
    'textarea,input{width:100%;box-sizing:border-box;padding:.6em;font-size:1em;border:1px solid #bbb;border-radius:6px}' +
    'textarea{height:5em}p{font-size:.85em;color:#666}' +
    'button{margin-top:1.2em;width:100%;padding:.8em;font-size:1.1em;border:0;border-radius:6px;background:#e8b14d;color:#222;font-weight:bold}' +
    '.cancel{background:#ddd;margin-top:.6em}</style></head><body>' +
    '<h1>🧇 Wafflelist</h1>' +
    '<label>Seed phrase (12 words)</label>' +
    '<textarea id="phrase" autocapitalize="none" autocorrect="off" placeholder="correct horse battery staple ..."></textarea>' +
    '<p>Your phrase is used once on this phone to derive your keys; it is not stored and never leaves the device.</p>' +
    '<label>Server</label>' +
    '<input id="server" value="' + cfg.server + '">' +
    '<button onclick="save()">Save</button>' +
    '<button class="cancel" onclick="location.href=\'pebblejs://close#\'">Cancel</button>' +
    '<script>function save(){' +
    'var r={phrase:document.getElementById(\'phrase\').value,server:document.getElementById(\'server\').value};' +
    'location.href=\'pebblejs://close#\'+encodeURIComponent(JSON.stringify(r));}' +
    '<\/script></body></html>';
}

Pebble.addEventListener('showConfiguration', function () {
  Pebble.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(configPageHtml()));
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e.response) return;
  var resp = null;
  try {
    resp = JSON.parse(decodeURIComponent(e.response));
  } catch (err) {
    try { resp = JSON.parse(e.response); } catch (err2) { return; }
  }
  if (resp && resp.phrase) {
    setupFromPhrase(resp.phrase, resp.server);
  } else if (resp && resp.server && isConfigured()) {
    cfg.server = resp.server.replace(/\/+$/, '');
    localStorage.setItem('wl-server', cfg.server);
    fetchTodos();
  }
});

/* ---------------- events ---------------- */

Pebble.addEventListener('ready', function () {
  if (isConfigured()) {
    sendStatus('Loading...');
    fetchTodos();
  } else {
    sendStatus('Open settings in the Pebble app on your phone');
  }
});

Pebble.addEventListener('appmessage', function (e) {
  var p = e.payload;
  if (p.AddTodo !== undefined) {
    addTodo(String(p.AddTodo));
  } else if (p.Complete !== undefined) {
    completeTodo(Number(p.Complete));
  } else if (p.Request !== undefined) {
    if (isConfigured()) fetchTodos();
    else sendStatus('Open settings in the Pebble app on your phone');
  }
});
