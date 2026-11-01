import { writable } from 'svelte/store';

export interface PhysicsState {
	running: boolean;
	gravity: number;
}

function createPhysicsStore() {
	const { subscribe, set, update } = writable<PhysicsState>({ running: false, gravity: 9.8 });

	return {
		subscribe,
		set,
		toggle: () =>
			update((state) => {
				state.running = !state.running;
				return state;
			}),
		setRunning: (running: boolean) =>
			update((state) => {
				state.running = running;
				return state;
			}),
		setGravity: (gravity: number) =>
			update((state) => {
				state.gravity = Math.max(0, gravity);
				return state;
			}),
	};
}

export const physicsStore = createPhysicsStore();
