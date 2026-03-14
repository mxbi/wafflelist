import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let _db: Database.Database | null = null;

function initDb(): Database.Database {
	if (_db) return _db;

	const dataDir = path.join(process.cwd(), 'data');
	if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

	_db = new Database(path.join(dataDir, 'wafflelist.db'));

	_db.pragma('journal_mode = WAL');
	_db.pragma('foreign_keys = ON');

	_db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  signing_public_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  encrypted_blob TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  encrypted_blob TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_user_updated ON todos(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_lists_user_updated ON lists(user_id, updated_at);
`);

	// Migration: remove sort_order column from lists (now stored in encrypted blob)
	const listCols = _db.prepare("PRAGMA table_info(lists)").all() as { name: string }[];
	if (listCols.some(c => c.name === 'sort_order')) {
		_db.exec('ALTER TABLE lists DROP COLUMN sort_order');
	}

	// Migration: rename encryption_public_key -> signing_public_key
	const userCols = _db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
	if (userCols.some(c => c.name === 'encryption_public_key') && !userCols.some(c => c.name === 'signing_public_key')) {
		_db.exec('ALTER TABLE users RENAME COLUMN encryption_public_key TO signing_public_key');
	}

	return _db;
}

const db = new Proxy({} as Database.Database, {
	get(_target, prop, receiver) {
		const instance = initDb();
		const value = Reflect.get(instance, prop, receiver);
		if (typeof value === 'function') {
			return value.bind(instance);
		}
		return value;
	}
});

export { db };
