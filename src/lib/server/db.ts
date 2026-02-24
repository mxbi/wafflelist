import Database from 'better-sqlite3';
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
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  encryption_public_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  encrypted_blob TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  encrypted_blob TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_user_updated ON todos(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_lists_user_updated ON lists(user_id, updated_at);
`);

// Migration: remove sort_order column from lists (now stored in encrypted blob)
const listCols = db.prepare("PRAGMA table_info(lists)").all() as { name: string }[];
if (listCols.some(c => c.name === 'sort_order')) {
	db.exec('ALTER TABLE lists DROP COLUMN sort_order');
}

export { db };
