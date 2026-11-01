<script lang="ts">
	import { uiStore } from '../stores/ui';

	const toast = $derived($uiStore.toast);

	$effect(() => {
		const current = $uiStore.toast;
		if (!current) return;

		const id = setTimeout(() => uiStore.hideToast(), current.duration);
		return () => clearTimeout(id);
	});

	const background = $derived(
		toast?.type === 'error'
			? '#f87171'
			: toast?.type === 'warning'
				? '#fbbf24'
				: toast?.type === 'success'
					? '#34d399'
					: 'var(--tx)'
	);
</script>

{#if toast}
<div id="msg" role="alert" aria-live="polite" style="background: {background}">
	{toast.message}
</div>
{/if}

<style>
	:global(#msg) {
		position: absolute;
		left: 50%;
		top: 48px;
		transform: translateX(-50%);
		color: #0b0c10;
		padding: 7px 14px;
		border-radius: 14px;
		z-index: 20;
		max-width: min(86%, 360px);
		text-align: center;
		font-weight: 700;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
	}
</style>
