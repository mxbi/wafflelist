type Listener = (event: string, data: string) => void;

const listeners = new Map<string, Set<Listener>>();

export function addSyncListener(userId: string, listener: Listener) {
	if (!listeners.has(userId)) listeners.set(userId, new Set());
	listeners.get(userId)!.add(listener);
	return () => {
		const set = listeners.get(userId);
		if (set) {
			set.delete(listener);
			if (set.size === 0) listeners.delete(userId);
		}
	};
}

export function broadcast(userId: string, type: string, payload: Record<string, unknown> = {}) {
	const set = listeners.get(userId);
	if (!set) return;
	const data = JSON.stringify({ type, ...payload });
	for (const listener of set) {
		listener('sync', data);
	}
}
