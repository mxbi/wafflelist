const DB_NAME = 'wafflelist-keystore';
const STORE_NAME = 'keys';
const KEY_ID = 'current';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
	return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export async function saveKey(userId: string, key: CryptoKey): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const req = tx(db, 'readwrite').put({ userId, key }, KEY_ID);
		req.onsuccess = () => { db.close(); resolve(); };
		req.onerror = () => { db.close(); reject(req.error); };
	});
}

export async function loadKey(): Promise<{ userId: string; key: CryptoKey } | null> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const req = tx(db, 'readonly').get(KEY_ID);
		req.onsuccess = () => {
			db.close();
			const result = req.result;
			if (result && result.userId && result.key) {
				resolve({ userId: result.userId, key: result.key });
			} else {
				resolve(null);
			}
		};
		req.onerror = () => { db.close(); reject(req.error); };
	});
}

export async function clearKey(): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const req = tx(db, 'readwrite').delete(KEY_ID);
		req.onsuccess = () => { db.close(); resolve(); };
		req.onerror = () => { db.close(); reject(req.error); };
	});
}
