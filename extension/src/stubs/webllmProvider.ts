export const WEB_LLM_MODELS: Array<{ id: string; label: string }> = [];

export interface BrowserAiStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  model: string | null;
  progress: number;
  text: string;
  error: string;
}

export interface BrowserAiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function getBrowserAiStatus(): BrowserAiStatus {
  return { state: 'idle', model: null, progress: 0, text: 'Not available', error: '' };
}

export function subscribeToBrowserAiStatus(listener: (status: BrowserAiStatus) => void) {
  listener(getBrowserAiStatus());
  return () => undefined;
}

export function isBrowserAiSupported() { return false; }

export function getBrowserAiSupportDetail() {
  return 'Browser AI is not available in the extension.';
}

export async function interruptBrowserAiGeneration() { /* no-op */ }

export async function boostWithBrowserAi(): Promise<BrowserAiTokenUsage | null> {
  throw new Error('This provider is not available in the extension.');
}
