// Blender readymade material library.
//
// Every preset is a small PBR description (base colour, metalness, roughness,
// emissive strength, opacity) plus a procedural texture recipe. The recipes
// paint high resolution canvases for the albedo, the roughness and the bump
// channel, which the viewport uploads as textures.

import { defaultMaterialSlot } from './mesh';
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

export const MATERIAL_PRESETS = [
// --- Metals -------------------------------------------------------------
{
  id: 'gold-24k',
  name: '24K Gold',
  group: 'Metals',
  color: '#f5c542',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 1,
  roughness: 0.16,
  opacity: 1,
  recipe: 'polished',
  accent: '#fff0a8',
  density: 6
}, {
  id: 'silver-brushed',
  name: 'Brushed Silver',
  group: 'Metals',
  color: '#c8ccd4',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 1,
  roughness: 0.32,
  opacity: 1,
  recipe: 'brushed',
  accent: '#8d939e',
  density: 3
}, {
  id: 'chrome-mirror',
  name: 'Mirror Chrome',
  group: 'Metals',
  color: '#eef1f6',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 1,
  roughness: 0.03,
  opacity: 1,
  recipe: 'polished',
  accent: '#b9c4d6',
  density: 2
}, {
  id: 'copper',
  name: 'Copper',
  group: 'Metals',
  color: '#b87333',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 1,
  roughness: 0.28,
  opacity: 1,
  recipe: 'brushed',
  accent: '#e0a06a',
  density: 4
}, {
  id: 'rusted-iron',
  name: 'Rusted Iron',
  group: 'Metals',
  color: '#8a4a25',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0.65,
  roughness: 0.78,
  opacity: 1,
  recipe: 'rust',
  accent: '#d9762f',
  density: 5
}, {
  id: 'dark-steel',
  name: 'Dark Steel',
  group: 'Metals',
  color: '#4a5058',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0.95,
  roughness: 0.42,
  opacity: 1,
  recipe: 'brushed',
  accent: '#22262c',
  density: 3
}, {
  id: 'titanium',
  name: 'Brushed Titanium',
  group: 'Metals',
  color: '#9aa0a8',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 1,
  roughness: 0.38,
  opacity: 1,
  recipe: 'brushed',
  accent: '#6d737b',
  density: 5
}, {
  id: 'rose-gold',
  name: 'Rose Gold',
  group: 'Metals',
  color: '#e2a08c',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 1,
  roughness: 0.22,
  opacity: 1,
  recipe: 'polished',
  accent: '#f6cdbd',
  density: 4
}, {
  id: 'black-plastic',
  name: 'Matte Black Plastic',
  group: 'Metals',
  color: '#23262b',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0.1,
  roughness: 0.62,
  opacity: 1,
  recipe: 'speckle',
  accent: '#3a3f47',
  density: 8
},
// --- Wood, stone and nature --------------------------------------------
{
  id: 'oak-planks',
  name: 'Oak Wood Planks',
  group: 'Wood, Stone & Nature',
  color: '#b07b45',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0,
  roughness: 0.68,
  opacity: 1,
  recipe: 'planks',
  accent: '#6d4523',
  density: 4
}, {
  id: 'red-brick',
  name: 'Red Brick Wall',
  group: 'Wood, Stone & Nature',
  color: '#a04a3c',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0,
  roughness: 0.82,
  opacity: 1,
  recipe: 'bricks',
  accent: '#c9b7a4',
  density: 5
}, {
  id: 'white-marble',
  name: 'White Marble',
  group: 'Wood, Stone & Nature',
  color: '#eef0f2',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0.05,
  roughness: 0.24,
  opacity: 1,
  recipe: 'veins',
  accent: '#8d97a5',
  density: 3
}, {
  id: 'rough-concrete',
  name: 'Rough Concrete',
  group: 'Wood, Stone & Nature',
  color: '#9a9a98',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0,
  roughness: 0.92,
  opacity: 1,
  recipe: 'speckle',
  accent: '#6c6c6a',
  density: 7
}, {
  id: 'green-grass',
  name: 'Green Grass',
  group: 'Wood, Stone & Nature',
  color: '#4f9b3a',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0,
  roughness: 0.88,
  opacity: 1,
  recipe: 'blades',
  accent: '#2c6620',
  density: 9
}, {
  id: 'cobblestone',
  name: 'Cobblestone',
  group: 'Wood, Stone & Nature',
  color: '#7d7f83',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0,
  roughness: 0.8,
  opacity: 1,
  recipe: 'cells',
  accent: '#4f5154',
  density: 6
}, {
  id: 'volcanic-basalt',
  name: 'Volcanic Basalt',
  group: 'Wood, Stone & Nature',
  color: '#3a3d42',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0.1,
  roughness: 0.85,
  opacity: 1,
  recipe: 'speckle',
  accent: '#1d1f22',
  density: 10
}, {
  id: 'sandstone',
  name: 'Sandstone',
  group: 'Wood, Stone & Nature',
  color: '#c9a97c',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0,
  roughness: 0.78,
  opacity: 1,
  recipe: 'bands',
  accent: '#9b7c53',
  density: 6
}, {
  id: 'satin-fabric',
  name: 'Satin Fabric',
  group: 'Wood, Stone & Nature',
  color: '#7b5ea7',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0,
  roughness: 0.55,
  opacity: 1,
  recipe: 'weave',
  accent: '#4e3a6d',
  density: 12
},
// --- Glass, neon and stylised ------------------------------------------
{
  id: 'clear-glass',
  name: 'Clear Glass',
  group: 'Glass, Neon & Stylized',
  color: '#dff1ff',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0,
  roughness: 0.04,
  opacity: 0.24,
  recipe: 'flat',
  accent: '#ffffff',
  density: 1
}, {
  id: 'frosted-ice',
  name: 'Frosted Ice',
  group: 'Glass, Neon & Stylized',
  color: '#cfeaff',
  emissive: '#0b1a26',
  emissiveStrength: 0.6,
  metalness: 0,
  roughness: 0.46,
  opacity: 0.72,
  recipe: 'crystal',
  accent: '#8fc9f0',
  density: 8
}, {
  id: 'ocean-water',
  name: 'Ocean Water',
  group: 'Glass, Neon & Stylized',
  color: '#1f6f9c',
  emissive: '#06222f',
  emissiveStrength: 0.5,
  metalness: 0.1,
  roughness: 0.14,
  opacity: 0.82,
  recipe: 'waves',
  accent: '#8fd8f0',
  density: 4
}, {
  id: 'neon-cyan',
  name: 'Neon Cyan',
  group: 'Glass, Neon & Stylized',
  color: '#5cf2ff',
  emissive: '#5cf2ff',
  emissiveStrength: 2.4,
  metalness: 0,
  roughness: 0.2,
  opacity: 1,
  recipe: 'flat',
  accent: '#aef9ff',
  density: 1
}, {
  id: 'neon-magma',
  name: 'Neon Magma',
  group: 'Glass, Neon & Stylized',
  color: '#ff6a2b',
  emissive: '#ff5a12',
  emissiveStrength: 2.6,
  metalness: 0,
  roughness: 0.24,
  opacity: 1,
  recipe: 'flat',
  accent: '#ffc46b',
  density: 1
}, {
  id: 'carbon-fiber',
  name: 'Carbon Fiber',
  group: 'Glass, Neon & Stylized',
  color: '#1c1e22',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0.6,
  roughness: 0.3,
  opacity: 1,
  recipe: 'weave',
  accent: '#3c4149',
  density: 16
}, {
  id: 'car-paint',
  name: 'Glossy Car Paint',
  group: 'Glass, Neon & Stylized',
  color: '#c81f3a',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0.85,
  roughness: 0.09,
  opacity: 1,
  recipe: 'flakes',
  accent: '#f3f6fa',
  density: 22
}, {
  id: 'toon-anime',
  name: 'Toon Anime Shader',
  group: 'Glass, Neon & Stylized',
  color: '#ffd166',
  emissive: '#3a2400',
  emissiveStrength: 0.35,
  metalness: 0,
  roughness: 0.7,
  opacity: 1,
  recipe: 'bands',
  accent: '#a86f1c',
  density: 3
}, {
  id: 'emerald-gem',
  name: 'Emerald Gemstone',
  group: 'Glass, Neon & Stylized',
  color: '#0f9d58',
  emissive: '#00301a',
  emissiveStrength: 0.8,
  metalness: 0.1,
  roughness: 0.06,
  opacity: 0.86,
  recipe: 'crystal',
  accent: '#8affc4',
  density: 6
}, {
  id: 'graphite',
  name: 'Graphite Composite',
  group: 'Glass, Neon & Stylized',
  color: '#4c5158',
  emissive: '#000000',
  emissiveStrength: 1,
  metalness: 0.45,
  roughness: 0.5,
  opacity: 1,
  recipe: 'speckle',
  accent: '#23262b',
  density: 11
}];
export const MATERIAL_GROUPS = ['Metals', 'Wood, Stone & Nature', 'Glass, Neon & Stylized'];
export function presetsForGroup(group) {
  return MATERIAL_PRESETS.filter(preset => preset.group === group);
}
export function presetById(id) {
  return MATERIAL_PRESETS.find(preset => preset.id === id) ?? null;
}

