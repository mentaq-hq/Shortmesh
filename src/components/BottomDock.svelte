<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { workspaceStore, currentChips, currentChipIndex, currentChipName } from '../stores/workspace';
	import { uiStore } from '../stores/ui';
	import { timelineStore } from '../stores/timeline';
	import { CHIP_ICONS, ICONS } from '../lib/constants';
	import ActionPanel from './ActionPanel.svelte';
	import AgentPromptBar from './AgentPromptBar.svelte';
	import Timeline from './Timeline.svelte';

	let dock: HTMLDivElement;
	let resizeObserver: ResizeObserver | null = null;
	let resizeFrame = 0;
	let dockCollapsed = $state(false);

	function setChip(chipIndex: number) {
		workspaceStore.setChip($workspaceStore.current, chipIndex);
		if (dockCollapsed) dockCollapsed = false;
	}

	function toggleDock() {
		dockCollapsed = !dockCollapsed;
		uiStore.toggleDock();
		publishHeight();
	}

	function beginDockResize(event: PointerEvent) {
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		event.preventDefault();
		event.stopPropagation();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture?.(event.pointerId);
		const startY = event.clientY;
		const tlBody = dock?.querySelector('.tl-body') as HTMLElement | null;
		const tlRows = dock?.querySelector('.tl-rows') as HTMLElement | null;
		const startH = tlRows?.clientHeight || 148;
		const onMove = (moveEvent: PointerEvent) => {
			const dy = startY - moveEvent.clientY;
			const nextH = Math.max(64, Math.min(window.innerHeight - 160, startH + dy));
			if (tlRows) tlRows.style.height = `${nextH}px`;
			if (tlBody) tlBody.style.height = `${nextH + 26}px`;
			publishHeight();
		};
		const onUp = (upEvent: PointerEvent) => {
			handle.releasePointerCapture?.(upEvent.pointerId);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	}

	function publishHeight() {
		if (resizeFrame) return;
		resizeFrame = requestAnimationFrame(() => {
			resizeFrame = 0;
			if (!dock) return;
			document.documentElement.style.setProperty('--dh', `${Math.round(dock.getBoundingClientRect().height)}px`);
		});
	}

	onMount(() => {
		if (!dock) return;
		resizeObserver = new ResizeObserver(publishHeight);
		resizeObserver.observe(dock);
		publishHeight();
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		if (resizeFrame) cancelAnimationFrame(resizeFrame);
		document.documentElement.style.setProperty('--dh', '92px');
	});
</script>

<div
	id="dock"
	bind:this={dock}
	class="gl fixed bottom-0 left-0 right-0 w-full z-10 overflow-hidden"
	class:collapsed={dockCollapsed}
	role="region"
	aria-label="Workspace Dock"
	data-testid="dock"
>
	<div id="dock-topbar" class="dock-topbar" data-testid="dock-topbar">
		<div class="dock-topbar-left">
			<span class="dock-tab-badge" id="dock-badge-text">{($currentChipName || $workspaceStore.current).toUpperCase()}</span>
		</div>
		<div
			id="dock-resize"
			class="dock-resize"
			data-testid="dock-resize"
			title="Drag up/down to resize panel"
			onpointerdown={beginDockResize}
		>
			<span></span>
		</div>
		<div class="dock-topbar-right">
			<button
				type="button"
				class="dock-arrow-btn"
				id="dock-btn-collapse"
				data-testid="dock-collapse"
				title="Collapse / Hide Panel"
				onclick={toggleDock}
			>
				{#if dockCollapsed}
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
				{:else}
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
				{/if}
			</button>
		</div>
	</div>

	{#if $workspaceStore.current === 'age' && !dockCollapsed}
		<div id="agent-bar-wrap" class="px-2 py-1.5 border-t border-ln">
			<AgentPromptBar />
		</div>
	{/if}

	<div
		id="timelineSlot"
		class="tl-slot"
		class:open={$timelineStore.show && !dockCollapsed}
		aria-hidden={!$timelineStore.show || dockCollapsed}
		inert={!$timelineStore.show || dockCollapsed}
	>
		<Timeline />
	</div>

	{#if !dockCollapsed}
		<div id="action-panel">
			<ActionPanel />
		</div>
	{/if}

	<div id="sh" class="flex items-center gap-1 px-2 py-1 overflow-x-auto border-t border-ln">
		{#each $currentChips as chip, index}
			<button
				class="chip"
				class:on={index === $currentChipIndex}
				onclick={() => setChip(index)}
				title={chip[1]}
				aria-label={chip[0]}
				data-testid="chip-{index}"
			>
				{@html ICONS[CHIP_ICONS[chip[0]] ?? 'plus']}
				<span>{chip[0]}</span>
			</button>
		{/each}
	</div>
</div>
