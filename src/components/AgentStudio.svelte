<script lang="ts">
	import { toolStore } from '../stores/tools';
	import { timelineStore } from '../stores/timeline';
	import {
		DEFAULT_FREE_API_PROVIDERS,
		resolveProvider,
		type ApiProviderCard,
		type AgentCreationMode,
		type RoutingMode,
	} from '../lib/agentProviders';

	let creationMode = $state<AgentCreationMode>('animation');
	let menuOpen = $state(false);
	let settingsOpen = $state(false);
	let slashOpen = $state(false);
	let globalRouting = $state<RoutingMode>('auto');
	let providers = $state<ApiProviderCard[]>([...DEFAULT_FREE_API_PROVIDERS]);
	let attachments = $state<{ name: string; ext: string }[]>([]);
	let fileInput: HTMLInputElement;

	const activeProvider = $derived(resolveProvider(providers, globalRouting));

	function clearPrompt() {
		toolStore.setAgentPrompt('');
	}

	function handleAttach(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (!input.files) return;
		for (const f of Array.from(input.files)) {
			const ext = (f.name.split('.').pop() || 'FILE').toUpperCase();
			attachments.push({ name: f.name, ext });
		}
		input.value = '';
	}

	function runPrompt() {
		toolStore.runAgent();
		if (creationMode === 'animation') timelineStore.setPlaying(true);
	}
</script>

