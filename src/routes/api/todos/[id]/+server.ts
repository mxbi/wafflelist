import { update, remove } from '$lib/server/crud';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = update('todos');
export const DELETE: RequestHandler = remove('todos');
