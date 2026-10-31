import { writable, get } from 'svelte/store';
import { PRIMITIVES, sceneStore } from './scene';
import { timelineStore } from './timeline';
import { uiStore } from './ui';

export interface ToolState {
	current: string;
	snap: boolean;
	space: 'world' | 'local' | 'view' | 'normal' | 'cursor';
	pivot: 'median' | 'individual' | 'active' | 'cursor' | 'bbox';
	agentPrompt: string;
	/** How the scissors tool cuts: two halves or a marked side. */
	cutMode: 'split' | 'mark';
	selectionMode: 'single' | 'box' | 'lasso';
	axisConstraint: 'all' | 'x' | 'y' | 'z';
	uniformScale: boolean;
	activeParamTool: string | null;
	toolParams: Record<string, any>;
}

const initialState: ToolState = {
	current: 'move',
	snap: false,
	space: 'world',
	pivot: 'median',
	agentPrompt: '',
	cutMode: 'split',
	selectionMode: 'single',
	axisConstraint: 'all',
	uniformScale: true,
	activeParamTool: null,
	toolParams: {
		extrude: { amount: 0.35 },
		bevel: { amount: 0.05, segments: 1 },
		loopcut: { amount: 1 },
		inset: { amount: 0.18 },
		decimate: { ratio: 0.5 },
		solidify: { amount: 0.12 },
		smooth: { iterations: 2, factor: 0.5 },
		array: { count: 3, offset: [1.25, 0, 0] },
		screw: { axis: 'z', angle: 360, steps: 16, pitch: 0.5 },
		boolean: { op: 'difference' },
		subdivide: { levels: 1 },
	},
};

const COLOR_NAMES: Record<string, string> = {
	red: '#ff6b6b',
	orange: '#ffa94d',
	yellow: '#ffd43b',
	green: '#51d88a',
	teal: '#3dd9a8',
	cyan: '#5cb8ff',
	blue: '#4c8dff',
	purple: '#a78bfa',
	violet: '#b197fc',
	pink: '#f472b6',
	white: '#f1f3f9',
	grey: '#9aa3b8',
	gray: '#9aa3b8',
	black: '#14161d',
};

const PRIMITIVE_WORDS: Record<string, string> = {
	cube: 'cube',
	box: 'cube',
	sphere: 'sphere',
	ball: 'sphere',
	cylinder: 'cylinder',
	cone: 'cone',
	torus: 'torus',
	donut: 'torus',
	ring: 'torus',
	plane: 'plane',
	floor: 'plane',
	ground: 'plane',
	coin: 'coin',
	light: 'light',
	lamp: 'light',
	sun: 'light',
	camera: 'camera',
	bone: 'bone',
};

function parseColor(text: string): string | null {
	const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(text);
	if (hex) return hex[0];
	for (const [name, value] of Object.entries(COLOR_NAMES)) {
		if (new RegExp(`\\b${name}\\b`, 'i').test(text)) return value;
	}
	return null;
}

