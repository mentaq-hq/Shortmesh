import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

let babel = null;
let presetTs = null;
function getBabel() {
	if (!babel) {
		const require = createRequire(import.meta.url);
		babel = require('/workspace/app/node_modules/@babel/core');
		presetTs = require('/workspace/app/node_modules/@babel/preset-typescript');
	}
	return { babel, presetTs };
}

const CACHE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.ts-cache');
try {
	fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch {
	// Best-effort cache directory
}

export async function resolve(specifier, context, nextResolve) {
	if (specifier === 'svelte/store') {
		return {
			url: 'virtual:svelte-store',
			shortCircuit: true,
		};
	}
	try {
		return await nextResolve(specifier, context);
	} catch (err) {
		if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
			return await nextResolve(`${specifier}.ts`, context);
		}
		throw err;
	}
}

export async function load(url, context, nextLoad) {
	if (url === 'virtual:svelte-store') {
		return {
			format: 'module',
			shortCircuit: true,
			source: `
export function writable(val) {
	const subs = new Set();
	function set(next) {
		val = next;
		for (const s of subs) s(val);
	}
	function update(fn) {
		set(fn(val));
	}
	function subscribe(fn) {
		subs.add(fn);
		fn(val);
		return () => subs.delete(fn);
	}
	return { set, update, subscribe };
}
export function get(store) {
	let v;
	store.subscribe((val) => { v = val; })();
	return v;
}
export function derived(stores, fn) {
	const isArr = Array.isArray(stores);
	const list = isArr ? stores : [stores];
	const out = writable(undefined);
	function recompute() {
		const vals = list.map((s) => get(s));
		out.set(fn(isArr ? vals : vals[0]));
	}
	recompute();
	for (const s of list) s.subscribe(recompute);
	return { subscribe: out.subscribe };
}
`,
		};
	}
	if (url.endsWith('.ts')) {
		const filename = fileURLToPath(url);
		const source = fs.readFileSync(filename, 'utf8');
		const hash = crypto.createHash('sha1').update(filename).update('\0').update(source).digest('hex');
		const cacheFile = path.join(CACHE_DIR, `${hash}.mjs`);
		try {
			if (fs.existsSync(cacheFile)) {
				return {
					format: 'module',
					shortCircuit: true,
					source: fs.readFileSync(cacheFile, 'utf8'),
				};
			}
		} catch {
			// Fall back to fresh transform
		}
		const { babel: b, presetTs: p } = getBabel();
		const result = b.transformSync(source, {
			filename,
			presets: [[p, { ignoreExtensions: true }]],
			sourceMaps: 'inline',
		});
		try {
			const tmp = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
			fs.writeFileSync(tmp, result.code, 'utf8');
			fs.renameSync(tmp, cacheFile);
		} catch {
			// Ignore cache write errors
		}
		return {
			format: 'module',
			shortCircuit: true,
			source: result.code,
		};
	}
	return nextLoad(url, context);
}
