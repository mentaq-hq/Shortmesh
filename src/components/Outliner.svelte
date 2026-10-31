<script lang="ts">
	import { sceneStore, iconForType, type SceneObject } from '../stores/scene';
	import { uiStore } from '../stores/ui';
	import { timelineStore } from '../stores/timeline';
	import { ICONS } from '../lib/constants';

	let renamingId = $state<string | null>(null);
	let draft = $state('');

	function toggleVisibility(object: SceneObject) {
		sceneStore.toggleVisibility(object.id);
	}

	function toggleLock(object: SceneObject) {
		sceneStore.toggleLock(object.id);
	}

	function selectObject(object: SceneObject) {
		if (object.locked) return;
		sceneStore.selectObject(object.id);
	}

	function deleteObject(object: SceneObject) {
		sceneStore.deleteObject(object.id);
		timelineStore.removeKeyframesFor(object.id);
	}

	function startRename(object: SceneObject) {
		if (object.locked) return;
		renamingId = object.id;
		draft = object.name;
	}

	function commitRename() {
		if (renamingId && draft.trim()) sceneStore.renameObject(renamingId, draft);
		renamingId = null;
		draft = '';
	}

	function cancelRename() {
		renamingId = null;
		draft = '';
	}
</script>

{#if $uiStore.showOutliner}
	<div id="ob" role="tree" aria-label="Scene Objects" data-testid="outliner">
		<div class="ob-head">
			<span class="ob-title">Objects</span>
			<span class="ob-count">{$sceneStore.objects.length}</span>
		</div>

		<div class="ob-list">
			{#if $sceneStore.objects.length === 0}
				<div class="ob-empty">Empty. Use Model → Add.</div>
			{/if}

			{#each $sceneStore.objects as object (object.id)}
				<div
					class="ro"
					class:on={object.selected}
					class:locked={object.locked}
					data-testid="object-row"
				>
					{#if renamingId === object.id}
						<div class="ro-main">
							<span class="ro-icon" aria-hidden="true">{@html ICONS[iconForType(object.type)]}</span>
							<input
								class="ro-input"
								type="text"
								bind:value={draft}
								onblur={commitRename}
								onkeydown={(event) => {
									if (event.key === 'Enter') commitRename();
									if (event.key === 'Escape') cancelRename();
								}}
								aria-label="Rename {object.name}"
								data-testid="rename-input"
							/>
						</div>
					{:else}
						<button
							class="ro-main"
							onclick={() => selectObject(object)}
							ondblclick={() => startRename(object)}
							role="treeitem"
							aria-selected={object.selected}
							title={object.name}
							data-testid="object-name"
						>
							<span class="ro-icon" aria-hidden="true">{@html ICONS[iconForType(object.type)]}</span>
							<span class="ro-name">{object.name}</span>
						</button>
					{/if}

					<div class="ro-actions">
						<button
							class="ro-ib"
							onclick={() => toggleVisibility(object)}
							aria-label={object.visible ? 'Hide' : 'Show'}
							title={object.visible ? 'Hide' : 'Show'}
							data-testid="object-visibility"
						>
							{@html object.visible ? ICONS.eye : ICONS.eye_off}
						</button>
						<button
							class="ro-ib"
							class:on={object.locked}
							onclick={() => toggleLock(object)}
							aria-label={object.locked ? 'Unlock' : 'Lock'}
							aria-pressed={object.locked}
							title={object.locked ? 'Locked' : 'Lock the object'}
							data-testid="object-lock"
						>
							{@html ICONS.lock}
						</button>
						<button
							class="ro-ib danger"
							onclick={() => deleteObject(object)}
							aria-label="Delete"
							title="Delete"
							data-testid="object-delete"
						>
							{@html ICONS.trash}
						</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	:global(#ob) {
		position: absolute;
		right: 8px;
		top: 48px;
		width: 208px;
		max-height: min(55vh, calc(100% - var(--dh) - 60px));
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		border-radius: 12px;
		background: transparent;
		border: none;
		z-index: 10;
		overflow: hidden;
	}

	:global(#ob *) {
		box-sizing: border-box;
	}

	:global(.ob-head) {
		flex: none;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 10px;
		display: none;
	}

	:global(.ob-title) {
		font: 700 9.5px system-ui, -apple-system, sans-serif;
		color: var(--tx3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	:global(.ob-count) {
		font: 600 9.5px system-ui, -apple-system, sans-serif;
		color: var(--tx2);
	}

	:global(.ob-list) {
		flex: 1;
		min-height: 0;
		padding: 6px;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	:global(.ob-list::-webkit-scrollbar) {
		display: none;
	}

	:global(.ob-empty) {
		padding: 8px 2px;
		color: var(--tx3);
		font: 500 10px system-ui, -apple-system, sans-serif;
		text-align: center;
	}

	:global(.ro) {
		flex: none;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 0 6px 0 8px;
		border-radius: 8px;
	}

	:global(.ro.on) {
		background: rgba(61, 219, 176, 0.1);
	}

	:global(.ro.locked) {
		opacity: 0.6;
	}

	:global(.ro-main) {
		flex: 1;
		min-width: 0;
		height: 28px;
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--tx);
		text-align: left;
		cursor: pointer;
	}

	:global(.ro-icon) {
		flex: none;
		width: 15px;
		height: 15px;
		display: grid;
		place-items: center;
		color: var(--tx3);
	}

	:global(.ro-icon :global(svg)) {
		width: 15px;
		height: 15px;
	}

	:global(.ro.on .ro-icon) {
		color: var(--ac);
	}

	:global(.ro-name) {
		flex: 1;
		min-width: 0;
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.ro-input) {
		flex: 1;
		min-width: 0;
		height: 26px;
		padding: 0 6px;
		background: var(--bg2);
		border: 1px solid var(--ac);
		border-radius: 6px;
		color: var(--tx);
		font-size: 12px;
		outline: none;
	}

	:global(.ro-actions) {
		flex: none;
		display: flex;
		align-items: center;
		gap: 1px;
	}

	:global(.ro-ib) {
		flex: none;
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--tx2);
		cursor: pointer;
	}

	:global(.ro-ib :global(svg)) {
		width: 14px;
		height: 14px;
	}

	:global(.ro-ib:hover) {
		background: var(--bg3);
		color: var(--tx);
	}

	:global(.ro-ib.on) {
		color: #f59e0b;
	}

	:global(.ro-ib.danger:hover) {
		color: #ff7a6b;
	}
</style>
