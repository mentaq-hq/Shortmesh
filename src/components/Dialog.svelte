<script lang="ts">
	import { untrack } from 'svelte';
	import { uiStore } from '../stores/ui';
	import { sceneStore } from '../stores/scene';
	import { timelineStore } from '../stores/timeline';
	import {
		applyProject,
		createProject,
		deleteSavedProject,
		downloadProject,
		listSavedProjects,
		readProjectFile,
		saveToBrowser,
		type ProjectFile,
		type StoredProject,
	} from '../lib/project';

	let { title = 'Dialog', children }: { title?: string; children?: any } = $props();

	const open = $derived(Boolean($uiStore.activeDialog));
	const dialogTitle = $derived(
		$uiStore.activeDialog === 'save'
			? 'Save Project'
			: $uiStore.activeDialog === 'open'
				? 'Open Project'
				: $uiStore.activeDialog === 'new'
					? 'New Project'
					: $uiStore.activeDialog === 'shortcuts'
						? 'Keyboard Shortcuts'
						: title,
	);

	let projectName = $state('Untitled');
	let savedProjects = $state<StoredProject[]>([]);
	let error = $state('');

	$effect(() => {
		const dialog = $uiStore.activeDialog;
		if (!dialog) return;
		error = '';
		if (dialog === 'save' || dialog === 'new') projectName = untrack(() => createProject().name);
		if (dialog === 'open') savedProjects = listSavedProjects();
	});

	function close() {
		uiStore.closeDialog();
	}

	function toast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
		uiStore.showToast(message, type, 2600);
	}

	function saveDownload() {
		try {
			const project = createProject(projectName.trim() || 'Untitled');
			downloadProject(project);
			toast('Project download started.', 'success');
			close();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not save the project.';
		}
	}

	function saveLocal() {
		try {
			const project = createProject(projectName.trim() || 'Untitled');
			saveToBrowser(project);
			toast('Project saved in this browser.', 'success');
			close();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not save the project.';
		}
	}

	async function loadFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const project: ProjectFile = await readProjectFile(file);
			applyProject(project);
			timelineStore.setShow(Object.keys(project.timeline.keyframes).length > 0);
			toast(`Opened ${project.name}.`, 'success');
			close();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not open that project.';
		} finally {
			input.value = '';
		}
	}

	function loadStored(entry: StoredProject) {
		try {
			applyProject(entry.project);
			timelineStore.setShow(Object.keys(entry.project.timeline.keyframes).length > 0);
			toast(`Opened ${entry.name}.`, 'success');
			close();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not open that project.';
		}
	}

	function removeStored(name: string) {
		deleteSavedProject(name);
		savedProjects = listSavedProjects();
		toast('Saved project removed.', 'info');
	}

	function newProject() {
		sceneStore.clear();
		timelineStore.clearKeyframes();
		timelineStore.setTime(0);
		timelineStore.setPlaying(false);
		timelineStore.setShow(false);
		toast('New project created.', 'success');
		close();
	}
</script>

{#if open}
	<div id="dlg" class="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-bg0" role="dialog" aria-modal="true" aria-labelledby="dlg-title" data-testid="dialog">
		<div class="dh flex justify-between items-center px-3.5 py-3 border-b border-ln text-lg font-bold">
			<span id="dlg-title">{dialogTitle}</span>
			<button class="s w-8 h-8 flex items-center justify-center rounded-lg text-tx2 hover:bg-bg3" onclick={close} aria-label="Close" data-testid="dialog-close">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<path d="M5 5l14 14M19 5L5 19" />
				</svg>
			</button>
		</div>

		<div class="flex-1 overflow-y-auto p-3">
			{#if error}
				<div class="mb-3 rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-red-300" role="alert">{error}</div>
			{/if}

			{#if $uiStore.activeDialog === 'save'}
				<div class="ds">
					<b>Project name</b>
					<input
						class="w-full rounded-lg border border-ln2 bg-bg2 px-3 py-2 text-tx outline-none focus:border-accent"
						bind:value={projectName}
						aria-label="Project name"
						data-testid="project-name"
					/>
				</div>
				<div class="ds">
					<b>Contents</b>
					<p class="text-tx2">{$sceneStore.objects.length} objects · {$timelineStore.keyframes.size} animated objects</p>
				</div>
				<div class="ds dr">
					<button class="s h-10 px-4" onclick={saveDownload} data-testid="save-download">Download project file</button>
					<button class="s h-10 px-4" onclick={saveLocal} data-testid="save-browser">Save in this browser</button>
				</div>
			{:else if $uiStore.activeDialog === 'open'}
				<div class="ds">
					<b>From your device</b>
					<input type="file" accept=".json,.tsf,.tsf.json,application/json" onchange={loadFile} data-testid="open-file" />
				</div>
				<div class="ds">
					<b>Saved in this browser</b>
					{#if savedProjects.length === 0}
						<p class="text-tx2">No browser projects yet. Use Save → Save in this browser.</p>
					{:else}
						<div class="flex flex-col gap-2">
							{#each savedProjects as entry}
								<div class="flex items-center gap-2">
									<button class="s h-9 flex-1 justify-start px-3" onclick={() => loadStored(entry)}>
										{entry.name} · {entry.savedAt.slice(0, 10)}
									</button>
									<button class="s h-9 px-3" onclick={() => removeStored(entry.name)} aria-label="Delete {entry.name}">Delete</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if $uiStore.activeDialog === 'new'}
				<div class="ds">
					<b>Start over</b>
					<p class="text-tx2">This clears the scene and all keyframes. You can undo the scene change.</p>
				</div>
				<div class="ds dr">
					<button class="s h-10 px-4" onclick={newProject} data-testid="confirm-new">Create new project</button>
					<button class="s h-10 px-4" onclick={close}>Cancel</button>
				</div>
			{:else if $uiStore.activeDialog === 'shortcuts'}
				<div class="ds">
					<b>Editing</b>
					<p class="text-tx2">Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo · Ctrl/Cmd+D duplicate · Delete removes selection</p>
				</div>
				<div class="ds">
					<b>Tools</b>
					<p class="text-tx2">V pick · G move · R rotate · S scale · F frame selected · Space play/pause</p>
				</div>
				<div class="ds">
					<b>Files</b>
					<p class="text-tx2">Ctrl/Cmd+S save · Ctrl/Cmd+O open · Ctrl/Cmd+N new project · Esc close dialog</p>
				</div>
			{:else if children}
				{@render children()}
			{:else}
				<p class="text-tx2">This dialog is ready for content.</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	:global(#dlg) {
		background: var(--bg0);
	}

	:global(#dlg *) {
		touch-action: pan-y;
	}

	:global(#dlg input:not([type='file'])) {
		user-select: text;
		touch-action: manipulation;
	}

	:global(.dh) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 14px;
		border-bottom: 1px solid var(--ln);
		font-size: 17px;
		font-weight: 700;
	}

	:global(.ds) {
		padding: 12px 14px;
		border-bottom: 1px solid var(--bg2);
	}

	:global(.ds > b) {
		display: block;
		color: var(--tx2);
		margin-bottom: 8px;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 700;
	}
</style>
