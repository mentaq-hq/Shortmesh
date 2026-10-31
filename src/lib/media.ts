// Media layers: text and image planes.
//
// The renderer only draws meshes, so a "layer" is a real plane object whose
// material slot carries a texture. Text is rasterised into a canvas, images
// are decoded and downscaled before they become data URLs. Everything here is
// browser only; the pure helpers stay usable from Node tests.

export interface LayerImage {
	dataUrl: string;
	width: number;
	height: number;
}

export const TEXT_TEXTURE_WIDTH = 1024;
export const TEXT_TEXTURE_HEIGHT = 512;

/** Longest edge kept when an image becomes a layer, in texture pixels. */
const MAX_IMAGE_EDGE = 1400;

/** A 2:1 plane that keeps the source aspect ratio inside a 2.4 unit width. */
export function aspectPlaneScale(
	width: number,
	height: number,
	widthUnits = 2.4,
): [number, number, number] {
	const safeWidth = Number.isFinite(width) && width > 0 ? width : 16;
	const safeHeight = Number.isFinite(height) && height > 0 ? height : 9;
	const aspect = Math.min(8, Math.max(0.12, safeWidth / safeHeight));
	const planeHeight = Math.min(6, Math.max(0.3, widthUnits / aspect));
	return [widthUnits, planeHeight, 1];
}

/** Splits a caption into at most `maxLines` lines of `maxWidth` pixels. */
export function wrapCaption(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	maxLines: number,
): string[] {
	const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
	if (!words.length) return [''];
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;
		if (!line || ctx.measureText(candidate).width <= maxWidth) {
			line = candidate;
			continue;
		}
		lines.push(line);
		line = word;
		if (lines.length === maxLines) break;
	}
	if (lines.length < maxLines && line) lines.push(line);
	if (lines.length === maxLines) {
		const consumed = lines.join(' ');
		if (consumed.length < text.replace(/\s+/g, ' ').trim().length) {
			let last = lines[maxLines - 1];
			while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
				last = last.slice(0, -1);
			}
			lines[maxLines - 1] = `${last.trimEnd()}…`;
		}
	}
	return lines;
}

/**
 * Rasterises a caption into an opaque title plate.
 *
 * The WebGL shader draws textured faces without alpha blending, so the card
 * carries its own background instead of pretending to be a transparent
 * overlay. The text and the accent bar are still real pixels in the texture.
 */
export function textTextureDataUrl(raw: string): string | null {
	if (typeof document === 'undefined') return null;
	const text = raw.replace(/\s+/g, ' ').trim() || 'Text';
	const canvas = document.createElement('canvas');
	canvas.width = TEXT_TEXTURE_WIDTH;
	canvas.height = TEXT_TEXTURE_HEIGHT;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
	background.addColorStop(0, '#111722');
	background.addColorStop(0.58, '#0c1018');
	background.addColorStop(1, '#161d29');
	ctx.fillStyle = background;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = 'rgba(110, 231, 183, 0.16)';
	ctx.fillRect(0, 0, canvas.width, 6);
	ctx.fillStyle = '#6ee7b7';
	ctx.fillRect(64, 132, 8, 248);

	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	const sizes = [92, 78, 64, 52, 42];
	let lines: string[] = [text];
	let size = sizes[0];
	for (const candidate of sizes) {
		ctx.font = `800 ${candidate}px Inter, system-ui, -apple-system, sans-serif`;
		const wrapped = wrapCaption(ctx, text, 820, 4);
		if (wrapped.length * candidate * 1.14 <= 340 || candidate === sizes[sizes.length - 1]) {
			lines = wrapped;
			size = candidate;
			break;
		}
	}
	ctx.font = `800 ${size}px Inter, system-ui, -apple-system, sans-serif`;
	const lineHeight = size * 1.14;
	const total = lines.length * lineHeight;
	const first = canvas.height / 2 - total / 2 + lineHeight / 2;
	lines.forEach((line, index) => {
		ctx.fillStyle = '#f4f7fb';
		ctx.fillText(line, 104, first + index * lineHeight);
	});

	ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
	ctx.fillRect(0, canvas.height - 4, canvas.width, 4);
	return canvas.toDataURL('image/png');
}

function loadImage(source: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('The image could not be decoded.'));
		image.src = source;
	});
}

function readFile(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ''));
		reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
		reader.readAsDataURL(file);
	});
}

/**
 * Decodes, downscales and re-encodes a picked image.
 *
 * Autosave stores the project in localStorage, so an untouched 12 MP camera
 * file would blow the quota. Keeping the longest edge at 1400 px stays well
 * inside it while still looking sharp on a plane.
 */
export async function readLayerImage(file: File): Promise<LayerImage | null> {
	if (typeof document === 'undefined') return null;
	const looksLikeImage =
		file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name);
	if (!looksLikeImage) return null;
	const source = await readFile(file);
	const image = await loadImage(source);
	const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
	const width = Math.max(1, Math.round(image.naturalWidth * scale));
	const height = Math.max(1, Math.round(image.naturalHeight * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(image, 0, 0, width, height);
	const transparent =
		file.type === 'image/png' ||
		file.type === 'image/webp' ||
		/\.(png|webp)$/i.test(file.name);
	const dataUrl = transparent
		? canvas.toDataURL('image/png')
		: canvas.toDataURL('image/jpeg', 0.86);
	return { dataUrl, width, height };
}

/** Calls back once the browser has decoded a data URL, so it can redraw. */
export function primeLayerTexture(url: string, ready: () => void): void {
	if (typeof Image === 'undefined') return;
	const image = new Image();
	image.onload = () => ready();
	image.onerror = () => ready();
	image.src = url;
}
