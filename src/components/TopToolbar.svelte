<script lang="ts">
	import { uiStore } from '../stores/ui';
	import { sceneStore } from '../stores/scene';
	import { workspaceStore, type WorkspaceKey } from '../stores/workspace';
	import { ICONS, WORKSPACES } from '../lib/constants';
	import ModePill from './ModePill.svelte';

	const undo = () => sceneStore.undo();
	const frameSelected = () => window.dispatchEvent(new CustomEvent('toon:frame-selected'));
	const redo = () => sceneStore.redo();
	const toggleOutliner = () => uiStore.toggleOutliner();

	let menuOpen = $state(false);

	function setWorkspace(workspace: WorkspaceKey) {
		workspaceStore.setWorkspace(workspace);
		menuOpen = false;
	}
</script>

<header id="topbar" aria-label="Application bar">
	<div class="left">
		<img class="logo" src="/favicon.svg" alt="Shortmesh" />
		<ModePill onMenu={() => (menuOpen = !menuOpen)} />

		{#if menuOpen}
			<div class="menu" role="menu" data-testid="workspace-menu">
				{#each Object.entries(WORKSPACES) as [key, ws]}
					<button
						class="menu-item"
						class:on={$workspaceStore.current === key}
						onclick={() => setWorkspace(key as WorkspaceKey)}
						role="menuitem"
						style="--c: {ws.color}"
						data-testid="ws-menu-{key}"
					>
						<span class="menu-dot"></span>
						{ws.label}
					</button>
				{/each}
				<div class="menu-sep"></div>
				<button class="menu-item" onclick={() => { uiStore.openDialog('open'); menuOpen = false; }} role="menuitem" data-testid="ws-menu-open">
					{@html ICONS.folder}
					Open
				</button>
				<button class="menu-item" onclick={() => { uiStore.openDialog('save'); menuOpen = false; }} role="menuitem" data-testid="ws-menu-save">
					{@html ICONS.save}
					Save
				</button>
			</div>
		{/if}
	</div>

	<nav class="tabs" aria-label="Workspaces">
		{#each Object.entries(WORKSPACES) as [key, ws]}
			<button
				class="tab"
				class:on={$workspaceStore.current === key}
				onclick={() => setWorkspace(key as WorkspaceKey)}
				style="--c: {ws.color}"
				aria-label={ws.label}
				aria-pressed={$workspaceStore.current === key}
				title={ws.label}
				data-testid="workspace-{key}"
			>
				<span class="tab-dot"></span>
				<span class="tab-label">{ws.label}</span>
			</button>
		{/each}
	</nav>

	<div class="right">
		<button class="tb" onclick={undo} aria-label="Undo" title="Undo (Ctrl+Z)" data-testid="undo">
			{@html ICONS.undo}
		</button>
		<button class="tb" onclick={redo} aria-label="Redo" title="Redo (Ctrl+Y)" data-testid="redo">
			{@html ICONS.redo}
		</button>
		<button
			class="tb"
			onclick={() => uiStore.openDialog('save')}
			aria-label="Save project"
			title="Save project (Ctrl+S)"
			data-testid="save"
		>
			{@html ICONS.save}
		</button>
		<button
			class="tb"
			onclick={frameSelected}
			aria-label="Frame selection"
			title="Frame selection (F)"
			data-testid="toolbar-frame"
		>
			{@html ICONS.frame}
		</button>
		<button
			class="tb"
			class:on={$uiStore.showOutliner}
			onclick={toggleOutliner}
			aria-label="Outliner"
			title="Objects"
			data-testid="outliner-toggle"
		>
			{@html ICONS.layers}
		</button>
	</div>
</header>

<style>
	:global(#topbar) {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 40px;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 8px 0 12px;
		background: var(--gl);
	}

	.left {
		display: flex;
		align-items: center;
		gap: 8px;
		position: relative;
	}

	.logo {
		width: 18px;
		height: 18px;
		border-radius: 6px;
		background: linear-gradient(135deg, #3ddbb0, #4d8de5);
		flex: none;
	}

	.tabs {
		display: none;
		align-items: center;
		gap: 2px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.tabs::-webkit-scrollbar {
		display: none;
	}

	.tab {
		flex: none;
		display: flex;
		align-items: center;
		gap: 6px;
		height: 26px;
		padding: 0 9px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--tx2);
		font: 600 11px system-ui, -apple-system, sans-serif;
		cursor: pointer;
		white-space: nowrap;
	}

	.tab:hover {
		background: #21252f;
		color: var(--tx);
	}

	.tab.on {
		background: color-mix(in srgb, var(--c) 14%, transparent);
		color: var(--tx);
	}

	.tab-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--c);
		opacity: 0.5;
	}

	.tab.on .tab-dot {
		opacity: 1;
	}

	.right {
		display: flex;
		align-items: center;
	}

	.tb {
		background: transparent;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: 12px;
		color: var(--tx2);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.tb :global(svg) {
		width: 18px;
		height: 18px;
	}

	.tb:hover {
		background: #21252f;
		color: var(--tx);
	}

	.tb.on {
		color: var(--ac);
	}

	.menu {
		position: absolute;
		left: 0;
		top: 34px;
		z-index: 30;
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 152px;
		padding: 5px;
		border-radius: 12px;
		background: #12141a;
		border: 1px solid var(--ln);
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55);
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 30px;
		padding: 0 9px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--tx2);
		font: 600 11px system-ui, -apple-system, sans-serif;
		cursor: pointer;
		text-align: left;
	}

	.menu-item :global(svg) {
		width: 15px;
		height: 15px;
	}

	.menu-item:hover {
		background: #21252f;
		color: var(--tx);
	}

	.menu-item.on {
		background: color-mix(in srgb, var(--c) 16%, transparent);
		color: var(--tx);
	}

	.menu-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--c);
		flex: none;
	}

	.menu-sep {
		height: 1px;
		margin: 4px 6px;
		background: var(--ln);
	}

	@media (min-width: 900px) {
		.tabs {
			display: flex;
		}
	}
</style>
