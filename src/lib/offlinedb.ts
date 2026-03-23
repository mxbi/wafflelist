const DB_NAME = 'wafflelist-offline';
const DB_VERSION = 2;

interface OfflineRow {
	id: string;
	encrypted_blob: string | null;
	updated_at: number;
}

export interface QueueItem {
	queue_id: string;
	entity_type: 'todo' | 'list';
	action: 'create' | 'update' | 'delete';
	entity_id: string;
	payload?: { encrypted_blob: string };
	updated_at: number;
	timestamp: number;
}

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains('todos')) db.createObjectStore('todos', { keyPath: 'id' });
			if (!db.objectStoreNames.contains('lists')) db.createObjectStore('lists', { keyPath: 'id' });
			if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
			// Recreate queue store with explicit keyPath (no autoIncrement)
			if (db.objectStoreNames.contains('queue')) db.deleteObjectStore('queue');
			db.createObjectStore('queue', { keyPath: 'queue_id' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function tx(db: IDBDatabase, stores: string | string[], mode: IDBTransactionMode = 'readonly') {
	return db.transaction(stores, mode);
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

// Cache operations
export async function cacheRows(store: 'todos' | 'lists', rows: OfflineRow[]): Promise<void> {
	const db = await open();
	const t = tx(db, store, 'readwrite');
	const s = t.objectStore(store);
	for (const row of rows) {
		if (row.encrypted_blob === null) {
			s.delete(row.id);
		} else {
			s.put(row);
		}
	}
	return new Promise((resolve, reject) => {
		t.oncomplete = () => { db.close(); resolve(); };
		t.onerror = () => { db.close(); reject(t.error); };
	});
}

export async function getCached(store: 'todos' | 'lists'): Promise<OfflineRow[]> {
	const db = await open();
	const rows = await reqToPromise(tx(db, store).objectStore(store).getAll()) as OfflineRow[];
	db.close();
	return rows;
}

export async function clearCached(store: 'todos' | 'lists'): Promise<void> {
	const db = await open();
	const t = tx(db, store, 'readwrite');
	t.objectStore(store).clear();
	return new Promise((resolve, reject) => {
		t.oncomplete = () => { db.close(); resolve(); };
		t.onerror = () => { db.close(); reject(t.error); };
	});
}

export async function deleteCachedRow(store: 'todos' | 'lists', id: string): Promise<void> {
	const db = await open();
	const t = tx(db, store, 'readwrite');
	t.objectStore(store).delete(id);
	return new Promise((resolve, reject) => {
		t.oncomplete = () => { db.close(); resolve(); };
		t.onerror = () => { db.close(); reject(t.error); };
	});
}

// Meta operations
export async function getMeta(key: string): Promise<unknown> {
	const db = await open();
	const row = await reqToPromise(tx(db, 'meta').objectStore('meta').get(key)) as { key: string; value: unknown } | undefined;
	db.close();
	return row?.value ?? null;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
	const db = await open();
	const t = tx(db, 'meta', 'readwrite');
	t.objectStore('meta').put({ key, value });
	return new Promise((resolve, reject) => {
		t.oncomplete = () => { db.close(); resolve(); };
		t.onerror = () => { db.close(); reject(t.error); };
	});
}

// Queue operations
export async function enqueue(item: Omit<QueueItem, 'queue_id'>): Promise<void> {
	const db = await open();
	const t = tx(db, 'queue', 'readwrite');
	t.objectStore('queue').add({ ...item, queue_id: crypto.randomUUID() });
	return new Promise((resolve, reject) => {
		t.oncomplete = () => { db.close(); resolve(); };
		t.onerror = () => { db.close(); reject(t.error); };
	});
}

export async function getQueue(): Promise<QueueItem[]> {
	const db = await open();
	const items = await reqToPromise(tx(db, 'queue').objectStore('queue').getAll()) as QueueItem[];
	db.close();
	return items;
}

export async function clearQueueItem(queueId: string): Promise<void> {
	const db = await open();
	const t = tx(db, 'queue', 'readwrite');
	const store = t.objectStore('queue');
	// Use cursor to find and delete by queue_id value, not by IDB key.
	// This works regardless of whether the store uses autoIncrement or keyPath.
	const req = store.openCursor();
	req.onsuccess = () => {
		const cursor = req.result;
		if (cursor) {
			if (cursor.value.queue_id === queueId) {
				cursor.delete();
			} else {
				cursor.continue();
			}
		}
	};
	return new Promise((resolve, reject) => {
		t.oncomplete = () => { db.close(); resolve(); };
		t.onerror = () => { db.close(); reject(t.error); };
	});
}

export async function clearQueue(): Promise<void> {
	const db = await open();
	const t = tx(db, 'queue', 'readwrite');
	t.objectStore('queue').clear();
	return new Promise((resolve, reject) => {
		t.oncomplete = () => { db.close(); resolve(); };
		t.onerror = () => { db.close(); reject(t.error); };
	});
}

export async function clearAllOfflineData(): Promise<void> {
	const db = await open();
	const stores = ['todos', 'lists', 'meta', 'queue'] as const;
	const t = db.transaction(stores, 'readwrite');
	for (const name of stores) t.objectStore(name).clear();
	return new Promise((resolve, reject) => {
		t.oncomplete = () => { db.close(); resolve(); };
		t.onerror = () => { db.close(); reject(t.error); };
	});
}

/**
 * Collapse queue: per entity_id, keep only the latest mutation.
 * Delete beats everything (if any mutation is delete, keep only delete).
 */
export async function collapseQueue(): Promise<void> {
	const items = await getQueue();
	if (items.length === 0) return;

	const byEntity = new Map<string, QueueItem[]>();
	for (const item of items) {
		const key = `${item.entity_type}:${item.entity_id}`;
		if (!byEntity.has(key)) byEntity.set(key, []);
		byEntity.get(key)!.push(item);
	}

	const toDelete: string[] = [];
	const toUpdate: { queue_id: string; action: QueueItem['action'] }[] = [];
	for (const group of byEntity.values()) {
		if (group.length <= 1) continue;
		const hasDelete = group.some(i => i.action === 'delete');
		const hasCreate = group.some(i => i.action === 'create');
		if (hasDelete) {
			if (hasCreate) {
				// Created and deleted offline — nothing to send, remove all
				for (const item of group) toDelete.push(item.queue_id);
			} else {
				// Keep only the delete, remove everything else
				const deleteItem = group.find(i => i.action === 'delete')!;
				for (const item of group) {
					if (item.queue_id !== deleteItem.queue_id) toDelete.push(item.queue_id);
				}
			}
		} else {
			// Keep only the latest by timestamp
			group.sort((a, b) => a.timestamp - b.timestamp);
			const survivor = group[group.length - 1];
			for (let i = 0; i < group.length - 1; i++) toDelete.push(group[i].queue_id);
			// If any earlier item was a create, the survivor must be a create
			// (server hasn't seen this entity yet — PATCH would 404)
			if (hasCreate && survivor.action !== 'create') {
				toUpdate.push({ queue_id: survivor.queue_id, action: 'create' });
			}
		}
	}

	for (const id of toDelete) {
		await clearQueueItem(id);
	}

	// Update surviving items that need their action changed (e.g. update → create)
	if (toUpdate.length > 0) {
		const db = await open();
		const t = tx(db, 'queue', 'readwrite');
		const store = t.objectStore('queue');
		const req = store.openCursor();
		req.onsuccess = () => {
			const cursor = req.result;
			if (cursor) {
				const match = toUpdate.find(u => u.queue_id === cursor.value.queue_id);
				if (match) {
					cursor.update({ ...cursor.value, action: match.action });
				}
				cursor.continue();
			}
		};
		await new Promise<void>((resolve, reject) => {
			t.oncomplete = () => { db.close(); resolve(); };
			t.onerror = () => { db.close(); reject(t.error); };
		});
	}
}
