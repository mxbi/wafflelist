/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

import { build, files, version } from '$service-worker';

const CACHE_NAME = `wafflelist-${version}`;
const OFFLINE_KEY = '__offline_shell__';

// Pre-cache all build assets (JS/CSS) and static files on install
const PRECACHE = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then(async (cache) => {
			await cache.addAll(PRECACHE);
			// Pre-cache the app shell so offline navigation always works.
			// Fetch /inbox (the default route) and store it as a generic shell.
			try {
				const shell = await fetch('/inbox');
				if (shell.ok) {
					await cache.put(OFFLINE_KEY, shell);
				}
			} catch {
				// Server might not be reachable during SW install (unlikely but safe)
			}
		})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
			)
		).then(() => {
			self.clients.matchAll().then((clients) => {
				clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
			});
			return self.clients.claim();
		})
	);
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Only handle same-origin GET requests
	if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

	// Don't cache API calls or SSE
	if (url.pathname.startsWith('/api/')) return;

	// Cache-first for precached build/static assets (immutable, hashed filenames)
	if (PRECACHE.includes(url.pathname)) {
		event.respondWith(
			caches.match(event.request).then((cached) => {
				if (cached) return cached;
				return fetch(event.request).then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					}
					return response;
				});
			})
		);
		return;
	}

	// Navigation requests: network-first with offline shell fallback
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(event.request, clone);
							// Keep the offline shell fresh with the latest navigation response
							cache.put(OFFLINE_KEY, clone.clone());
						});
					}
					return response;
				})
				.catch(() =>
					caches.open(CACHE_NAME).then((cache) =>
						cache.match(event.request).then((cached) => {
							if (cached) return cached;
							// Serve the offline shell — SvelteKit's client router will handle the route
							return cache.match(OFFLINE_KEY) as Promise<Response>;
						})
					)
				)
		);
		return;
	}

	// Other non-navigation requests: network-first with cache fallback
	event.respondWith(
		fetch(event.request)
			.then((response) => {
				if (response.ok) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
				}
				return response;
			})
			.catch(() =>
				caches.match(event.request).then((cached) => {
					if (cached) return cached;
					return new Response('', { status: 503, statusText: 'Offline' });
				})
			)
	);
});
