import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm';

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

export const WEB_LLM_MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B (Browser AI)' },
  { id: 'gemma3-1b-it-q4f16_1-MLC', label: 'Gemma 3 1B (Browser AI)' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 0.5B (Browser AI)' },
] as const;

// Per-model chatOpts overrides to fix known issues in web-llm prebuilt configs.
// gemma3: prebuilt config sets both context_window_size and sliding_window_size positive,
// which the MLC runtime rejects. Disabling sliding window fixes it.
const MODEL_CHAT_OVERRIDES: Partial<Record<string, Record<string, number>>> = {
  'gemma3-1b-it-q4f16_1-MLC': { sliding_window_size: -1 },
};

let engine: MLCEngineInterface | null = null;
let loadedModel: string | null = null;
let loadingPromise: Promise<MLCEngineInterface> | null = null;
let webLlmModulePromise: Promise<typeof import('@mlc-ai/web-llm')> | null = null;
let status: BrowserAiStatus = {
  state: 'idle',
  model: null,
  progress: 0,
  text: 'Browser AI idle',
  error: '',
};

const listeners = new Set<(status: BrowserAiStatus) => void>();

function emit(nextStatus: BrowserAiStatus) {
  status = nextStatus;
  listeners.forEach((listener) => listener(status));
}

function setProgress(model: string, report: InitProgressReport) {
  emit({
    state: 'loading',
    model,
    progress: report.progress,
    text: report.text,
    error: '',
  });
}

function loadWebLlmModule() {
  if (!webLlmModulePromise) {
    webLlmModulePromise = import('@mlc-ai/web-llm');
  }

  return webLlmModulePromise;
}

export function getBrowserAiStatus() {
  return status;
}

export function subscribeToBrowserAiStatus(listener: (status: BrowserAiStatus) => void) {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

export function isBrowserAiSupported() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function getBrowserAiSupportDetail() {
  return isBrowserAiSupported()
    ? 'WebGPU is available in this browser.'
    : 'WebGPU is unavailable. Use a recent Chrome or Edge build on a supported device.';
}

async function ensureBrowserAiEngine(model: string) {
  if (!isBrowserAiSupported()) {
    throw new Error(getBrowserAiSupportDetail());
  }

  if (engine && loadedModel === model) {
    return engine;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  const initProgressCallback = (report: InitProgressReport) => setProgress(model, report);

  loadingPromise = (async () => {
    try {
      const { CreateMLCEngine, prebuiltAppConfig } = await loadWebLlmModule();

      emit({
        state: 'loading',
        model,
        progress: 0,
        text: 'Preparing Browser AI model…',
        error: '',
      });

      const chatOpts = MODEL_CHAT_OVERRIDES[model];

      if (engine) {
        engine.setInitProgressCallback(initProgressCallback);
        await engine.reload(model, chatOpts);
      } else {
        // CreateMLCEngine's config type doesn't include chatOpts in v0.2.x —
        // create without it, then apply overrides via reload() which does
        // accept chatOpts and is a lightweight op when the model is already loaded.
        engine = await CreateMLCEngine(model, {
          appConfig: prebuiltAppConfig,
          initProgressCallback,
        });
        if (chatOpts) {
          await engine.reload(model, chatOpts);
        }
      }

      loadedModel = model;
      emit({
        state: 'ready',
        model,
        progress: 1,
        text: 'Browser AI model ready',
        error: '',
      });
      return engine;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Browser AI failed to load.';
      emit({
        state: 'error',
        model,
        progress: 0,
        text: 'Browser AI load failed',
        error: message,
      });
      throw error;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export async function interruptBrowserAiGeneration() {
  if (!engine) {
    return;
  }

  await engine.interruptGenerate();
}

export async function boostWithBrowserAi(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<BrowserAiTokenUsage | null> {
  const activeEngine = await ensureBrowserAiEngine(model);

  if (signal?.aborted) {
    await activeEngine.interruptGenerate();
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  const handleAbort = () => {
    void activeEngine.interruptGenerate();
  };

  signal?.addEventListener('abort', handleAbort, { once: true });

  try {
    const stream = await activeEngine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      stream_options: { include_usage: true },
      // Low temperature keeps small 1B models on-task (rewriting, not answering).
      temperature: 0.15,
      max_tokens: 2048,
    });

    let usage: BrowserAiTokenUsage | null = null;
    for await (const chunk of stream) {
      if (signal?.aborted) {
        await activeEngine.interruptGenerate();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        onChunk(delta);
      }

      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }
    }

    emit({
      state: 'ready',
      model,
      progress: 1,
      text: 'Browser AI model ready',
      error: '',
    });

    return usage;
  } finally {
    signal?.removeEventListener('abort', handleAbort);
  }
}
