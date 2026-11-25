import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatRelativeDate, formatDateGroupLabel } from '../../src/lib/dates';

const originalTZ = process.env.TZ;
afterEach(() => {
	vi.useRealTimers();
	process.env.TZ = originalTZ;
});

describe('relative date labels', () => {
	it.each(['Asia/Tokyo', 'America/Los_Angeles', 'Europe/London'])('labels relative to the local day (%s)', (tz) => {
		process.env.TZ = tz;
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-03-10T23:30:00')); // late evening local time
		expect(formatRelativeDate('2026-03-09')).toBe('Yesterday');
		expect(formatRelativeDate('2026-03-10')).toBe('Today');
		expect(formatRelativeDate('2026-03-11')).toBe('Tomorrow');
		expect(formatRelativeDate('2026-03-13')).toBe('Friday');
		expect(formatRelativeDate('2026-04-01')).toBe('Wed, Apr 1');
		expect(formatDateGroupLabel('2026-03-10')).toBe('TODAY, MAR 10');
		expect(formatDateGroupLabel('2026-03-13')).toBe('FRIDAY, MAR 13');
	});

	it('is not thrown off by a DST change in between', () => {
		process.env.TZ = 'America/New_York'; // DST starts 2026-03-08
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-03-07T12:00:00'));
		expect(formatRelativeDate('2026-03-08')).toBe('Tomorrow');
		expect(formatRelativeDate('2026-03-09')).toBe('Monday');
	});
});
