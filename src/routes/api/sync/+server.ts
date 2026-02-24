import { addSyncListener } from '$lib/server/sync';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	let remove: (() => void) | undefined;

	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue('data: {"type":"connected"}\n\n');

			remove = addSyncListener((_event, data) => {
				try {
					controller.enqueue(`data: ${data}\n\n`);
				} catch {
					remove?.();
				}
			});
		},
		cancel() {
			remove?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
