import { writable, get } from 'svelte/store';

export type BrushKind =
	| 'draw'
	| 'clay'
	| 'smooth'
	| 'inflate'
	| 'grab'
	| 'snake_hook'
	| 'pinch'
	| 'crease'
	| 'flatten'
	| 'fill'
	| 'mask'
	| 'simplify';

export type BrushFalloff = 'smooth' | 'linear' | 'hard';

export interface BrushState {
	kind: BrushKind;
	radius: number;
	strength: number;
	hardness: number;
	falloff: BrushFalloff;
	inverted: boolean;
	symmetryX: boolean;
	symmetryY: boolean;
	symmetryZ: boolean;
	color: string;
	quickSmooth: boolean;
}

const initialState: BrushState = {
	kind: 'draw',
	radius: 0.9,
	strength: 0.6,
	hardness: 0.5,
	falloff: 'smooth',
	inverted: false,
	symmetryX: false,
	symmetryY: false,
	symmetryZ: false,
	color: '#f97316',
	quickSmooth: false,
};

function createBrushStore() {
	const { subscribe, set, update } = writable<BrushState>({ ...initialState });

	return {
		subscribe,
		set,
		setKind: (kind: BrushKind) =>
			update((state) => {
				state.kind = kind;
				return state;
			}),
		setRadius: (radius: number) =>
			update((state) => {
				state.radius = Math.min(5, Math.max(0.05, radius));
				return state;
			}),
		setStrength: (strength: number) =>
			update((state) => {
				state.strength = Math.min(1, Math.max(0.02, strength));
				return state;
			}),
		setHardness: (hardness: number) =>
			update((state) => {
				state.hardness = Math.min(1, Math.max(0, hardness));
				return state;
			}),
		setFalloff: (falloff: BrushFalloff) =>
			update((state) => {
				state.falloff = falloff;
				return state;
			}),
		toggleInverted: () =>
			update((state) => {
				state.inverted = !state.inverted;
				return state;
			}),
		setInverted: (inverted: boolean) =>
			update((state) => {
				state.inverted = inverted;
				return state;
			}),
		toggleSymmetry: (axis: 'x' | 'y' | 'z') =>
			update((state) => {
				if (axis === 'x') state.symmetryX = !state.symmetryX;
				if (axis === 'y') state.symmetryY = !state.symmetryY;
				if (axis === 'z') state.symmetryZ = !state.symmetryZ;
				return state;
			}),
		setQuickSmooth: (quickSmooth: boolean) =>
			update((state) => {
				state.quickSmooth = quickSmooth;
				return state;
			}),
		setColor: (color: string) =>
			update((state) => {
				state.color = color;
				return state;
			}),
		symmetry: () => {
			const state = get(brushStore);
			return state.symmetryX || state.symmetryY || state.symmetryZ
				? { x: state.symmetryX, y: state.symmetryY, z: state.symmetryZ }
				: null;
		},
		reset: () => set({ ...initialState }),
	};
}

export const brushStore = createBrushStore();
