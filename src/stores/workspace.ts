// Workspace Store

import { writable, derived } from 'svelte/store';
import { WORKSPACES, WORKSPACE_CHIPS, HINTS } from '../lib/constants';

export type WorkspaceKey = keyof typeof WORKSPACES;

export interface WorkspaceChip {
	name: string;
	description: string;
}

export interface WorkspaceState {
	current: WorkspaceKey;
	open: boolean;
	chipIndices: Record<string, number>;
}

const initialState: WorkspaceState = {
	current: 'mod',
	open: true,
	chipIndices: {
		mod: 0,
		edt: 0,
		scl: 0,
		uvp: 0,
		shd: 0,
		rig: 0,
		ani: 0,
		phy: 0,
		gam: 0,
		ren: 0,
		age: 0,
	},
};

function createWorkspaceStore() {
	const { subscribe, set, update } = writable<WorkspaceState>(initialState);
	
	return {
		subscribe,
		set,
		setWorkspace: (workspace: WorkspaceKey) => update(state => {
			state.current = workspace;
			state.open = true;
			return state;
		}),
		toggleOpen: () => update(state => {
			state.open = !state.open;
			return state;
		}),
		setChip: (workspace: WorkspaceKey, index: number) => update(state => {
			state.chipIndices[workspace] = index;
			state.open = true;
			return state;
		}),
	};
}

export const workspaceStore = createWorkspaceStore();

// Derived stores
export const currentWorkspace = derived(workspaceStore, $ws => WORKSPACES[$ws.current]);
export const currentChips = derived(workspaceStore, $ws => WORKSPACE_CHIPS[$ws.current] || []);
export const currentChipIndex = derived(workspaceStore, $ws => $ws.chipIndices[$ws.current] || 0);
export const currentChipName = derived(
	[currentChips, currentChipIndex],
	([$chips, $idx]) => $chips[$idx]?.[0] || ''
);
export const currentHint = derived(workspaceStore, $ws => HINTS[$ws.current]);
