// Viewport Store

import { writable } from 'svelte/store';

export interface ViewportState {
	width: number;
	height: number;
	camera: {
		position: [number, number, number];
		rotation: [number, number, number, number];
		fov: number;
		aspect: number;
		near: number;
		far: number;
	};
	gizmoMode: 'translate' | 'rotate' | 'scale' | 'universal';
	gizmoSpace: 'world' | 'local' | 'view' | 'normal' | 'cursor';
	gizmoPivot: 'median' | 'individual' | 'active' | 'cursor' | 'bbox';
	snapEnabled: boolean;
	snapIncrement: number;
	snapAngle: number;
	shadingMode: 'wireframe' | 'solid' | 'material' | 'rendered' | 'toon';
	xray: boolean;
	overlays: {
		grid: boolean;
		axes: boolean;
		bounds: boolean;
		wireframe: boolean;
		normals: boolean;
	};
	pipCamera: string | null;
	pipMode: 0 | 1 | 2;
	/** Zoom of the camera preview, 0.2 to 3. */
	pipZoom: number;
	resolution: [number, number];
	/** 3D cursor position in world space (PV16). */
	cursorPosition: [number, number, number];
	/** Whether the 3D cursor is visible. */
	cursorVisible: boolean;
	/** Split viewport count (PV07): 1, 2, or 4. */
	viewportSplit: 1 | 2 | 4;
	/** Render region box in normalized viewport coords [x,y,w,h] (PV10). */
	renderRegion: [number, number, number, number] | null;
	viewThroughCamera: boolean;
	activeCameraId: string | null;
}

const initialState: ViewportState = {
	width: 0,
	height: 0,
	camera: {
		position: [0, 1, 5],
		rotation: [0, 0, 0, 1],
		fov: 50,
		aspect: 16/9,
		near: 0.1,
		far: 1000,
	},
	gizmoMode: 'translate',
	gizmoSpace: 'world',
	gizmoPivot: 'median',
	snapEnabled: false,
	snapIncrement: 0.5,
	snapAngle: 15,
	shadingMode: 'rendered',
	xray: false,
	overlays: {
		grid: true,
		axes: true,
		bounds: false,
		wireframe: false,
		normals: false,
	},
	pipCamera: null,
	pipMode: 0,
	pipZoom: 1.8,
	resolution: [1920, 1080],
	cursorPosition: [0, 0, 0],
	cursorVisible: false,
	viewportSplit: 1,
	renderRegion: null,
	viewThroughCamera: false,
	activeCameraId: null,
};

function createViewportStore() {
	const { subscribe, set, update } = writable<ViewportState>(initialState);
	
	return {
		subscribe,
		set,
		setSize: (width: number, height: number) => update(state => {
			state.width = width;
			state.height = height;
			state.camera.aspect = width / height;
			return state;
		}),
		setCamera: (camera: Partial<ViewportState['camera']>) => update(state => {
			state.camera = { ...state.camera, ...camera };
			return state;
		}),
		setGizmoMode: (mode: ViewportState['gizmoMode']) => update(state => {
			state.gizmoMode = mode;
			return state;
		}),
		setGizmoSpace: (space: ViewportState['gizmoSpace']) => update(state => {
			state.gizmoSpace = space;
			return state;
		}),
		setGizmoPivot: (pivot: ViewportState['gizmoPivot']) => update(state => {
			state.gizmoPivot = pivot;
			return state;
		}),
		toggleSnap: () => update(state => {
			state.snapEnabled = !state.snapEnabled;
			return state;
		}),
		setSnapIncrement: (increment: number) => update(state => {
			state.snapIncrement = increment;
			return state;
		}),
		setSnapAngle: (angle: number) => update(state => {
			state.snapAngle = angle;
			return state;
		}),
		setShadingMode: (mode: ViewportState['shadingMode']) => update(state => {
			state.shadingMode = mode;
			return state;
		}),
		toggleXray: () => update(state => {
			state.xray = !state.xray;
			return state;
		}),
		toggleOverlay: (overlay: keyof ViewportState['overlays']) => update(state => {
			state.overlays[overlay] = !state.overlays[overlay];
			return state;
		}),
		toggleGrid: () => update(state => {
			state.overlays.grid = !state.overlays.grid;
			return state;
		}),
		toggleAxes: () => update(state => {
			state.overlays.axes = !state.overlays.axes;
			return state;
		}),
		setPIPCamera: (cameraId: string | null, mode: ViewportState['pipMode'] = 0) => update(state => {
			state.pipCamera = cameraId;
			state.pipMode = mode;
			return state;
		}),
		setPipZoom: (zoom: number) => update(state => {
			state.pipZoom = Math.min(3, Math.max(0.2, zoom));
			return state;
		}),
		setPIPZoom: (zoom: number) => update(state => {
			state.pipZoom = Math.min(3, Math.max(0.2, zoom));
			return state;
		}),
		setResolution: (width: number, height: number) => update(state => {
			state.resolution = [width, height];
			return state;
		}),
		setCursor: (position: [number, number, number]) => update(state => {
			state.cursorPosition = [position[0], position[1], position[2]];
			return state;
		}),
		toggleCursor: () => update(state => {
			state.cursorVisible = !state.cursorVisible;
			return state;
		}),
		setCursorVisible: (visible: boolean) => update(state => {
			state.cursorVisible = visible;
			return state;
		}),
		setViewportSplit: (split: 1 | 2 | 4) => update(state => {
			state.viewportSplit = split;
			return state;
		}),
		setRenderRegion: (region: [number, number, number, number] | null) => update(state => {
			state.renderRegion = region ? [...region] as [number, number, number, number] : null;
			return state;
		}),
		toggleViewThroughCamera: () => update(state => {
			state.viewThroughCamera = !state.viewThroughCamera;
			return state;
		}),
		setViewThroughCamera: (active: boolean) => update(state => {
			state.viewThroughCamera = active;
			return state;
		}),
		setActiveCameraId: (id: string | null) => update(state => {
			state.activeCameraId = id;
			return state;
		}),
	};
}

export const viewportStore = createViewportStore();
