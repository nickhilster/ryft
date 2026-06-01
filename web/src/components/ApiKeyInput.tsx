import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MODEL,
  FREE_PROVIDERS,
  MODELS,
  PAID_PROVIDERS,
  PROVIDERS,
  type Provider,
} from "../lib/providers";
import { probeProviderConnection } from "../lib/ryFine";
import {
  buildSetupScript,
  detectHardware,
  recommendModel,
  type HardwareProfile,
  type ModelRecommendation,
} from "../lib/hardwareDetect";
import {
  getBrowserAiSupportDetail,
  isBrowserAiSupported,
} from "../lib/webllmProvider";

interface Props {
  provider: Provider;
  apiKeys: Record<Provider, string>;
  model: string;
  onProviderChange: (p: Provider) => void;
  onApiKeyChange: (provider: Provider, key: string) => void;
  onModelChange: (model: string) => void;
  /** When true, always render the full editor (used inside the Settings panel). */
  embedded?: boolean;
}

type ConnectionStatus = "checking" | "active" | "inactive" | "ready";

interface HostedProbeState {
  provider: Provider;
  credential: string;
  status: Extract<ConnectionStatus, "checking" | "active" | "inactive">;
  detail: string;
  latencyMs: number | null;
}

const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";

export type DiscoveredEndpoint = {
  endpoint: string;
  latencyMs: number | null;
  active: boolean;
};

const OLLAMA_DISCOVERY_CANDIDATES = [
  "http://localhost:11434",
  "http://127.0.0.1:11434",
];

function normalizeOllamaEndpoint(endpoint: string | undefined): string {
  return (endpoint?.trim() || DEFAULT_OLLAMA_ENDPOINT).replace(/\/$/, "");
}

