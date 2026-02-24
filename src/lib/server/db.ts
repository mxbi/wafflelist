import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'wafflelist.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  encryption_public_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  icon TEXT,
  sort_order REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  list_id TEXT REFERENCES lists(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_date TEXT,
  reminder_date TEXT,
  snoozed_until TEXT,
  completed_at TEXT,
  sort_order REAL NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// Seed default user if none exists
const DEFAULT_USER_ID = 'default-user';
const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(DEFAULT_USER_ID);
if (!existing) {
	db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
		DEFAULT_USER_ID,
		'default',
		'not-implemented',
		Date.now()
	);
}

export { db, DEFAULT_USER_ID };
