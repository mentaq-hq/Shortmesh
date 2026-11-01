// Blender readymade material library.
//
// Every preset is a small PBR description (base colour, metalness, roughness,
// emissive strength, opacity) plus a procedural texture recipe. The recipes
// paint high resolution canvases for the albedo, the roughness and the bump
// channel, which the viewport uploads as textures.

import { defaultMaterialSlot, type MaterialSlot } from './mesh';

export type MaterialGroup = 'Metals' | 'Wood, Stone & Nature' | 'Glass, Neon & Stylized';

export type RecipeName =
	| 'flat'
	| 'brushed'
	| 'polished'
	| 'rust'
	| 'planks'
	| 'bricks'
	| 'veins'
	| 'speckle'
	| 'blades'
	| 'cells'
	| 'waves'
	| 'crystal'
	| 'weave'
	| 'bands'
	| 'flakes';

export interface MaterialPreset {
	id: string;
	name: string;
	group: MaterialGroup;
	color: string;
	emissive: string;
	emissiveStrength: number;
	metalness: number;
	roughness: number;
	opacity: number;
	recipe: RecipeName;
	/** Secondary colour used by the recipe. */
	accent: string;
	/** Pattern density, higher means more repeats. */
	density: number;
}

export interface TextureSet {
	albedo: HTMLCanvasElement;
	roughness: HTMLCanvasElement;
	bump: HTMLCanvasElement;
}

const TEXTURE_SIZE = 64;
const MAP_SIZE = 64;
const THUMBNAIL_SIZE = 32;

/**
 * A material slot as the renderer needs it.
 *
 * The texture holds the final colour, so the tint factor divides it by the
 * colour of the preset. That way the base colour slider keeps working as a
 * tint on top of the procedural texture.
 */
export interface RenderSlot {
	color: [number, number, number];
	emissive: [number, number, number];
	emissiveStrength: number;
	metalness: number;
	roughness: number;
	specular?: number;
	normalStrength?: number;
	opacity: number;
	blendMode?: 'opaque' | 'blend' | 'clip';
	uvRepeat: number;
	uvScaleY?: number;
	uvOffsetX?: number;
	uvOffsetY?: number;
	uvRotation?: number;
	texMapping?: number;
	texStrength?: number;
	texTint: [number, number, number];
	albedo: TexImageSource | null;
	roughnessMap: TexImageSource | null;
	bumpMap: TexImageSource | null;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
	// --- Metals -------------------------------------------------------------
	{ id: 'gold-24k', name: '24K Gold', group: 'Metals', color: '#f5c542', emissive: '#000000', emissiveStrength: 1, metalness: 1, roughness: 0.16, opacity: 1, recipe: 'polished', accent: '#fff0a8', density: 6 },
	{ id: 'silver-brushed', name: 'Brushed Silver', group: 'Metals', color: '#c8ccd4', emissive: '#000000', emissiveStrength: 1, metalness: 1, roughness: 0.32, opacity: 1, recipe: 'brushed', accent: '#8d939e', density: 3 },
	{ id: 'chrome-mirror', name: 'Mirror Chrome', group: 'Metals', color: '#eef1f6', emissive: '#000000', emissiveStrength: 1, metalness: 1, roughness: 0.03, opacity: 1, recipe: 'polished', accent: '#b9c4d6', density: 2 },
	{ id: 'copper', name: 'Copper', group: 'Metals', color: '#b87333', emissive: '#000000', emissiveStrength: 1, metalness: 1, roughness: 0.28, opacity: 1, recipe: 'brushed', accent: '#e0a06a', density: 4 },
	{ id: 'rusted-iron', name: 'Rusted Iron', group: 'Metals', color: '#8a4a25', emissive: '#000000', emissiveStrength: 1, metalness: 0.65, roughness: 0.78, opacity: 1, recipe: 'rust', accent: '#d9762f', density: 5 },
	{ id: 'dark-steel', name: 'Dark Steel', group: 'Metals', color: '#4a5058', emissive: '#000000', emissiveStrength: 1, metalness: 0.95, roughness: 0.42, opacity: 1, recipe: 'brushed', accent: '#22262c', density: 3 },
	{ id: 'titanium', name: 'Brushed Titanium', group: 'Metals', color: '#9aa0a8', emissive: '#000000', emissiveStrength: 1, metalness: 1, roughness: 0.38, opacity: 1, recipe: 'brushed', accent: '#6d737b', density: 5 },
	{ id: 'rose-gold', name: 'Rose Gold', group: 'Metals', color: '#e2a08c', emissive: '#000000', emissiveStrength: 1, metalness: 1, roughness: 0.22, opacity: 1, recipe: 'polished', accent: '#f6cdbd', density: 4 },
	{ id: 'black-plastic', name: 'Matte Black Plastic', group: 'Metals', color: '#23262b', emissive: '#000000', emissiveStrength: 1, metalness: 0.1, roughness: 0.62, opacity: 1, recipe: 'speckle', accent: '#3a3f47', density: 8 },

