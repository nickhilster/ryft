import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVED_PROMPTS_STORAGE_KEY,
  createSavedPrompt,
  extractTemplateVariables,
  importSavedPrompts,
  loadSavedPrompts,
  renderTemplate,
  saveSavedPrompts,
} from '../src/lib/savedPrompts.ts';

class MemoryStorage {
  private values = new Map<string, string>();

  constructor(initialValues: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initialValues)) {
      this.values.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const timestamp = '2026-05-27T22:00:00.000Z';

describe('saved prompt helpers', () => {
  it('extracts unique template variables in first-seen order', () => {
    const variables = extractTemplateVariables(
      'Write for {{ client }} in a {{tone}} tone. Mention {{client}} and {{project_name}}.'
    );

    assert.deepEqual(variables, ['client', 'tone', 'project_name']);
  });

  it('renders supplied template variables and leaves missing values visible', () => {
    const rendered = renderTemplate(
      'Write for {{client}} in a {{tone}} tone about {{topic}}.',
      { client: 'Acme', tone: 'friendly' }
    );

    assert.equal(rendered, 'Write for Acme in a friendly tone about {{topic}}.');
  });

  it('falls back to an empty prompt library when storage is corrupt', () => {
    const storage = new MemoryStorage({ [SAVED_PROMPTS_STORAGE_KEY]: '{not-json' });

    assert.deepEqual(loadSavedPrompts(storage), []);
  });

  it('round-trips valid saved prompts through storage', () => {
    const storage = new MemoryStorage();
    const prompt = createSavedPrompt(
      {
        title: 'Launch brief',
        body: 'Draft a launch plan for {{product}}.',
        tags: ['planning', 'launch', 'planning'],
        notes: 'Reusable GTM prompt',
        provider: 'ollama',
        model: 'llama3.2',
        agent: 'planning',
        customBoostInstructions: 'Prefer crisp stakeholder language.',
      },
      { id: 'prompt-1', now: timestamp }
    );

    saveSavedPrompts([prompt], storage);

    assert.deepEqual(loadSavedPrompts(storage), [prompt]);
  });

  it('imports valid prompts, skips invalid prompts, and regenerates conflicting ids', () => {
    const existing = createSavedPrompt(
      {
        title: 'Existing',
        body: 'Existing body',
        tags: [],
        notes: '',
        provider: 'ollama',
        model: 'llama3.2',
        agent: 'general',
        customBoostInstructions: '',
      },
      { id: 'same-id', now: timestamp }
    );

    const importJson = JSON.stringify({
      version: 1,
      prompts: [
        {
          ...existing,
          title: 'Imported valid',
          body: 'Use {{client}} context',
        },
        {
          ...existing,
          id: 'invalid-provider',
          provider: 'unknown',
        },
      ],
    });

    const result = importSavedPrompts([existing], importJson, {
      idFactory: () => 'new-id',
      now: timestamp,
    });

    assert.equal(result.importedCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.prompts.length, 2);
    assert.equal(result.prompts[1].id, 'new-id');
    assert.equal(result.prompts[1].title, 'Imported valid');
  });
});
