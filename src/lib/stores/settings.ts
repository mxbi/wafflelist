import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'wafflelist-background';

const defaultBackground = '#2B579A';

const VALID_HEX = /^#[0-9a-fA-F]{6}$/;
const VALID_GRADIENT = /^linear-gradient\(\d+deg,\s*#[0-9a-fA-F]{3,8}\s+\d+%,\s*#[0-9a-fA-F]{3,8}\s+\d+%\)$/;

function isValidBackground(value: string): boolean {
	return VALID_HEX.test(value) || VALID_GRADIENT.test(value);
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
