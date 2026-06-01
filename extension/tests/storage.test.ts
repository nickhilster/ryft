import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL } from '@ryfine/core/providers';
import { getSettings, saveSettings } from '../src/shared/storage';
import { DEFAULT_SETTINGS } from '../src/shared/types';

beforeEach(() => {
  vi.mocked(chrome.storage.local.get).mockResolvedValue({});
  vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined);
});

describe('getSettings', () => {
  it('returns DEFAULT_SETTINGS when storage is empty', async () => {
    const settings = await getSettings();

    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a partial stored value with defaults', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      settings: { provider: 'openai', model: 'gpt-4o' },
    });

    const settings = await getSettings();

    expect(settings.provider).toBe('openai');
    expect(settings.model).toBe('gpt-4o');
    expect(settings.agent).toBe(DEFAULT_SETTINGS.agent);
    expect(settings.customInstructions).toBe(DEFAULT_SETTINGS.customInstructions);
  });

  it('normalizes unsupported saved providers to the extension default', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      settings: { provider: 'browserai', model: 'gemma-3n-e4b-it' },
    });

    const settings = await getSettings();

    expect(settings.provider).toBe(DEFAULT_SETTINGS.provider);
    expect(settings.model).toBe(DEFAULT_SETTINGS.model);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ settings });
  });
});

describe('saveSettings', () => {
  it('writes settings to chrome.storage.local under the settings key', async () => {
    const newSettings = {
      ...DEFAULT_SETTINGS,
      provider: 'gemini' as const,
      model: DEFAULT_MODEL.gemini,
    };

    await saveSettings(newSettings);

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ settings: newSettings });
  });
});