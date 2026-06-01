import { startTransition, useEffect, useRef, useState } from 'react';
import { AGENTS, type Agent } from '@ryfine/core/agents';
import { DEFAULT_MODEL, MODELS, PROVIDERS, type Provider } from '@ryfine/core/providers';
import { getSettings, saveSettings } from '../shared/storage';
import { DEFAULT_SETTINGS, type ContentMessage, type ContentResponse, type ExtensionBoostRequest, type ExtensionSettings, type PortBoostRequest, type PortBoostResponse } from '../shared/types';

type View = 'boost' | 'settings';
type Status = 'idle' | 'loading' | 'done' | 'error';

const EXTENSION_PROVIDERS = PROVIDERS.filter((provider) => provider.id !== 'browserai');
const SAVABLE_PROVIDERS = EXTENSION_PROVIDERS.filter((provider) => provider.requiresKey || provider.id === 'ollama');

function requiresCredential(provider: Provider): boolean {
  return PROVIDERS.find((item) => item.id === provider)?.requiresKey ?? false;
}

function getProviderLabel(provider: Provider): string {
  return PROVIDERS.find((item) => item.id === provider)?.label ?? provider;
}

export default function App() {
  const [view, setView] = useState<View>('boost');
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [tokens, setTokens] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    void getSettings().then((loadedSettings) => {
      setSettings(loadedSettings);
      setDraftSettings(loadedSettings);
    });

    void chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id) {
        return;
      }

      const message: ContentMessage = { type: 'GET_SELECTED_TEXT' };

      try {
        const response = await chrome.tabs.sendMessage(tab.id, message) as ContentResponse | undefined;
        if (response?.type === 'SELECTED_TEXT' && response.text.trim()) {
          startTransition(() => {
            setInput(response.text.trim());
          });
        }
      } catch {
        // Ignore tabs where the content script cannot be injected.
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, []);

  function persistBoostSetting(nextSettings: ExtensionSettings): void {
    setSettings(nextSettings);
    void saveSettings(nextSettings);
  }

  function handleAgentChange(agent: Agent): void {
    persistBoostSetting({ ...settings, agent });
  }

  function handleProviderChange(provider: Provider): void {
    const nextSettings = {
      ...settings,
      provider,
      model: DEFAULT_MODEL[provider],
    };
    persistBoostSetting(nextSettings);
    setError('');
  }

  function handleModelChange(model: string): void {
    const nextSettings = { ...settings, model };
    persistBoostSetting(nextSettings);
  }

  function openSettings(): void {
    setDraftSettings(settings);
    setView('settings');
  }

  async function handleBoost(): Promise<void> {
    const apiKey = settings.apiKeys[settings.provider] ?? '';

    if (settings.provider === 'browserai') {
      setStatus('error');
      setError('This provider is not available in the extension. Pick Ollama or a hosted provider.');
      return;
    }

    if (requiresCredential(settings.provider) && !apiKey.trim()) {
      setStatus('error');
      setError(`No credential configured for ${getProviderLabel(settings.provider)}. Open Settings.`);
      return;
    }

    if (!input.trim()) {
      setStatus('error');
      setError('Enter a prompt to boost.');
      return;
    }

    portRef.current?.disconnect();
    const port = chrome.runtime.connect({ name: 'boost' });
    portRef.current = port;

    const request: ExtensionBoostRequest = {
      promptText: input.trim(),
      provider: settings.provider,
      model: settings.model,
      apiKey,
      agent: settings.agent,
      customInstructions: settings.customInstructions || undefined,
    };
    const startMessage: PortBoostRequest = { type: 'START', request };

    setStatus('loading');
    setOutput('');
    setError('');
    setTokens(null);

    let accumulated = '';

    port.onMessage.addListener((message: PortBoostResponse) => {
      if (message.type === 'CHUNK') {
        accumulated += message.text;
        startTransition(() => {
          setOutput(accumulated);
        });
        return;
      }

      if (message.type === 'DONE') {
        setTokens(message.tokenUsage?.totalTokens ?? null);
        setStatus('done');
        port.disconnect();
        portRef.current = null;
        return;
      }

      setError(message.error);
      setStatus('error');
      port.disconnect();
      portRef.current = null;
    });

    port.postMessage(startMessage);
  }

  function handleCopy(): void {
    void navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    });
  }

  async function handleSaveSettings(): Promise<void> {
    await saveSettings(draftSettings);
    setSettings(draftSettings);
    setView('boost');
  }

  if (view === 'settings') {
    return (
      <div className="popup-shell">
        <div className="popup-card">
          <header className="popup-header">
            <div>
              <p className="eyebrow">Extension settings</p>
              <h1 className="popup-title">RyFine</h1>
            </div>
            <button className="ghost-button" type="button" onClick={() => setView('boost')}>
              Back
            </button>
          </header>

          <section className="panel stack-md">
            <div className="field-grid two-up">
              <label className="field stack-xs">
                <span className="field-label">Default provider</span>
                <select
                  className="select"
                  value={draftSettings.provider}
                  onChange={(event) => {
                    const provider = event.target.value as Provider;
                    setDraftSettings((current) => ({
                      ...current,
                      provider,
                      model: DEFAULT_MODEL[provider],
                    }));
                  }}
                >
                  {EXTENSION_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field stack-xs">
                <span className="field-label">Default model</span>
                <select
                  className="select"
                  value={draftSettings.model}
                  onChange={(event) => {
                    const model = event.target.value;
                    setDraftSettings((current) => ({ ...current, model }));
                  }}
                >
                  {MODELS[draftSettings.provider].map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="stack-sm">
              <p className="section-title">Credentials</p>
              {SAVABLE_PROVIDERS.map((provider) => (
                <label key={provider.id} className="field stack-xs">
                  <span className="field-label">
                    {provider.id === 'ollama' ? 'Ollama base URL' : provider.label}
                  </span>
                  <input
                    className="input"
                    type={provider.id === 'ollama' ? 'text' : 'password'}
                    placeholder={provider.placeholder}
                    value={draftSettings.apiKeys[provider.id] ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraftSettings((current) => ({
                        ...current,
                        apiKeys: {
                          ...current.apiKeys,
                          [provider.id]: value,
                        },
                      }));
                    }}
                  />
                </label>
              ))}
            </div>

            <label className="field stack-xs">
              <span className="field-label">Custom instructions</span>
              <textarea
                className="textarea compact"
                rows={4}
                placeholder="Bias the rewrite toward your house style, constraints, or response format."
                value={draftSettings.customInstructions}
                onChange={(event) => {
                  const customInstructions = event.target.value;
                  setDraftSettings((current) => ({ ...current, customInstructions }));
                }}
              />
            </label>

            <div className="callout">
              The extension supports Ollama and hosted providers.
            </div>

            <button className="primary-button" type="button" onClick={handleSaveSettings}>
              Save settings
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-shell">
      <div className="popup-card">
        <header className="popup-header">
          <div>
            <p className="eyebrow">Boost from any tab</p>
            <h1 className="popup-title">RyFine</h1>
          </div>

          <div className="header-actions">
            <label className="inline-select">
              <span className="sr-only">Agent</span>
              <select value={settings.agent} onChange={(event) => handleAgentChange(event.target.value as Agent)}>
                {AGENTS.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="ghost-button" type="button" onClick={openSettings}>
              Settings
            </button>
          </div>
        </header>

        <section className="panel stack-md">
          <div className="field-grid two-up">
            <label className="field stack-xs">
              <span className="field-label">Provider</span>
              <select className="select" value={settings.provider} onChange={(event) => handleProviderChange(event.target.value as Provider)}>
                {EXTENSION_PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field stack-xs">
              <span className="field-label">Model</span>
              <select className="select" value={settings.model} onChange={(event) => handleModelChange(event.target.value)}>
                {MODELS[settings.provider].map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field stack-xs">
            <span className="field-label">Prompt</span>
            <textarea
              className="textarea"
              rows={6}
              placeholder="Paste or type a rough prompt. Selected text from the current tab appears here when available."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary-button" type="button" disabled={status === 'loading'} onClick={() => void handleBoost()}>
            {status === 'loading' ? 'Boosting...' : 'Boost prompt'}
          </button>

          {output ? (
            <div className="output-panel stack-sm">
              <div className="output-copy">{output}</div>
              <div className="output-footer">
                <span className="meta-text">
                  {tokens !== null ? `${tokens.toLocaleString()} tokens` : 'Streaming complete'}
                </span>
                <button className="ghost-button small" type="button" onClick={handleCopy}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <footer className="popup-footer">
          <a className="footer-link" href="https://www.ryfine.app" target="_blank" rel="noreferrer">
            Open the full RyFine app
          </a>
        </footer>
      </div>
    </div>
  );
}