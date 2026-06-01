import { type Agent } from '@ryfine/core/agents';
import { DEFAULT_MODEL, type Provider } from '@ryfine/core/providers';

export interface ExtensionSettings {
  provider: Provider;
  model: string;
  apiKeys: Partial<Record<Provider, string>>;
  agent: Agent;
  customInstructions: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: 'anthropic',
  model: DEFAULT_MODEL.anthropic,
  apiKeys: {},
  agent: 'auto',
  customInstructions: '',
};

export interface ExtensionBoostRequest {
  promptText: string;
  provider: Provider;
  apiKey: string;
  model: string;
  agent: Agent;
  customInstructions?: string;
}

export interface ExtensionBoostTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type PortBoostRequest = {
  type: 'START';
  request: ExtensionBoostRequest;
};

export type PortBoostResponse =
  | { type: 'CHUNK'; text: string }
  | { type: 'DONE'; tokenUsage: ExtensionBoostTokenUsage | null }
  | { type: 'ERROR'; error: string };

export type ContentMessage =
  | { type: 'INJECT_TEXT'; text: string }
  | { type: 'GET_SELECTED_TEXT' };

export type ContentResponse =
  | { type: 'SELECTED_TEXT'; text: string }
  | { type: 'INJECTED' };

export interface TabInfo {
  title?: string;
  url?: string;
}

/** Message sent from background → content script (or internal background use). */
export type BackgroundMessage =
  | { type: 'GET_TAB_CONTEXT' };

export type BackgroundResponse =
  | { type: 'TAB_CONTEXT'; tabs: TabInfo[] };