	// --- Wood, stone and nature --------------------------------------------
	{ id: 'oak-planks', name: 'Oak Wood Planks', group: 'Wood, Stone & Nature', color: '#b07b45', emissive: '#000000', emissiveStrength: 1, metalness: 0, roughness: 0.68, opacity: 1, recipe: 'planks', accent: '#6d4523', density: 4 },
	{ id: 'red-brick', name: 'Red Brick Wall', group: 'Wood, Stone & Nature', color: '#a04a3c', emissive: '#000000', emissiveStrength: 1, metalness: 0, roughness: 0.82, opacity: 1, recipe: 'bricks', accent: '#c9b7a4', density: 5 },
	{ id: 'white-marble', name: 'White Marble', group: 'Wood, Stone & Nature', color: '#eef0f2', emissive: '#000000', emissiveStrength: 1, metalness: 0.05, roughness: 0.24, opacity: 1, recipe: 'veins', accent: '#8d97a5', density: 3 },
	{ id: 'rough-concrete', name: 'Rough Concrete', group: 'Wood, Stone & Nature', color: '#9a9a98', emissive: '#000000', emissiveStrength: 1, metalness: 0, roughness: 0.92, opacity: 1, recipe: 'speckle', accent: '#6c6c6a', density: 7 },
	{ id: 'green-grass', name: 'Green Grass', group: 'Wood, Stone & Nature', color: '#4f9b3a', emissive: '#000000', emissiveStrength: 1, metalness: 0, roughness: 0.88, opacity: 1, recipe: 'blades', accent: '#2c6620', density: 9 },
	{ id: 'cobblestone', name: 'Cobblestone', group: 'Wood, Stone & Nature', color: '#7d7f83', emissive: '#000000', emissiveStrength: 1, metalness: 0, roughness: 0.8, opacity: 1, recipe: 'cells', accent: '#4f5154', density: 6 },
	{ id: 'volcanic-basalt', name: 'Volcanic Basalt', group: 'Wood, Stone & Nature', color: '#3a3d42', emissive: '#000000', emissiveStrength: 1, metalness: 0.1, roughness: 0.85, opacity: 1, recipe: 'speckle', accent: '#1d1f22', density: 10 },
	{ id: 'sandstone', name: 'Sandstone', group: 'Wood, Stone & Nature', color: '#c9a97c', emissive: '#000000', emissiveStrength: 1, metalness: 0, roughness: 0.78, opacity: 1, recipe: 'bands', accent: '#9b7c53', density: 6 },
	{ id: 'satin-fabric', name: 'Satin Fabric', group: 'Wood, Stone & Nature', color: '#7b5ea7', emissive: '#000000', emissiveStrength: 1, metalness: 0, roughness: 0.55, opacity: 1, recipe: 'weave', accent: '#4e3a6d', density: 12 },

