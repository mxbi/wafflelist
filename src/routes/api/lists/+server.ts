import { getAll, create } from '$lib/server/crud';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = getAll('lists');
export const POST: RequestHandler = create('lists');