/** Builds the material slot that a preset describes. */
export function presetToSlot(preset, name = preset.name) {
  return {
    ...defaultMaterialSlot(name),
    color: preset.color,
    emissive: preset.emissive,
    emissiveStrength: preset.emissiveStrength,
    metalness: preset.metalness,
    roughness: preset.roughness,
    opacity: preset.opacity,
    uvRepeat: 1,
    presetId: preset.id
  };
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const expanded = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const num = Number.parseInt(expanded, 16);
  if (!Number.isFinite(num)) return [128, 128, 128];
  return [num >> 16 & 255, num >> 8 & 255, num & 255];
}
function hash(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2246822519;
  h = (h ^ h >>> 13) * 1274126177;
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}
function smoothStep(value) {
  return value * value * (3 - 2 * value);
}
function valueNoise(x, y, seed) {
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
function fbm(x, y, octaves, seed) {
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
function asPixel(color) {
  return Array.isArray(color) ? {
    r: color[0],
    g: color[1],
    b: color[2]
  } : color;
}
function mixColor(a, b, t) {
  const first = asPixel(a);
  const second = asPixel(b);
  const k = Math.min(1, Math.max(0, t));
  return {
    r: first.r + (second.r - first.r) * k,
    g: first.g + (second.g - first.g) * k,
    b: first.b + (second.b - first.b) * k
  };
}
function createCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}
function recipeSample(preset, u, v) {
  const base = hexToRgb(preset.color);
  const accent = hexToRgb(preset.accent);
  const density = Math.max(1, preset.density);
  switch (preset.recipe) {
    case 'flat':
      {
        return {
          color: {
            r: base[0],
            g: base[1],
            b: base[2]
          },
          roughness: preset.roughness,
          bump: 0.5
        };
      }
    case 'brushed':
      {
        const streak = valueNoise(u * density * 90, v * density * 2.5, 11);
        const fine = valueNoise(u * density * 220, v * density * 6, 23);
        const amount = streak * 0.65 + fine * 0.35;
        return {
          color: mixColor(accent, base, 0.35 + amount * 0.65),
          roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.22),
          bump: amount
        };
      }
    case 'polished':
      {
        const amount = fbm(u * density * 4, v * density * 4, 3, 31);
        return {
          color: mixColor(accent, base, 0.75 + amount * 0.25),
          roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.06),
          bump: 0.5 + (amount - 0.5) * 0.12
        };
      }
    case 'rust':
      {
        const blotch = fbm(u * density * 3.2, v * density * 3.2, 5, 43);
        const grain = valueNoise(u * density * 60, v * density * 60, 57);
        const rust = Math.min(1, Math.max(0, (blotch - 0.35) * 2.4));
        const color = mixColor(base, accent, rust * 0.9 + grain * 0.1);
        return {
          color,
          roughness: Math.min(1, 0.45 + rust * 0.5),
          bump: 0.35 + rust * 0.5 + grain * 0.15
        };
      }
    case 'planks':
      {
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
          bump: seam ? 0.12 : 0.45 + grain * 0.4
        };
      }
    case 'bricks':
      {
        const rows = density;
        const row = Math.floor(v * rows);
        const shift = row % 2 === 0 ? 0 : 0.5;
        const bx = (u * density * 0.5 + shift) % 1;
        const by = v * rows % 1;
        const mortar = bx < 0.06 || bx > 0.94 || by < 0.1 || by > 0.9 ? 1 : 0;
        const grain = fbm(u * 40, v * 40, 3, 97 + row);
        const tone = hash(row, Math.floor(u * density * 0.5 + shift), 103);
        let color = mixColor(accent, base, 0.55 + tone * 0.45);
        color = mixColor(color, {
          r: color.r * 0.85,
          g: color.g * 0.85,
          b: color.b * 0.85
        }, grain * 0.5);
        if (mortar) color = mixColor(color, accent, 0.85);
        return {
          color,
          roughness: Math.min(1, preset.roughness + (mortar ? 0.08 : 0)),
          bump: mortar ? 0.08 : 0.55 + grain * 0.3
        };
      }
    case 'veins':
      {
        const warp = fbm(u * density * 2, v * density * 2, 4, 113) * 2.4;
        const vein = Math.abs(Math.sin((u * density + warp) * Math.PI * 2));
        const thin = Math.pow(1 - vein, 12);
        const grain = fbm(u * 60, v * 60, 3, 127);
        const color = mixColor(base, accent, thin * 0.85 + grain * 0.06);
        return {
          color,
          roughness: Math.min(1, preset.roughness + (thin > 0.5 ? 0.1 : 0)),
          bump: 0.5 + (1 - thin) * 0.08
        };
      }
    case 'speckle':
      {
        const coarse = fbm(u * density * 3, v * density * 3, 4, 139);
        const fine = valueNoise(u * density * 70, v * density * 70, 149);
        const amount = coarse * 0.7 + fine * 0.3;
        return {
          color: mixColor(accent, base, 0.3 + amount * 0.7),
          roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.18),
          bump: amount
        };
      }
    case 'blades':
      {
        const blade = valueNoise(u * density * 18, v * density * 4, 151);
        const clump = fbm(u * density * 2.5, v * density * 2.5, 3, 157);
        const amount = blade * 0.65 + clump * 0.35;
        return {
          color: mixColor(accent, base, 0.25 + amount * 0.75),
          roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.1),
          bump: blade
        };
      }
    case 'cells':
      {
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
          bump: stone ? 0.75 : 0.2
        };
      }
    case 'waves':
      {
        const wave = Math.sin((u * density + v * density * 0.6) * Math.PI * 2) * 0.5 + 0.5;
        const foam = Math.pow(wave, 6);
        const ripple = fbm(u * 24, v * 24, 3, 179);
        const color = mixColor(base, accent, foam * 0.8 + ripple * 0.12);
        return {
          color,
          roughness: Math.min(1, preset.roughness + foam * 0.12),
          bump: wave * 0.6 + ripple * 0.2
        };
      }
    case 'crystal':
      {
        const facet = Math.abs(Math.sin((u * density + v * density * 0.35) * Math.PI));
        const grain = fbm(u * 30, v * 30, 4, 191);
        const amount = facet * 0.6 + grain * 0.4;
        return {
          color: mixColor(base, accent, amount * 0.7),
          roughness: Math.min(1, preset.roughness + (amount - 0.5) * 0.25),
          bump: amount
        };
      }
    case 'weave':
      {
        const gx = u * density;
        const gy = v * density;
        const over = (Math.floor(gx) + Math.floor(gy)) % 2 === 0;
        const thread = over ? Math.sin(gy % 1 * Math.PI) : Math.sin(gx % 1 * Math.PI);
        const grain = valueNoise(gx * 12, gy * 12, 197);
        const color = mixColor(accent, base, 0.25 + thread * 0.55 + grain * 0.2);
        return {
          color,
          roughness: Math.min(1, preset.roughness + (thread - 0.5) * 0.2),
          bump: thread * 0.8 + grain * 0.2
        };
      }
    case 'bands':
      {
        const band = Math.floor(v * density * 3);
        const tone = hash(band, 5, 199);
        const grain = valueNoise(u * 45, v * 45, 211);
        const color = mixColor(accent, base, 0.35 + tone * 0.5 + grain * 0.15);
        return {
          color,
          roughness: Math.min(1, preset.roughness + (tone - 0.5) * 0.08),
          bump: 0.5 + grain * 0.1
        };
      }
    case 'flakes':
      {
        const flake = valueNoise(u * density * 4, v * density * 4, 223);
        const sheen = fbm(u * 6, v * 6, 3, 227);
        const color = mixColor(base, accent, Math.pow(flake, 6) * 0.7 + sheen * 0.12);
        return {
          color,
          roughness: Math.min(1, preset.roughness + (flake - 0.5) * 0.08),
          bump: 0.5 + (flake - 0.5) * 0.1
        };
      }
    default:
      return {
        color: {
          r: base[0],
          g: base[1],
          b: base[2]
        },
        roughness: preset.roughness,
        bump: 0.5
      };
  }
}
function renderTextureSet(preset, size) {
  const albedoCanvas = createCanvas(size);
  const roughnessCanvas = createCanvas(MAP_SIZE);
  const bumpCanvas = createCanvas(MAP_SIZE);
  const albedoCtx = albedoCanvas.getContext('2d');
  const roughnessCtx = roughnessCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  if (!albedoCtx || !roughnessCtx || !bumpCtx) {
    return {
      albedo: albedoCanvas,
      roughness: roughnessCanvas,
      bump: bumpCanvas
    };
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
  return {
    albedo: albedoCanvas,
    roughness: roughnessCanvas,
    bump: bumpCanvas
  };
}

/** Paints only the albedo channel, used for the library previews. */
function renderAlbedo(preset, size) {
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
const textureCache = new Map();
const thumbnailCache = new Map();

/** Returns the generated textures of a preset, generating them on first use. */
export function textureSetFor(preset) {
  const cached = textureCache.get(preset.id);
  if (cached) return cached;
  const generated = renderTextureSet(preset, TEXTURE_SIZE);
  textureCache.set(preset.id, generated);
  return generated;
}

/** Small preview image of a preset, used by the library swatches. */
export function thumbnailFor(preset) {
  const cached = thumbnailCache.get(preset.id);
  if (cached) return cached;
  const url = renderAlbedo(preset, THUMBNAIL_SIZE).toDataURL('image/png');
  thumbnailCache.set(preset.id, url);
  return url;
}

/** Averages the albedo of a preset, used for the viewport fallback colour. */
export function averageColor(preset) {
  const rgb = hexToRgb(preset.color);
  return `#${rgb.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Builds the slot that a user uploaded image describes.
 *
 * The image is stored as a data URL so the project file keeps working.
 */
export function slotFromImage(name, dataUrl) {
  return {
    ...defaultMaterialSlot(name),
    color: '#ffffff',
    metalness: 0.1,
    roughness: 0.5,
    imageUrl: dataUrl
  };
}
const imageCache = new Map();

/** The decoded image of a slot, when the user uploaded one. */
export function imageForSlot(slotOrUrl) {
  const url = typeof slotOrUrl === 'string' ? slotOrUrl : slotOrUrl?.imageUrl;
  if (!url || typeof Image === 'undefined') return null;
  let image = imageCache.get(url);
  if (!image) {
    image = new Image();
    image.onload = () => {
      const g = globalThis;
      if (g.__lookEngine?.onTexLoaded) g.__lookEngine.onTexLoaded();
    };
    image.src = url;
    imageCache.set(url, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

/** Turns a material slot into the values the renderer uploads. */
export function renderSlotFor(slot) {
  const preset = slot.presetId ? presetById(slot.presetId) : null;
  const textures = preset ? textureSetFor(preset) : null;
  const image = imageForSlot(slot.imageUrl);
  const rMap = imageForSlot(slot.roughnessUrl);
  const bMap = imageForSlot(slot.normalUrl);
  const color = hexToRgb(slot.color).map(channel => channel / 255);
  const emissive = hexToRgb(slot.emissive).map(channel => channel / 255);
  const tint = preset && !image ? hexToRgb(preset.color) : [255, 255, 255];
  const texTint = preset && !image ? [1 / Math.max(tint[0] / 255, 0.05), 1 / Math.max(tint[1] / 255, 0.05), 1 / Math.max(tint[2] / 255, 0.05)] : [1, 1, 1];
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
    bumpMap: bMap || (textures ? textures.bump : null)
  };
}

/** Builds the render slots of an object from its material slots. */
export function renderSlotsFor(slots) {
  return slots.map(renderSlotFor);
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6W10sInNvdXJjZXMiOlsibWF0ZXJpYWxzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEJsZW5kZXIgcmVhZHltYWRlIG1hdGVyaWFsIGxpYnJhcnkuXG4vL1xuLy8gRXZlcnkgcHJlc2V0IGlzIGEgc21hbGwgUEJSIGRlc2NyaXB0aW9uIChiYXNlIGNvbG91ciwgbWV0YWxuZXNzLCByb3VnaG5lc3MsXG4vLyBlbWlzc2l2ZSBzdHJlbmd0aCwgb3BhY2l0eSkgcGx1cyBhIHByb2NlZHVyYWwgdGV4dHVyZSByZWNpcGUuIFRoZSByZWNpcGVzXG4vLyBwYWludCBoaWdoIHJlc29sdXRpb24gY2FudmFzZXMgZm9yIHRoZSBhbGJlZG8sIHRoZSByb3VnaG5lc3MgYW5kIHRoZSBidW1wXG4vLyBjaGFubmVsLCB3aGljaCB0aGUgdmlld3BvcnQgdXBsb2FkcyBhcyB0ZXh0dXJlcy5cblxuaW1wb3J0IHsgZGVmYXVsdE1hdGVyaWFsU2xvdCwgdHlwZSBNYXRlcmlhbFNsb3QgfSBmcm9tICcuL21lc2gnO1xuXG5leHBvcnQgdHlwZSBNYXRlcmlhbEdyb3VwID0gJ01ldGFscycgfCAnV29vZCwgU3RvbmUgJiBOYXR1cmUnIHwgJ0dsYXNzLCBOZW9uICYgU3R5bGl6ZWQnO1xuXG5leHBvcnQgdHlwZSBSZWNpcGVOYW1lID1cblx0fCAnZmxhdCdcblx0fCAnYnJ1c2hlZCdcblx0fCAncG9saXNoZWQnXG5cdHwgJ3J1c3QnXG5cdHwgJ3BsYW5rcydcblx0fCAnYnJpY2tzJ1xuXHR8ICd2ZWlucydcblx0fCAnc3BlY2tsZSdcblx0fCAnYmxhZGVzJ1xuXHR8ICdjZWxscydcblx0fCAnd2F2ZXMnXG5cdHwgJ2NyeXN0YWwnXG5cdHwgJ3dlYXZlJ1xuXHR8ICdiYW5kcydcblx0fCAnZmxha2VzJztcblxuZXhwb3J0IGludGVyZmFjZSBNYXRlcmlhbFByZXNldCB7XG5cdGlkOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0Z3JvdXA6IE1hdGVyaWFsR3JvdXA7XG5cdGNvbG9yOiBzdHJpbmc7XG5cdGVtaXNzaXZlOiBzdHJpbmc7XG5cdGVtaXNzaXZlU3RyZW5ndGg6IG51bWJlcjtcblx0bWV0YWxuZXNzOiBudW1iZXI7XG5cdHJvdWdobmVzczogbnVtYmVyO1xuXHRvcGFjaXR5OiBudW1iZXI7XG5cdHJlY2lwZTogUmVjaXBlTmFtZTtcblx0LyoqIFNlY29uZGFyeSBjb2xvdXIgdXNlZCBieSB0aGUgcmVjaXBlLiAqL1xuXHRhY2NlbnQ6IHN0cmluZztcblx0LyoqIFBhdHRlcm4gZGVuc2l0eSwgaGlnaGVyIG1lYW5zIG1vcmUgcmVwZWF0cy4gKi9cblx0ZGVuc2l0eTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRleHR1cmVTZXQge1xuXHRhbGJlZG86IEhUTUxDYW52YXNFbGVtZW50O1xuXHRyb3VnaG5lc3M6IEhUTUxDYW52YXNFbGVtZW50O1xuXHRidW1wOiBIVE1MQ2FudmFzRWxlbWVudDtcbn1cblxuY29uc3QgVEVYVFVSRV9TSVpFID0gNjQ7XG5jb25zdCBNQVBfU0laRSA9IDY0O1xuY29uc3QgVEhVTUJOQUlMX1NJWkUgPSAzMjtcblxuLyoqXG4gKiBBIG1hdGVyaWFsIHNsb3QgYXMgdGhlIHJlbmRlcmVyIG5lZWRzIGl0LlxuICpcbiAqIFRoZSB0ZXh0dXJlIGhvbGRzIHRoZSBmaW5hbCBjb2xvdXIsIHNvIHRoZSB0aW50IGZhY3RvciBkaXZpZGVzIGl0IGJ5IHRoZVxuICogY29sb3VyIG9mIHRoZSBwcmVzZXQuIFRoYXQgd2F5IHRoZSBiYXNlIGNvbG91ciBzbGlkZXIga2VlcHMgd29ya2luZyBhcyBhXG4gKiB0aW50IG9uIHRvcCBvZiB0aGUgcHJvY2VkdXJhbCB0ZXh0dXJlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFJlbmRlclNsb3Qge1xuXHRjb2xvcjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRlbWlzc2l2ZTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRlbWlzc2l2ZVN0cmVuZ3RoOiBudW1iZXI7XG5cdG1ldGFsbmVzczogbnVtYmVyO1xuXHRyb3VnaG5lc3M6IG51bWJlcjtcblx0c3BlY3VsYXI/OiBudW1iZXI7XG5cdG5vcm1hbFN0cmVuZ3RoPzogbnVtYmVyO1xuXHRvcGFjaXR5OiBudW1iZXI7XG5cdGJsZW5kTW9kZT86ICdvcGFxdWUnIHwgJ2JsZW5kJyB8ICdjbGlwJztcblx0dXZSZXBlYXQ6IG51bWJlcjtcblx0dXZTY2FsZVk/OiBudW1iZXI7XG5cdHV2T2Zmc2V0WD86IG51bWJlcjtcblx0dXZPZmZzZXRZPzogbnVtYmVyO1xuXHR1dlJvdGF0aW9uPzogbnVtYmVyO1xuXHR0ZXhNYXBwaW5nPzogbnVtYmVyO1xuXHR0ZXhTdHJlbmd0aD86IG51bWJlcjtcblx0dGV4VGludDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXHRhbGJlZG86IFRleEltYWdlU291cmNlIHwgbnVsbDtcblx0cm91Z2huZXNzTWFwOiBUZXhJbWFnZVNvdXJjZSB8IG51bGw7XG5cdGJ1bXBNYXA6IFRleEltYWdlU291cmNlIHwgbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IE1BVEVSSUFMX1BSRVNFVFM6IE1hdGVyaWFsUHJlc2V0W10gPSBbXG5cdC8vIC0tLSBNZXRhbHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHR7IGlkOiAnZ29sZC0yNGsnLCBuYW1lOiAnMjRLIEdvbGQnLCBncm91cDogJ01ldGFscycsIGNvbG9yOiAnI2Y1YzU0MicsIGVtaXNzaXZlOiAnIzAwMDAwMCcsIGVtaXNzaXZlU3RyZW5ndGg6IDEsIG1ldGFsbmVzczogMSwgcm91Z2huZXNzOiAwLjE2LCBvcGFjaXR5OiAxLCByZWNpcGU6ICdwb2xpc2hlZCcsIGFjY2VudDogJyNmZmYwYTgnLCBkZW5zaXR5OiA2IH0sXG5cdHsgaWQ6ICdzaWx2ZXItYnJ1c2hlZCcsIG5hbWU6ICdCcnVzaGVkIFNpbHZlcicsIGdyb3VwOiAnTWV0YWxzJywgY29sb3I6ICcjYzhjY2Q0JywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAxLCByb3VnaG5lc3M6IDAuMzIsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ2JydXNoZWQnLCBhY2NlbnQ6ICcjOGQ5MzllJywgZGVuc2l0eTogMyB9LFxuXHR7IGlkOiAnY2hyb21lLW1pcnJvcicsIG5hbWU6ICdNaXJyb3IgQ2hyb21lJywgZ3JvdXA6ICdNZXRhbHMnLCBjb2xvcjogJyNlZWYxZjYnLCBlbWlzc2l2ZTogJyMwMDAwMDAnLCBlbWlzc2l2ZVN0cmVuZ3RoOiAxLCBtZXRhbG5lc3M6IDEsIHJvdWdobmVzczogMC4wMywgb3BhY2l0eTogMSwgcmVjaXBlOiAncG9saXNoZWQnLCBhY2NlbnQ6ICcjYjljNGQ2JywgZGVuc2l0eTogMiB9LFxuXHR7IGlkOiAnY29wcGVyJywgbmFtZTogJ0NvcHBlcicsIGdyb3VwOiAnTWV0YWxzJywgY29sb3I6ICcjYjg3MzMzJywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAxLCByb3VnaG5lc3M6IDAuMjgsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ2JydXNoZWQnLCBhY2NlbnQ6ICcjZTBhMDZhJywgZGVuc2l0eTogNCB9LFxuXHR7IGlkOiAncnVzdGVkLWlyb24nLCBuYW1lOiAnUnVzdGVkIElyb24nLCBncm91cDogJ01ldGFscycsIGNvbG9yOiAnIzhhNGEyNScsIGVtaXNzaXZlOiAnIzAwMDAwMCcsIGVtaXNzaXZlU3RyZW5ndGg6IDEsIG1ldGFsbmVzczogMC42NSwgcm91Z2huZXNzOiAwLjc4LCBvcGFjaXR5OiAxLCByZWNpcGU6ICdydXN0JywgYWNjZW50OiAnI2Q5NzYyZicsIGRlbnNpdHk6IDUgfSxcblx0eyBpZDogJ2Rhcmstc3RlZWwnLCBuYW1lOiAnRGFyayBTdGVlbCcsIGdyb3VwOiAnTWV0YWxzJywgY29sb3I6ICcjNGE1MDU4JywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAwLjk1LCByb3VnaG5lc3M6IDAuNDIsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ2JydXNoZWQnLCBhY2NlbnQ6ICcjMjIyNjJjJywgZGVuc2l0eTogMyB9LFxuXHR7IGlkOiAndGl0YW5pdW0nLCBuYW1lOiAnQnJ1c2hlZCBUaXRhbml1bScsIGdyb3VwOiAnTWV0YWxzJywgY29sb3I6ICcjOWFhMGE4JywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAxLCByb3VnaG5lc3M6IDAuMzgsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ2JydXNoZWQnLCBhY2NlbnQ6ICcjNmQ3MzdiJywgZGVuc2l0eTogNSB9LFxuXHR7IGlkOiAncm9zZS1nb2xkJywgbmFtZTogJ1Jvc2UgR29sZCcsIGdyb3VwOiAnTWV0YWxzJywgY29sb3I6ICcjZTJhMDhjJywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAxLCByb3VnaG5lc3M6IDAuMjIsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ3BvbGlzaGVkJywgYWNjZW50OiAnI2Y2Y2RiZCcsIGRlbnNpdHk6IDQgfSxcblx0eyBpZDogJ2JsYWNrLXBsYXN0aWMnLCBuYW1lOiAnTWF0dGUgQmxhY2sgUGxhc3RpYycsIGdyb3VwOiAnTWV0YWxzJywgY29sb3I6ICcjMjMyNjJiJywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAwLjEsIHJvdWdobmVzczogMC42Miwgb3BhY2l0eTogMSwgcmVjaXBlOiAnc3BlY2tsZScsIGFjY2VudDogJyMzYTNmNDcnLCBkZW5zaXR5OiA4IH0sXG5cblx0Ly8gLS0tIFdvb2QsIHN0b25lIGFuZCBuYXR1cmUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0eyBpZDogJ29hay1wbGFua3MnLCBuYW1lOiAnT2FrIFdvb2QgUGxhbmtzJywgZ3JvdXA6ICdXb29kLCBTdG9uZSAmIE5hdHVyZScsIGNvbG9yOiAnI2IwN2I0NScsIGVtaXNzaXZlOiAnIzAwMDAwMCcsIGVtaXNzaXZlU3RyZW5ndGg6IDEsIG1ldGFsbmVzczogMCwgcm91Z2huZXNzOiAwLjY4LCBvcGFjaXR5OiAxLCByZWNpcGU6ICdwbGFua3MnLCBhY2NlbnQ6ICcjNmQ0NTIzJywgZGVuc2l0eTogNCB9LFxuXHR7IGlkOiAncmVkLWJyaWNrJywgbmFtZTogJ1JlZCBCcmljayBXYWxsJywgZ3JvdXA6ICdXb29kLCBTdG9uZSAmIE5hdHVyZScsIGNvbG9yOiAnI2EwNGEzYycsIGVtaXNzaXZlOiAnIzAwMDAwMCcsIGVtaXNzaXZlU3RyZW5ndGg6IDEsIG1ldGFsbmVzczogMCwgcm91Z2huZXNzOiAwLjgyLCBvcGFjaXR5OiAxLCByZWNpcGU6ICdicmlja3MnLCBhY2NlbnQ6ICcjYzliN2E0JywgZGVuc2l0eTogNSB9LFxuXHR7IGlkOiAnd2hpdGUtbWFyYmxlJywgbmFtZTogJ1doaXRlIE1hcmJsZScsIGdyb3VwOiAnV29vZCwgU3RvbmUgJiBOYXR1cmUnLCBjb2xvcjogJyNlZWYwZjInLCBlbWlzc2l2ZTogJyMwMDAwMDAnLCBlbWlzc2l2ZVN0cmVuZ3RoOiAxLCBtZXRhbG5lc3M6IDAuMDUsIHJvdWdobmVzczogMC4yNCwgb3BhY2l0eTogMSwgcmVjaXBlOiAndmVpbnMnLCBhY2NlbnQ6ICcjOGQ5N2E1JywgZGVuc2l0eTogMyB9LFxuXHR7IGlkOiAncm91Z2gtY29uY3JldGUnLCBuYW1lOiAnUm91Z2ggQ29uY3JldGUnLCBncm91cDogJ1dvb2QsIFN0b25lICYgTmF0dXJlJywgY29sb3I6ICcjOWE5YTk4JywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAwLCByb3VnaG5lc3M6IDAuOTIsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ3NwZWNrbGUnLCBhY2NlbnQ6ICcjNmM2YzZhJywgZGVuc2l0eTogNyB9LFxuXHR7IGlkOiAnZ3JlZW4tZ3Jhc3MnLCBuYW1lOiAnR3JlZW4gR3Jhc3MnLCBncm91cDogJ1dvb2QsIFN0b25lICYgTmF0dXJlJywgY29sb3I6ICcjNGY5YjNhJywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAwLCByb3VnaG5lc3M6IDAuODgsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ2JsYWRlcycsIGFjY2VudDogJyMyYzY2MjAnLCBkZW5zaXR5OiA5IH0sXG5cdHsgaWQ6ICdjb2JibGVzdG9uZScsIG5hbWU6ICdDb2JibGVzdG9uZScsIGdyb3VwOiAnV29vZCwgU3RvbmUgJiBOYXR1cmUnLCBjb2xvcjogJyM3ZDdmODMnLCBlbWlzc2l2ZTogJyMwMDAwMDAnLCBlbWlzc2l2ZVN0cmVuZ3RoOiAxLCBtZXRhbG5lc3M6IDAsIHJvdWdobmVzczogMC44LCBvcGFjaXR5OiAxLCByZWNpcGU6ICdjZWxscycsIGFjY2VudDogJyM0ZjUxNTQnLCBkZW5zaXR5OiA2IH0sXG5cdHsgaWQ6ICd2b2xjYW5pYy1iYXNhbHQnLCBuYW1lOiAnVm9sY2FuaWMgQmFzYWx0JywgZ3JvdXA6ICdXb29kLCBTdG9uZSAmIE5hdHVyZScsIGNvbG9yOiAnIzNhM2Q0MicsIGVtaXNzaXZlOiAnIzAwMDAwMCcsIGVtaXNzaXZlU3RyZW5ndGg6IDEsIG1ldGFsbmVzczogMC4xLCByb3VnaG5lc3M6IDAuODUsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ3NwZWNrbGUnLCBhY2NlbnQ6ICcjMWQxZjIyJywgZGVuc2l0eTogMTAgfSxcblx0eyBpZDogJ3NhbmRzdG9uZScsIG5hbWU6ICdTYW5kc3RvbmUnLCBncm91cDogJ1dvb2QsIFN0b25lICYgTmF0dXJlJywgY29sb3I6ICcjYzlhOTdjJywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAwLCByb3VnaG5lc3M6IDAuNzgsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ2JhbmRzJywgYWNjZW50OiAnIzliN2M1MycsIGRlbnNpdHk6IDYgfSxcblx0eyBpZDogJ3NhdGluLWZhYnJpYycsIG5hbWU6ICdTYXRpbiBGYWJyaWMnLCBncm91cDogJ1dvb2QsIFN0b25lICYgTmF0dXJlJywgY29sb3I6ICcjN2I1ZWE3JywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAwLCByb3VnaG5lc3M6IDAuNTUsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ3dlYXZlJywgYWNjZW50OiAnIzRlM2E2ZCcsIGRlbnNpdHk6IDEyIH0sXG5cblx0Ly8gLS0tIEdsYXNzLCBuZW9uIGFuZCBzdHlsaXNlZCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0eyBpZDogJ2NsZWFyLWdsYXNzJywgbmFtZTogJ0NsZWFyIEdsYXNzJywgZ3JvdXA6ICdHbGFzcywgTmVvbiAmIFN0eWxpemVkJywgY29sb3I6ICcjZGZmMWZmJywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAwLCByb3VnaG5lc3M6IDAuMDQsIG9wYWNpdHk6IDAuMjQsIHJlY2lwZTogJ2ZsYXQnLCBhY2NlbnQ6ICcjZmZmZmZmJywgZGVuc2l0eTogMSB9LFxuXHR7IGlkOiAnZnJvc3RlZC1pY2UnLCBuYW1lOiAnRnJvc3RlZCBJY2UnLCBncm91cDogJ0dsYXNzLCBOZW9uICYgU3R5bGl6ZWQnLCBjb2xvcjogJyNjZmVhZmYnLCBlbWlzc2l2ZTogJyMwYjFhMjYnLCBlbWlzc2l2ZVN0cmVuZ3RoOiAwLjYsIG1ldGFsbmVzczogMCwgcm91Z2huZXNzOiAwLjQ2LCBvcGFjaXR5OiAwLjcyLCByZWNpcGU6ICdjcnlzdGFsJywgYWNjZW50OiAnIzhmYzlmMCcsIGRlbnNpdHk6IDggfSxcblx0eyBpZDogJ29jZWFuLXdhdGVyJywgbmFtZTogJ09jZWFuIFdhdGVyJywgZ3JvdXA6ICdHbGFzcywgTmVvbiAmIFN0eWxpemVkJywgY29sb3I6ICcjMWY2ZjljJywgZW1pc3NpdmU6ICcjMDYyMjJmJywgZW1pc3NpdmVTdHJlbmd0aDogMC41LCBtZXRhbG5lc3M6IDAuMSwgcm91Z2huZXNzOiAwLjE0LCBvcGFjaXR5OiAwLjgyLCByZWNpcGU6ICd3YXZlcycsIGFjY2VudDogJyM4ZmQ4ZjAnLCBkZW5zaXR5OiA0IH0sXG5cdHsgaWQ6ICduZW9uLWN5YW4nLCBuYW1lOiAnTmVvbiBDeWFuJywgZ3JvdXA6ICdHbGFzcywgTmVvbiAmIFN0eWxpemVkJywgY29sb3I6ICcjNWNmMmZmJywgZW1pc3NpdmU6ICcjNWNmMmZmJywgZW1pc3NpdmVTdHJlbmd0aDogMi40LCBtZXRhbG5lc3M6IDAsIHJvdWdobmVzczogMC4yLCBvcGFjaXR5OiAxLCByZWNpcGU6ICdmbGF0JywgYWNjZW50OiAnI2FlZjlmZicsIGRlbnNpdHk6IDEgfSxcblx0eyBpZDogJ25lb24tbWFnbWEnLCBuYW1lOiAnTmVvbiBNYWdtYScsIGdyb3VwOiAnR2xhc3MsIE5lb24gJiBTdHlsaXplZCcsIGNvbG9yOiAnI2ZmNmEyYicsIGVtaXNzaXZlOiAnI2ZmNWExMicsIGVtaXNzaXZlU3RyZW5ndGg6IDIuNiwgbWV0YWxuZXNzOiAwLCByb3VnaG5lc3M6IDAuMjQsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ2ZsYXQnLCBhY2NlbnQ6ICcjZmZjNDZiJywgZGVuc2l0eTogMSB9LFxuXHR7IGlkOiAnY2FyYm9uLWZpYmVyJywgbmFtZTogJ0NhcmJvbiBGaWJlcicsIGdyb3VwOiAnR2xhc3MsIE5lb24gJiBTdHlsaXplZCcsIGNvbG9yOiAnIzFjMWUyMicsIGVtaXNzaXZlOiAnIzAwMDAwMCcsIGVtaXNzaXZlU3RyZW5ndGg6IDEsIG1ldGFsbmVzczogMC42LCByb3VnaG5lc3M6IDAuMywgb3BhY2l0eTogMSwgcmVjaXBlOiAnd2VhdmUnLCBhY2NlbnQ6ICcjM2M0MTQ5JywgZGVuc2l0eTogMTYgfSxcblx0eyBpZDogJ2Nhci1wYWludCcsIG5hbWU6ICdHbG9zc3kgQ2FyIFBhaW50JywgZ3JvdXA6ICdHbGFzcywgTmVvbiAmIFN0eWxpemVkJywgY29sb3I6ICcjYzgxZjNhJywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAwLjg1LCByb3VnaG5lc3M6IDAuMDksIG9wYWNpdHk6IDEsIHJlY2lwZTogJ2ZsYWtlcycsIGFjY2VudDogJyNmM2Y2ZmEnLCBkZW5zaXR5OiAyMiB9LFxuXHR7IGlkOiAndG9vbi1hbmltZScsIG5hbWU6ICdUb29uIEFuaW1lIFNoYWRlcicsIGdyb3VwOiAnR2xhc3MsIE5lb24gJiBTdHlsaXplZCcsIGNvbG9yOiAnI2ZmZDE2NicsIGVtaXNzaXZlOiAnIzNhMjQwMCcsIGVtaXNzaXZlU3RyZW5ndGg6IDAuMzUsIG1ldGFsbmVzczogMCwgcm91Z2huZXNzOiAwLjcsIG9wYWNpdHk6IDEsIHJlY2lwZTogJ2JhbmRzJywgYWNjZW50OiAnI2E4NmYxYycsIGRlbnNpdHk6IDMgfSxcblx0eyBpZDogJ2VtZXJhbGQtZ2VtJywgbmFtZTogJ0VtZXJhbGQgR2Vtc3RvbmUnLCBncm91cDogJ0dsYXNzLCBOZW9uICYgU3R5bGl6ZWQnLCBjb2xvcjogJyMwZjlkNTgnLCBlbWlzc2l2ZTogJyMwMDMwMWEnLCBlbWlzc2l2ZVN0cmVuZ3RoOiAwLjgsIG1ldGFsbmVzczogMC4xLCByb3VnaG5lc3M6IDAuMDYsIG9wYWNpdHk6IDAuODYsIHJlY2lwZTogJ2NyeXN0YWwnLCBhY2NlbnQ6ICcjOGFmZmM0JywgZGVuc2l0eTogNiB9LFxuXHR7IGlkOiAnZ3JhcGhpdGUnLCBuYW1lOiAnR3JhcGhpdGUgQ29tcG9zaXRlJywgZ3JvdXA6ICdHbGFzcywgTmVvbiAmIFN0eWxpemVkJywgY29sb3I6ICcjNGM1MTU4JywgZW1pc3NpdmU6ICcjMDAwMDAwJywgZW1pc3NpdmVTdHJlbmd0aDogMSwgbWV0YWxuZXNzOiAwLjQ1LCByb3VnaG5lc3M6IDAuNSwgb3BhY2l0eTogMSwgcmVjaXBlOiAnc3BlY2tsZScsIGFjY2VudDogJyMyMzI2MmInLCBkZW5zaXR5OiAxMSB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IE1BVEVSSUFMX0dST1VQUzogTWF0ZXJpYWxHcm91cFtdID0gWydNZXRhbHMnLCAnV29vZCwgU3RvbmUgJiBOYXR1cmUnLCAnR2xhc3MsIE5lb24gJiBTdHlsaXplZCddO1xuXG5leHBvcnQgZnVuY3Rpb24gcHJlc2V0c0Zvckdyb3VwKGdyb3VwOiBNYXRlcmlhbEdyb3VwKTogTWF0ZXJpYWxQcmVzZXRbXSB7XG5cdHJldHVybiBNQVRFUklBTF9QUkVTRVRTLmZpbHRlcigocHJlc2V0KSA9PiBwcmVzZXQuZ3JvdXAgPT09IGdyb3VwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByZXNldEJ5SWQoaWQ6IHN0cmluZyk6IE1hdGVyaWFsUHJlc2V0IHwgbnVsbCB7XG5cdHJldHVybiBNQVRFUklBTF9QUkVTRVRTLmZpbmQoKHByZXNldCkgPT4gcHJlc2V0LmlkID09PSBpZCkgPz8gbnVsbDtcbn1cblxuLyoqIEJ1aWxkcyB0aGUgbWF0ZXJpYWwgc2xvdCB0aGF0IGEgcHJlc2V0IGRlc2NyaWJlcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVzZXRUb1Nsb3QocHJlc2V0OiBNYXRlcmlhbFByZXNldCwgbmFtZSA9IHByZXNldC5uYW1lKTogTWF0ZXJpYWxTbG90IHtcblx0cmV0dXJuIHtcblx0XHQuLi5kZWZhdWx0TWF0ZXJpYWxTbG90KG5hbWUpLFxuXHRcdGNvbG9yOiBwcmVzZXQuY29sb3IsXG5cdFx0ZW1pc3NpdmU6IHByZXNldC5lbWlzc2l2ZSxcblx0XHRlbWlzc2l2ZVN0cmVuZ3RoOiBwcmVzZXQuZW1pc3NpdmVTdHJlbmd0aCxcblx0XHRtZXRhbG5lc3M6IHByZXNldC5tZXRhbG5lc3MsXG5cdFx0cm91Z2huZXNzOiBwcmVzZXQucm91Z2huZXNzLFxuXHRcdG9wYWNpdHk6IHByZXNldC5vcGFjaXR5LFxuXHRcdHV2UmVwZWF0OiAxLFxuXHRcdHByZXNldElkOiBwcmVzZXQuaWQsXG5cdH07XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUHJvY2VkdXJhbCB0ZXh0dXJlc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGhleFRvUmdiKGhleDogc3RyaW5nKTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdIHtcblx0Y29uc3QgdmFsdWUgPSBoZXgucmVwbGFjZSgnIycsICcnKTtcblx0Y29uc3QgZXhwYW5kZWQgPSB2YWx1ZS5sZW5ndGggPT09IDMgPyB2YWx1ZS5zcGxpdCgnJykubWFwKChjKSA9PiBjICsgYykuam9pbignJykgOiB2YWx1ZTtcblx0Y29uc3QgbnVtID0gTnVtYmVyLnBhcnNlSW50KGV4cGFuZGVkLCAxNik7XG5cdGlmICghTnVtYmVyLmlzRmluaXRlKG51bSkpIHJldHVybiBbMTI4LCAxMjgsIDEyOF07XG5cdHJldHVybiBbKG51bSA+PiAxNikgJiAyNTUsIChudW0gPj4gOCkgJiAyNTUsIG51bSAmIDI1NV07XG59XG5cbmZ1bmN0aW9uIGhhc2goeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG5cdGxldCBoID0geCAqIDM3NDc2MTM5MyArIHkgKiA2NjgyNjUyNjMgKyBzZWVkICogMjI0NjgyMjUxOTtcblx0aCA9IChoIF4gKGggPj4+IDEzKSkgKiAxMjc0MTI2MTc3O1xuXHRyZXR1cm4gKChoIF4gKGggPj4+IDE2KSkgPj4+IDApIC8gNDI5NDk2NzI5NTtcbn1cblxuZnVuY3Rpb24gc21vb3RoU3RlcCh2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIHZhbHVlICogdmFsdWUgKiAoMyAtIDIgKiB2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHZhbHVlTm9pc2UoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNlZWQ6IG51bWJlcik6IG51bWJlciB7XG5cdGNvbnN0IHgwID0gTWF0aC5mbG9vcih4KTtcblx0Y29uc3QgeTAgPSBNYXRoLmZsb29yKHkpO1xuXHRjb25zdCBmeCA9IHNtb290aFN0ZXAoeCAtIHgwKTtcblx0Y29uc3QgZnkgPSBzbW9vdGhTdGVwKHkgLSB5MCk7XG5cdGNvbnN0IG4wMCA9IGhhc2goeDAsIHkwLCBzZWVkKTtcblx0Y29uc3QgbjEwID0gaGFzaCh4MCArIDEsIHkwLCBzZWVkKTtcblx0Y29uc3QgbjAxID0gaGFzaCh4MCwgeTAgKyAxLCBzZWVkKTtcblx0Y29uc3QgbjExID0gaGFzaCh4MCArIDEsIHkwICsgMSwgc2VlZCk7XG5cdGNvbnN0IHRvcCA9IG4wMCArIChuMTAgLSBuMDApICogZng7XG5cdGNvbnN0IGJvdHRvbSA9IG4wMSArIChuMTEgLSBuMDEpICogZng7XG5cdHJldHVybiB0b3AgKyAoYm90dG9tIC0gdG9wKSAqIGZ5O1xufVxuXG5mdW5jdGlvbiBmYm0oeDogbnVtYmVyLCB5OiBudW1iZXIsIG9jdGF2ZXM6IG51bWJlciwgc2VlZDogbnVtYmVyKTogbnVtYmVyIHtcblx0bGV0IHRvdGFsID0gMDtcblx0bGV0IGFtcGxpdHVkZSA9IDAuNTtcblx0bGV0IGZyZXF1ZW5jeSA9IDE7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgb2N0YXZlczsgaSsrKSB7XG5cdFx0dG90YWwgKz0gdmFsdWVOb2lzZSh4ICogZnJlcXVlbmN5LCB5ICogZnJlcXVlbmN5LCBzZWVkICsgaSAqIDEzMSkgKiBhbXBsaXR1ZGU7XG5cdFx0YW1wbGl0dWRlICo9IDAuNTtcblx0XHRmcmVxdWVuY3kgKj0gMjtcblx0fVxuXHRyZXR1cm4gdG90YWwgLyAoMSAtIE1hdGgucG93KDAuNSwgb2N0YXZlcykpO1xufVxuXG5pbnRlcmZhY2UgUGl4ZWwge1xuXHRyOiBudW1iZXI7XG5cdGc6IG51bWJlcjtcblx0YjogbnVtYmVyO1xufVxuXG50eXBlIENvbG9yTGlrZSA9IFBpeGVsIHwgW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuXG5mdW5jdGlvbiBhc1BpeGVsKGNvbG9yOiBDb2xvckxpa2UpOiBQaXhlbCB7XG5cdHJldHVybiBBcnJheS5pc0FycmF5KGNvbG9yKSA/IHsgcjogY29sb3JbMF0sIGc6IGNvbG9yWzFdLCBiOiBjb2xvclsyXSB9IDogY29sb3I7XG59XG5cbmZ1bmN0aW9uIG1peENvbG9yKGE6IENvbG9yTGlrZSwgYjogQ29sb3JMaWtlLCB0OiBudW1iZXIpOiBQaXhlbCB7XG5cdGNvbnN0IGZpcnN0ID0gYXNQaXhlbChhKTtcblx0Y29uc3Qgc2Vjb25kID0gYXNQaXhlbChiKTtcblx0Y29uc3QgayA9IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIHQpKTtcblx0cmV0dXJuIHtcblx0XHRyOiBmaXJzdC5yICsgKHNlY29uZC5yIC0gZmlyc3QucikgKiBrLFxuXHRcdGc6IGZpcnN0LmcgKyAoc2Vjb25kLmcgLSBmaXJzdC5nKSAqIGssXG5cdFx0YjogZmlyc3QuYiArIChzZWNvbmQuYiAtIGZpcnN0LmIpICogayxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQ2FudmFzKHNpemU6IG51bWJlcik6IEhUTUxDYW52YXNFbGVtZW50IHtcblx0Y29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5cdGNhbnZhcy53aWR0aCA9IHNpemU7XG5cdGNhbnZhcy5oZWlnaHQgPSBzaXplO1xuXHRyZXR1cm4gY2FudmFzO1xufVxuXG5mdW5jdGlvbiByZWNpcGVTYW1wbGUocHJlc2V0OiBNYXRlcmlhbFByZXNldCwgdTogbnVtYmVyLCB2OiBudW1iZXIpOiB7IGNvbG9yOiBQaXhlbDsgcm91Z2huZXNzOiBudW1iZXI7IGJ1bXA6IG51bWJlciB9IHtcblx0Y29uc3QgYmFzZSA9IGhleFRvUmdiKHByZXNldC5jb2xvcik7XG5cdGNvbnN0IGFjY2VudCA9IGhleFRvUmdiKHByZXNldC5hY2NlbnQpO1xuXHRjb25zdCBkZW5zaXR5ID0gTWF0aC5tYXgoMSwgcHJlc2V0LmRlbnNpdHkpO1xuXG5cdHN3aXRjaCAocHJlc2V0LnJlY2lwZSkge1xuXHRcdGNhc2UgJ2ZsYXQnOiB7XG5cdFx0XHRyZXR1cm4geyBjb2xvcjogeyByOiBiYXNlWzBdLCBnOiBiYXNlWzFdLCBiOiBiYXNlWzJdIH0sIHJvdWdobmVzczogcHJlc2V0LnJvdWdobmVzcywgYnVtcDogMC41IH07XG5cdFx0fVxuXHRcdGNhc2UgJ2JydXNoZWQnOiB7XG5cdFx0XHRjb25zdCBzdHJlYWsgPSB2YWx1ZU5vaXNlKHUgKiBkZW5zaXR5ICogOTAsIHYgKiBkZW5zaXR5ICogMi41LCAxMSk7XG5cdFx0XHRjb25zdCBmaW5lID0gdmFsdWVOb2lzZSh1ICogZGVuc2l0eSAqIDIyMCwgdiAqIGRlbnNpdHkgKiA2LCAyMyk7XG5cdFx0XHRjb25zdCBhbW91bnQgPSBzdHJlYWsgKiAwLjY1ICsgZmluZSAqIDAuMzU7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb2xvcjogbWl4Q29sb3IoYWNjZW50LCBiYXNlLCAwLjM1ICsgYW1vdW50ICogMC42NSksXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArIChhbW91bnQgLSAwLjUpICogMC4yMiksXG5cdFx0XHRcdGJ1bXA6IGFtb3VudCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ3BvbGlzaGVkJzoge1xuXHRcdFx0Y29uc3QgYW1vdW50ID0gZmJtKHUgKiBkZW5zaXR5ICogNCwgdiAqIGRlbnNpdHkgKiA0LCAzLCAzMSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb2xvcjogbWl4Q29sb3IoYWNjZW50LCBiYXNlLCAwLjc1ICsgYW1vdW50ICogMC4yNSksXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArIChhbW91bnQgLSAwLjUpICogMC4wNiksXG5cdFx0XHRcdGJ1bXA6IDAuNSArIChhbW91bnQgLSAwLjUpICogMC4xMixcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ3J1c3QnOiB7XG5cdFx0XHRjb25zdCBibG90Y2ggPSBmYm0odSAqIGRlbnNpdHkgKiAzLjIsIHYgKiBkZW5zaXR5ICogMy4yLCA1LCA0Myk7XG5cdFx0XHRjb25zdCBncmFpbiA9IHZhbHVlTm9pc2UodSAqIGRlbnNpdHkgKiA2MCwgdiAqIGRlbnNpdHkgKiA2MCwgNTcpO1xuXHRcdFx0Y29uc3QgcnVzdCA9IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChibG90Y2ggLSAwLjM1KSAqIDIuNCkpO1xuXHRcdFx0Y29uc3QgY29sb3IgPSBtaXhDb2xvcihiYXNlLCBhY2NlbnQsIHJ1c3QgKiAwLjkgKyBncmFpbiAqIDAuMSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb2xvcixcblx0XHRcdFx0cm91Z2huZXNzOiBNYXRoLm1pbigxLCAwLjQ1ICsgcnVzdCAqIDAuNSksXG5cdFx0XHRcdGJ1bXA6IDAuMzUgKyBydXN0ICogMC41ICsgZ3JhaW4gKiAwLjE1LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSAncGxhbmtzJzoge1xuXHRcdFx0Y29uc3QgcGxhbmsgPSBNYXRoLmZsb29yKHYgKiBkZW5zaXR5KTtcblx0XHRcdGNvbnN0IG9mZnNldCA9IGhhc2gocGxhbmssIDMsIDY3KSAqIDAuNztcblx0XHRcdGNvbnN0IGxvY2FsID0gKHYgKiBkZW5zaXR5IC0gcGxhbmspICogNjtcblx0XHRcdGNvbnN0IHNlYW0gPSBsb2NhbCA8IDAuMDYgfHwgbG9jYWwgPiA1Ljk0ID8gMSA6IDA7XG5cdFx0XHRjb25zdCBncmFpbiA9IGZibSh1ICogZGVuc2l0eSAqIDUgKyBvZmZzZXQgKiA5LCB2ICogZGVuc2l0eSAqIDI2LCA0LCA3MSArIHBsYW5rKTtcblx0XHRcdGNvbnN0IHRvbmUgPSBoYXNoKHBsYW5rLCA3LCA4OSk7XG5cdFx0XHRsZXQgY29sb3IgPSBtaXhDb2xvcihhY2NlbnQsIGJhc2UsIDAuNDUgKyB0b25lICogMC40ICsgZ3JhaW4gKiAwLjI1KTtcblx0XHRcdGlmIChzZWFtKSBjb2xvciA9IG1peENvbG9yKGNvbG9yLCBhY2NlbnQsIDAuNzUpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29sb3IsXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArIChzZWFtID8gMC4xIDogMCkgKyAoZ3JhaW4gLSAwLjUpICogMC4xMiksXG5cdFx0XHRcdGJ1bXA6IHNlYW0gPyAwLjEyIDogMC40NSArIGdyYWluICogMC40LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSAnYnJpY2tzJzoge1xuXHRcdFx0Y29uc3Qgcm93cyA9IGRlbnNpdHk7XG5cdFx0XHRjb25zdCByb3cgPSBNYXRoLmZsb29yKHYgKiByb3dzKTtcblx0XHRcdGNvbnN0IHNoaWZ0ID0gcm93ICUgMiA9PT0gMCA/IDAgOiAwLjU7XG5cdFx0XHRjb25zdCBieCA9ICh1ICogZGVuc2l0eSAqIDAuNSArIHNoaWZ0KSAlIDE7XG5cdFx0XHRjb25zdCBieSA9ICh2ICogcm93cykgJSAxO1xuXHRcdFx0Y29uc3QgbW9ydGFyID0gYnggPCAwLjA2IHx8IGJ4ID4gMC45NCB8fCBieSA8IDAuMSB8fCBieSA+IDAuOSA/IDEgOiAwO1xuXHRcdFx0Y29uc3QgZ3JhaW4gPSBmYm0odSAqIDQwLCB2ICogNDAsIDMsIDk3ICsgcm93KTtcblx0XHRcdGNvbnN0IHRvbmUgPSBoYXNoKHJvdywgTWF0aC5mbG9vcih1ICogZGVuc2l0eSAqIDAuNSArIHNoaWZ0KSwgMTAzKTtcblx0XHRcdGxldCBjb2xvciA9IG1peENvbG9yKGFjY2VudCwgYmFzZSwgMC41NSArIHRvbmUgKiAwLjQ1KTtcblx0XHRcdGNvbG9yID0gbWl4Q29sb3IoY29sb3IsIHsgcjogY29sb3IuciAqIDAuODUsIGc6IGNvbG9yLmcgKiAwLjg1LCBiOiBjb2xvci5iICogMC44NSB9LCBncmFpbiAqIDAuNSk7XG5cdFx0XHRpZiAobW9ydGFyKSBjb2xvciA9IG1peENvbG9yKGNvbG9yLCBhY2NlbnQsIDAuODUpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29sb3IsXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArIChtb3J0YXIgPyAwLjA4IDogMCkpLFxuXHRcdFx0XHRidW1wOiBtb3J0YXIgPyAwLjA4IDogMC41NSArIGdyYWluICogMC4zLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSAndmVpbnMnOiB7XG5cdFx0XHRjb25zdCB3YXJwID0gZmJtKHUgKiBkZW5zaXR5ICogMiwgdiAqIGRlbnNpdHkgKiAyLCA0LCAxMTMpICogMi40O1xuXHRcdFx0Y29uc3QgdmVpbiA9IE1hdGguYWJzKE1hdGguc2luKCh1ICogZGVuc2l0eSArIHdhcnApICogTWF0aC5QSSAqIDIpKTtcblx0XHRcdGNvbnN0IHRoaW4gPSBNYXRoLnBvdygxIC0gdmVpbiwgMTIpO1xuXHRcdFx0Y29uc3QgZ3JhaW4gPSBmYm0odSAqIDYwLCB2ICogNjAsIDMsIDEyNyk7XG5cdFx0XHRjb25zdCBjb2xvciA9IG1peENvbG9yKGJhc2UsIGFjY2VudCwgdGhpbiAqIDAuODUgKyBncmFpbiAqIDAuMDYpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29sb3IsXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArICh0aGluID4gMC41ID8gMC4xIDogMCkpLFxuXHRcdFx0XHRidW1wOiAwLjUgKyAoMSAtIHRoaW4pICogMC4wOCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ3NwZWNrbGUnOiB7XG5cdFx0XHRjb25zdCBjb2Fyc2UgPSBmYm0odSAqIGRlbnNpdHkgKiAzLCB2ICogZGVuc2l0eSAqIDMsIDQsIDEzOSk7XG5cdFx0XHRjb25zdCBmaW5lID0gdmFsdWVOb2lzZSh1ICogZGVuc2l0eSAqIDcwLCB2ICogZGVuc2l0eSAqIDcwLCAxNDkpO1xuXHRcdFx0Y29uc3QgYW1vdW50ID0gY29hcnNlICogMC43ICsgZmluZSAqIDAuMztcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbG9yOiBtaXhDb2xvcihhY2NlbnQsIGJhc2UsIDAuMyArIGFtb3VudCAqIDAuNyksXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArIChhbW91bnQgLSAwLjUpICogMC4xOCksXG5cdFx0XHRcdGJ1bXA6IGFtb3VudCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ2JsYWRlcyc6IHtcblx0XHRcdGNvbnN0IGJsYWRlID0gdmFsdWVOb2lzZSh1ICogZGVuc2l0eSAqIDE4LCB2ICogZGVuc2l0eSAqIDQsIDE1MSk7XG5cdFx0XHRjb25zdCBjbHVtcCA9IGZibSh1ICogZGVuc2l0eSAqIDIuNSwgdiAqIGRlbnNpdHkgKiAyLjUsIDMsIDE1Nyk7XG5cdFx0XHRjb25zdCBhbW91bnQgPSBibGFkZSAqIDAuNjUgKyBjbHVtcCAqIDAuMzU7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb2xvcjogbWl4Q29sb3IoYWNjZW50LCBiYXNlLCAwLjI1ICsgYW1vdW50ICogMC43NSksXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArIChhbW91bnQgLSAwLjUpICogMC4xKSxcblx0XHRcdFx0YnVtcDogYmxhZGUsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdjZWxscyc6IHtcblx0XHRcdGNvbnN0IGd4ID0gdSAqIGRlbnNpdHk7XG5cdFx0XHRjb25zdCBneSA9IHYgKiBkZW5zaXR5O1xuXHRcdFx0Y29uc3QgY3ggPSBNYXRoLmZsb29yKGd4KTtcblx0XHRcdGNvbnN0IGN5ID0gTWF0aC5mbG9vcihneSk7XG5cdFx0XHRjb25zdCBmeCA9IGd4IC0gY3g7XG5cdFx0XHRjb25zdCBmeSA9IGd5IC0gY3k7XG5cdFx0XHRjb25zdCBqaXR0ZXJYID0gaGFzaChjeCwgY3ksIDE2MykgKiAwLjM7XG5cdFx0XHRjb25zdCBqaXR0ZXJZID0gaGFzaChjeCwgY3ksIDE2NykgKiAwLjM7XG5cdFx0XHRjb25zdCBkID0gTWF0aC5oeXBvdChmeCAtIDAuNSAtIGppdHRlclgsIGZ5IC0gMC41IC0gaml0dGVyWSk7XG5cdFx0XHRjb25zdCBzdG9uZSA9IGQgPCAwLjQyID8gMSA6IDA7XG5cdFx0XHRjb25zdCBncmFpbiA9IHZhbHVlTm9pc2UoZ3ggKiAzMCwgZ3kgKiAzMCwgMTczKTtcblx0XHRcdGNvbnN0IGNvbG9yID0gc3RvbmUgPyBtaXhDb2xvcihhY2NlbnQsIGJhc2UsIDAuNTUgKyBncmFpbiAqIDAuNDUpIDogbWl4Q29sb3IoYmFzZSwgYWNjZW50LCAwLjcpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29sb3IsXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArIChzdG9uZSA/IDAgOiAwLjA4KSksXG5cdFx0XHRcdGJ1bXA6IHN0b25lID8gMC43NSA6IDAuMixcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ3dhdmVzJzoge1xuXHRcdFx0Y29uc3Qgd2F2ZSA9IE1hdGguc2luKCh1ICogZGVuc2l0eSArIHYgKiBkZW5zaXR5ICogMC42KSAqIE1hdGguUEkgKiAyKSAqIDAuNSArIDAuNTtcblx0XHRcdGNvbnN0IGZvYW0gPSBNYXRoLnBvdyh3YXZlLCA2KTtcblx0XHRcdGNvbnN0IHJpcHBsZSA9IGZibSh1ICogMjQsIHYgKiAyNCwgMywgMTc5KTtcblx0XHRcdGNvbnN0IGNvbG9yID0gbWl4Q29sb3IoYmFzZSwgYWNjZW50LCBmb2FtICogMC44ICsgcmlwcGxlICogMC4xMik7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb2xvcixcblx0XHRcdFx0cm91Z2huZXNzOiBNYXRoLm1pbigxLCBwcmVzZXQucm91Z2huZXNzICsgZm9hbSAqIDAuMTIpLFxuXHRcdFx0XHRidW1wOiB3YXZlICogMC42ICsgcmlwcGxlICogMC4yLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSAnY3J5c3RhbCc6IHtcblx0XHRcdGNvbnN0IGZhY2V0ID0gTWF0aC5hYnMoTWF0aC5zaW4oKHUgKiBkZW5zaXR5ICsgdiAqIGRlbnNpdHkgKiAwLjM1KSAqIE1hdGguUEkpKTtcblx0XHRcdGNvbnN0IGdyYWluID0gZmJtKHUgKiAzMCwgdiAqIDMwLCA0LCAxOTEpO1xuXHRcdFx0Y29uc3QgYW1vdW50ID0gZmFjZXQgKiAwLjYgKyBncmFpbiAqIDAuNDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbG9yOiBtaXhDb2xvcihiYXNlLCBhY2NlbnQsIGFtb3VudCAqIDAuNyksXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArIChhbW91bnQgLSAwLjUpICogMC4yNSksXG5cdFx0XHRcdGJ1bXA6IGFtb3VudCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ3dlYXZlJzoge1xuXHRcdFx0Y29uc3QgZ3ggPSB1ICogZGVuc2l0eTtcblx0XHRcdGNvbnN0IGd5ID0gdiAqIGRlbnNpdHk7XG5cdFx0XHRjb25zdCBvdmVyID0gKE1hdGguZmxvb3IoZ3gpICsgTWF0aC5mbG9vcihneSkpICUgMiA9PT0gMDtcblx0XHRcdGNvbnN0IHRocmVhZCA9IG92ZXIgPyBNYXRoLnNpbigoZ3kgJSAxKSAqIE1hdGguUEkpIDogTWF0aC5zaW4oKGd4ICUgMSkgKiBNYXRoLlBJKTtcblx0XHRcdGNvbnN0IGdyYWluID0gdmFsdWVOb2lzZShneCAqIDEyLCBneSAqIDEyLCAxOTcpO1xuXHRcdFx0Y29uc3QgY29sb3IgPSBtaXhDb2xvcihhY2NlbnQsIGJhc2UsIDAuMjUgKyB0aHJlYWQgKiAwLjU1ICsgZ3JhaW4gKiAwLjIpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29sb3IsXG5cdFx0XHRcdHJvdWdobmVzczogTWF0aC5taW4oMSwgcHJlc2V0LnJvdWdobmVzcyArICh0aHJlYWQgLSAwLjUpICogMC4yKSxcblx0XHRcdFx0YnVtcDogdGhyZWFkICogMC44ICsgZ3JhaW4gKiAwLjIsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdiYW5kcyc6IHtcblx0XHRcdGNvbnN0IGJhbmQgPSBNYXRoLmZsb29yKHYgKiBkZW5zaXR5ICogMyk7XG5cdFx0XHRjb25zdCB0b25lID0gaGFzaChiYW5kLCA1LCAxOTkpO1xuXHRcdFx0Y29uc3QgZ3JhaW4gPSB2YWx1ZU5vaXNlKHUgKiA0NSwgdiAqIDQ1LCAyMTEpO1xuXHRcdFx0Y29uc3QgY29sb3IgPSBtaXhDb2xvcihhY2NlbnQsIGJhc2UsIDAuMzUgKyB0b25lICogMC41ICsgZ3JhaW4gKiAwLjE1KTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbG9yLFxuXHRcdFx0XHRyb3VnaG5lc3M6IE1hdGgubWluKDEsIHByZXNldC5yb3VnaG5lc3MgKyAodG9uZSAtIDAuNSkgKiAwLjA4KSxcblx0XHRcdFx0YnVtcDogMC41ICsgZ3JhaW4gKiAwLjEsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdmbGFrZXMnOiB7XG5cdFx0XHRjb25zdCBmbGFrZSA9IHZhbHVlTm9pc2UodSAqIGRlbnNpdHkgKiA0LCB2ICogZGVuc2l0eSAqIDQsIDIyMyk7XG5cdFx0XHRjb25zdCBzaGVlbiA9IGZibSh1ICogNiwgdiAqIDYsIDMsIDIyNyk7XG5cdFx0XHRjb25zdCBjb2xvciA9IG1peENvbG9yKGJhc2UsIGFjY2VudCwgTWF0aC5wb3coZmxha2UsIDYpICogMC43ICsgc2hlZW4gKiAwLjEyKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbG9yLFxuXHRcdFx0XHRyb3VnaG5lc3M6IE1hdGgubWluKDEsIHByZXNldC5yb3VnaG5lc3MgKyAoZmxha2UgLSAwLjUpICogMC4wOCksXG5cdFx0XHRcdGJ1bXA6IDAuNSArIChmbGFrZSAtIDAuNSkgKiAwLjEsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHsgY29sb3I6IHsgcjogYmFzZVswXSwgZzogYmFzZVsxXSwgYjogYmFzZVsyXSB9LCByb3VnaG5lc3M6IHByZXNldC5yb3VnaG5lc3MsIGJ1bXA6IDAuNSB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRleHR1cmVTZXQocHJlc2V0OiBNYXRlcmlhbFByZXNldCwgc2l6ZTogbnVtYmVyKTogVGV4dHVyZVNldCB7XG5cdGNvbnN0IGFsYmVkb0NhbnZhcyA9IGNyZWF0ZUNhbnZhcyhzaXplKTtcblx0Y29uc3Qgcm91Z2huZXNzQ2FudmFzID0gY3JlYXRlQ2FudmFzKE1BUF9TSVpFKTtcblx0Y29uc3QgYnVtcENhbnZhcyA9IGNyZWF0ZUNhbnZhcyhNQVBfU0laRSk7XG5cdGNvbnN0IGFsYmVkb0N0eCA9IGFsYmVkb0NhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXHRjb25zdCByb3VnaG5lc3NDdHggPSByb3VnaG5lc3NDYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblx0Y29uc3QgYnVtcEN0eCA9IGJ1bXBDYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblx0aWYgKCFhbGJlZG9DdHggfHwgIXJvdWdobmVzc0N0eCB8fCAhYnVtcEN0eCkge1xuXHRcdHJldHVybiB7IGFsYmVkbzogYWxiZWRvQ2FudmFzLCByb3VnaG5lc3M6IHJvdWdobmVzc0NhbnZhcywgYnVtcDogYnVtcENhbnZhcyB9O1xuXHR9XG5cblx0Y29uc3QgYWxiZWRvSW1hZ2UgPSBhbGJlZG9DdHguY3JlYXRlSW1hZ2VEYXRhKHNpemUsIHNpemUpO1xuXHRjb25zdCByb3VnaG5lc3NJbWFnZSA9IHJvdWdobmVzc0N0eC5jcmVhdGVJbWFnZURhdGEoTUFQX1NJWkUsIE1BUF9TSVpFKTtcblx0Y29uc3QgYnVtcEltYWdlID0gYnVtcEN0eC5jcmVhdGVJbWFnZURhdGEoTUFQX1NJWkUsIE1BUF9TSVpFKTtcblxuXHRmb3IgKGxldCB5ID0gMDsgeSA8IHNpemU7IHkrKykge1xuXHRcdGZvciAobGV0IHggPSAwOyB4IDwgc2l6ZTsgeCsrKSB7XG5cdFx0XHRjb25zdCB1ID0geCAvIHNpemU7XG5cdFx0XHRjb25zdCB2ID0geSAvIHNpemU7XG5cdFx0XHRjb25zdCBzYW1wbGUgPSByZWNpcGVTYW1wbGUocHJlc2V0LCB1LCB2KTtcblx0XHRcdGNvbnN0IG9mZnNldCA9ICh5ICogc2l6ZSArIHgpICogNDtcblx0XHRcdGFsYmVkb0ltYWdlLmRhdGFbb2Zmc2V0XSA9IE1hdGgucm91bmQoTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBzYW1wbGUuY29sb3IucikpKTtcblx0XHRcdGFsYmVkb0ltYWdlLmRhdGFbb2Zmc2V0ICsgMV0gPSBNYXRoLnJvdW5kKE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgc2FtcGxlLmNvbG9yLmcpKSk7XG5cdFx0XHRhbGJlZG9JbWFnZS5kYXRhW29mZnNldCArIDJdID0gTWF0aC5yb3VuZChNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIHNhbXBsZS5jb2xvci5iKSkpO1xuXHRcdFx0YWxiZWRvSW1hZ2UuZGF0YVtvZmZzZXQgKyAzXSA9IDI1NTtcblx0XHR9XG5cdH1cblxuXHRmb3IgKGxldCB5ID0gMDsgeSA8IE1BUF9TSVpFOyB5KyspIHtcblx0XHRmb3IgKGxldCB4ID0gMDsgeCA8IE1BUF9TSVpFOyB4KyspIHtcblx0XHRcdGNvbnN0IHUgPSB4IC8gTUFQX1NJWkU7XG5cdFx0XHRjb25zdCB2ID0geSAvIE1BUF9TSVpFO1xuXHRcdFx0Y29uc3Qgc2FtcGxlID0gcmVjaXBlU2FtcGxlKHByZXNldCwgdSwgdik7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSAoeSAqIE1BUF9TSVpFICsgeCkgKiA0O1xuXHRcdFx0Ly8gVGhlIHJvdWdobmVzcyBtYXAgaG9sZHMgYSBtdWx0aXBsaWVyIGFyb3VuZCBvbmUsIHNvIHRoZSBzbGlkZXJcblx0XHRcdC8vIG9mIHRoZSBzbG90IHN0YXlzIGluIGNoYXJnZSBvZiB0aGUgZmluYWwgcm91Z2huZXNzLlxuXHRcdFx0Y29uc3Qgcm91Z2ggPSBNYXRoLnJvdW5kKE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgKDAuNSArIChzYW1wbGUucm91Z2huZXNzIC0gcHJlc2V0LnJvdWdobmVzcykpICogMjU1KSkpO1xuXHRcdFx0cm91Z2huZXNzSW1hZ2UuZGF0YVtvZmZzZXRdID0gcm91Z2g7XG5cdFx0XHRyb3VnaG5lc3NJbWFnZS5kYXRhW29mZnNldCArIDFdID0gcm91Z2g7XG5cdFx0XHRyb3VnaG5lc3NJbWFnZS5kYXRhW29mZnNldCArIDJdID0gcm91Z2g7XG5cdFx0XHRyb3VnaG5lc3NJbWFnZS5kYXRhW29mZnNldCArIDNdID0gMjU1O1xuXG5cdFx0XHRjb25zdCBidW1wID0gTWF0aC5yb3VuZChNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIHNhbXBsZS5idW1wICogMjU1KSkpO1xuXHRcdFx0YnVtcEltYWdlLmRhdGFbb2Zmc2V0XSA9IGJ1bXA7XG5cdFx0XHRidW1wSW1hZ2UuZGF0YVtvZmZzZXQgKyAxXSA9IGJ1bXA7XG5cdFx0XHRidW1wSW1hZ2UuZGF0YVtvZmZzZXQgKyAyXSA9IGJ1bXA7XG5cdFx0XHRidW1wSW1hZ2UuZGF0YVtvZmZzZXQgKyAzXSA9IDI1NTtcblx0XHR9XG5cdH1cblxuXHRhbGJlZG9DdHgucHV0SW1hZ2VEYXRhKGFsYmVkb0ltYWdlLCAwLCAwKTtcblx0cm91Z2huZXNzQ3R4LnB1dEltYWdlRGF0YShyb3VnaG5lc3NJbWFnZSwgMCwgMCk7XG5cdGJ1bXBDdHgucHV0SW1hZ2VEYXRhKGJ1bXBJbWFnZSwgMCwgMCk7XG5cdHJldHVybiB7IGFsYmVkbzogYWxiZWRvQ2FudmFzLCByb3VnaG5lc3M6IHJvdWdobmVzc0NhbnZhcywgYnVtcDogYnVtcENhbnZhcyB9O1xufVxuXG4vKiogUGFpbnRzIG9ubHkgdGhlIGFsYmVkbyBjaGFubmVsLCB1c2VkIGZvciB0aGUgbGlicmFyeSBwcmV2aWV3cy4gKi9cbmZ1bmN0aW9uIHJlbmRlckFsYmVkbyhwcmVzZXQ6IE1hdGVyaWFsUHJlc2V0LCBzaXplOiBudW1iZXIpOiBIVE1MQ2FudmFzRWxlbWVudCB7XG5cdGNvbnN0IGNhbnZhcyA9IGNyZWF0ZUNhbnZhcyhzaXplKTtcblx0Y29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cdGlmICghY3R4KSByZXR1cm4gY2FudmFzO1xuXHRjb25zdCBpbWFnZSA9IGN0eC5jcmVhdGVJbWFnZURhdGEoc2l6ZSwgc2l6ZSk7XG5cdGZvciAobGV0IHkgPSAwOyB5IDwgc2l6ZTsgeSsrKSB7XG5cdFx0Zm9yIChsZXQgeCA9IDA7IHggPCBzaXplOyB4KyspIHtcblx0XHRcdGNvbnN0IHNhbXBsZSA9IHJlY2lwZVNhbXBsZShwcmVzZXQsIHggLyBzaXplLCB5IC8gc2l6ZSk7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSAoeSAqIHNpemUgKyB4KSAqIDQ7XG5cdFx0XHRpbWFnZS5kYXRhW29mZnNldF0gPSBNYXRoLnJvdW5kKE1hdGgubWluKDI1NSwgTWF0aC5tYXgoMCwgc2FtcGxlLmNvbG9yLnIpKSk7XG5cdFx0XHRpbWFnZS5kYXRhW29mZnNldCArIDFdID0gTWF0aC5yb3VuZChNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIHNhbXBsZS5jb2xvci5nKSkpO1xuXHRcdFx0aW1hZ2UuZGF0YVtvZmZzZXQgKyAyXSA9IE1hdGgucm91bmQoTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBzYW1wbGUuY29sb3IuYikpKTtcblx0XHRcdGltYWdlLmRhdGFbb2Zmc2V0ICsgM10gPSAyNTU7XG5cdFx0fVxuXHR9XG5cdGN0eC5wdXRJbWFnZURhdGEoaW1hZ2UsIDAsIDApO1xuXHRyZXR1cm4gY2FudmFzO1xufVxuXG5jb25zdCB0ZXh0dXJlQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgVGV4dHVyZVNldD4oKTtcbmNvbnN0IHRodW1ibmFpbENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuLyoqIFJldHVybnMgdGhlIGdlbmVyYXRlZCB0ZXh0dXJlcyBvZiBhIHByZXNldCwgZ2VuZXJhdGluZyB0aGVtIG9uIGZpcnN0IHVzZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZXh0dXJlU2V0Rm9yKHByZXNldDogTWF0ZXJpYWxQcmVzZXQpOiBUZXh0dXJlU2V0IHtcblx0Y29uc3QgY2FjaGVkID0gdGV4dHVyZUNhY2hlLmdldChwcmVzZXQuaWQpO1xuXHRpZiAoY2FjaGVkKSByZXR1cm4gY2FjaGVkO1xuXHRjb25zdCBnZW5lcmF0ZWQgPSByZW5kZXJUZXh0dXJlU2V0KHByZXNldCwgVEVYVFVSRV9TSVpFKTtcblx0dGV4dHVyZUNhY2hlLnNldChwcmVzZXQuaWQsIGdlbmVyYXRlZCk7XG5cdHJldHVybiBnZW5lcmF0ZWQ7XG59XG5cbi8qKiBTbWFsbCBwcmV2aWV3IGltYWdlIG9mIGEgcHJlc2V0LCB1c2VkIGJ5IHRoZSBsaWJyYXJ5IHN3YXRjaGVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRodW1ibmFpbEZvcihwcmVzZXQ6IE1hdGVyaWFsUHJlc2V0KTogc3RyaW5nIHtcblx0Y29uc3QgY2FjaGVkID0gdGh1bWJuYWlsQ2FjaGUuZ2V0KHByZXNldC5pZCk7XG5cdGlmIChjYWNoZWQpIHJldHVybiBjYWNoZWQ7XG5cdGNvbnN0IHVybCA9IHJlbmRlckFsYmVkbyhwcmVzZXQsIFRIVU1CTkFJTF9TSVpFKS50b0RhdGFVUkwoJ2ltYWdlL3BuZycpO1xuXHR0aHVtYm5haWxDYWNoZS5zZXQocHJlc2V0LmlkLCB1cmwpO1xuXHRyZXR1cm4gdXJsO1xufVxuXG4vKiogQXZlcmFnZXMgdGhlIGFsYmVkbyBvZiBhIHByZXNldCwgdXNlZCBmb3IgdGhlIHZpZXdwb3J0IGZhbGxiYWNrIGNvbG91ci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhdmVyYWdlQ29sb3IocHJlc2V0OiBNYXRlcmlhbFByZXNldCk6IHN0cmluZyB7XG5cdGNvbnN0IHJnYiA9IGhleFRvUmdiKHByZXNldC5jb2xvcik7XG5cdHJldHVybiBgIyR7cmdiLm1hcCgoY2hhbm5lbCkgPT4gTWF0aC5yb3VuZChjaGFubmVsKS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKSkuam9pbignJyl9YDtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIHNsb3QgdGhhdCBhIHVzZXIgdXBsb2FkZWQgaW1hZ2UgZGVzY3JpYmVzLlxuICpcbiAqIFRoZSBpbWFnZSBpcyBzdG9yZWQgYXMgYSBkYXRhIFVSTCBzbyB0aGUgcHJvamVjdCBmaWxlIGtlZXBzIHdvcmtpbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzbG90RnJvbUltYWdlKG5hbWU6IHN0cmluZywgZGF0YVVybDogc3RyaW5nKTogTWF0ZXJpYWxTbG90IHtcblx0cmV0dXJuIHtcblx0XHQuLi5kZWZhdWx0TWF0ZXJpYWxTbG90KG5hbWUpLFxuXHRcdGNvbG9yOiAnI2ZmZmZmZicsXG5cdFx0bWV0YWxuZXNzOiAwLjEsXG5cdFx0cm91Z2huZXNzOiAwLjUsXG5cdFx0aW1hZ2VVcmw6IGRhdGFVcmwsXG5cdH07XG59XG5cbmNvbnN0IGltYWdlQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4oKTtcblxuLyoqIFRoZSBkZWNvZGVkIGltYWdlIG9mIGEgc2xvdCwgd2hlbiB0aGUgdXNlciB1cGxvYWRlZCBvbmUuICovXG5leHBvcnQgZnVuY3Rpb24gaW1hZ2VGb3JTbG90KHNsb3RPclVybDogTWF0ZXJpYWxTbG90IHwgc3RyaW5nIHwgdW5kZWZpbmVkKTogSFRNTEltYWdlRWxlbWVudCB8IG51bGwge1xuXHRjb25zdCB1cmwgPSB0eXBlb2Ygc2xvdE9yVXJsID09PSAnc3RyaW5nJyA/IHNsb3RPclVybCA6IHNsb3RPclVybD8uaW1hZ2VVcmw7XG5cdGlmICghdXJsIHx8IHR5cGVvZiBJbWFnZSA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybiBudWxsO1xuXHRsZXQgaW1hZ2UgPSBpbWFnZUNhY2hlLmdldCh1cmwpO1xuXHRpZiAoIWltYWdlKSB7XG5cdFx0aW1hZ2UgPSBuZXcgSW1hZ2UoKTtcblx0XHRpbWFnZS5vbmxvYWQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBnID0gZ2xvYmFsVGhpcyBhcyB1bmtub3duIGFzIHsgX19sb29rRW5naW5lPzogeyBvblRleExvYWRlZD86ICgpID0+IHZvaWQgfSB9O1xuXHRcdFx0aWYgKGcuX19sb29rRW5naW5lPy5vblRleExvYWRlZCkgZy5fX2xvb2tFbmdpbmUub25UZXhMb2FkZWQoKTtcblx0XHR9O1xuXHRcdGltYWdlLnNyYyA9IHVybDtcblx0XHRpbWFnZUNhY2hlLnNldCh1cmwsIGltYWdlKTtcblx0fVxuXHRyZXR1cm4gaW1hZ2UuY29tcGxldGUgJiYgaW1hZ2UubmF0dXJhbFdpZHRoID4gMCA/IGltYWdlIDogbnVsbDtcbn1cblxuLyoqIFR1cm5zIGEgbWF0ZXJpYWwgc2xvdCBpbnRvIHRoZSB2YWx1ZXMgdGhlIHJlbmRlcmVyIHVwbG9hZHMuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU2xvdEZvcihzbG90OiBNYXRlcmlhbFNsb3QpOiBSZW5kZXJTbG90IHtcblx0Y29uc3QgcHJlc2V0ID0gc2xvdC5wcmVzZXRJZCA/IHByZXNldEJ5SWQoc2xvdC5wcmVzZXRJZCkgOiBudWxsO1xuXHRjb25zdCB0ZXh0dXJlcyA9IHByZXNldCA/IHRleHR1cmVTZXRGb3IocHJlc2V0KSA6IG51bGw7XG5cdGNvbnN0IGltYWdlID0gaW1hZ2VGb3JTbG90KHNsb3QuaW1hZ2VVcmwpO1xuXHRjb25zdCByTWFwID0gaW1hZ2VGb3JTbG90KHNsb3Qucm91Z2huZXNzVXJsKTtcblx0Y29uc3QgYk1hcCA9IGltYWdlRm9yU2xvdChzbG90Lm5vcm1hbFVybCk7XG5cdGNvbnN0IGNvbG9yID0gaGV4VG9SZ2Ioc2xvdC5jb2xvcikubWFwKChjaGFubmVsKSA9PiBjaGFubmVsIC8gMjU1KSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdGNvbnN0IGVtaXNzaXZlID0gaGV4VG9SZ2Ioc2xvdC5lbWlzc2l2ZSkubWFwKChjaGFubmVsKSA9PiBjaGFubmVsIC8gMjU1KSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG5cdGNvbnN0IHRpbnQgPSBwcmVzZXQgJiYgIWltYWdlID8gaGV4VG9SZ2IocHJlc2V0LmNvbG9yKSA6IFsyNTUsIDI1NSwgMjU1XTtcblx0Y29uc3QgdGV4VGludDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gcHJlc2V0ICYmICFpbWFnZVxuXHRcdD8gW1xuXHRcdFx0XHQxIC8gTWF0aC5tYXgodGludFswXSAvIDI1NSwgMC4wNSksXG5cdFx0XHRcdDEgLyBNYXRoLm1heCh0aW50WzFdIC8gMjU1LCAwLjA1KSxcblx0XHRcdFx0MSAvIE1hdGgubWF4KHRpbnRbMl0gLyAyNTUsIDAuMDUpLFxuXHRcdFx0XVxuXHRcdDogWzEsIDEsIDFdO1xuXHRyZXR1cm4ge1xuXHRcdGNvbG9yLFxuXHRcdGVtaXNzaXZlLFxuXHRcdGVtaXNzaXZlU3RyZW5ndGg6IHNsb3QuZW1pc3NpdmVTdHJlbmd0aCA/PyAxLFxuXHRcdG1ldGFsbmVzczogc2xvdC5tZXRhbG5lc3MgPz8gMC4wNCxcblx0XHRyb3VnaG5lc3M6IHNsb3Qucm91Z2huZXNzID8/IDAuMzYsXG5cdFx0c3BlY3VsYXI6IHNsb3Quc3BlY3VsYXIgPz8gMC41LFxuXHRcdG5vcm1hbFN0cmVuZ3RoOiBzbG90Lm5vcm1hbFN0cmVuZ3RoID8/IDEsXG5cdFx0b3BhY2l0eTogc2xvdC5vcGFjaXR5ID8/IDEsXG5cdFx0YmxlbmRNb2RlOiBzbG90LmJsZW5kTW9kZSB8fCAnYmxlbmQnLFxuXHRcdHV2UmVwZWF0OiBzbG90LnV2UmVwZWF0ID8/IDEsXG5cdFx0dXZTY2FsZVk6IHNsb3QudXZTY2FsZVkgPz8gc2xvdC51dlJlcGVhdCA/PyAxLFxuXHRcdHV2T2Zmc2V0WDogc2xvdC51dk9mZnNldFggPz8gMCxcblx0XHR1dk9mZnNldFk6IHNsb3QudXZPZmZzZXRZID8/IDAsXG5cdFx0dXZSb3RhdGlvbjogc2xvdC51dlJvdGF0aW9uID8/IDAsXG5cdFx0dGV4TWFwcGluZzogc2xvdC50ZXhNYXBwaW5nID8/IDAsXG5cdFx0dGV4U3RyZW5ndGg6IHNsb3QudGV4U3RyZW5ndGggPz8gMSxcblx0XHR0ZXhUaW50LFxuXHRcdGFsYmVkbzogaW1hZ2UgfHwgKHRleHR1cmVzID8gdGV4dHVyZXMuYWxiZWRvIDogbnVsbCksXG5cdFx0cm91Z2huZXNzTWFwOiByTWFwIHx8ICh0ZXh0dXJlcyA/IHRleHR1cmVzLnJvdWdobmVzcyA6IG51bGwpLFxuXHRcdGJ1bXBNYXA6IGJNYXAgfHwgKHRleHR1cmVzID8gdGV4dHVyZXMuYnVtcCA6IG51bGwpLFxuXHR9O1xufVxuXG4vKiogQnVpbGRzIHRoZSByZW5kZXIgc2xvdHMgb2YgYW4gb2JqZWN0IGZyb20gaXRzIG1hdGVyaWFsIHNsb3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclNsb3RzRm9yKHNsb3RzOiBNYXRlcmlhbFNsb3RbXSk6IFJlbmRlclNsb3RbXSB7XG5cdHJldHVybiBzbG90cy5tYXAocmVuZGVyU2xvdEZvcik7XG59XG4iXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxTQUFTLG1CQUFtQixRQUEyQixRQUFRO0FBNEMvRCxNQUFNLFlBQVksR0FBRyxFQUFFO0FBQ3ZCLE1BQU0sUUFBUSxHQUFHLEVBQUU7QUFDbkIsTUFBTSxjQUFjLEdBQUcsRUFBRTs7QUFFekI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBd0JBLE9BQU8sTUFBTSxnQkFBa0MsR0FBRztBQUNqRDtBQUNBO0VBQUUsRUFBRSxFQUFFLFVBQVU7RUFBRSxJQUFJLEVBQUUsVUFBVTtFQUFFLEtBQUssRUFBRSxRQUFRO0VBQUUsS0FBSyxFQUFFLFNBQVM7RUFBRSxRQUFRLEVBQUUsU0FBUztFQUFFLGdCQUFnQixFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxJQUFJO0VBQUUsT0FBTyxFQUFFLENBQUM7RUFBRSxNQUFNLEVBQUUsVUFBVTtFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsT0FBTyxFQUFFO0FBQUUsQ0FBQyxFQUMvTTtFQUFFLEVBQUUsRUFBRSxnQkFBZ0I7RUFBRSxJQUFJLEVBQUUsZ0JBQWdCO0VBQUUsS0FBSyxFQUFFLFFBQVE7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxPQUFPLEVBQUUsQ0FBQztFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQzFOO0VBQUUsRUFBRSxFQUFFLGVBQWU7RUFBRSxJQUFJLEVBQUUsZUFBZTtFQUFFLEtBQUssRUFBRSxRQUFRO0VBQUUsS0FBSyxFQUFFLFNBQVM7RUFBRSxRQUFRLEVBQUUsU0FBUztFQUFFLGdCQUFnQixFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxJQUFJO0VBQUUsT0FBTyxFQUFFLENBQUM7RUFBRSxNQUFNLEVBQUUsVUFBVTtFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsT0FBTyxFQUFFO0FBQUUsQ0FBQyxFQUN6TjtFQUFFLEVBQUUsRUFBRSxRQUFRO0VBQUUsSUFBSSxFQUFFLFFBQVE7RUFBRSxLQUFLLEVBQUUsUUFBUTtFQUFFLEtBQUssRUFBRSxTQUFTO0VBQUUsUUFBUSxFQUFFLFNBQVM7RUFBRSxnQkFBZ0IsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsSUFBSTtFQUFFLE9BQU8sRUFBRSxDQUFDO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxNQUFNLEVBQUUsU0FBUztFQUFFLE9BQU8sRUFBRTtBQUFFLENBQUMsRUFDMU07RUFBRSxFQUFFLEVBQUUsYUFBYTtFQUFFLElBQUksRUFBRSxhQUFhO0VBQUUsS0FBSyxFQUFFLFFBQVE7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxJQUFJO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxPQUFPLEVBQUUsQ0FBQztFQUFFLE1BQU0sRUFBRSxNQUFNO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQ3BOO0VBQUUsRUFBRSxFQUFFLFlBQVk7RUFBRSxJQUFJLEVBQUUsWUFBWTtFQUFFLEtBQUssRUFBRSxRQUFRO0VBQUUsS0FBSyxFQUFFLFNBQVM7RUFBRSxRQUFRLEVBQUUsU0FBUztFQUFFLGdCQUFnQixFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsSUFBSTtFQUFFLFNBQVMsRUFBRSxJQUFJO0VBQUUsT0FBTyxFQUFFLENBQUM7RUFBRSxNQUFNLEVBQUUsU0FBUztFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsT0FBTyxFQUFFO0FBQUUsQ0FBQyxFQUNyTjtFQUFFLEVBQUUsRUFBRSxVQUFVO0VBQUUsSUFBSSxFQUFFLGtCQUFrQjtFQUFFLEtBQUssRUFBRSxRQUFRO0VBQUUsS0FBSyxFQUFFLFNBQVM7RUFBRSxRQUFRLEVBQUUsU0FBUztFQUFFLGdCQUFnQixFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxJQUFJO0VBQUUsT0FBTyxFQUFFLENBQUM7RUFBRSxNQUFNLEVBQUUsU0FBUztFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsT0FBTyxFQUFFO0FBQUUsQ0FBQyxFQUN0TjtFQUFFLEVBQUUsRUFBRSxXQUFXO0VBQUUsSUFBSSxFQUFFLFdBQVc7RUFBRSxLQUFLLEVBQUUsUUFBUTtFQUFFLEtBQUssRUFBRSxTQUFTO0VBQUUsUUFBUSxFQUFFLFNBQVM7RUFBRSxnQkFBZ0IsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsSUFBSTtFQUFFLE9BQU8sRUFBRSxDQUFDO0VBQUUsTUFBTSxFQUFFLFVBQVU7RUFBRSxNQUFNLEVBQUUsU0FBUztFQUFFLE9BQU8sRUFBRTtBQUFFLENBQUMsRUFDak47RUFBRSxFQUFFLEVBQUUsZUFBZTtFQUFFLElBQUksRUFBRSxxQkFBcUI7RUFBRSxLQUFLLEVBQUUsUUFBUTtFQUFFLEtBQUssRUFBRSxTQUFTO0VBQUUsUUFBUSxFQUFFLFNBQVM7RUFBRSxnQkFBZ0IsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLEdBQUc7RUFBRSxTQUFTLEVBQUUsSUFBSTtFQUFFLE9BQU8sRUFBRSxDQUFDO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxNQUFNLEVBQUUsU0FBUztFQUFFLE9BQU8sRUFBRTtBQUFFLENBQUM7QUFFaE87QUFDQTtFQUFFLEVBQUUsRUFBRSxZQUFZO0VBQUUsSUFBSSxFQUFFLGlCQUFpQjtFQUFFLEtBQUssRUFBRSxzQkFBc0I7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxPQUFPLEVBQUUsQ0FBQztFQUFFLE1BQU0sRUFBRSxRQUFRO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQ3BPO0VBQUUsRUFBRSxFQUFFLFdBQVc7RUFBRSxJQUFJLEVBQUUsZ0JBQWdCO0VBQUUsS0FBSyxFQUFFLHNCQUFzQjtFQUFFLEtBQUssRUFBRSxTQUFTO0VBQUUsUUFBUSxFQUFFLFNBQVM7RUFBRSxnQkFBZ0IsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsSUFBSTtFQUFFLE9BQU8sRUFBRSxDQUFDO0VBQUUsTUFBTSxFQUFFLFFBQVE7RUFBRSxNQUFNLEVBQUUsU0FBUztFQUFFLE9BQU8sRUFBRTtBQUFFLENBQUMsRUFDbE87RUFBRSxFQUFFLEVBQUUsY0FBYztFQUFFLElBQUksRUFBRSxjQUFjO0VBQUUsS0FBSyxFQUFFLHNCQUFzQjtFQUFFLEtBQUssRUFBRSxTQUFTO0VBQUUsUUFBUSxFQUFFLFNBQVM7RUFBRSxnQkFBZ0IsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxTQUFTLEVBQUUsSUFBSTtFQUFFLE9BQU8sRUFBRSxDQUFDO0VBQUUsTUFBTSxFQUFFLE9BQU87RUFBRSxNQUFNLEVBQUUsU0FBUztFQUFFLE9BQU8sRUFBRTtBQUFFLENBQUMsRUFDck87RUFBRSxFQUFFLEVBQUUsZ0JBQWdCO0VBQUUsSUFBSSxFQUFFLGdCQUFnQjtFQUFFLEtBQUssRUFBRSxzQkFBc0I7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxPQUFPLEVBQUUsQ0FBQztFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQ3hPO0VBQUUsRUFBRSxFQUFFLGFBQWE7RUFBRSxJQUFJLEVBQUUsYUFBYTtFQUFFLEtBQUssRUFBRSxzQkFBc0I7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxPQUFPLEVBQUUsQ0FBQztFQUFFLE1BQU0sRUFBRSxRQUFRO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQ2pPO0VBQUUsRUFBRSxFQUFFLGFBQWE7RUFBRSxJQUFJLEVBQUUsYUFBYTtFQUFFLEtBQUssRUFBRSxzQkFBc0I7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLEdBQUc7RUFBRSxPQUFPLEVBQUUsQ0FBQztFQUFFLE1BQU0sRUFBRSxPQUFPO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQy9OO0VBQUUsRUFBRSxFQUFFLGlCQUFpQjtFQUFFLElBQUksRUFBRSxpQkFBaUI7RUFBRSxLQUFLLEVBQUUsc0JBQXNCO0VBQUUsS0FBSyxFQUFFLFNBQVM7RUFBRSxRQUFRLEVBQUUsU0FBUztFQUFFLGdCQUFnQixFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsR0FBRztFQUFFLFNBQVMsRUFBRSxJQUFJO0VBQUUsT0FBTyxFQUFFLENBQUM7RUFBRSxNQUFNLEVBQUUsU0FBUztFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsT0FBTyxFQUFFO0FBQUcsQ0FBQyxFQUM3TztFQUFFLEVBQUUsRUFBRSxXQUFXO0VBQUUsSUFBSSxFQUFFLFdBQVc7RUFBRSxLQUFLLEVBQUUsc0JBQXNCO0VBQUUsS0FBSyxFQUFFLFNBQVM7RUFBRSxRQUFRLEVBQUUsU0FBUztFQUFFLGdCQUFnQixFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxJQUFJO0VBQUUsT0FBTyxFQUFFLENBQUM7RUFBRSxNQUFNLEVBQUUsT0FBTztFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsT0FBTyxFQUFFO0FBQUUsQ0FBQyxFQUM1TjtFQUFFLEVBQUUsRUFBRSxjQUFjO0VBQUUsSUFBSSxFQUFFLGNBQWM7RUFBRSxLQUFLLEVBQUUsc0JBQXNCO0VBQUUsS0FBSyxFQUFFLFNBQVM7RUFBRSxRQUFRLEVBQUUsU0FBUztFQUFFLGdCQUFnQixFQUFFLENBQUM7RUFBRSxTQUFTLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxJQUFJO0VBQUUsT0FBTyxFQUFFLENBQUM7RUFBRSxNQUFNLEVBQUUsT0FBTztFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsT0FBTyxFQUFFO0FBQUcsQ0FBQztBQUVuTztBQUNBO0VBQUUsRUFBRSxFQUFFLGFBQWE7RUFBRSxJQUFJLEVBQUUsYUFBYTtFQUFFLEtBQUssRUFBRSx3QkFBd0I7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsQ0FBQztFQUFFLFNBQVMsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxPQUFPLEVBQUUsSUFBSTtFQUFFLE1BQU0sRUFBRSxNQUFNO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQ3BPO0VBQUUsRUFBRSxFQUFFLGFBQWE7RUFBRSxJQUFJLEVBQUUsYUFBYTtFQUFFLEtBQUssRUFBRSx3QkFBd0I7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsR0FBRztFQUFFLFNBQVMsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxPQUFPLEVBQUUsSUFBSTtFQUFFLE1BQU0sRUFBRSxTQUFTO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQ3pPO0VBQUUsRUFBRSxFQUFFLGFBQWE7RUFBRSxJQUFJLEVBQUUsYUFBYTtFQUFFLEtBQUssRUFBRSx3QkFBd0I7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsR0FBRztFQUFFLFNBQVMsRUFBRSxHQUFHO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxPQUFPLEVBQUUsSUFBSTtFQUFFLE1BQU0sRUFBRSxPQUFPO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQ3pPO0VBQUUsRUFBRSxFQUFFLFdBQVc7RUFBRSxJQUFJLEVBQUUsV0FBVztFQUFFLEtBQUssRUFBRSx3QkFBd0I7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsR0FBRztFQUFFLFNBQVMsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLEdBQUc7RUFBRSxPQUFPLEVBQUUsQ0FBQztFQUFFLE1BQU0sRUFBRSxNQUFNO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQzlOO0VBQUUsRUFBRSxFQUFFLFlBQVk7RUFBRSxJQUFJLEVBQUUsWUFBWTtFQUFFLEtBQUssRUFBRSx3QkFBd0I7RUFBRSxLQUFLLEVBQUUsU0FBUztFQUFFLFFBQVEsRUFBRSxTQUFTO0VBQUUsZ0JBQWdCLEVBQUUsR0FBRztFQUFFLFNBQVMsRUFBRSxDQUFDO0VBQUUsU0FBUyxFQUFFLElBQUk7RUFBRSxPQUFPLEVBQUUsQ0FBQztFQUFFLE1BQU0sRUFBRSxNQUFNO0VBQUUsTUFBTSxFQUFFLFNBQVM7RUFBRSxPQUFPLEVBQUU7QUFBRSxDQUFDLEVBQ2pPO0VBQUUsRUFBRSxFQUFFLGNBQWM7RUFBRSxJQUFJLEVBQUUsY0FB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QUM7TUFDRjtJQUNBLEtBQUssT0FBTztNQUFFO1FBQ2IsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLE9BQU87UUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLE9BQU87UUFDdEIsTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDeEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUUsRUFBRSxHQUFHLENBQUMsR0FBSSxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBRSxFQUFFLEdBQUcsQ0FBQyxHQUFJLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDakYsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxHQUFHLENBQUM7UUFDL0MsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxHQUFHLE1BQU0sR0FBRyxJQUFJLEdBQUcsS0FBSyxHQUFHLEdBQUcsQ0FBQztRQUN4RSxPQUFPO1VBQ04sS0FBSztVQUNMLFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsU0FBUyxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUM7VUFDL0QsSUFBSSxFQUFFLE1BQU0sR0FBRyxHQUFHLEdBQUcsS0FBSyxHQUFHO1FBQzlCLENBQUM7TUFDRjtJQUNBLEtBQUssT0FBTztNQUFFO1FBQ2IsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsT0FBTyxHQUFHLENBQUMsQ0FBQztRQUN4QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUM7UUFDL0IsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxHQUFHLENBQUM7UUFDN0MsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxHQUFHLElBQUksR0FBRyxHQUFHLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQztRQUN0RSxPQUFPO1VBQ04sS0FBSztVQUNMLFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsU0FBUyxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUM7VUFDOUQsSUFBSSxFQUFFLEdBQUcsR0FBRyxLQUFLLEdBQUc7UUFDckIsQ0FBQztNQUNGO0lBQ0EsS0FBSyxRQUFRO01BQUU7UUFDZCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsQ0FBQyxHQUFHLE9BQU8sR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDO1FBQy9ELE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsQ0FBQztRQUN2QyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQztRQUM3RSxPQUFPO1VBQ04sS0FBSztVQUNMLFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsU0FBUyxHQUFHLENBQUMsS0FBSyxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUM7VUFDL0QsSUFBSSxFQUFFLEdBQUcsR0FBRyxDQUFDLEtBQUssR0FBRyxHQUFHLElBQUk7UUFDN0IsQ0FBQztNQUNGO0lBQ0E7TUFDQyxPQUFPO1FBQUUsS0FBSyxFQUFFO1VBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7VUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztVQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUFFLENBQUM7UUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7UUFBRSxJQUFJLEVBQUU7TUFBSSxDQUFDO0VBQ2xHO0FBQ0Q7QUFFQSxTQUFTLGdCQUFnQixDQUFDLE1BQXNCLEVBQUUsSUFBWSxFQUFjO0VBQzNFLE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7RUFDdkMsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQztFQUM5QyxNQUFNLFVBQVUsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDO0VBQ3pDLE1BQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO0VBQy9DLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO0VBQ3JELE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO0VBQzNDLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxZQUFZLElBQUksQ0FBQyxPQUFPLEVBQUU7SUFDNUMsT0FBTztNQUFFLE1BQU0sRUFBRSxZQUFZO01BQUUsU0FBUyxFQUFFLGVBQWU7TUFBRSxJQUFJLEVBQUU7SUFBVyxDQUFDO0VBQzlFO0VBRUEsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO0VBQ3pELE1BQU0sY0FBYyxHQUFHLFlBQVksQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQztFQUN2RSxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUM7RUFFN0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRTtJQUM5QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFO01BQzlCLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJO01BQ2xCLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJO01BQ2xCLE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztNQUN6QyxNQUFNLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUM7TUFDakMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUNqRixXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUNyRixXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztNQUNyRixXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHO0lBQ25DO0VBQ0Q7RUFFQSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQ2xDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLEVBQUUsQ0FBQyxFQUFFLEVBQUU7TUFDbEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLFFBQVE7TUFDdEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLFFBQVE7TUFDdEIsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO01BQ3pDLE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLFFBQVEsR0FBRyxDQUFDLElBQUksQ0FBQztNQUNyQztNQUNBO01BQ0EsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxNQUFNLENBQUMsU0FBUyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO01BQ3pHLGNBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsS0FBSztNQUNuQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLO01BQ3ZDLGNBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUs7TUFDdkMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsR0FBRztNQUVyQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztNQUN0RSxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUk7TUFDN0IsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSTtNQUNqQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJO01BQ2pDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUc7SUFDakM7RUFDRDtFQUVBLFNBQVMsQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7RUFDekMsWUFBWSxDQUFDLFlBQVksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztFQUMvQyxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0VBQ3JDLE9BQU87SUFBRSxNQUFNLEVBQUUsWUFBWTtJQUFFLFNBQVMsRUFBRSxlQUFlO0lBQUUsSUFBSSxFQUFFO0VBQVcsQ0FBQztBQUM5RTs7QUFFQTtBQUNBLFNBQVMsWUFBWSxDQUFDLE1BQXNCLEVBQUUsSUFBWSxFQUFxQjtFQUM5RSxNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDO0VBQ2pDLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO0VBQ25DLElBQUksQ0FBQyxHQUFHLEVBQUUsT0FBTyxNQUFNO0VBQ3ZCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztFQUM3QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFO0lBQzlCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7TUFDOUIsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7TUFDdkQsTUFBTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDO01BQ2pDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDM0UsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDL0UsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7TUFDL0UsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsR0FBRztJQUM3QjtFQUNEO0VBQ0EsR0FBRyxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztFQUM3QixPQUFPLE1BQU07QUFDZDtBQUVBLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFxQixDQUFDO0FBQ2xELE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFpQixDQUFDOztBQUVoRDtBQUNBLE9BQU8sU0FBUyxhQUFhLENBQUMsTUFBc0IsRUFBYztFQUNqRSxNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7RUFDMUMsSUFBSSxNQUFNLEVBQUUsT0FBTyxNQUFNO0VBQ3pCLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUM7RUFDeEQsWUFBWSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQztFQUN0QyxPQUFPLFNBQVM7QUFDakI7O0FBRUE7QUFDQSxPQUFPLFNBQVMsWUFBWSxDQUFDLE1BQXNCLEVBQVU7RUFDNUQsTUFBTSxNQUFNLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0VBQzVDLElBQUksTUFBTSxFQUFFLE9BQU8sTUFBTTtFQUN6QixNQUFNLEdBQUcsR0FBRyxZQUFZLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUM7RUFDdkUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztFQUNsQyxPQUFPLEdBQUc7QUFDWDs7QUFFQTtBQUNBLE9BQU8sU0FBUyxZQUFZLENBQUMsTUFBc0IsRUFBVTtFQUM1RCxNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztFQUNsQyxPQUFPLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBRSxPQUFPLElBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRTtBQUM5Rjs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTyxTQUFTLGFBQWEsQ0FBQyxJQUFZLEVBQUUsT0FBZSxFQUFnQjtFQUMxRSxPQUFPO0lBQ04sR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLENBQUM7SUFDNUIsS0FBSyxFQUFFLFNBQVM7SUFDaEIsU0FBUyxFQUFFLEdBQUc7SUFDZCxTQUFTLEVBQUUsR0FBRztJQUNkLFFBQVEsRUFBRTtFQUNYLENBQUM7QUFDRjtBQUVBLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUEyQixDQUFDOztBQUV0RDtBQUNBLE9BQU8sU0FBUyxZQUFZLENBQUMsU0FBNEMsRUFBMkI7RUFDbkcsTUFBTSxHQUFHLEdBQUcsT0FBTyxTQUFTLEtBQUssUUFBUSxHQUFHLFNBQVMsR0FBRyxTQUFTLEVBQUUsUUFBUTtFQUMzRSxJQUFJLENBQUMsR0FBRyxJQUFJLE9BQU8sS0FBSyxLQUFLLFdBQVcsRUFBRSxPQUFPLElBQUk7RUFDckQsSUFBSSxLQUFLLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7RUFDL0IsSUFBSSxDQUFDLEtBQUssRUFBRTtJQUNYLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxDQUFDO0lBQ25CLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTTtNQUNwQixNQUFNLENBQUMsR0FBRyxVQUF3RTtNQUNsRixJQUFJLENBQUMsQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUNELEtBQUssQ0FBQyxHQUFHLEdBQUcsR0FBRztJQUNmLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQztFQUMzQjtFQUNBLE9BQU8sS0FBSyxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsWUFBWSxHQUFHLENBQUMsR0FBRyxLQUFLLEdBQUcsSUFBSTtBQUMvRDs7QUFFQTtBQUNBLE9BQU8sU0FBUyxhQUFhLENBQUMsSUFBa0IsRUFBYztFQUM3RCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsSUFBSTtFQUMvRCxNQUFNLFFBQVEsR0FBRyxNQUFNLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUk7RUFDdEQsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7RUFDekMsTUFBTSxJQUFJLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUM7RUFDNUMsTUFBTSxJQUFJLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7RUFDekMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUUsT0FBTyxJQUFLLE9BQU8sR0FBRyxHQUFHLENBQTZCO0VBQzlGLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFFLE9BQU8sSUFBSyxPQUFPLEdBQUcsR0FBRyxDQUE2QjtFQUNwRyxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO0VBQ3hFLE1BQU0sT0FBaUMsR0FBRyxNQUFNLElBQUksQ0FBQyxLQUFLLEdBQ3ZELENBQ0EsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxJQUFJLENBQUMsRUFDakMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxJQUFJLENBQUMsRUFDakMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FDakMsR0FDQSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0VBQ1osT0FBTztJQUNOLEtBQUs7SUFDTCxRQUFRO0lBQ1IsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixJQUFJLENBQUM7SUFDNUMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSTtJQUNqQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJO0lBQ2pDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxJQUFJLEdBQUc7SUFDOUIsY0FBYyxFQUFFLElBQUksQ0FBQyxjQUFjLElBQUksQ0FBQztJQUN4QyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDO0lBQzFCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLE9BQU87SUFDcEMsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQztJQUM1QixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUM7SUFDN0MsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQztJQUM5QixTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDO0lBQzlCLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUM7SUFDaEMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQztJQUNoQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDO0lBQ2xDLE9BQU87SUFDUCxNQUFNLEVBQUUsS0FBSyxLQUFLLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztJQUNwRCxZQUFZLEVBQUUsSUFBSSxLQUFLLFFBQVEsR0FBRyxRQUFRLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztJQUM1RCxPQUFPLEVBQUUsSUFBSSxLQUFLLFFBQVEsR0FBRyxRQUFRLENBQUMsSUFBSSxHQUFHLElBQUk7RUFDbEQsQ0FBQztBQUNGOztBQUVBO0FBQ0EsT0FBTyxTQUFTLGNBQWMsQ0FBQyxLQUFxQixFQUFnQjtFQUNuRSxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDO0FBQ2hDIiwiaWdub3JlTGlzdCI6W119