	// --- Glass, neon and stylised ------------------------------------------
	{ id: 'clear-glass', name: 'Clear Glass', group: 'Glass, Neon & Stylized', color: '#dff1ff', emissive: '#000000', emissiveStrength: 1, metalness: 0, roughness: 0.04, opacity: 0.24, recipe: 'flat', accent: '#ffffff', density: 1 },
	{ id: 'frosted-ice', name: 'Frosted Ice', group: 'Glass, Neon & Stylized', color: '#cfeaff', emissive: '#0b1a26', emissiveStrength: 0.6, metalness: 0, roughness: 0.46, opacity: 0.72, recipe: 'crystal', accent: '#8fc9f0', density: 8 },
	{ id: 'ocean-water', name: 'Ocean Water', group: 'Glass, Neon & Stylized', color: '#1f6f9c', emissive: '#06222f', emissiveStrength: 0.5, metalness: 0.1, roughness: 0.14, opacity: 0.82, recipe: 'waves', accent: '#8fd8f0', density: 4 },
	{ id: 'neon-cyan', name: 'Neon Cyan', group: 'Glass, Neon & Stylized', color: '#5cf2ff', emissive: '#5cf2ff', emissiveStrength: 2.4, metalness: 0, roughness: 0.2, opacity: 1, recipe: 'flat', accent: '#aef9ff', density: 1 },
	{ id: 'neon-magma', name: 'Neon Magma', group: 'Glass, Neon & Stylized', color: '#ff6a2b', emissive: '#ff5a12', emissiveStrength: 2.6, metalness: 0, roughness: 0.24, opacity: 1, recipe: 'flat', accent: '#ffc46b', density: 1 },
	{ id: 'carbon-fiber', name: 'Carbon Fiber', group: 'Glass, Neon & Stylized', color: '#1c1e22', emissive: '#000000', emissiveStrength: 1, metalness: 0.6, roughness: 0.3, opacity: 1, recipe: 'weave', accent: '#3c4149', density: 16 },
	{ id: 'car-paint', name: 'Glossy Car Paint', group: 'Glass, Neon & Stylized', color: '#c81f3a', emissive: '#000000', emissiveStrength: 1, metalness: 0.85, roughness: 0.09, opacity: 1, recipe: 'flakes', accent: '#f3f6fa', density: 22 },
	{ id: 'toon-anime', name: 'Toon Anime Shader', group: 'Glass, Neon & Stylized', color: '#ffd166', emissive: '#3a2400', emissiveStrength: 0.35, metalness: 0, roughness: 0.7, opacity: 1, recipe: 'bands', accent: '#a86f1c', density: 3 },
	{ id: 'emerald-gem', name: 'Emerald Gemstone', group: 'Glass, Neon & Stylized', color: '#0f9d58', emissive: '#00301a', emissiveStrength: 0.8, metalness: 0.1, roughness: 0.06, opacity: 0.86, recipe: 'crystal', accent: '#8affc4', density: 6 },
	{ id: 'graphite', name: 'Graphite Composite', group: 'Glass, Neon & Stylized', color: '#4c5158', emissive: '#000000', emissiveStrength: 1, metalness: 0.45, roughness: 0.5, opacity: 1, recipe: 'speckle', accent: '#23262b', density: 11 },
];

export const MATERIAL_GROUPS: MaterialGroup[] = ['Metals', 'Wood, Stone & Nature', 'Glass, Neon & Stylized'];

export function presetsForGroup(group: MaterialGroup): MaterialPreset[] {
	return MATERIAL_PRESETS.filter((preset) => preset.group === group);
}

