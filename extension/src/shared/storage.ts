import { DEFAULT_MODEL, MODELS, type Provider } from '@ryfine/core/providers';
import type { ExtensionSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'settings';
const UNSUPPORTED_EXTENSION_PROVIDERS = new Set<Provider>(['browserai']);

function normalizeSettings(settings: ExtensionSettings): ExtensionSettings {
  const provider = UNSUPPORTED_EXTENSION_PROVIDERS.has(settings.provider)
    ? DEFAULT_SETTINGS.provider
    : settings.provider;
  const availableModels = MODELS[provider];
  const model = availableModels.some((item) => item.id === settings.model)
    ? settings.model
    : DEFAULT_MODEL[provider];

  return {
    ...settings,
    provider,
    model,
  };
}

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;

  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiKeys: {
      ...DEFAULT_SETTINGS.apiKeys,
      ...(stored?.apiKeys ?? {}),
    },
  };
  const normalized = normalizeSettings(merged);

  if (
    normalized.provider !== merged.provider ||
    normalized.model !== merged.model
  ) {
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  }

  return normalized;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeSettings(settings) });
}

export function getApiKey(settings: ExtensionSettings): string {
  return settings.apiKeys[settings.provider] ?? '';
}