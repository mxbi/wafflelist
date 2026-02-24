import { json, error } from '@sveltejs/kit';
import { db, DEFAULT_USER_ID } from '$lib/server/db';
import { broadcast } from '$lib/server/sync';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(params.id, DEFAULT_USER_ID);
	if (!existing) throw error(404, 'Todo not found');

	const fields: string[] = [];
	const values: unknown[] = [];
	for (const key of ['title', 'notes', 'due_date', 'reminder_date', 'snoozed_until', 'completed_at', 'sort_order', 'list_id'] as const) {
		if (key in body) {
			fields.push(`${key} = ?`);
			values.push(body[key]);
		}
	}
	if (fields.length === 0) throw error(400, 'No fields to update');

	values.push(params.id);
	db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...values);

	const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(params.id);
	broadcast('todo_updated', { todo });
	return json(todo);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const result = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(params.id, DEFAULT_USER_ID);
	if (result.changes === 0) throw error(404, 'Todo not found');
	broadcast('todo_deleted', { id: params.id });
	return json({ ok: true });
};