export function presetById(id: string): MaterialPreset | null {
	return MATERIAL_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Builds the material slot that a preset describes. */
export function presetToSlot(preset: MaterialPreset, name = preset.name): MaterialSlot {
	return {
		...defaultMaterialSlot(name),
		color: preset.color,
		emissive: preset.emissive,
		emissiveStrength: preset.emissiveStrength,
		metalness: preset.metalness,
		roughness: preset.roughness,
		opacity: preset.opacity,
		uvRepeat: 1,
		presetId: preset.id,
	};
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
	const value = hex.replace('#', '');
	const expanded = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
	const num = Number.parseInt(expanded, 16);
	if (!Number.isFinite(num)) return [128, 128, 128];
	return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function hash(x: number, y: number, seed: number): number {
	let h = x * 374761393 + y * 668265263 + seed * 2246822519;
	h = (h ^ (h >>> 13)) * 1274126177;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothStep(value: number): number {
	return value * value * (3 - 2 * value);
}

function valueNoise(x: number, y: number, seed: number): number {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const fx = smoothStep(x - x0);
	const fy = smoothStep(y - y0);
	const n00 = hash(x0, y0, seed);
	const n10 = hash(x0 + 1, y0, seed);
	const n01 = hash(x0, y0 + 1, seed);
	const n11 = hash(x0 + 1, y0 + 1, seed);
	const top = n00 + (n10 - n00) * fx;
	const bottom = n01 + (n11 - n01) * fx;
	return top + (bottom - top) * fy;
}

function fbm(x: number, y: number, octaves: number, seed: number): number {
	let total = 0;
	let amplitude = 0.5;
	let frequency = 1;
	for (let i = 0; i < octaves; i++) {
		total += valueNoise(x * frequency, y * frequency, seed + i * 131) * amplitude;
		amplitude *= 0.5;
		frequency *= 2;
	}
	return total / (1 - Math.pow(0.5, octaves));
}

interface Pixel {
	r: number;
	g: number;
	b: number;
}

type ColorLike = Pixel | [number, number, number];

function asPixel(color: ColorLike): Pixel {
	return Array.isArray(color) ? { r: color[0], g: color[1], b: color[2] } : color;
}

function mixColor(a: ColorLike, b: ColorLike, t: number): Pixel {
	const first = asPixel(a);
	const second = asPixel(b);
	const k = Math.min(1, Math.max(0, t));
	return {
		r: first.r + (second.r - first.r) * k,
		g: first.g + (second.g - first.g) * k,
		b: first.b + (second.b - first.b) * k,
	};
}

function createCanvas(size: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	return canvas;
}

function recipeSample(preset: MaterialPreset, u: number, v: number): { color: Pixel; roughness: number; bump: number } {
	const base = hexToRgb(preset.color);
	const accent = hexToRgb(preset.accent);
	const density = Math.max(1, preset.density);

	switch (preset.recipe) {
		case 'flat': {
			return { color: { r: base[0], g: base[1], b: base[2] }, roughness: preset.roughness, bump: 0.5 };
		}
		case 'brushed': {
			const streak = valueNoise(u * density * 90, v * density * 2.5, 11);
			const fine = valueNoise(u * density * 220, v * density * 6, 23);
			const amount = streak * 0.65 + fine * 0.35;
			return {
				color: mixColor(accent, base, 0.35 + amount * 0.65),
				roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.22),
				bump: amount,
			};
		}
		case 'polished': {
			const amount = fbm(u * density * 4, v * density * 4, 3, 31);
			return {
				color: mixColor(accent, base, 0.75 + amount * 0.25),
				roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.06),
				bump: 0.5 + (amount - 0.5) * 0.12,
			};
		}
		case 'rust': {
			const blotch = fbm(u * density * 3.2, v * density * 3.2, 5, 43);
			const grain = valueNoise(u * density * 60, v * density * 60, 57);
			const rust = Math.min(1, Math.max(0, (blotch - 0.35) * 2.4));
			const color = mixColor(base, accent, rust * 0.9 + grain * 0.1);
			return {
				color,
				roughness: Math.min(1, 0.45 + rust * 0.5),
				bump: 0.35 + rust * 0.5 + grain * 0.15,
			};
		}
		case 'planks': {
			const plank = Math.floor(v * density);
			const offset = hash(plank, 3, 67) * 0.7;
			const local = (v * density - plank) * 6;
			const seam = local < 0.06 || local > 5.94 ? 1 : 0;
			const grain = fbm(u * density * 5 + offset * 9, v * density * 26, 4, 71 + plank);
			const tone = hash(plank, 7, 89);
			let color = mixColor(accent, base, 0.45 + tone * 0.4 + grain * 0.25);
			if (seam) color = mixColor(color, accent, 0.75);
			return {
				color,
				roughness: Math.min(1, preset.roughness + (seam ? 0.1 : 0) + (grain - 0.5) * 0.12),
				bump: seam ? 0.12 : 0.45 + grain * 0.4,
			};
		}
		case 'bricks': {
			const rows = density;
			const row = Math.floor(v * rows);
			const shift = row % 2 === 0 ? 0 : 0.5;
			const bx = (u * density * 0.5 + shift) % 1;
			const by = (v * rows) % 1;
			const mortar = bx < 0.06 || bx > 0.94 || by < 0.1 || by > 0.9 ? 1 : 0;
			const grain = fbm(u * 40, v * 40, 3, 97 + row);
			const tone = hash(row, Math.floor(u * density * 0.5 + shift), 103);
			let color = mixColor(accent, base, 0.55 + tone * 0.45);
			color = mixColor(color, { r: color.r * 0.85, g: color.g * 0.85, b: color.b * 0.85 }, grain * 0.5);
			if (mortar) color = mixColor(color, accent, 0.85);
			return {
				color,
				roughness: Math.min(1, preset.roughness + (mortar ? 0.08 : 0)),
				bump: mortar ? 0.08 : 0.55 + grain * 0.3,
			};
		}
		case 'veins': {
			const warp = fbm(u * density * 2, v * density * 2, 4, 113) * 2.4;
			const vein = Math.abs(Math.sin((u * density + warp) * Math.PI * 2));
			const thin = Math.pow(1 - vein, 12);
			const grain = fbm(u * 60, v * 60, 3, 127);
			const color = mixColor(base, accent, thin * 0.85 + grain * 0.06);
			return {
				color,
				roughness: Math.min(1, preset.roughness + (thin > 0.5 ? 0.1 : 0)),
				bump: 0.5 + (1 - thin) * 0.08,
			};
		}
		case 'speckle': {
			const coarse = fbm(u * density * 3, v * density * 3, 4, 139);
			const fine = valueNoise(u * density * 70, v * density * 70, 149);
			const amount = coarse * 0.7 + fine * 0.3;
			return {
				color: mixColor(accent, base, 0.3 + amount * 0.7),
				roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.18),
				bump: amount,
			};
		}
		case 'blades': {
			const blade = valueNoise(u * density * 18, v * density * 4, 151);
			const clump = fbm(u * density * 2.5, v * density * 2.5, 3, 157);
			const amount = blade * 0.65 + clump * 0.35;
			return {
				color: mixColor(accent, base, 0.25 + amount * 0.75),
				roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.1),
				bump: blade,
			};
		}
		case 'cells': {
			const gx = u * density;
			const gy = v * density;
			const cx = Math.floor(gx);
			const cy = Math.floor(gy);
			const fx = gx - cx;
			const fy = gy - cy;
			const jitterX = hash(cx, cy, 163) * 0.3;
			const jitterY = hash(cx, cy, 167) * 0.3;
			const d = Math.hypot(fx - 0.5 - jitterX, fy - 0.5 - jitterY);
			const stone = d < 0.42 ? 1 : 0;
			const grain = valueNoise(gx * 30, gy * 30, 173);
			const color = stone ? mixColor(accent, base, 0.55 + grain * 0.45) : mixColor(base, accent, 0.7);
			return {
				color,
				roughness: Math.min(1, preset.roughness + (stone ? 0 : 0.08)),
				bump: stone ? 0.75 : 0.2,
			};
		}
		case 'waves': {
			const wave = Math.sin((u * density + v * density * 0.6) * Math.PI * 2) * 0.5 + 0.5;
			const foam = Math.pow(wave, 6);
			const ripple = fbm(u * 24, v * 24, 3, 179);
			const color = mixColor(base, accent, foam * 0.8 + ripple * 0.12);
			return {
				color,
				roughness: Math.min(1, preset.roughness + foam * 0.12),
				bump: wave * 0.6 + ripple * 0.2,
			};
		}
		case 'crystal': {
			const facet = Math.abs(Math.sin((u * density + v * density * 0.35) * Math.PI));
			const grain = fbm(u * 30, v * 30, 4, 191);
			const amount = facet * 0.6 + grain * 0.4;
			return {
				color: mixColor(base, accent, amount * 0.7),
				roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.25),
				bump: amount,
			};
		}
		case 'weave': {
			const gx = u * density;
			const gy = v * density;
			const over = (Math.floor(gx) + Math.floor(gy)) % 2 === 0;
			const thread = over ? Math.sin((gy % 1) * Math.PI) : Math.sin((gx % 1) * Math.PI);
			const grain = valueNoise(gx * 12, gy * 12, 197);
			const color = mixColor(accent, base, 0.25 + thread * 0.55 + grain * 0.2);
			return {
				color,
				roughness: Math.min(1, preset.roughness + (thread - 0.5) * 0.2),
				bump: thread * 0.8 + grain * 0.2,
			};
		}
		case 'bands': {
			const band = Math.floor(v * density * 3);
			const tone = hash(band, 5, 199);
			const grain = valueNoise(u * 45, v * 45, 211);
			const color = mixColor(accent, base, 0.35 + tone * 0.5 + grain * 0.15);
			return {
				color,
				roughness: Math.min(1, preset.roughness + (tone - 0.5) * 0.08),
				bump: 0.5 + grain * 0.1,
			};
		}
		case 'flakes': {
			const flake = valueNoise(u * density * 4, v * density * 4, 223);
			const sheen = fbm(u * 6, v * 6, 3, 227);
			const color = mixColor(base, accent, Math.pow(flake, 6) * 0.7 + sheen * 0.12);
			return {
				color,
				roughness: Math.min(1, preset.roughness + (flake - 0.5) * 0.08),
				bump: 0.5 + (flake - 0.5) * 0.1,
			};
		}
		default:
			return { color: { r: base[0], g: base[1], b: base[2] }, roughness: preset.roughness, bump: 0.5 };
	}
}