function parseNumbers(text: string): number[] {
	return (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter((value) => Number.isFinite(value));
}

function selectedObject() {
	const state = get(sceneStore);
	return state.objects.find((object) => object.id === state.selectedId) || null;
}

function findObjectByName(text: string) {
	const state = get(sceneStore);
	const lower = text.toLowerCase();
	const matches = state.objects.filter((object) => lower.includes(object.name.toLowerCase()));
	return matches.sort((a, b) => b.name.length - a.name.length)[0] || null;
}

function resolveTarget(text: string) {
	const named = findObjectByName(text);
	return named || selectedObject();
}

function report(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
	uiStore.showToast(message, type, 2600);
}

function vectorFrom(numbers: number[], fallback: [number, number, number]): [number, number, number] {
	if (numbers.length >= 3) return [numbers[0], numbers[1], numbers[2]];
	return fallback;
}

function addPrimitiveCommand(text: string): boolean {
	const words = text.toLowerCase();
	if (!/\b(add|create|make|place|new)\b/.test(words)) return false;
	const entries = Object.entries(PRIMITIVE_WORDS);
	let type = '';
	for (const [word, primitive] of entries) {
		if (new RegExp(`\\b${word}(?:e?s)?\\b`, 'i').test(words)) {
			type = primitive;
			break;
		}
	}
	if (!type) return false;

	const numbers = parseNumbers(words);
	let count = 1;
	const countMatch = /\b(\d+)\b/.exec(words);
	if (countMatch) {
		const value = Number(countMatch[1]);
		if (value >= 1 && value <= 25) count = value;
	}
	const color = parseColor(text);
	const definition = PRIMITIVES.find((primitive) => primitive.type === type);
	const positionNumbers = numbers.length >= 3 ? numbers.slice(-3) : null;

	const created: string[] = [];
	for (let index = 0; index < count; index++) {
		sceneStore.addPrimitive(type, positionNumbers && index === 0 ? (positionNumbers as [number, number, number]) : undefined);
		const id = get(sceneStore).selectedId;
		if (id) created.push(id);
	}
	if (color) {
		for (const id of created) sceneStore.setColor(id, color);
	}
	report(`Added ${count > 1 ? `${count} ` : ''}${definition?.label.toLowerCase() || type}${count > 1 ? 's' : ''}.`, 'success');
	return true;
}

function animateCommand(text: string): boolean {
	const words = text.toLowerCase();
	if (!/\b(animate|spin|rotate|bounce|orbit|fall|drop)\b/.test(words)) return false;
	const target = resolveTarget(text);
	if (!target) {
		report('Select an object before asking for an animation.', 'warning');
		return true;
	}
	const duration = Math.max(1, Math.min(10, parseNumbers(words).find((value) => value >= 1 && value <= 10) || 2));
	const start = {
		time: 0,
		position: [...target.position] as [number, number, number],
		rotation: [...target.rotation] as [number, number, number],
		scale: [...target.scale] as [number, number, number],
	};

	if (/\bspin\b/.test(words)) {
		timelineStore.addKeyframe(target.id, start);
		timelineStore.addKeyframe(target.id, {
			...start,
			time: duration,
			rotation: [start.rotation[0], start.rotation[1] + Math.PI * 2, start.rotation[2]],
		});
		report(`Spinning ${target.name} over ${duration}s.`, 'success');
	} else if (/\bbounce\b/.test(words)) {
		timelineStore.addKeyframe(target.id, start);
		timelineStore.addKeyframe(target.id, {
			...start,
			time: duration / 2,
			position: [start.position[0], start.position[1] + 2, start.position[2]],
		});
		timelineStore.addKeyframe(target.id, { ...start, time: duration });
		report(`Bouncing ${target.name} over ${duration}s.`, 'success');
	} else if (/\borbit\b/.test(words)) {
		const radius = Math.hypot(start.position[0], start.position[2]) || 2;
		for (let index = 0; index <= 4; index++) {
			const angle = (index / 4) * Math.PI * 2;
			timelineStore.addKeyframe(target.id, {
				...start,
				time: (duration * index) / 4,
				position: [Math.cos(angle) * radius, start.position[1], Math.sin(angle) * radius],
			});
		}
		report(`Orbiting ${target.name} over ${duration}s.`, 'success');
	} else if (/\b(fall|drop)\b/.test(words)) {
		timelineStore.addKeyframe(target.id, start);
		timelineStore.addKeyframe(target.id, {
			...start,
			time: duration,
			position: [start.position[0], 0, start.position[2]],
		});
		report(`${target.name} will fall over ${duration}s.`, 'success');
	} else {
		timelineStore.addKeyframe(target.id, start);
		timelineStore.addKeyframe(target.id, {
			...start,
			time: duration,
			rotation: [start.rotation[0], start.rotation[1] + Math.PI, start.rotation[2]],
		});
		report(`Animated ${target.name} over ${duration}s.`, 'success');
	}
	timelineStore.setDuration(Math.max(duration, get(timelineStore).duration));
	timelineStore.setPlaying(true);
	return true;
}

function runCommand(raw: string): void {
	const text = raw.trim();
	const words = text.toLowerCase();
	if (!text) return;

	if (/\b(help|commands)\b/.test(words)) {
		report('Try: add cube, add 3 red spheres, select Cube, move to 2 0 0, spin, drop, play, undo.', 'info');
		return;
	}
	if (/\b(undo)\b/.test(words)) {
		sceneStore.undo();
		report('Undo.', 'success');
		return;
	}
	if (/\b(redo)\b/.test(words)) {
		sceneStore.redo();
		report('Redo.', 'success');
		return;
	}
	if (/\b(clear|reset)\b/.test(words) && !/\b(reset score)\b/.test(words)) {
		sceneStore.clear();
		timelineStore.clearKeyframes();
		report('Scene cleared. Undo is available.', 'success');
		return;
	}
	if (/\b(reset score|score reset)\b/.test(words)) {
		sceneStore.resetScore();
		report('Score reset.', 'success');
		return;
	}
	if (/\b(play game|game mode|start game)\b/.test(words)) {
		const state = get(sceneStore);
		if (!state.gameMode) sceneStore.toggleGameMode();
		report('Game mode on. Use arrow keys or the on-screen pad.', 'success');
		return;
	}
	if (/\b(stop game|exit game|end game)\b/.test(words)) {
		const state = get(sceneStore);
		if (state.gameMode) sceneStore.toggleGameMode();
		sceneStore.resetGameInput();
		report('Game mode off.', 'success');
		return;
	}
	if (/\b(play|start)\b/.test(words) && !/\b(play game)\b/.test(words)) {
		timelineStore.setShow(true);
		timelineStore.setPlaying(true);
		report('Playing timeline.', 'success');
		return;
	}
	if (/\b(pause|stop)\b/.test(words)) {
		timelineStore.setPlaying(false);
		report('Timeline paused.', 'success');
		return;
	}
	if (/\b(add key|keyframe)\b/.test(words)) {
		const target = resolveTarget(text);
		if (!target) {
			report('Select an object before adding a keyframe.', 'warning');
			return;
		}
		const time = get(timelineStore).currentTime;
		timelineStore.addKeyframe(target.id, {
			time,
			position: [...target.position] as [number, number, number],
			rotation: [...target.rotation] as [number, number, number],
			scale: [...target.scale] as [number, number, number],
		});
		report(`Keyframe added for ${target.name} at ${time.toFixed(2)}s.`, 'success');
		return;
	}
	if (/\b(delete|remove)\b/.test(words)) {
		const target = findObjectByName(text);
		if (target) {
			sceneStore.deleteObject(target.id);
			timelineStore.removeKeyframesFor(target.id);
			report(`Deleted ${target.name}.`, 'success');
			return;
		}
		sceneStore.deleteSelected();
		report('Deleted selected object.', 'success');
		return;
	}
	if (/\b(select)\b/.test(words)) {
		const target = findObjectByName(text);
		if (target) {
			sceneStore.selectObject(target.id);
			report(`Selected ${target.name}.`, 'success');
		} else {
			report('No matching object. Check the outliner for names.', 'warning');
		}
		return;
	}
	if (/\b(color|paint|make.*(red|blue|green|yellow|purple|pink|white|black))\b/.test(words)) {
		const target = resolveTarget(text);
		const color = parseColor(text);
		if (!target) {
			report('Select an object before changing its color.', 'warning');
			return;
		}
		if (!color) {
			report('I could not find a color name in that request.', 'warning');
			return;
		}
		sceneStore.setColor(target.id, color);
		report(`Colored ${target.name}.`, 'success');
		return;
	}
	if (/\b(move|translate)\b/.test(words)) {
		const target = resolveTarget(text);
		if (!target) {
			report('Select an object before moving it.', 'warning');
			return;
		}
		const numbers = parseNumbers(words);
		if (!numbers.length) {
			report('Give me a position, for example: move to 2 0 0.', 'warning');
			return;
		}
		const position = /by\b/.test(words) && numbers.length >= 3
			? [target.position[0] + numbers[0], target.position[1] + numbers[1], target.position[2] + numbers[2]] as [number, number, number]
			: vectorFrom(numbers, target.position);
		sceneStore.setTransform(target.id, { position });
		report(`Moved ${target.name}.`, 'success');
		return;
	}
	if (/\b(rotate|turn)\b/.test(words)) {
		const target = resolveTarget(text);
		if (!target) {
			report('Select an object before rotating it.', 'warning');
			return;
		}
		const numbers = parseNumbers(words);
		const radians = (numbers.length >= 3 ? numbers : [0, 45, 0]).map((value) => (value * Math.PI) / 180);
		sceneStore.setTransform(target.id, {
			rotation: [target.rotation[0] + radians[0], target.rotation[1] + radians[1], target.rotation[2] + radians[2]],
		});
		report(`Rotated ${target.name}.`, 'success');
		return;
	}
	if (/\b(scale|resize|size)\b/.test(words)) {
		const target = resolveTarget(text);
		if (!target) {
			report('Select an object before scaling it.', 'warning');
			return;
		}
		const numbers = parseNumbers(words);
		const factor = numbers[0] && numbers[0] > 0 ? numbers[0] : 1.25;
		sceneStore.setTransform(target.id, { scale: [target.scale[0] * factor, target.scale[1] * factor, target.scale[2] * factor] });
		report(`Scaled ${target.name}.`, 'success');
		return;
	}
	if (animateCommand(text)) return;
	if (addPrimitiveCommand(text)) return;
	report('I did not understand that. Type "help" for example commands.', 'warning');
}

function createToolStore() {
	const { subscribe, set, update } = writable<ToolState>(initialState);

	return {
		subscribe,
		set,
		setTool: (tool: string) => update((state) => {
			state.current = tool;
			return state;
		}),
		/** Pans the viewport, useful on a touch screen. */
		setPan: () => update((state) => {
			state.current = 'pan';
			return state;
		}),
		toggleSnap: () => update((state) => {
			state.snap = !state.snap;
			return state;
		}),
		setSpace: (space: ToolState['space']) => update((state) => {
			state.space = space;
			return state;
		}),
		setPivot: (pivot: ToolState['pivot']) => update((state) => {
			state.pivot = pivot;
			return state;
		}),
		setAgentPrompt: (prompt: string) => update((state) => {
			state.agentPrompt = prompt;
			return state;
		}),
		setCutMode: (mode: 'split' | 'mark') => update((state) => {
			state.cutMode = mode;
			return state;
		}),
		setSelectionMode: (mode: 'single' | 'box' | 'lasso') => update((state) => {
			state.selectionMode = mode;
			return state;
		}),
		setAxisConstraint: (axis: 'all' | 'x' | 'y' | 'z') => update((state) => {
			state.axisConstraint = axis;
			return state;
		}),
		setUniformScale: (uniform: boolean) => update((state) => {
			state.uniformScale = uniform;
			return state;
		}),
		setActiveParamTool: (tool: string | null) => update((state) => {
			state.activeParamTool = tool;
			return state;
		}),
		setToolParam: (tool: string, key: string, value: any) => update((state) => {
			if (!state.toolParams[tool]) state.toolParams[tool] = {};
			state.toolParams[tool][key] = value;
			return state;
		}),
		runAgent: () => {
			const state = get(toolStore);
			const prompt = state.agentPrompt.trim();
			if (!prompt) {
				report('Describe what to build or animate first.', 'warning');
				return;
			}
			runCommand(prompt);
			update((current) => {
				current.agentPrompt = '';
				return current;
			});
		},
		runCommand: (command: string) => runCommand(command),
		undo: () => sceneStore.undo(),
		redo: () => sceneStore.redo(),
	};
}

export const toolStore = createToolStore();
