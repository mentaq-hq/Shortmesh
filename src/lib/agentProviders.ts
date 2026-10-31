// Free AI API Providers, Custom Card Builder, Auto/Manual Router, MCP & Skills
export type RoutingMode = 'auto' | 'manual';
export type AgentCreationMode = 'asset' | 'animation';

export interface ApiProviderCard {
	id: string;
	name: string;
	badge: string;
	platformUrl: string;
	modelUrl: string;
	endpointUrl: string;
	model: string;
	modelPresets: string[];
	apiKey: string;
	mode: RoutingMode;
	enabled: boolean;
	temperature: number;
	maxTokens: number;
	custom: boolean;
}

export interface McpServerCard {
	id: string;
	name: string;
	badge: string;
	platformUrl: string;
	endpointUrl: string;
	transport: string;
	authKey: string;
	mode: RoutingMode;
	enabled: boolean;
	custom: boolean;
}

export interface AgentSkillCard {
	id: string;
	name: string;
	targetMode: AgentCreationMode;
	mode: RoutingMode;
	enabled: boolean;
	instructions: string;
	custom: boolean;
}

export const DEFAULT_FREE_API_PROVIDERS: ApiProviderCard[] = [
	{
		id: 'google-ai-studio',
		name: 'Google AI Studio (Gemini API)',
		badge: 'Free Tier · Gemini 2.5 / 3.7 Flash',
		platformUrl: 'https://aistudio.google.com/apikey',
		modelUrl: 'https://ai.google.dev/gemini-api/docs/models',
		endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
		model: 'gemini-2.5-flash',
		modelPresets: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'groq-cloud',
		name: 'Groq Cloud (LPU Ultra-Fast)',
		badge: 'Free API Plan · gsk_',
		platformUrl: 'https://console.groq.com/keys',
		modelUrl: 'https://console.groq.com/docs/models',
		endpointUrl: 'https://api.groq.com/openai/v1/chat/completions',
		model: 'llama-3.3-70b-versatile',
		modelPresets: ['llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b', 'qwen-qwq-32b'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'openrouter',
		name: 'OpenRouter (25+ Free Models)',
		badge: 'Free :free Models · sk-or-',
		platformUrl: 'https://openrouter.ai/keys',
		modelUrl: 'https://openrouter.ai/models?q=:free',
		endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
		model: 'meta-llama/llama-3.3-70b-instruct:free',
		modelPresets: ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-r1:free'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'cerebras-cloud',
		name: 'Cerebras Cloud (Wafer-Scale)',
		badge: 'Free 1M Tokens/Day · csk-',
		platformUrl: 'https://cloud.cerebras.ai/',
		modelUrl: 'https://inference-docs.cerebras.ai/models/overview',
		endpointUrl: 'https://api.cerebras.ai/v1/chat/completions',
		model: 'llama-3.3-70b',
		modelPresets: ['llama-3.3-70b', 'llama3.1-8b', 'qwen-3-32b'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'nvidia-nim',
		name: 'NVIDIA NIM (NVIDIA Build)',
		badge: '1,000+ Free Credits · nvapi-',
		platformUrl: 'https://build.nvidia.com/settings/api-keys',
		modelUrl: 'https://build.nvidia.com/models',
		endpointUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
		model: 'meta/llama-3.3-70b-instruct',
		modelPresets: ['meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-r1'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'mistral-la-plateforme',
		name: 'Mistral AI (La Plateforme)',
		badge: 'Free Studio Tier · Codestral',
		platformUrl: 'https://console.mistral.ai/api-keys',
		modelUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/',
		endpointUrl: 'https://api.mistral.ai/v1/chat/completions',
		model: 'codestral-latest',
		modelPresets: ['codestral-latest', 'mistral-small-latest'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'huggingface-inference',
		name: 'Hugging Face Inference API',
		badge: 'Free Serverless Tier · hf_',
		platformUrl: 'https://huggingface.co/settings/tokens',
		modelUrl: 'https://huggingface.co/models?pipeline_tag=text-generation',
		endpointUrl: 'https://router.huggingface.co/v1/chat/completions',
		model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
		modelPresets: ['Qwen/Qwen2.5-Coder-32B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'cohere-trial',
		name: 'Cohere (Free Trial API)',
		badge: 'Free 1,000 Calls/Mo',
		platformUrl: 'https://dashboard.cohere.com/api-keys',
		modelUrl: 'https://docs.cohere.com/docs/models',
		endpointUrl: 'https://api.cohere.ai/compatibility/v1/chat/completions',
		model: 'command-r-plus-08-2024',
		modelPresets: ['command-r-plus-08-2024', 'command-a-03-2025'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'github-models',
		name: 'GitHub Models (Azure AI Free)',
		badge: 'Free via GitHub PAT',
		platformUrl: 'https://github.com/marketplace/models',
		modelUrl: 'https://github.com/marketplace/models',
		endpointUrl: 'https://models.inference.ai.azure.com/chat/completions',
		model: 'gpt-4o-mini',
		modelPresets: ['gpt-4o-mini', 'gpt-4o', 'DeepSeek-R1'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'together-ai',
		name: 'Together AI (Open Models)',
		badge: 'Free Turbo Endpoints',
		platformUrl: 'https://api.together.xyz/settings/api-keys',
		modelUrl: 'https://docs.together.ai/docs/serverless-models',
		endpointUrl: 'https://api.together.xyz/v1/chat/completions',
		model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
		modelPresets: ['meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'cloudflare-workers-ai',
		name: 'Cloudflare Workers AI',
		badge: '10,000 Free Neurons/Day',
		platformUrl: 'https://dash.cloudflare.com/',
		modelUrl: 'https://developers.cloudflare.com/workers-ai/models/',
		endpointUrl: 'https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1/chat/completions',
		model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
		modelPresets: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
	{
		id: 'deepseek-platform',
		name: 'DeepSeek / OpenAI Compatible',
		badge: 'Direct / Local Ollama Ready',
		platformUrl: 'https://platform.deepseek.com/api_keys',
		modelUrl: 'https://api-docs.deepseek.com/',
		endpointUrl: 'https://api.deepseek.com/v1/chat/completions',
		model: 'deepseek-chat',
		modelPresets: ['deepseek-chat', 'deepseek-reasoner'],
		apiKey: '',
		mode: 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: false,
	},
];

export function moveCard<T>(cards: T[], index: number, direction: -1 | 1): T[] {
	const target = index + direction;
	if (index < 0 || index >= cards.length || target < 0 || target >= cards.length) {
		return [...cards];
	}
	const copy = [...cards];
	const temp = copy[target];
	copy[target] = copy[index];
	copy[index] = temp;
	return copy;
}

export function createCustomProviderCard(input: {
	name: string;
	platformUrl: string;
	endpointUrl: string;
	model: string;
	apiKey?: string;
	modelUrl?: string;
	mode?: RoutingMode;
}): ApiProviderCard {
	return {
		id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		name: input.name.trim() || 'Custom AI Provider',
		badge: 'Custom Provider',
		platformUrl: input.platformUrl.trim() || 'https://openai.com',
		modelUrl: (input.modelUrl || input.platformUrl).trim() || 'https://openai.com',
		endpointUrl: input.endpointUrl.trim() || 'https://api.openai.com/v1/chat/completions',
		model: input.model.trim() || 'gpt-4o-mini',
		modelPresets: [input.model.trim() || 'gpt-4o-mini'],
		apiKey: (input.apiKey || '').trim(),
		mode: input.mode || 'auto',
		enabled: true,
		temperature: 0.4,
		maxTokens: 4096,
		custom: true,
	};
}

export function resolveProvider(
	cards: ApiProviderCard[],
	globalMode: RoutingMode = 'auto'
): ApiProviderCard | null {
	const enabled = cards.filter((c) => c.enabled);
	if (!enabled.length) return cards[0] || null;
	if (globalMode === 'manual') {
		return (
			enabled.find((c) => c.mode === 'manual') ||
			enabled.find((c) => c.apiKey.trim().length > 0) ||
			enabled[0]
		);
	}
	return (
		enabled.find((c) => c.mode === 'auto' && c.apiKey.trim().length > 0) ||
		enabled.find((c) => c.apiKey.trim().length > 0) ||
		enabled[0]
	);
}