function renderTextureSet(preset: MaterialPreset, size: number): TextureSet {
	const albedoCanvas = createCanvas(size);
	const roughnessCanvas = createCanvas(MAP_SIZE);
	const bumpCanvas = createCanvas(MAP_SIZE);
	const albedoCtx = albedoCanvas.getContext('2d');
	const roughnessCtx = roughnessCanvas.getContext('2d');
	const bumpCtx = bumpCanvas.getContext('2d');
	if (!albedoCtx || !roughnessCtx || !bumpCtx) {
		return { albedo: albedoCanvas, roughness: roughnessCanvas, bump: bumpCanvas };
	}

	const albedoImage = albedoCtx.createImageData(size, size);
	const roughnessImage = roughnessCtx.createImageData(MAP_SIZE, MAP_SIZE);
	const bumpImage = bumpCtx.createImageData(MAP_SIZE, MAP_SIZE);

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const u = x / size;
			const v = y / size;
			const sample = recipeSample(preset, u, v);
			const offset = (y * size + x) * 4;
			albedoImage.data[offset] = Math.round(Math.min(255, Math.max(0, sample.color.r)));
			albedoImage.data[offset + 1] = Math.round(Math.min(255, Math.max(0, sample.color.g)));
			albedoImage.data[offset + 2] = Math.round(Math.min(255, Math.max(0, sample.color.b)));
			albedoImage.data[offset + 3] = 255;
		}
	}

	for (let y = 0; y < MAP_SIZE; y++) {
		for (let x = 0; x < MAP_SIZE; x++) {
			const u = x / MAP_SIZE;
			const v = y / MAP_SIZE;
			const sample = recipeSample(preset, u, v);
			const offset = (y * MAP_SIZE + x) * 4;
			// The roughness map holds a multiplier around one, so the slider
			// of the slot stays in charge of the final roughness.
			const rough = Math.round(Math.min(255, Math.max(0, (0.5 + (sample.roughness - preset.roughness)) * 255)));
			roughnessImage.data[offset] = rough;
			roughnessImage.data[offset + 1] = rough;
			roughnessImage.data[offset + 2] = rough;
			roughnessImage.data[offset + 3] = 255;

			const bump = Math.round(Math.min(255, Math.max(0, sample.bump * 255)));
			bumpImage.data[offset] = bump;
			bumpImage.data[offset + 1] = bump;
			bumpImage.data[offset + 2] = bump;
			bumpImage.data[offset + 3] = 255;
		}
	}

	albedoCtx.putImageData(albedoImage, 0, 0);
	roughnessCtx.putImageData(roughnessImage, 0, 0);
	bumpCtx.putImageData(bumpImage, 0, 0);
	return { albedo: albedoCanvas, roughness: roughnessCanvas, bump: bumpCanvas };
}

