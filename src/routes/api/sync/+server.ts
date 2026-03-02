import { addSyncListener } from '$lib/server/sync';
import { verifySyncRequest } from '$lib/server/verify';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const userId = await verifySyncRequest(url);

	let remove: (() => void) | undefined;

	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue('data: {"type":"connected"}\n\n');

			remove = addSyncListener(userId, (_event, data) => {
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