<div id="agent-bar-wrap" data-testid="agent-studio-section" style="display:flex;">
	<!-- Top bar (1:1 clone of Agent Section UI – Agent.html) -->
	<div class="ag-clone-topbar" style="height:56px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1B2230;margin:0 -12px;padding:0 12px;flex:none">
		<button type="button" aria-label="Menu" onclick={() => (menuOpen = !menuOpen)} style="width:40px;height:40px;border-radius:12px;border:none;background:transparent;color:#E8ECF4;display:flex;align-items:center;justify-content:center">
			<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h16"></path></svg>
		</button>
		<div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px">
			<span style="width:7px;height:7px;border-radius:50%;background:#2EE6B6"></span>Agent
		</div>
		<button type="button" aria-label="New chat" onclick={clearPrompt} style="width:40px;height:40px;border-radius:12px;border:none;background:transparent;color:#E8ECF4;display:flex;align-items:center;justify-content:center">
			<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h8M16 4l4 4L8 20H4v-4z"></path></svg>
		</button>
	</div>

	<!-- Center content -->
	<div id="agent-hero-box" style="flex:1;overflow-y:auto;padding:24px 4px 0">
		<div id="agent-hero-title" style="font-size:20px;font-weight:600;letter-spacing:-.01em">What are we building?</div>
		<div id="agent-hero-sub" style="font-size:13.5px;line-height:1.5;color:#8A94A6;margin-top:6px">
			Describe an animation or a 3D asset. Type <span style="font-family:ui-monospace,monospace;color:#2EE6B6">/</span> for MCP and Skills.
		</div>

		<!-- Quick starters list -->
		<div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:#6F7A8E;margin:20px 4px 8px">TRY</div>
		<div style="background:#0F131B;border:1px solid #1E2533;border-radius:14px;overflow:hidden">
			<button type="button" onclick={() => { toolStore.setAgentPrompt('Spin the cube'); runPrompt(); }} style="width:100%;height:48px;padding:0 14px;border:none;border-bottom:1px solid #1A202C;background:transparent;color:#E8ECF4;display:flex;align-items:center;gap:12px;text-align:left">
				<svg class="ico" style="width:18px;height:18px;color:#2EE6B6;flex:none" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M10 8.5l5 3.5-5 3.5z"></path></svg>
				<span style="font-size:14px;color:#E8ECF4">Spin the cube</span>
				<svg class="ico" style="width:16px;height:16px;color:#5F6A7D;margin-left:auto" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
			</button>
			<button type="button" onclick={() => { toolStore.setAgentPrompt('Bouncing ball loop'); runPrompt(); }} style="width:100%;height:48px;padding:0 14px;border:none;border-bottom:1px solid #1A202C;background:transparent;color:#E8ECF4;display:flex;align-items:center;gap:12px;text-align:left">
				<svg class="ico" style="width:18px;height:18px;color:#2EE6B6;flex:none" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M10 8.5l5 3.5-5 3.5z"></path></svg>
				<span style="font-size:14px;color:#E8ECF4">Bouncing ball loop</span>
				<svg class="ico" style="width:16px;height:16px;color:#5F6A7D;margin-left:auto" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
			</button>
			<button type="button" onclick={() => { toolStore.setAgentPrompt('Low-poly tree'); runPrompt(); }} style="width:100%;height:48px;padding:0 14px;border:none;background:transparent;color:#E8ECF4;display:flex;align-items:center;gap:12px;text-align:left">
				<svg class="ico" style="width:18px;height:18px;color:#2EE6B6;flex:none" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5"></path></svg>
				<span style="font-size:14px;color:#E8ECF4">Low-poly tree</span>
				<svg class="ico" style="width:16px;height:16px;color:#5F6A7D;margin-left:auto" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
			</button>
		</div>

		<!-- Slash commands list -->
		<div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:#6F7A8E;margin:20px 4px 8px">COMMANDS</div>
		<div style="background:#0F131B;border:1px solid #1E2533;border-radius:14px;overflow:hidden">
			<button type="button" onclick={() => { toolStore.setAgentPrompt('/anim-director Orbit camera'); runPrompt(); }} style="width:100%;height:48px;padding:0 14px;border:none;border-bottom:1px solid #1A202C;background:transparent;color:#E8ECF4;display:flex;align-items:center;gap:10px;text-align:left">
				<span style="width:18px;text-align:center;font-family:ui-monospace,monospace;font-size:15px;color:#5F6A7D">/</span>
				<span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;color:#2EE6B6">/anim-director</span>
				<span style="font-size:12.5px;color:#8A94A6;margin-left:auto">Orbit camera</span>
			</button>
			<button type="button" onclick={() => { toolStore.setAgentPrompt('/rig-mcp Auto-rig'); runPrompt(); }} style="width:100%;height:48px;padding:0 14px;border:none;background:transparent;color:#E8ECF4;display:flex;align-items:center;gap:10px;text-align:left">
				<span style="width:18px;text-align:center;font-family:ui-monospace,monospace;font-size:15px;color:#5F6A7D">/</span>
				<span style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;color:#2EE6B6">/rig-mcp</span>
				<span style="font-size:12.5px;color:#8A94A6;margin-left:auto">Auto-rig</span>
			</button>
		</div>
	</div>

	<!-- Bottom composer -->
	<div style="flex:none;display:flex;flex-direction:column;gap:10px;padding-top:10px">
		<!-- Mode switch (outside the prompt box, clean pill) -->
		<div style="display:flex;gap:2px;background:#0F131B;border:1px solid #1E2533;border-radius:12px;padding:3px;align-self:flex-start">
			<button type="button" class="ag-mode-btn" class:on={creationMode === 'animation'} onclick={() => (creationMode = 'animation')} style="height:30px;padding:0 14px;border-radius:9px;border:none;background:{creationMode === 'animation' ? '#18222B' : 'transparent'};color:{creationMode === 'animation' ? '#2EE6B6' : '#8A94A6'};font-size:12.5px;font-weight:{creationMode === 'animation' ? '600' : '500'};display:flex;align-items:center;gap:6px">
				<svg class="ico" style="width:14px;height:14px" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M10 8.5l5 3.5-5 3.5z"></path></svg>
				Animation
			</button>
			<button type="button" class="ag-mode-btn" class:on={creationMode === 'asset'} onclick={() => (creationMode = 'asset')} style="height:30px;padding:0 14px;border-radius:9px;border:none;background:{creationMode === 'asset' ? '#18222B' : 'transparent'};color:{creationMode === 'asset' ? '#2EE6B6' : '#8A94A6'};font-size:12.5px;font-weight:{creationMode === 'asset' ? '600' : '500'};display:flex;align-items:center;gap:6px">
				<svg class="ico" style="width:14px;height:14px" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5"></path></svg>
				3D Asset
			</button>
		</div>

		<!-- Prompt box -->
		<div style="border:1px solid #2F5F57;background:#11151D;border-radius:22px;padding:12px 10px 8px 16px;position:relative">
			<button type="button" aria-label="Clear prompt" onclick={clearPrompt} style="position:absolute;top:6px;right:6px;width:36px;height:36px;border-radius:50%;border:none;background:transparent;color:#8A94A6;display:flex;align-items:center;justify-content:center">
				<svg class="ico" style="width:16px;height:16px" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>
			</button>
			<textarea
				id="agent-input"
				rows="2"
				data-testid="agent-prompt"
				value={$toolStore.agentPrompt}
				oninput={(e) => toolStore.setAgentPrompt((e.currentTarget as HTMLTextAreaElement).value)}
				style="width:100%;padding:0 34px 0 0;min-height:46px;font-size:15px;line-height:1.5;color:#E8ECF4;background:transparent;border:none;outline:none;resize:none;font-family:inherit"
				placeholder="Make the cube rotate 360° in 3 seconds and loop"
			></textarea>
			<div style="display:flex;align-items:center;margin:6px 0 0 -8px">
				<button type="button" aria-label="Add attachment" onclick={() => fileInput?.click()} style="width:38px;height:38px;border-radius:50%;border:none;background:transparent;color:#8A94A6;display:flex;align-items:center;justify-content:center">
					<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
				</button>
				<input bind:this={fileInput} type="file" multiple accept="*/*" style="display:none;" onchange={handleAttach} />
				<button type="button" aria-label="MCP and Skills" onclick={() => (slashOpen = !slashOpen)} style="width:38px;height:38px;border-radius:50%;border:none;background:transparent;color:#8A94A6;display:flex;align-items:center;justify-content:center;font-family:ui-monospace,monospace;font-size:17px">/</button>
				<button type="button" aria-label="Settings" onclick={() => (settingsOpen = true)} style="width:38px;height:38px;border-radius:50%;border:none;background:transparent;color:#8A94A6;display:flex;align-items:center;justify-content:center">
					<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"></path><circle cx="16" cy="7" r="2"></circle><circle cx="8" cy="17" r="2"></circle></svg>
				</button>
				<button type="button" aria-label="Choose model" onclick={() => (settingsOpen = true)} style="margin-left:auto;margin-right:8px;height:34px;padding:0 10px;border-radius:17px;border:none;background:transparent;color:#B4BCCB;font-size:13px;font-weight:500;display:flex;align-items:center;gap:7px">
					<span style="width:7px;height:7px;border-radius:50%;background:#2EE6B6"></span>
					<span>{activeProvider?.defaultModel || 'Auto'}</span>
					<svg class="ico" style="width:14px;height:14px;color:#6F7A8E" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
				</button>
				<button type="button" id="agent-send" aria-label="Send" onclick={runPrompt} data-testid="agent-send" style="width:40px;height:40px;border-radius:50%;border:none;background:#2EE6B6;color:#06231D;display:flex;align-items:center;justify-content:center">
					<svg class="ico" style="width:20px;height:20px;stroke-width:2.3" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"></path></svg>
				</button>
			</div>
		</div>
	</div>
</div>
