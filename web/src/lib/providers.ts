export type Provider =
  | 'browserai'
  | 'ollama'
  | 'openrouter'
  | 'gemini'
  | 'groq'
  | 'anthropic'
  | 'openai'
  | 'deepseek';

export interface ProviderDef {
  id: Provider;
  label: string;
  tier: 'free' | 'paid';
  placeholder: string;
  requiresKey: boolean;
  /** Direct link to the provider's API key creation page. */
  keyUrl?: string;
  /**
   * Image / vision support:
   *  'yes'   – provider always accepts image content blocks
   *  'model' – depends on the specific model chosen (e.g. Ollama/OpenRouter)
   *  'no'    – provider does not support image input
   */
  visionSupport: 'yes' | 'model' | 'no';
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'browserai',  label: 'Browser AI', tier: 'free', placeholder: 'Runs in this browser with WebGPU', requiresKey: false, visionSupport: 'no' },
  { id: 'ollama',     label: 'Ollama',     tier: 'free', placeholder: 'http://localhost:11434', requiresKey: false, visionSupport: 'model', },
  { id: 'openrouter', label: 'OpenRouter', tier: 'free', placeholder: 'sk-or-...', requiresKey: true,  keyUrl: 'https://openrouter.ai/settings/keys',              visionSupport: 'model' },
  { id: 'gemini',     label: 'Gemini',     tier: 'free', placeholder: 'AIza...',   requiresKey: true,  keyUrl: 'https://aistudio.google.com/app/apikey',           visionSupport: 'yes' },
  { id: 'groq',       label: 'Groq',       tier: 'free', placeholder: 'gsk_...',   requiresKey: true,  keyUrl: 'https://console.groq.com/keys',                    visionSupport: 'no' },
  { id: 'anthropic',  label: 'Anthropic',  tier: 'paid', placeholder: 'sk-ant-...', requiresKey: true, keyUrl: 'https://console.anthropic.com/settings/keys',      visionSupport: 'yes' },
  { id: 'openai',     label: 'OpenAI',     tier: 'paid', placeholder: 'sk-...',    requiresKey: true,  keyUrl: 'https://platform.openai.com/api-keys',             visionSupport: 'yes' },
  { id: 'deepseek',   label: 'DeepSeek',   tier: 'paid', placeholder: 'sk-...',    requiresKey: true,  keyUrl: 'https://platform.deepseek.com/api_keys',           visionSupport: 'no' },
];

export const FREE_PROVIDERS = PROVIDERS.filter(provider => provider.tier === 'free');
export const PAID_PROVIDERS = PROVIDERS.filter(provider => provider.tier === 'paid');

export const MODELS: Record<Provider, { id: string; label: string }[]> = {
  browserai: [
    { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B' },
    { id: 'gemma3-1b-it-q4f16_1-MLC', label: 'Gemma 3 1B' },
    { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 0.5B' },
  ],
  ollama: [
    { id: 'llama3.3', label: 'Llama 3.3 70B' },
    { id: 'llama3.2', label: 'Llama 3.2 3B' },
    { id: 'qwen3:14b', label: 'Qwen3 14B' },
    { id: 'qwen2.5:7b', label: 'Qwen2.5 7B' },
    { id: 'mistral', label: 'Mistral 7B' },
    { id: 'phi4', label: 'Phi-4' },
    { id: 'gemma3:9b', label: 'Gemma 3 9B' },
    { id: 'deepseek-r1', label: 'DeepSeek R1' },
    { id: 'codellama', label: 'CodeLlama' },
  ],
  openrouter: [
    { id: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick (free)' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
    { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (free)' },
    { id: 'qwen/qwen3-14b:free', label: 'Qwen3 14B (free)' },
    { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (free)' },
    { id: 'microsoft/phi-4:free', label: 'Phi-4 (free)' },
    { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (free)' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (free tier)' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite (free tier)' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (free tier)' },
    { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B (free tier)' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 70B' },
    { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-4o-mini',  label: 'GPT-4o mini · $0.15/1M' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano · $0.10/1M' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini · $0.40/1M' },
    { id: 'gpt-4.1',      label: 'GPT-4.1 · $2/1M' },
    { id: 'gpt-4o',       label: 'GPT-4o · $2.50/1M' },
    { id: 'o4-mini',      label: 'o4-mini · reasoning' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek V3' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
  ],
};

export const DEFAULT_MODEL: Record<Provider, string> = {
  browserai: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  ollama: 'llama3.2',
  openrouter: 'meta-llama/llama-4-maverick:free',
  gemini: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
};

export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && PROVIDERS.some(provider => provider.id === value);
}