export function ApiKeyInput({
  provider,
  apiKeys,
  model,
  onProviderChange,
  onApiKeyChange,
  onModelChange,
  embedded = false,
}: Props) {
  const providerInfo = PROVIDERS.find((p) => p.id === provider)!;
  const currentKey = apiKeys[provider];
  const isOllama = provider === "ollama";
  const isBrowserAi = provider === "browserai";
  const hasConfig = !providerInfo.requiresKey || !!currentKey;
  const hasAnyKey = Object.values(apiKeys).some(Boolean);

  const [visible, setVisible] = useState(false);
  const [drafts, setDrafts] = useState<Record<Provider, string>>({
    ...apiKeys,
  });
  const [open, setOpen] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [ollamaConnectionStatus, setOllamaConnectionStatus] =
    useState<ConnectionStatus>("checking");
  const [ollamaConnectionDetail, setOllamaConnectionDetail] = useState(
    `Checking ${DEFAULT_OLLAMA_ENDPOINT}`,
  );
  const [hostedProbeState, setHostedProbeState] =
    useState<HostedProbeState | null>(null);
  // Ollama setup flow
  const [showSetup, setShowSetup] = useState(false);
  const [hwProfile, setHwProfile] = useState<HardwareProfile | null>(null);
  const [hwRec, setHwRec] = useState<ModelRecommendation | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [corsCopied, setCorsCopied] = useState(false);
  const [setupCopied, setSetupCopied] = useState(false);
  const [discoveringHosts, setDiscoveringHosts] = useState(false);
  const [discoveredEndpoints, setDiscoveredEndpoints] = useState<
    DiscoveredEndpoint[]
  >([]);
  const importRef = useRef<HTMLInputElement>(null);
  const modelChangeRef = useRef(onModelChange);
  const ollamaConnectionAbortRef = useRef<AbortController | null>(null);
  const hostedProbeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    modelChangeRef.current = onModelChange;
  }, [onModelChange]);

  const probeOllamaConnection = useCallback(
    async (endpointOverride?: string, syncModels = false) => {
      const base = normalizeOllamaEndpoint(endpointOverride ?? currentKey);

      ollamaConnectionAbortRef.current?.abort();
      const controller = new AbortController();
      ollamaConnectionAbortRef.current = controller;

      setOllamaConnectionStatus("checking");
      setOllamaConnectionDetail(`Checking ${base}`);

      const timeoutId = window.setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch(`${base}/api/tags`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Endpoint returned ${response.status}`);
        }

        const data = (await response.json()) as {
          models?: Array<{ name: string }>;
        };
        const names = (data.models ?? []).map((entry) => entry.name);

        setDetectedModels(names);

        if (syncModels && names.length > 0) {
          modelChangeRef.current(names[0]);
        }

        setOllamaConnectionStatus("active");
        setOllamaConnectionDetail(
          names.length > 0
            ? `${names.length} model${names.length === 1 ? "" : "s"} detected at ${base}`
            : `Endpoint reachable at ${base}`,
        );
        return names;
      } catch {
        if (ollamaConnectionAbortRef.current !== controller) {
          return [];
        }

        setDetectedModels([]);
        setOllamaConnectionStatus("inactive");
        setOllamaConnectionDetail(`No response from ${base}`);
        return [];
      } finally {
        window.clearTimeout(timeoutId);

        if (ollamaConnectionAbortRef.current === controller) {
          ollamaConnectionAbortRef.current = null;
        }
      }
    },
    [currentKey],
  );

  useEffect(() => {
    if (provider !== "ollama") {
      ollamaConnectionAbortRef.current?.abort();
      ollamaConnectionAbortRef.current = null;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void probeOllamaConnection(currentKey);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentKey, probeOllamaConnection, provider]);

  useEffect(
    () => () => {
      ollamaConnectionAbortRef.current?.abort();
      hostedProbeAbortRef.current?.abort();
    },
    [],
  );

  function switchProvider(p: Provider) {
    onProviderChange(p);
    onModelChange(DEFAULT_MODEL[p]);
    setVisible(false);
    setConfirmRemove(false);
  }

  function save() {
    onApiKeyChange(provider, drafts[provider].trim());
    if (!embedded) {
      setOpen(false);
    }
  }

  function handleDraftChange(val: string) {
    setDrafts((prev) => ({ ...prev, [provider]: val }));
    setConfirmRemove(false);
  }

  function removeKey() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    onApiKeyChange(provider, "");
    setDrafts((prev) => ({ ...prev, [provider]: "" }));
    setConfirmRemove(false);
    setHostedProbeState(null);
  }

  function exportKeys() {
    const blob = new Blob([JSON.stringify(apiKeys, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ryft-keys.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildRemoteOllamaSetupScript(
    endpoint: string,
    origin: string,
    useWindows: boolean,
  ) {
    if (!origin) {
      return "";
    }

    const command = useWindows
      ? `[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS","${origin}","User")\nollama serve`
      : `OLLAMA_ORIGINS="${origin}" ollama serve`;

    return `# Run this on the machine hosting Ollama:\n${command}\n\n# In Ryft on the other device, use this endpoint:\n${endpoint}`;
  }

  function copyRemoteOllamaSetup() {
    const endpoint = normalizeOllamaEndpoint(drafts.ollama);
    const origin = typeof location !== "undefined" ? location.origin : "";
    const script = buildRemoteOllamaSetupScript(
      endpoint,
      origin,
      navigator.userAgent.toLowerCase().includes("win"),
    );

    if (!script) {
      return;
    }

    void navigator.clipboard.writeText(script);
    setSetupCopied(true);
    setTimeout(() => setSetupCopied(false), 2500);
  }

  async function probeOllamaHost(
    endpoint: string,
  ): Promise<DiscoveredEndpoint> {
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(
        `${normalizeOllamaEndpoint(endpoint)}/api/tags`,
        {
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}`);
      }

      await response.json();
      return {
        endpoint: normalizeOllamaEndpoint(endpoint),
        latencyMs: Math.round(performance.now() - start),
        active: true,
      };
    } catch {
      return {
        endpoint: normalizeOllamaEndpoint(endpoint),
        latencyMs: null,
        active: false,
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  const detectOllamaHosts = useCallback(
    async (force = false) => {
      if (!force && discoveredEndpoints.length > 0) {
        return discoveredEndpoints;
      }

      setDiscoveringHosts(true);
      const results = await Promise.all(
        OLLAMA_DISCOVERY_CANDIDATES.map((endpoint) =>
          probeOllamaHost(endpoint),
        ),
      );

      setDiscoveredEndpoints(results);
      setDiscoveringHosts(false);
      return results;
    },
    [discoveredEndpoints],
  );

  useEffect(() => {
    if (provider !== "ollama" || !open) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void detectOllamaHosts();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [provider, open, detectOllamaHosts]);

  function importKeys(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const newDrafts = { ...drafts };
        for (const p of PROVIDERS) {
          if (typeof data[p.id] === "string" && data[p.id]) {
            onApiKeyChange(p.id, data[p.id]);
            newDrafts[p.id] = data[p.id];
          }
        }
        setDrafts(newDrafts);
      } catch {
        /* invalid JSON */
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function detectOllamaModels() {
    await probeOllamaConnection(drafts.ollama, true);
  }

  async function testHostedConnection() {
    const credential = drafts[provider].trim();
    if (!credential || isOllama) {
      return;
    }

    hostedProbeAbortRef.current?.abort();
    const controller = new AbortController();
    hostedProbeAbortRef.current = controller;

    setHostedProbeState({
      provider,
      credential,
      status: "checking",
      detail: `Testing ${providerInfo.label}...`,
      latencyMs: null,
    });

    const timeoutId = window.setTimeout(() => controller.abort(), 6000);

    try {
      const result = await probeProviderConnection(
        { provider, apiKey: credential },
        controller.signal,
      );
      setHostedProbeState({
        provider,
        credential,
        status: "active",
        detail: `${result.detail} in ${result.latencyMs} ms`,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      if (hostedProbeAbortRef.current !== controller) {
        return;
      }

      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Connection timed out"
          : error instanceof Error
            ? error.message
            : "Connection failed";

      setHostedProbeState({
        provider,
        credential,
        status: "inactive",
        detail: message,
        latencyMs: null,
      });
    } finally {
      window.clearTimeout(timeoutId);
      if (hostedProbeAbortRef.current === controller) {
        hostedProbeAbortRef.current = null;
      }
    }
  }

  const currentCredentialValue = isOllama
    ? normalizeOllamaEndpoint(open ? drafts.ollama : currentKey)
    : isBrowserAi
      ? ""
      : (open ? drafts[provider] : currentKey).trim();

  const matchingHostedProbe =
    !isOllama &&
    !isBrowserAi &&
    hostedProbeState?.provider === provider &&
    hostedProbeState.credential === currentCredentialValue
      ? hostedProbeState
      : null;

  const connectionState = isOllama
    ? {
        status: ollamaConnectionStatus,
        label:
          ollamaConnectionStatus === "checking"
            ? "Checking"
            : ollamaConnectionStatus === "active"
              ? "Active"
              : "Inactive",
        detail: ollamaConnectionDetail,
      }
    : isBrowserAi
      ? {
          status: isBrowserAiSupported()
            ? ("ready" as const)
            : ("inactive" as const),
          label: isBrowserAiSupported() ? "Ready" : "Unsupported",
          detail: getBrowserAiSupportDetail(),
        }
      : matchingHostedProbe
        ? {
            status: matchingHostedProbe.status,
            label:
              matchingHostedProbe.status === "checking"
                ? "Checking"
                : matchingHostedProbe.status === "active"
                  ? "Active"
                  : "Inactive",
            detail: matchingHostedProbe.detail,
          }
        : currentCredentialValue
          ? {
              status: "ready" as const,
              label: "Ready",
              detail: `${providerInfo.label} is configured. Run Test connection to verify live access.`,
            }
          : {
              status: "inactive" as const,
              label: "Inactive",
              detail: `Save a ${providerInfo.label} API key to activate this provider.`,
            };

  const ollamaModelAvailability = (() => {
    if (!isOllama) {
      return null;
    }

    const selectedModel = model.trim();
    if (ollamaConnectionStatus !== "active") {
      return {
        tone: "inactive",
        label: "Missing",
        detail: "Ollama is offline, so installed models cannot be checked.",
      };
    }

    if (detectedModels.length === 0) {
      return {
        tone: "warning",
        label: "Missing",
        detail: "No installed Ollama models were detected at this endpoint.",
      };
    }

    if (detectedModels.includes(selectedModel)) {
      return {
        tone: "active",
        label: "Installed",
        detail: `${selectedModel} is installed and ready to use.`,
      };
    }

    return {
      tone: "inactive",
      label: "Selected model not found",
      detail: `${selectedModel || "This model"} is not installed on the active Ollama endpoint.`,
    };
  })();

  const fallbackProviders =
    isOllama && ollamaConnectionStatus === "inactive"
      ? PROVIDERS.filter((candidate) => candidate.id !== "ollama")
          .sort(
            (left, right) =>
              Number(Boolean(apiKeys[right.id])) -
              Number(Boolean(apiKeys[left.id])),
          )
          .slice(0, 3)
      : [];

  function renderConnectionStatus(compact = false) {
    return (
      <div
        className={`connection-status ${compact ? "compact" : ""}`}
        role="status"
        aria-live="polite"
        title={connectionState.detail}
      >
        <span
          className={`connection-light status-${connectionState.status}`}
          aria-hidden="true"
        />
        <span className="connection-status-copy">
          <span className="connection-status-label">
            {connectionState.label}
          </span>
          {!compact && (
            <span className="connection-status-detail">
              {connectionState.detail}
            </span>
          )}
        </span>
      </div>
    );
  }

  // ── Collapsed ────────────────────────────────────────────────────
  if (!open && !embedded) {
    return (
      <div className="api-bar collapsed">
        <span className={`provider-badge tier-${providerInfo.tier}`}>
          {providerInfo.label}
        </span>
        {renderConnectionStatus(true)}
        {isOllama ? (
          <input
            className="model-text-input"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="model name"
            list="ollama-models-collapsed"
            title="Ollama model name"
          />
        ) : (
          <select
            className="model-select"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {MODELS[provider].map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        )}
        <datalist id="ollama-models-collapsed">
          {[
            ...MODELS.ollama,
            ...detectedModels.map((m) => ({ id: m, label: m })),
          ].map((m) => (
            <option key={m.id} value={m.id} />
          ))}
        </datalist>
        <button className="btn-ghost" onClick={() => setOpen(true)}>
          {hasConfig ? "Settings" : "⚠️ Add key"}
        </button>
        {hasAnyKey && (
          <button
            className="btn-ghost"
            onClick={exportKeys}
            title="Download keys as JSON"
          >
            Export keys
          </button>
        )}
      </div>
    );
  }

  // ── Expanded ─────────────────────────────────────────────────────
  return (
    <div className="api-bar expanded">
      <div className="provider-group">
        <span className="provider-group-label">Free</span>
        <div className="provider-pills">
          {FREE_PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={`provider-pill ${provider === p.id ? "active" : ""}`}
              onClick={() => switchProvider(p.id)}
            >
              {p.label}
              {(!p.requiresKey || apiKeys[p.id]) && (
                <span className="key-dot" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="provider-group group-divider">
        <span className="provider-group-label">Paid</span>
        <div className="provider-pills">
          {PAID_PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={`provider-pill ${provider === p.id ? "active" : ""}`}
              onClick={() => switchProvider(p.id)}
            >
              {p.label}
              {apiKeys[p.id] && <span className="key-dot" />}
            </button>
          ))}
        </div>
      </div>

      <div className="connection-status-row">
        <span className="api-label">Status</span>
        {renderConnectionStatus()}
      </div>

      {isOllama ? (
        <>
          <p className="ollama-note">
            Runs on your machine — no API key or account needed.
          </p>
          <div className="api-row">
            <label className="api-label">Endpoint</label>
            <input
              className="api-input"
              type="text"
              placeholder="http://localhost:11434"
              value={drafts.ollama}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
            />
            <button className="btn-primary" onClick={save}>
              Save
            </button>
            <button
              className="btn-ghost"
              onClick={copyRemoteOllamaSetup}
              disabled={!drafts.ollama.trim()}
            >
              {setupCopied ? "Copied!" : "Copy setup"}
            </button>
          </div>
          {discoveredEndpoints.length > 0 && (
            <div className="connection-card">
              <p className="connection-card-title">
                Detected active Ollama hosts
              </p>
              {discoveredEndpoints.filter((item) => item.active).length > 0 ? (
                discoveredEndpoints
                  .filter((item) => item.active)
                  .map((item) => (
                    <div key={item.endpoint} className="connection-card-entry">
                      <span>{item.endpoint}</span>
                      <button
                        className="btn-ghost small"
                        onClick={() => {
                          setDrafts((prev) => ({
                            ...prev,
                            ollama: item.endpoint,
                          }));
                          onApiKeyChange("ollama", item.endpoint);
                        }}
                      >
                        Use this host
                      </button>
                    </div>
                  ))
              ) : (
                <div className="connection-card-entry">
                  <span>No active local Ollama hosts were found.</span>
                  <button
                    className="btn-ghost small"
                    onClick={() => void detectOllamaHosts(true)}
                    disabled={discoveringHosts}
                  >
                    {discoveringHosts ? "Scanning…" : "Retry detection"}
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="api-row">
            <label className="api-label">Model</label>
            {detectedModels.length > 0 ? (
              <select
                className="model-select"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
              >
                {/* Keep the current value selectable even if not in detected list */}
                {!detectedModels.includes(model) && model && (
                  <option value={model}>{model}</option>
                )}
                {detectedModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  className="api-input"
                  type="text"
                  placeholder="llama3.2"
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  list="ollama-models-static"
                />
                <datalist id="ollama-models-static">
                  {MODELS.ollama.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </datalist>
              </>
            )}
            <button
              className="btn-ghost"
              onClick={detectOllamaModels}
              disabled={ollamaConnectionStatus === "checking"}
            >
              {ollamaConnectionStatus === "checking" ? "Detecting…" : "Detect"}
            </button>
          </div>
          {ollamaModelAvailability && (
            <div
              className="model-availability"
              title={ollamaModelAvailability.detail}
            >
              <span
                className={`availability-pill tone-${ollamaModelAvailability.tone}`}
              >
                {ollamaModelAvailability.label}
              </span>
              <span className="availability-detail">
                {ollamaModelAvailability.detail}
              </span>
            </div>
          )}
          {(() => {
            // Detect HTTPS→HTTP CORS mismatch: Ollama is likely running but
            // the browser is silently blocking requests from the https:// origin.
            const isHttpsPage =
              typeof location !== "undefined" && location.protocol === "https:";
            const ollamaIsHttp = normalizeOllamaEndpoint(
              drafts.ollama,
            ).startsWith("http://");
            const likelyCors =
              isOllama &&
              isHttpsPage &&
              ollamaIsHttp &&
              ollamaConnectionStatus === "inactive";
            const pageOrigin =
              typeof location !== "undefined" ? location.origin : "";
            const isWin = navigator.userAgent.toLowerCase().includes("win");
            const corsFixScript = isWin
              ? `# Run in PowerShell, then restart Ollama from the system tray:\n[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS","${pageOrigin}","User")`
              : `# Run in Terminal, then restart Ollama:\nOLLAMA_ORIGINS="${pageOrigin}" ollama serve`;
            return likelyCors ? (
              <div className="cors-card">
                <p className="cors-title">
                  Ollama is running but blocking this domain
                </p>
                <p className="cors-body">
                  Browsers require Ollama to explicitly allow{" "}
                  <code>{pageOrigin}</code> before accepting requests from it.
                  Set <code>OLLAMA_ORIGINS</code>, then restart Ollama:
                </p>
                <div className="setup-script-wrap">
                  <pre className="setup-script">{corsFixScript}</pre>
                  <button
                    className={`btn-ghost small setup-copy ${corsCopied ? "copied" : ""}`}
                    onClick={() => {
                      void navigator.clipboard.writeText(corsFixScript);
                      setCorsCopied(true);
                      setTimeout(() => setCorsCopied(false), 2500);
                    }}
                  >
                    {corsCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            ) : null;
          })()}

          {fallbackProviders.length > 0 && (
            <div className="fallback-card">
              {!showSetup ? (
                <>
                  <p>
                    Ollama looks offline. Use a cloud provider, or set up Ollama
                    on this device.
                  </p>
                  <div className="fallback-actions">
                    <button
                      className="btn-ghost small"
                      onClick={() => {
                        const profile = detectHardware();
                        const rec = recommendModel(profile);
                        setHwProfile(profile);
                        setHwRec(rec);
                        setShowSetup(true);
                      }}
                    >
                      Set up Ollama on this device →
                    </button>
                    {fallbackProviders.map((candidate) => (
                      <button
                        key={candidate.id}
                        className="btn-ghost small"
                        onClick={() => switchProvider(candidate.id)}
                      >
                        Try {candidate.label}
                        {apiKeys[candidate.id] ? "" : " setup"}
                      </button>
                    ))}
                  </div>
                </>
              ) : hwProfile && hwRec ? (
                <div className="setup-flow">
                  <div className="setup-header">
                    <span className="setup-title">Ollama setup</span>
                    <button
                      className="btn-ghost small"
                      onClick={() => setShowSetup(false)}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="setup-hw-grid">
                    <div className="setup-hw-item">
                      <span className="setup-hw-label">OS</span>
                      <span className="setup-hw-value">
                        {hwProfile.os === "unknown"
                          ? "Unknown"
                          : hwProfile.os.charAt(0).toUpperCase() +
                            hwProfile.os.slice(1)}
                      </span>
                    </div>
                    <div className="setup-hw-item">
                      <span className="setup-hw-label">CPU</span>
                      <span className="setup-hw-value">
                        {hwProfile.cpuCores} cores
                      </span>
                    </div>
                    <div className="setup-hw-item">
                      <span className="setup-hw-label">RAM</span>
                      <span className="setup-hw-value">
                        {hwProfile.ramGbApprox} GB
                        {hwProfile.ramCapped
                          ? " (browser cap — may be more)"
                          : ""}
                      </span>
                    </div>
                    {hwProfile.gpuRenderer && (
                      <div className="setup-hw-item setup-hw-gpu">
                        <span className="setup-hw-label">GPU</span>
                        <span className="setup-hw-value">
                          {hwProfile.gpuRenderer}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="setup-rec">
                    <span className="setup-rec-label">Recommended model</span>
                    <span className="setup-rec-model">{hwRec.label}</span>
                    <span className="setup-rec-reason">{hwRec.reason}</span>
                  </div>

                  <div className="setup-script-wrap">
                    <pre className="setup-script">
                      {buildSetupScript(hwProfile.os, hwRec.id)}
                    </pre>
                    <button
                      className={`btn-ghost small setup-copy ${scriptCopied ? "copied" : ""}`}
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          buildSetupScript(hwProfile.os, hwRec.id),
                        );
                        setScriptCopied(true);
                        setTimeout(() => setScriptCopied(false), 2500);
                        // Pre-fill the model field so it's ready when Ollama starts
                        onModelChange(hwRec.id);
                      }}
                    >
                      {scriptCopied ? "Copied!" : "Copy script"}
                    </button>
                  </div>

                  <p className="setup-hint">
                    Run this in a terminal, then come back — Ryft will detect
                    Ollama automatically when it starts.
                  </p>
                </div>
              ) : null}
            </div>
          )}
          <p className="api-note">
            Install Ollama at <strong>ollama.com</strong>, then run{" "}
            <code>ollama pull llama3.2</code>
          </p>
        </>
      ) : isBrowserAi ? (
        <>
          <p className="ollama-note">
            Runs on this device with WebGPU. No API key or cloud account
            required.
          </p>
          <div className="api-row">
            <label className="api-label">Model</label>
            <select
              className="model-select"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
            >
              {MODELS.browserai.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <p className="api-note">
            Browser AI downloads the selected model into the browser cache on
            first use. Recent Chrome or Edge builds with WebGPU work best.
          </p>
        </>
      ) : (
        <>
          <div className="api-row">
            <input
              className="api-input"
              type={visible ? "text" : "password"}
              placeholder={providerInfo.placeholder}
              value={drafts[provider]}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
            />
            <button className="btn-ghost" onClick={() => setVisible((v) => !v)}>
              {visible ? "Hide" : "Show"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => void testHostedConnection()}
              disabled={
                !drafts[provider].trim() ||
                connectionState.status === "checking"
              }
            >
              {connectionState.status === "checking"
                ? "Testing…"
                : "Test connection"}
            </button>
            <button className="btn-primary" onClick={save}>
              Save
            </button>
            {currentKey && (
              <button
                className={`btn-remove ${confirmRemove ? "confirming" : ""}`}
                onClick={removeKey}
                onBlur={() => setConfirmRemove(false)}
              >
                {confirmRemove ? "Confirm?" : "Remove"}
              </button>
            )}
          </div>
          <div className="api-row">
            <label className="api-label">Model</label>
            <select
              className="model-select"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
            >
              {MODELS[provider].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <p className="api-note">
            Keys stored in localStorage only · sent directly to{" "}
            {providerInfo.label}, never elsewhere
            {providerInfo.keyUrl && (
              <>
                {" "}
                ·{" "}
                <a
                  className="get-key-link"
                  href={providerInfo.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get key →
                </a>
              </>
            )}
          </p>
        </>
      )}

      <div className="key-file-row">
        <button className="btn-ghost small" onClick={exportKeys}>
          Export all keys
        </button>
        <button
          className="btn-ghost small"
          onClick={() => importRef.current?.click()}
        >
          Import from file
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={importKeys}
        />
      </div>
    </div>
  );
}
