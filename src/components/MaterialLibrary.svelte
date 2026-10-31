<script lang="ts">
	import { MATERIAL_GROUPS, MATERIAL_PRESETS, thumbnailFor, type MaterialPreset } from '../lib/materials';
	import type { MaterialSlot } from '../lib/mesh';
	import { selectedObject, sceneStore } from '../stores/scene';
	import { uiStore } from '../stores/ui';

	const object = $derived($selectedObject);
	const marked = $derived($sceneStore.markedFaces);
	const hasPortion = $derived(Boolean($sceneStore.markedObjectId && marked.length));

	const activeSlotIndex = $derived.by(() => {
		if (!object?.geometry) return 0;
		if ($sceneStore.markedObjectId === object.id && marked.length) {
			return object.geometry.faceSlot[marked[0]] ?? 0;
		}
		return 0;
	});

	const slot = $derived(object?.geometry?.slots?.[activeSlotIndex] ?? null);

	function apply(preset: MaterialPreset) {
		if (!object) {
			uiStore.showToast('Select an object first.', 'warning');
			return;
		}
		sceneStore.applyMaterialPreset(object.id, preset.id);
		uiStore.showToast(
			hasPortion ? `${preset.name} applied to the marked portion.` : `${preset.name} applied.`,
			'success',
			2200,
		);
	}

	function patch(changes: Partial<MaterialSlot>) {
		if (!object || !slot) return;
		sceneStore.updateMaterialSlot(object.id, activeSlotIndex, changes);
	}

	function onUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !object) return;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = String(reader.result ?? '');
			if (!dataUrl) return;
			const name = file.name.replace(/\.[^.]+$/, '') || 'Image';
			sceneStore.applyMaterialImage(object.id, dataUrl, name);
			uiStore.showToast(`Image applied to ${object.name}.`, 'success', 2200);
			input.value = '';
		};
		reader.readAsDataURL(file);
	}

	function clearPortion() {
		sceneStore.clearPortion();
	}
</script>

<div class="ml" data-testid="material-library">
	<div class="ml-head">
		<span class="ml-title">Material &amp; Texture Library</span>
		{#if hasPortion}
			<span class="ml-badge" data-testid="library-portion">{marked.length} faces marked</span>
			<button class="ml-chip" onclick={clearPortion} data-testid="library-clear-portion">Clear</button>
		{/if}
		<label class="ml-chip ml-file">
			Upload image
			<input type="file" accept="image/*" onchange={onUpload} data-testid="library-upload" />
		</label>
	</div>

	{#each MATERIAL_GROUPS as group}
		<div class="ml-group">
			<div class="ml-group-name">{group}</div>
			<div class="ml-grid">
				{#each MATERIAL_PRESETS.filter((preset) => preset.group === group) as preset}
					<button
						class="ml-swatch"
						title={preset.name}
						onclick={() => apply(preset)}
						data-testid="preset-{preset.id}"
					>
						<img src={thumbnailFor(preset)} alt={preset.name} width="34" height="34" />
						<span>{preset.name}</span>
					</button>
				{/each}
			</div>
		</div>
	{/each}

	<div class="ml-sliders">
		<label class="ml-range">
			Base
			<input
				type="color"
				value={slot?.color ?? '#9aa3b8'}
				oninput={(event) => patch({ color: event.currentTarget.value })}
				data-testid="library-color"
			/>
		</label>
		<label class="ml-range">
			Metal
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={slot?.metalness ?? 0}
				oninput={(event) => patch({ metalness: Number(event.currentTarget.value) })}
				data-testid="library-metalness"
			/>
		</label>
		<label class="ml-range">
			Rough
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={slot?.roughness ?? 0.5}
				oninput={(event) => patch({ roughness: Number(event.currentTarget.value) })}
				data-testid="library-roughness"
			/>
		</label>
		<label class="ml-range">
			Repeat
			<input
				type="range"
				min="0.5"
				max="20"
				step="0.5"
				value={slot?.uvRepeat ?? 1}
				oninput={(event) => patch({ uvRepeat: Number(event.currentTarget.value) })}
				data-testid="library-uv-repeat"
			/>
		</label>
		<label class="ml-range">
			Glow
			<input
				type="range"
				min="0"
				max="4"
				step="0.05"
				value={slot?.emissiveStrength ?? 1}
				oninput={(event) => patch({ emissiveStrength: Number(event.currentTarget.value) })}
				data-testid="library-emissive"
			/>
		</label>
		<label class="ml-range">
			Fade
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={slot?.opacity ?? 1}
				oninput={(event) => patch({ opacity: Number(event.currentTarget.value) })}
				data-testid="library-opacity"
			/>
		</label>
	</div>
</div>

<style>
	.ml {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 6px 8px 8px;
		border-top: 1px solid var(--ln);
		background: var(--gl);
		max-height: 46vh;
		overflow-y: auto;
	}

	.ml-head {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.ml-title {
		color: var(--tx);
		font: 700 11.5px Inter, system-ui, sans-serif;
	}

	.ml-badge {
		padding: 2px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--ac) 22%, transparent);
		color: var(--ac);
		font: 700 10px Inter, system-ui, sans-serif;
	}

	.ml-chip {
		display: inline-flex;
		align-items: center;
		height: 24px;
		padding: 0 9px;
		border: 1px solid var(--ln);
		border-radius: 999px;
		background: var(--bg2);
		color: var(--tx2);
		font: 700 10.5px Inter, system-ui, sans-serif;
		cursor: pointer;
	}

	.ml-file input {
		display: none;
	}

	.ml-group-name {
		margin: 4px 0 3px;
		color: var(--tx2);
		font: 700 10px Inter, system-ui, sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.ml-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
		gap: 5px;
	}

	.ml-swatch {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 5px 3px;
		border: 1px solid var(--ln);
		border-radius: 10px;
		background: var(--bg2);
		color: var(--tx2);
		cursor: pointer;
	}

	.ml-swatch:hover {
		border-color: var(--ac);
		color: var(--tx);
	}

	.ml-swatch img {
		border-radius: 7px;
		display: block;
	}

	.ml-swatch span {
		font: 600 8.5px Inter, system-ui, sans-serif;
		text-align: center;
		line-height: 1.15;
	}

	.ml-sliders {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding-top: 4px;
		border-top: 1px solid var(--ln);
	}

	.ml-range {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--tx2);
		font: 700 10.5px Inter, system-ui, sans-serif;
	}

	.ml-range input[type='range'] {
		width: 78px;
	}

	.ml-range input[type='color'] {
		width: 26px;
		height: 22px;
		padding: 0;
		border: 1px solid var(--ln2);
		border-radius: 6px;
		background: var(--bg2);
	}
</style>
