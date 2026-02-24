/**
 * Format a YYYY-MM-DD date string as a relative or short date label.
 * - "Yesterday", "Today", "Tomorrow" for nearby dates
 * - Day name (e.g. "Wednesday") for dates within the next 6 days
 * - "Mon, Feb 24" style for everything else
 */
export function formatRelativeDate(dateStr: string): string {
	const date = new Date(dateStr + 'T00:00:00');
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const diffMs = date.getTime() - today.getTime();
	const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === -1) return 'Yesterday';
	if (diffDays === 0) return 'Today';
	if (diffDays === 1) return 'Tomorrow';
	if (diffDays > 1 && diffDays <= 6) {
		return date.toLocaleDateString('en-US', { weekday: 'long' });
	}

	return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Format a YYYY-MM-DD date as an uppercase group header label.
 * e.g. "TODAY, FEB 24" or "WEDNESDAY, FEB 26"
 */
export function formatDateGroupLabel(dateStr: string): string {
	const date = new Date(dateStr + 'T00:00:00');
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const diffMs = date.getTime() - today.getTime();
	const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

	const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

	if (diffDays === -1) return `YESTERDAY, ${monthDay}`;
	if (diffDays === 0) return `TODAY, ${monthDay}`;
	if (diffDays === 1) return `TOMORROW, ${monthDay}`;

	const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
	return `${dayName}, ${monthDay}`;
}
