import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'wafflelist-background';

const defaultBackground = '#2B579A';

const VALID_HEX = /^#[0-9a-fA-F]{6}$/;
const VALID_GRADIENT = /^linear-gradient\(\d+deg,\s*#[0-9a-fA-F]{3,8}\s+\d+%,\s*#[0-9a-fA-F]{3,8}\s+\d+%\)$/;

export interface ImageTheme {
	id: string;
	name: string;
	/** Full-size background image (served from /static/themes) */
	src: string;
	/** Small preview used for the settings swatch */
	thumb: string;
	/** Dominant colour, used for the mobile theme-color and while the image loads */
	color: string;
}

// Vendored background images. To add one, drop `<id>.jpg` and `<id>-thumb.jpg`
// (~160px wide) into static/themes and add an entry here.
export const imageThemes: ImageTheme[] = [
	{ id: 'skyscrapers', name: 'Skyscrapers', src: '/themes/skyscrapers.jpg', thumb: '/themes/skyscrapers-thumb.jpg', color: '#5a6066' },
];

const IMAGE_PREFIX = 'image:';

export function getImageTheme(value: string): ImageTheme | undefined {
	if (!value.startsWith(IMAGE_PREFIX)) return undefined;
	const id = value.slice(IMAGE_PREFIX.length);
	return imageThemes.find((t) => t.id === id);
}

export function imageThemeValue(theme: ImageTheme): string {
	return IMAGE_PREFIX + theme.id;
}

function isValidBackground(value: string): boolean {
	return VALID_HEX.test(value) || VALID_GRADIENT.test(value) || !!getImageTheme(value);
}

/** CSS `background` declarations for a stored background value. */
export function backgroundStyle(value: string): string {
	const img = getImageTheme(value);
	if (img) {
		// Slight dark wash keeps the white headings readable on bright images
		return `background: linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.1)), url('${img.src}') center / cover no-repeat, ${img.color};`;
	}
	if (value.startsWith('linear-gradient')) return `background: ${value}; background-size: cover;`;
	return `background: ${value};`;
}

/** A single representative colour for a stored background value. */
export function backgroundColor(value: string): string {
	const img = getImageTheme(value);
	if (img) return img.color;
	return value.match(/#[0-9a-fA-F]{6}/)?.[0] ?? defaultBackground;
}

function createBackgroundStore() {
	const stored = browser ? localStorage.getItem(STORAGE_KEY) : null;
	const initial = stored && isValidBackground(stored) ? stored : defaultBackground;
	const { subscribe, set } = writable<string>(initial);

	return {
		subscribe,
		set(value: string) {
			if (!isValidBackground(value)) return;
			set(value);
			if (browser) localStorage.setItem(STORAGE_KEY, value);
		}
	};
}

export const background = createBackgroundStore();

export const presetColors = [
	'#2B579A',
	'#D94735',
	'#E67E22',
	'#27AE60',
	'#16A085',
	'#2980B9',
	'#8E44AD',
	'#2C3E50',
	'#C0392B',
	'#1ABC9C',
];

export const presetGradients = [
	'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
	'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
	'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
	'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
];
