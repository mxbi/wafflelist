import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { filterTodos, computeCounts } from '../../src/lib/filters';
import type { Todo } from '../../src/lib/types';

let n = 0;
function todo(fields: Partial<Todo> = {}): Todo {
	n++;
	return {
		id: `t${n}`, user_id: 'u', list_id: null, title: `todo ${n}`, notes: null, due_date: null,
		reminder_date: null, snoozed_until: null, completed_at: null, sort_order: n, created_at: n,
		...fields
	};
}
const ids = (ts: Todo[]) => ts.map((t) => t.id);

const originalTZ = process.env.TZ;
function at(tz: string, localIso: string) {
	process.env.TZ = tz;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(localIso)); // parsed in local (tz) time
}
afterEach(() => {
	vi.useRealTimers();
	process.env.TZ = originalTZ;
});

describe('"today" uses the user\'s local date', () => {
	it('evening in a UTC-negative timezone: tomorrow\'s todos are not due today', () => {
		at('America/Los_Angeles', '2026-03-10T20:00:00'); // already 2026-03-11 in UTC
		const dueToday = todo({ due_date: '2026-03-10' });
		const dueTomorrow = todo({ due_date: '2026-03-11' });
		expect(ids(filterTodos([dueToday, dueTomorrow], 'today'))).toEqual([dueToday.id]);
		expect(computeCounts([dueToday, dueTomorrow]).today).toBe(1);
	});

	it('morning in a UTC-positive timezone: today\'s todos are due today', () => {
		at('Asia/Tokyo', '2026-03-10T08:00:00'); // still 2026-03-09 in UTC
		const dueToday = todo({ due_date: '2026-03-10' });
		expect(ids(filterTodos([dueToday], 'today'))).toEqual([dueToday.id]);
		expect(computeCounts([dueToday]).today).toBe(1);
	});

	it('a todo snoozed until today reappears in the morning, local time', () => {
		at('Asia/Tokyo', '2026-03-10T08:00:00');
		const t = todo({ snoozed_until: '2026-03-10' });
		expect(ids(filterTodos([t], 'inbox'))).toEqual([t.id]);
		expect(filterTodos([t], 'snoozed')).toEqual([]);
	});
});

describe('views', () => {
	beforeEach(() => at('UTC', '2026-03-10T12:00:00'));

	const listId = 'list-1';
	function fixture() {
		return {
			inboxNoDate: todo(),
			inboxOverdue: todo({ due_date: '2026-03-01' }),
			inboxToday: todo({ due_date: '2026-03-10' }),
			listIn3Days: todo({ list_id: listId, due_date: '2026-03-13' }),
			listFarFuture: todo({ list_id: listId, due_date: '2026-06-01' }),
			otherList: todo({ list_id: 'list-2' }),
			completed: todo({ due_date: '2026-03-10', completed_at: '2026-03-10T09:00:00Z' }),
			snoozed: todo({ due_date: '2026-03-10', snoozed_until: '2026-03-12' }),
			snoozedEarlier: todo({ snoozed_until: '2026-03-11', list_id: listId })
		};
	}

	it('inbox: active, un-snoozed todos with no list', () => {
		const f = fixture();
		expect(ids(filterTodos(Object.values(f), 'inbox')).sort()).toEqual(ids([f.inboxNoDate, f.inboxOverdue, f.inboxToday]).sort());
	});

	it('today: includes overdue, excludes future, completed and snoozed', () => {
		const f = fixture();
		expect(ids(filterTodos(Object.values(f), 'today')).sort()).toEqual(ids([f.inboxOverdue, f.inboxToday]).sort());
	});

	it('week: includes todos due in the next few days', () => {
		const f = fixture();
		const week = ids(filterTodos(Object.values(f), 'week'));
		expect(week).toContain(f.listIn3Days.id);
		expect(week).toContain(f.inboxToday.id);
		expect(week).not.toContain(f.listFarFuture.id);
		expect(week).not.toContain(f.inboxNoDate.id);
	});

	it('list: only that list\'s active, un-snoozed todos', () => {
		const f = fixture();
		expect(ids(filterTodos(Object.values(f), 'list', listId)).sort()).toEqual(ids([f.listIn3Days, f.listFarFuture]).sort());
	});

	it('snoozed: only snoozed todos, soonest to wake first', () => {
		const f = fixture();
		expect(ids(filterTodos(Object.values(f), 'snoozed'))).toEqual(ids([f.snoozedEarlier, f.snoozed]));
	});

	it('all: every active, un-snoozed todo', () => {
		const f = fixture();
		const all = ids(filterTodos(Object.values(f), 'all'));
		expect(all.sort()).toEqual(ids([f.inboxNoDate, f.inboxOverdue, f.inboxToday, f.listIn3Days, f.listFarFuture, f.otherList]).sort());
	});

	it('orders by sort_order (manual ordering) within a view', () => {
		const a = todo({ sort_order: 5 });
		const b = todo({ sort_order: -2 });
		const c = todo({ sort_order: 0.5 });
		expect(ids(filterTodos([a, b, c], 'inbox'))).toEqual(ids([b, c, a]));
	});

	it('sidebar counts agree with what each view shows', () => {
		const todos = Object.values(fixture());
		const counts = computeCounts(todos);
		for (const view of ['inbox', 'today', 'week', 'all', 'snoozed'] as const) {
			expect(counts[view], view).toBe(filterTodos(todos, view).length);
		}
		for (const l of [listId, 'list-2']) {
			expect(counts.lists[l] ?? 0, l).toBe(filterTodos(todos, 'list', l).length);
		}
	});
});