/** Paints only the albedo channel, used for the library previews. */
function renderAlbedo(preset: MaterialPreset, size: number): HTMLCanvasElement {
	const canvas = createCanvas(size);
	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;
	const image = ctx.createImageData(size, size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const sample = recipeSample(preset, x / size, y / size);
			const offset = (y * size + x) * 4;
			image.data[offset] = Math.round(Math.min(255, Math.max(0, sample.color.r)));
			image.data[offset + 1] = Math.round(Math.min(255, Math.max(0, sample.color.g)));
			image.data[offset + 2] = Math.round(Math.min(255, Math.max(0, sample.color.b)));
			image.data[offset + 3] = 255;
		}
	}
	ctx.putImageData(image, 0, 0);
	return canvas;
}

const textureCache = new Map<string, TextureSet>();
const thumbnailCache = new Map<string, string>();

/** Returns the generated textures of a preset, generating them on first use. */
export function textureSetFor(preset: MaterialPreset): TextureSet {
	const cached = textureCache.get(preset.id);
	if (cached) return cached;
	const generated = renderTextureSet(preset, TEXTURE_SIZE);
	textureCache.set(preset.id, generated);
	return generated;
}

/** Small preview image of a preset, used by the library swatches. */
export function thumbnailFor(preset: MaterialPreset): string {
	const cached = thumbnailCache.get(preset.id);
	if (cached) return cached;
	const url = renderAlbedo(preset, THUMBNAIL_SIZE).toDataURL('image/png');
	thumbnailCache.set(preset.id, url);
	return url;
}

