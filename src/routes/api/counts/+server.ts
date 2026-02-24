import { json } from '@sveltejs/kit';
import { db, DEFAULT_USER_ID } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const today = new Date().toISOString().split('T')[0];
	const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

	const row = (sql: string, params: unknown[]) =>
		(db.prepare(sql).get(...params) as { count: number }).count;

	const inbox = row(
		'SELECT COUNT(*) as count FROM todos WHERE user_id = ? AND list_id IS NULL AND completed_at IS NULL AND (snoozed_until IS NULL OR snoozed_until <= ?)',
		[DEFAULT_USER_ID, today]
	);
	const todayCount = row(
		'SELECT COUNT(*) as count FROM todos WHERE user_id = ? AND due_date = ? AND completed_at IS NULL AND (snoozed_until IS NULL OR snoozed_until <= ?)',
		[DEFAULT_USER_ID, today, today]
	);
	const week = row(
		'SELECT COUNT(*) as count FROM todos WHERE user_id = ? AND due_date >= ? AND due_date <= ? AND completed_at IS NULL AND (snoozed_until IS NULL OR snoozed_until <= ?)',
		[DEFAULT_USER_ID, today, weekEnd, today]
	);
	const all = row(
		'SELECT COUNT(*) as count FROM todos WHERE user_id = ? AND completed_at IS NULL AND (snoozed_until IS NULL OR snoozed_until <= ?)',
		[DEFAULT_USER_ID, today]
	);
	const snoozed = row(
		'SELECT COUNT(*) as count FROM todos WHERE user_id = ? AND completed_at IS NULL AND snoozed_until IS NOT NULL AND snoozed_until > ?',
		[DEFAULT_USER_ID, today]
	);

	const listRows = db.prepare(
		'SELECT list_id, COUNT(*) as count FROM todos WHERE user_id = ? AND list_id IS NOT NULL AND completed_at IS NULL AND (snoozed_until IS NULL OR snoozed_until <= ?) GROUP BY list_id'
	).all(DEFAULT_USER_ID, today) as { list_id: string; count: number }[];

	const lists: Record<string, number> = {};
	for (const r of listRows) {
		lists[r.list_id] = r.count;
	}

	return json({ inbox, today: todayCount, week, all, snoozed, lists });
};
