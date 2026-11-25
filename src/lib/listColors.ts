// Palette of badge colours for lists: [background, text]
const palette: [string, string][] = [
	['#E3F2FD', '#1565C0'], // blue
	['#FCE4EC', '#AD1457'], // pink
	['#E8F5E9', '#2E7D32'], // green
	['#FFF3E0', '#E65100'], // orange
	['#F3E5F5', '#6A1B9A'], // purple
	['#E0F7FA', '#00838F'], // cyan
	['#FFFDE7', '#8D6E00'], // yellow
	['#FBE9E7', '#BF360C'], // red
	['#E8EAF6', '#283593'], // indigo
	['#F1F8E9', '#558B2F'], // lime
	['#EFEBE9', '#5D4037'], // brown
	['#ECEFF1', '#37474F'], // slate
];

function hash(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
	return Math.abs(h);
}

export function listColor(listId: string): { bg: string; fg: string } {
	const [bg, fg] = palette[hash(listId) % palette.length];
	return { bg, fg };
}

// MIME types used for HTML5 drag-and-drop payloads (must be lowercase)
export const DRAG_TODO = 'application/x-wafflelist-todo';
export const DRAG_LIST = 'application/x-wafflelist-list';