/** Averages the albedo of a preset, used for the viewport fallback colour. */
export function averageColor(preset: MaterialPreset): string {
	const rgb = hexToRgb(preset.color);
	return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Builds the slot that a user uploaded image describes.
 *
 * The image is stored as a data URL so the project file keeps working.
 */
export function slotFromImage(name: string, dataUrl: string): MaterialSlot {
	return {
		...defaultMaterialSlot(name),
		color: '#ffffff',
		metalness: 0.1,
		roughness: 0.5,
		imageUrl: dataUrl,
	};
}

const imageCache = new Map<string, HTMLImageElement>();

/** The decoded image of a slot, when the user uploaded one. */
export function imageForSlot(slotOrUrl: MaterialSlot | string | undefined): HTMLImageElement | null {
	const url = typeof slotOrUrl === 'string' ? slotOrUrl : slotOrUrl?.imageUrl;
	if (!url || typeof Image === 'undefined') return null;
	let image = imageCache.get(url);
	if (!image) {
		image = new Image();
		image.onload = () => {
			const g = globalThis as unknown as { __lookEngine?: { onTexLoaded?: () => void } };
			if (g.__lookEngine?.onTexLoaded) g.__lookEngine.onTexLoaded();
		};
		image.src = url;
		imageCache.set(url, image);
	}
	return image.complete && image.naturalWidth > 0 ? image : null;
}

/** Turns a material slot into the values the renderer uploads. */
export function renderSlotFor(slot: MaterialSlot): RenderSlot {
	const preset = slot.presetId ? presetById(slot.presetId) : null;
	const textures = preset ? textureSetFor(preset) : null;
	const image = imageForSlot(slot.imageUrl);
	const rMap = imageForSlot(slot.roughnessUrl);
	const bMap = imageForSlot(slot.normalUrl);
	const color = hexToRgb(slot.color).map((channel) => channel / 255) as [number, number, number];
	const emissive = hexToRgb(slot.emissive).map((channel) => channel / 255) as [number, number, number];
	const tint = preset && !image ? hexToRgb(preset.color) : [255, 255, 255];
	const texTint: [number, number, number] = preset && !image
		? [
				1 / Math.max(tint[0] / 255, 0.05),
				1 / Math.max(tint[1] / 255, 0.05),
				1 / Math.max(tint[2] / 255, 0.05),
			]
		: [1, 1, 1];
	return {
		color,
		emissive,
		emissiveStrength: slot.emissiveStrength ?? 1,
		metalness: slot.metalness ?? 0.04,
		roughness: slot.roughness ?? 0.36,
		specular: slot.specular ?? 0.5,
		normalStrength: slot.normalStrength ?? 1,
		opacity: slot.opacity ?? 1,
		blendMode: slot.blendMode || 'blend',
		uvRepeat: slot.uvRepeat ?? 1,
		uvScaleY: slot.uvScaleY ?? slot.uvRepeat ?? 1,
		uvOffsetX: slot.uvOffsetX ?? 0,
		uvOffsetY: slot.uvOffsetY ?? 0,
		uvRotation: slot.uvRotation ?? 0,
		texMapping: slot.texMapping ?? 0,
		texStrength: slot.texStrength ?? 1,
		texTint,
		albedo: image || (textures ? textures.albedo : null),
		roughnessMap: rMap || (textures ? textures.roughness : null),
		bumpMap: bMap || (textures ? textures.bump : null),
	};
}

/** Builds the render slots of an object from its material slots. */
export function renderSlotsFor(slots: MaterialSlot[]): RenderSlot[] {
	return slots.map(renderSlotFor);
}
