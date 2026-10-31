import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_FREE_API_PROVIDERS,
	moveCard,
	createCustomProviderCard,
	resolveProvider,
} from '../src/lib/agentProviders';

describe('Agent Studio — Free API Providers, Reordering & Auto/Manual Routing', () => {
	it('preloads all 12 verified free API platform cards with valid links and models', () => {
		assert.equal(DEFAULT_FREE_API_PROVIDERS.length, 12);
		for (const card of DEFAULT_FREE_API_PROVIDERS) {
			assert.ok(card.platformUrl.startsWith('https://'), `Invalid platformUrl for ${card.id}`);
			assert.ok(card.endpointUrl.startsWith('https://'), `Invalid endpointUrl for ${card.id}`);
			assert.ok(card.model.length > 0, `Missing model for ${card.id}`);
			assert.equal(card.mode, 'auto');
			assert.equal(card.enabled, true);
		}
	});

	it('reorders cards up and down cleanly via moveCard', () => {
		const list = [...DEFAULT_FREE_API_PROVIDERS];
		const firstId = list[0].id;
		const secondId = list[1].id;
		const movedDown = moveCard(list, 0, 1);
		assert.equal(movedDown[0].id, secondId);
		assert.equal(movedDown[1].id, firstId);
		const movedBackUp = moveCard(movedDown, 1, -1);
		assert.equal(movedBackUp[0].id, firstId);
		assert.equal(movedBackUp[1].id, secondId);
	});

	it('creates custom provider cards and resolves Auto vs Manual routing', () => {
		const custom = createCustomProviderCard({
			name: 'My Custom Ollama',
			platformUrl: 'https://ollama.com',
			endpointUrl: 'http://localhost:11434/v1/chat/completions',
			model: 'llama3.3:70b',
			apiKey: 'sk-custom-test',
			mode: 'manual',
		});
		assert.equal(custom.custom, true);
		assert.equal(custom.name, 'My Custom Ollama');

		const list = [...DEFAULT_FREE_API_PROVIDERS.map((c) => ({ ...c })), custom];
		// In manual mode, picks the manual card
		const manualResolved = resolveProvider(list, 'manual');
		assert.equal(manualResolved?.id, custom.id);

		// In auto mode, picks the first card with an API key
		list[2].apiKey = 'sk-or-v1-test';
		const autoResolved = resolveProvider(list, 'auto');
		assert.equal(autoResolved?.id, list[2].id);
	});
});
