import { getAll, create } from '$lib/server/crud';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = getAll('todos');
export const POST: RequestHandler = create('todos');
