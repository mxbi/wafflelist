type Listener = (event: string, data: string) => void;

const listeners = new Set<Listener>();

export function addSyncListener(listener: Listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function broadcast(type: string, payload: Record<string, unknown> = {}) {
	const data = JSON.stringify({ type, ...payload });
	for (const listener of listeners) {
		listener('sync', data);
	}
}
