import { update, remove } from '$lib/server/crud';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = update('lists');
export const DELETE: RequestHandler = remove('lists');
