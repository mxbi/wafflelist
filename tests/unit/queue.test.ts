import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, getQueue, clearQueue, collapseQueue, type QueueItem } from '../../src/lib/offlinedb';

type Item = Omit<QueueItem, 'queue_id'>;
const item = (action: QueueItem['action'], blob: string | null, timestamp: number, entity_id = 'e1'): Item => ({
	entity_type: 'todo', action, entity_id, timestamp, updated_at: timestamp,
	...(blob ? { payload: { encrypted_blob: blob } } : {})
});

async function collapsed(items: Item[]) {
	for (const i of items) await enqueue(i);
	await collapseQueue();
	return (await getQueue()).map((q) => ({ action: q.action, entity_id: q.entity_id, blob: q.payload?.encrypted_blob ?? null }));
}

beforeEach(() => clearQueue());

describe('offline queue collapsing', () => {
	it('create then edits → a single create carrying the latest content', async () => {
		expect(await collapsed([item('create', 'v1', 1), item('update', 'v2', 2), item('update', 'v3', 3)]))
			.toEqual([{ action: 'create', entity_id: 'e1', blob: 'v3' }]);
	});

	it('edits then delete → just the delete', async () => {
		expect(await collapsed([item('update', 'v2', 1), item('delete', null, 2)]))
			.toEqual([{ action: 'delete', entity_id: 'e1', blob: null }]);
	});

	it('created and deleted while offline → nothing to send', async () => {
		expect(await collapsed([item('create', 'v1', 1), item('update', 'v2', 2), item('delete', null, 3)])).toEqual([]);
	});

	it('does not merge changes to different entities', async () => {
		const out = await collapsed([item('update', 'a', 1, 'a'), item('update', 'b', 2, 'b')]);
		expect(out.map((o) => o.entity_id).sort()).toEqual(['a', 'b']);
	});

	it('keeps the most recently enqueued edit when two edits share a millisecond', async () => {
		// e.g. a blur and a change handler both saving in the same tick
		for (let trial = 0; trial < 20; trial++) {
			await clearQueue();
			expect(await collapsed([item('update', 'older', 1000), item('update', 'newer', 1000)]), `trial ${trial}`)
				.toEqual([{ action: 'update', entity_id: 'e1', blob: 'newer' }]);
		}
	});
});
