// UI Store

import { writable } from 'svelte/store';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
	message: string;
	type: ToastType;
	duration: number;
}

export interface UIState {
	showOutliner: boolean;
	dockOpen: boolean;
	activeDialog: string | null;
	toast: ToastMessage | null;
}

const initialState: UIState = {
	showOutliner: true,
	dockOpen: true,
	activeDialog: null,
	toast: null,
};

function createUIStore() {
	const { subscribe, set, update } = writable<UIState>(initialState);
	
	return {
		subscribe,
		set,
		toggleOutliner: () => update(state => {
			state.showOutliner = !state.showOutliner;
			return state;
		}),
		toggleDock: () => update(state => {
			state.dockOpen = !state.dockOpen;
			return state;
		}),
		openDialog: (dialog: string) => update(state => {
			state.activeDialog = dialog;
			return state;
		}),
		closeDialog: () => update(state => {
			state.activeDialog = null;
			return state;
		}),
		showToast: (message: string, type: ToastType = 'info', duration = 2000) => update(state => {
			state.toast = { message, type, duration };
			return state;
		}),
		hideToast: () => update(state => {
			state.toast = null;
			return state;
		}),
	};
}

export const uiStore = createUIStore();
