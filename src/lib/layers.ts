/**
 * Layer bar geometry for the CapCut style timeline.
 *
 * A layer bar is not decoration: its length comes from the data that actually
 * drives the layer, so a bar can never claim a duration the animation or the
 * action strip does not have.
 */

export interface LayerRange {
	start: number;
	end: number;
}

export interface LayerTint {
	/** Base colour of the bar. */
	bar: string;
	/** Slightly stronger colour for the border and the selected state. */
	edge: string;
}

const MIN_SPAN = 0.2;

/** How long a freshly added layer lives on the timeline. */
export const DEFAULT_CLIP_SECONDS = 3;

function clampRange(start: number, end: number, duration: number): LayerRange {
	const max = Math.max(MIN_SPAN, duration);
	let from = Math.min(max, Math.max(0, Number.isFinite(start) ? start : 0));
	let to = Math.min(max, Math.max(from, Number.isFinite(end) ? end : max));
	if (to - from < MIN_SPAN) {
		from = Math.max(0, Math.min(from, max - MIN_SPAN));
		to = Math.min(max, from + MIN_SPAN);
	}
	return { start: from, end: to };
}

/** True for the layers whose lifetime is a clip rather than a pose animation. */
export function isMediaLayer(type: string): boolean {
	return type === 'text' || type === 'image';
}

/**
 * Every drawable layer is a clip. Lights and cameras are scene infrastructure,
 * so they keep the whole timeline and are never hidden by a clip.
 */
export function isClippable(type: string): boolean {
	return type !== 'light' && type !== 'camera';
}

/**
 * Only media layers are hidden outside their clip. A mesh keeps rendering for
 * the whole timeline even when its bar is short: the bar is placement for its
 * animation, not a visibility cut. Otherwise a static cube would vanish after
 * the default three seconds, which looked like the scene had broken.
 */
export function clipHidesLayer(type: string): boolean {
	return isMediaLayer(type);
}

/**
 * The time span a layer occupies.
 *
 * 1. A stored clip wins: the user dragged the layer, so that placement is real.
 * 2. Action strips are explicit in and out points.
 * 3. Two or more keys span the first to the last key.
 * 4. A clippable layer with no animation lives for `DEFAULT_CLIP_SECONDS`.
 * 5. Lights and cameras, and a single-key pose, fill the whole timeline.
 */
export function layerRange(
	keys: readonly number[],
	strips: readonly { start: number; end: number }[],
	duration: number,
	clip: LayerRange | null = null,
	clippable = false,
): LayerRange {
	if (clip) return clampRange(clip.start, clip.end, duration);
	if (strips.length) {
		const start = Math.min(...strips.map((strip) => strip.start));
		const end = Math.max(...strips.map((strip) => strip.end));
		return clampRange(start, end, duration);
	}
	if (keys.length >= 2) {
		const sorted = [...keys].sort((a, b) => a - b);
		return clampRange(sorted[0], sorted[sorted.length - 1], duration);
	}
	if (clippable) return clampRange(0, Math.min(DEFAULT_CLIP_SECONDS, duration), duration);
	return clampRange(0, duration, duration);
}

/**
 * The visibility window of a media layer at a given time.
 *
 * Text and image layers are on screen only inside their clip; the renderer
 * hides them outside it. Other object types return null and stay visible.
 */
export function mediaWindow(
	type: string,
	clip: LayerRange | null,
	duration: number,
): LayerRange | null {
	if (!isClippable(type)) return null;
	return layerRange([], [], duration, clip, true);
}

/** Whether a media layer should be drawn at `time`. */
export function mediaVisible(type: string, clip: LayerRange | null, duration: number, time: number): boolean {
	const window = mediaWindow(type, clip, duration);
	if (!window) return true;
	return time >= window.start - 1e-4 && time < window.end - 1e-4;
}

/** Bar colours, keyed by scene object type. Text and image match CapCut tints. */
export function layerTint(type: string): LayerTint {
	switch (type) {
		case 'text':
			return { bar: '#d96b57', edge: '#f0907c' };
		case 'image':
			return { bar: '#2f9c92', edge: '#54c4b9' };
		case 'video':
			return { bar: '#5b74c9', edge: '#8196e6' };
		case 'light':
			return { bar: '#b08033', edge: '#d8a95c' };
		case 'camera':
			return { bar: '#7b5fb0', edge: '#a389d8' };
		default:
			return { bar: '#4c648f', edge: '#7692c4' };
	}
}
