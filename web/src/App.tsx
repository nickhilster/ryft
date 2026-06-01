import {
  Suspense,
  lazy,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useDeferredValue,
} from "react";
import {
  SeedOfLifeLogo,
  SeedOfLifeCenterpiece,
  type SolMode,
} from "./components/SeedOfLifeLogo";
import {
  detectOutputType,
  ryFine,
  type BoostTokenUsage,
  type RyFineRequest,
} from "@ryfine/core";
import {
  DEFAULT_MODEL,
  MODELS,
  PROVIDERS,
  type Provider,
} from "@ryfine/core";
import {
  type AppImage,
  extractPasteImage,
  formatImageSize,
  readImageFile,
} from "@ryfine/core";
import {
  buildFewShotExamples,
  createProject,
  createPromptRecord,
  formatRelativeTime,
  type Project,
  type PromptRecord,
} from "./lib/projects";
import {
  buildRepoContext,
  createRepoContextFile,
  getRepoContextPreview,
  getRepoContextSelectionStats,
  mergeRepoContextFiles,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_CHARS,
  MAX_UPLOAD_TOTAL_CHARS,
  type RepoContextFile,
} from "./lib/repoContext";
import { filterFilesForGitContext } from "./lib/gitFilter";
import { AGENTS } from "@ryfine/core";
import type { Agent } from "@ryfine/core";
import type { GitHubRepo } from "./lib/githubContext";
import {
  SAVED_PROMPTS_STORAGE_KEY,
  createSavedPrompt,
  importSavedPrompts,
  loadSavedPrompts,
  renderTemplate,
  saveSavedPrompts,
  serializeSavedPrompts,
  touchSavedPrompt,
  updateSavedPrompt,
  type ImportSavedPromptsResult,
  type SavedPromptDraft,
  type SavedPromptTemplate,
} from "./lib/savedPrompts";
import { AgentSelector } from "./components/AgentSelector";
import { QualityScore } from "./components/QualityScore";
import type { Command } from "./components/CommandPalette";
import type {
  PipelineTrace as PipelineTraceData,
  UserSkill,
} from "./lib/contextAssembler";
import { classifyIntent } from "./lib/intentClassifier";
import { isGibberish, getCatMessage } from "./lib/gibberishDetector";
import { EXAMPLE_PROMPTS, generatePersonalizedExamples, type ExamplePrompt } from "./lib/examples";
import { scorePrompt } from "./lib/promptScore";
import { getPipelineInvalidationKey } from "./lib/pipelineInvalidation";
import { loadUserSkills, saveUserSkills } from "./lib/userSkills";
import {
  getBrowserAiStatus,
  isBrowserAiSupported,
  subscribeToBrowserAiStatus,
} from "./lib/webllmProvider";
import "./App.css";

const LazyReactMarkdown = lazy(() => import("react-markdown"));
const LazyBoostMeta = lazy(() =>
  import("./components/BoostMeta").then((module) => ({
    default: module.BoostMeta,
  })),
);
const LazyApiKeyInput = lazy(() =>
  import("./components/ApiKeyInput").then((module) => ({
    default: module.ApiKeyInput,
  })),
);
const LazyCommandPalette = lazy(() =>
  import("./components/CommandPalette").then((module) => ({
    default: module.CommandPalette,
  })),
);
const LazyDiffView = lazy(() =>
  import("./components/DiffView").then((module) => ({
    default: module.DiffView,
  })),
);
const LazyIterationChain = lazy(() =>
  import("./components/IterationChain").then((module) => ({
    default: module.IterationChain,
  })),
);
const LazyPipelineTrace = lazy(() =>
  import("./components/PipelineTrace").then((module) => ({
    default: module.PipelineTrace,
  })),
);
const LazyPromptLibrary = lazy(() =>
  import("./components/PromptLibrary").then((module) => ({
    default: module.PromptLibrary,
  })),
);
const LazyGridDots = lazy(() =>
  import("./components/GridDots").then((module) => ({
    default: module.GridDots,
  })),
);
const loadProjectStorageModule = () => import("./lib/projectStorage");
const loadRepoContextStorageModule = () => import("./lib/repoContextStorage");
const loadGitHubContextModule = () => import("./lib/githubContext");
const LazySkillManager = lazy(() =>
  import("./components/SkillManager").then((module) => ({
    default: module.SkillManager,
  })),
);

const LS_PROVIDER = "ryft_provider";
const LS_MODEL = "ryft_model";
const LS_AGENT = "ryft_agent";
const LS_CUSTOM_INSTRUCTIONS = "ryft_custom_boost_instructions";
const LS_KEY = (provider: Provider) => `ryft_key_${provider}`;
const LS_THEME = "ryft_theme";
const LS_COMPARE_PROVIDER = "ryft_compare_provider";
const LS_COMPARE_MODEL = "ryft_compare_model";
const LS_ACTIVE_PROJECT_ID = "ryft_active_project_id";
const LS_ONBOARDING_DONE = "ryft_onboarding_done";
const LS_GITHUB_TOKEN = "ryft_github_token";
const LEGACY_API_KEY_PREFIX = "promptboost_key_";
const STORAGE_MIGRATION_FLAG = "ryft_storage_migration_v1";
const GITHUB_FILE_FETCH_CONCURRENCY = 20;

type AppTheme = "system" | "light" | "dark";
type CompareMode = "repo" | "models";
type GitHubConnectState =
  | "idle"
  | "awaiting_user"
  | "polling"
  | "picking_repo"
  | "loading_files"
  | "error";

const ALL_PROVIDERS = PROVIDERS.map((provider) => provider.id);

const LEGACY_STORAGE_KEYS: Record<string, string> = {
  promptboost_provider: LS_PROVIDER,
  promptboost_model: LS_MODEL,
  promptboost_agent: LS_AGENT,
  promptboost_custom_boost_instructions: LS_CUSTOM_INSTRUCTIONS,
  promptboost_saved_prompts_v1: SAVED_PROMPTS_STORAGE_KEY,
};

function migrateLegacyLocalStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const storage = window.localStorage;
    if (storage.getItem(STORAGE_MIGRATION_FLAG) === "true") {
      return;
    }

    for (const [legacyKey, nextKey] of Object.entries(LEGACY_STORAGE_KEYS)) {
      const legacyValue = storage.getItem(legacyKey);

      if (legacyValue !== null && storage.getItem(nextKey) === null) {
        storage.setItem(nextKey, legacyValue);
      }

      if (legacyValue !== null) {
        storage.removeItem(legacyKey);
      }
    }

    const legacyApiKeys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(LEGACY_API_KEY_PREFIX)) {
        legacyApiKeys.push(key);
      }
    }

    for (const legacyKey of legacyApiKeys) {
      const nextKey = legacyKey.replace(LEGACY_API_KEY_PREFIX, "ryft_key_");
      const legacyValue = storage.getItem(legacyKey);

      if (legacyValue !== null && storage.getItem(nextKey) === null) {
        storage.setItem(nextKey, legacyValue);
      }

      storage.removeItem(legacyKey);
    }

    storage.setItem(STORAGE_MIGRATION_FLAG, "true");
  } catch {
    // Ignore storage migration failures and let the app continue with fresh keys.
  }
}

migrateLegacyLocalStorage();

type BoostRunRequest = Omit<RyFineRequest, "apiKey">;
type BoostStatus = "idle" | "loading" | "done" | "error";
type CompareChoice = "baseline" | "repo";

interface BoostResult {
  output: string;
  status: BoostStatus;
  error: string;
  outputIsAnswer: boolean;
  durationMs: number | null;
  tokensUsed: BoostTokenUsage | null;
}

interface Iteration {
  id: string;
  instruction: string;
  result: BoostResult;
}

interface OutputMetrics {
  charCount: number;
  lineCount: number;
}

interface CompareSummary {
  identical: boolean;
  repoCharDelta: number;
  repoLineDelta: number;
}

interface RequestBudgetEstimate {
  promptChars: number;
  customInstructionChars: number;
  repoContextChars: number;
  totalChars: number;
  estimatedTokens: number;
  recommendedTokens: number;
  usageRatio: number;
  tone: "safe" | "watch" | "high";
  message: string;
}

interface GitHubDeviceSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
}

const CHARS_PER_TOKEN_ESTIMATE = 4;

const EMPTY_RESULT: BoostResult = {
  output: "",
  status: "idle",
  error: "",
  outputIsAnswer: false,
  durationMs: null,
  tokensUsed: null,
};

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "";
  }

  return durationMs < 1000
    ? `${durationMs} ms`
    : `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)} s`;
}

// Browser AI models have a 4096-token context window shared between
// input and output. Our system prompt + message wrapper use ~160 tokens
// and max_tokens=2048 is reserved for the completion, leaving ~1888
// for the user's prompt text. We warn at 70% = ~1320 tokens.
const BROWSER_AI_CONTEXT_WINDOW = 4096;
const BROWSER_AI_SYSTEM_OVERHEAD = 160; // BROWSER_AI_SYSTEM_PROMPT + wrapper
const BROWSER_AI_COMPLETION_RESERVE = 2048;
const BROWSER_AI_PROMPT_LIMIT =
  BROWSER_AI_CONTEXT_WINDOW -
  BROWSER_AI_SYSTEM_OVERHEAD -
  BROWSER_AI_COMPLETION_RESERVE; // ~1888

function getRecommendedTokenBudget(provider: Provider, model: string): number {
  if (provider === "browserai") {
    return BROWSER_AI_PROMPT_LIMIT;
  }

  if (provider !== "ollama") {
    return 16000;
  }

  if (/(70b|27b|14b)/i.test(model)) {
    return 12000;
  }

  if (/(3b|7b|8b|9b)/i.test(model)) {
    return 8000;
  }

  return 10000;
}

function getRequestBudgetEstimate(
  provider: Provider,
  model: string,
  promptText: string,
  repoContext: string,
  customInstructions: string,
): RequestBudgetEstimate {
  const promptChars = promptText.length;
  const customInstructionChars = customInstructions.trim().length;
  const repoContextChars = repoContext.length;

  // Browser AI strips repo context and custom rules before sending —
  // only the prompt text reaches the model. Estimate accordingly.
  const isBrowserAi = provider === "browserai";
  const effectiveChars = isBrowserAi
    ? promptChars
    : promptChars + customInstructionChars + repoContextChars;
  const totalChars = promptChars + customInstructionChars + repoContextChars;

  const estimatedTokens =
    effectiveChars === 0
      ? 0
      : Math.ceil(effectiveChars / CHARS_PER_TOKEN_ESTIMATE);
  const recommendedTokens = getRecommendedTokenBudget(provider, model);
  const usageRatio =
    recommendedTokens === 0
      ? 0
      : Math.min(estimatedTokens / recommendedTokens, 1);

  const hasStrippedContext =
    isBrowserAi && (repoContextChars > 0 || customInstructionChars > 0);
  const strippedNote = hasStrippedContext
    ? " Repo context and custom rules are not sent to Browser AI — only your prompt text."
    : "";

  if (estimatedTokens >= recommendedTokens) {
    return {
      promptChars,
      customInstructionChars,
      repoContextChars,
      totalChars,
      estimatedTokens,
      recommendedTokens,
      usageRatio,
      tone: "high",
      message: isBrowserAi
        ? `Your prompt is too long for this Browser AI model (${estimatedTokens.toLocaleString()} / ${recommendedTokens.toLocaleString()} available tokens). Shorten it to continue.${strippedNote}`
        : provider === "ollama"
          ? "This request may overload smaller local models or force truncation."
          : "This request is large enough that slower providers may respond more slowly or truncate context.",
    };
  }

  if (estimatedTokens >= recommendedTokens * 0.7) {
    return {
      promptChars,
      customInstructionChars,
      repoContextChars,
      totalChars,
      estimatedTokens,
      recommendedTokens,
      usageRatio,
      tone: "watch",
      message: isBrowserAi
        ? `Approaching the Browser AI prompt limit (${estimatedTokens.toLocaleString()} / ${recommendedTokens.toLocaleString()} tokens).${strippedNote}`
        : provider === "ollama"
          ? "You are approaching the comfortable range for smaller local models."
          : "This request is getting large; keep an eye on latency and output quality.",
    };
  }

  return {
    promptChars,
    customInstructionChars,
    repoContextChars,
    totalChars,
    estimatedTokens,
    recommendedTokens,
    usageRatio,
    tone: "safe",
    message: isBrowserAi
      ? `Request looks good.${strippedNote}`
      : provider === "ollama"
        ? "Request size looks comfortable for most local models."
        : "Request size looks healthy for a hosted boost.",
  };
}

function loadApiKeys(): Record<Provider, string> {
  return Object.fromEntries(
    ALL_PROVIDERS.map((provider) => [
      provider,
      localStorage.getItem(LS_KEY(provider)) ?? "",
    ]),
  ) as Record<Provider, string>;
}

function titleFromPrompt(prompt: string): string {
  const firstLine =
    prompt
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim() ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

function getOutputMetrics(output: string): OutputMetrics {
  const normalizedOutput = output.trim();

  return {
    charCount: output.length,
    lineCount: normalizedOutput
      ? normalizedOutput.split(/\r?\n/).filter((line) => line.trim().length > 0)
          .length
      : 0,
  };
}

function getCompareSummary(
  baselineOutput: string,
  repoOutput: string,
): CompareSummary | null {
  if (!baselineOutput || !repoOutput) {
    return null;
  }

  const baselineMetrics = getOutputMetrics(baselineOutput);
  const repoMetrics = getOutputMetrics(repoOutput);

  return {
    identical: baselineOutput.trim() === repoOutput.trim(),
    repoCharDelta: repoMetrics.charCount - baselineMetrics.charCount,
    repoLineDelta: repoMetrics.lineCount - baselineMetrics.lineCount,
  };
}

function formatCompareDelta(delta: number, unit: string): string {
  if (delta === 0) {
    return `the same ${unit} count`;
  }

  const absoluteDelta = Math.abs(delta);
  const label = absoluteDelta === 1 ? unit : `${unit}s`;

  return `${absoluteDelta.toLocaleString()} ${label} ${delta > 0 ? "longer" : "shorter"}`;
}

function useMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 720,
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 720);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isMobile;
}

type UrlDestination = { label: string; kind: 'url'; url: string };
type IdeDestination = { label: string; kind: 'ide'; uri: string; hint: string };
type OpenInDestination = UrlDestination | IdeDestination;

function getOpenInDestinations(output: string): OpenInDestination[] {
  const encodedOutput = encodeURIComponent(output);

  return [
    { label: "Claude",     kind: 'url', url: `https://claude.ai/new?q=${encodedOutput}` },
    { label: "ChatGPT",    kind: 'url', url: `https://chatgpt.com/?q=${encodedOutput}` },
    { label: "Perplexity", kind: 'url', url: `https://www.perplexity.ai/search?q=${encodedOutput}` },
    // IDE destinations — copy prompt to clipboard then launch via URI scheme.
    // App detection is not possible from a browser; all are always shown.
    { label: "VS Code",   kind: 'ide', uri: 'vscode://',    hint: 'Copies prompt to clipboard and opens VS Code — paste with Ctrl+V' },
    { label: "Cursor",    kind: 'ide', uri: 'cursor://',    hint: 'Copies prompt to clipboard and opens Cursor — paste with Ctrl+V' },
    { label: "Windsurf",  kind: 'ide', uri: 'windsurf://',  hint: 'Copies prompt to clipboard and opens Windsurf — paste with Ctrl+V' },
  ];
}

function renderHighlightedText(text: string, query: string, maxChars = 120) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return `${text.slice(0, maxChars)}${text.length > maxChars ? "…" : ""}`;
  }

  const normalizedText = text.toLowerCase();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return `${text.slice(0, maxChars)}${text.length > maxChars ? "…" : ""}`;
  }

  const previewStart = Math.max(0, matchIndex - 28);
  const previewEnd = Math.min(
    text.length,
    matchIndex + trimmedQuery.length + 60,
  );
  const prefix = previewStart > 0 ? "…" : "";
  const suffix = previewEnd < text.length ? "…" : "";
  const before = text.slice(previewStart, matchIndex);
  const match = text.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = text.slice(matchIndex + trimmedQuery.length, previewEnd);

  return (
    <>
      {prefix}
      {before}
      <mark>{match}</mark>
      {after}
      {suffix}
    </>
  );
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<TResult | null>,
): Promise<TResult[]> {
  const results: TResult[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const result = await mapper(items[currentIndex], currentIndex);
      if (result !== null) {
        results.push(result);
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export default function App() {
  const [provider, setProvider] = useState<Provider>(() => {
    const saved = localStorage.getItem(LS_PROVIDER) as Provider | null;
    if (saved) return saved;
    // First visit: prefer Browser AI when WebGPU is available, otherwise Ollama
    return isBrowserAiSupported() ? "browserai" : "ollama";
  });
  const [apiKeys, setApiKeys] = useState<Record<Provider, string>>(loadApiKeys);
  const [model, setModel] = useState(() => {
    const savedModel = localStorage.getItem(LS_MODEL);
    if (savedModel) return savedModel;
    const defaultProvider = isBrowserAiSupported() ? "browserai" : "ollama";
    return DEFAULT_MODEL[
      (localStorage.getItem(LS_PROVIDER) as Provider) ?? defaultProvider
    ];
  });
  const [agent, setAgent] = useState<Agent>(
    () => (localStorage.getItem(LS_AGENT) as Agent) ?? "auto",
  );
  const [customBoostInstructions, setCustomBoostInstructions] = useState(
    () => localStorage.getItem(LS_CUSTOM_INSTRUCTIONS) ?? "",
  );
  const [savedPrompts, setSavedPrompts] =
    useState<SavedPromptTemplate[]>(loadSavedPrompts);
  const [input, setInput] = useState("");
  const [singleInputSnapshot, setSingleInputSnapshot] = useState("");
  const [onboardingDone, setOnboardingDone] = useState(
    () => localStorage.getItem(LS_ONBOARDING_DONE) === "true",
  );
  // Personalized examples — start with static set, upgrade when Browser AI generates
  const [examples, setExamples] = useState<ExamplePrompt[]>(EXAMPLE_PROMPTS);
  const [examplesGenerating, setExamplesGenerating] = useState(false);
  // Tab titles forwarded by the RyFine browser extension (if installed)
  const [extensionTabTitles, setExtensionTabTitles] = useState<string[]>([]);
  const [singleResult, setSingleResult] = useState<BoostResult>(EMPTY_RESULT);
  const [compareBaselineResult, setCompareBaselineResult] =
    useState<BoostResult>(EMPTY_RESULT);
  const [compareRepoResult, setCompareRepoResult] =
    useState<BoostResult>(EMPTY_RESULT);
  const [lastTrace, setLastTrace] = useState<PipelineTraceData | null>(null);
  const [lastSystemPrompt, setLastSystemPrompt] = useState("");
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [outputMode, setOutputMode] = useState<"single" | "compare">("single");
  /** ID of the PromptRecord saved for the current singleResult (null if no active project). */
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [mobileTab, setMobileTab] = useState<"input" | "output">("input");
  const [dismissedClassificationPrimary, setDismissedClassificationPrimary] =
    useState<string | null>(null);
  const [catMessageActive, setCatMessageActive] = useState(false);
  const bypassCatRef = useRef(false);
  const [gridActive, setGridActive] = useState(false);
  const [ambientGridReady, setAmbientGridReady] = useState(false);
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [adjustInput, setAdjustInput] = useState("");
  const [selectedCompareResult, setSelectedCompareResult] =
    useState<CompareChoice | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const [repoContextFiles, setRepoContextFiles] = useState<RepoContextFile[]>(
    [],
  );
  const [repoContextUploadError, setRepoContextUploadError] = useState("");
  const [repoContextStorageError, setRepoContextStorageError] = useState("");
  const [repoContextLoaded, setRepoContextLoaded] = useState(false);
  const [previewedRepoFileId, setPreviewedRepoFileId] = useState<string | null>(
    null,
  );
  const [githubToken, setGitHubToken] = useState(
    () => localStorage.getItem(LS_GITHUB_TOKEN) ?? "",
  );
  const [githubRepos, setGitHubRepos] = useState<GitHubRepo[]>([]);
  const [githubRepoInput, setGitHubRepoInput] = useState("");
  const [githubFlowState, setGitHubFlowState] =
    useState<GitHubConnectState>("idle");
  const [githubDeviceSession, setGitHubDeviceSession] =
    useState<GitHubDeviceSession | null>(null);
  const [githubError, setGitHubError] = useState("");
  const [userSkills, setUserSkills] = useState<UserSkill[]>(loadUserSkills);
  const [openPanel, setOpenPanel] = useState<
    "rules" | "skills" | "context" | "library" | "settings" | "project" | null
  >(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [logoPopoverOpen, setLogoPopoverOpen] = useState(false);
  const logoPopoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [theme, setTheme] = useState<AppTheme>(
    () => (localStorage.getItem(LS_THEME) as AppTheme) ?? "system",
  );
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [compareProvider, setCompareProvider] = useState<Provider>(
    () =>
      (localStorage.getItem(LS_COMPARE_PROVIDER) as Provider | null) ??
      "openrouter",
  );
  const [compareModel, setCompareModel] = useState(
    () => localStorage.getItem(LS_COMPARE_MODEL) ?? DEFAULT_MODEL["openrouter"],
  );
  const [compareMode, setCompareMode] = useState<CompareMode>("repo");
  const [showModelB, setShowModelB] = useState(false);
  // Image attachment
  const [image, setImage] = useState<AppImage | null>(null);
  const [imageError, setImageError] = useState("");
  // Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectHistory, setProjectHistory] = useState<PromptRecord[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyGlobal, setHistoryGlobal] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<
    PromptRecord[]
  >([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [browserAiStatus, setBrowserAiStatus] = useState(getBrowserAiStatus);
  const abortRef = useRef<AbortController | null>(null);
  const githubAuthAbortRef = useRef<AbortController | null>(null);
  const repoFileInputRef = useRef<HTMLInputElement | null>(null);
  const repoFolderInputRef = useRef<HTMLInputElement | null>(null);
  const gitFolderInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const isMobile = useMobile();
  const githubClientId =
    (import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined)?.trim() ?? "";
  const deferredClassificationInput = useDeferredValue(input);

  useEffect(() => {
    let isDisposed = false;

    void loadRepoContextStorageModule()
      .then(({ loadPersistedRepoContextFiles }) => loadPersistedRepoContextFiles())
      .then((files) => {
        if (!isDisposed && files.length > 0) {
          setRepoContextFiles((previousFiles) =>
            mergeRepoContextFiles(files, previousFiles),
          );
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setRepoContextStorageError(
            "Could not restore repo context files from this browser.",
          );
        }
      })
      .finally(() => {
        if (!isDisposed) {
          setRepoContextLoaded(true);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    if (!repoContextLoaded) {
      return;
    }

    void loadRepoContextStorageModule()
      .then(({ savePersistedRepoContextFiles }) =>
        savePersistedRepoContextFiles(repoContextFiles),
      )
      .then(() => setRepoContextStorageError(""))
      .catch(() =>
        setRepoContextStorageError(
          "Could not save repo context files in this browser.",
        ),
      );
  }, [repoContextFiles, repoContextLoaded]);

  // Load projects on mount; restore active project from localStorage
  useEffect(() => {
    void loadProjectStorageModule()
      .then(({ loadProjects }) => loadProjects())
      .then((loaded) => {
        setProjects(loaded);
        const savedId = localStorage.getItem(LS_ACTIVE_PROJECT_ID);
        if (savedId) {
          const found = loaded.find((p) => p.id === savedId) ?? null;
          setActiveProject(found);
        }
      });
  }, []);

  // Load history whenever the active project changes or the project panel opens
  useEffect(() => {
    if (!activeProject) {
      return;
    }

    void loadProjectStorageModule()
      .then(({ getProjectHistory }) => getProjectHistory(activeProject.id))
      .then(setProjectHistory);
  }, [activeProject, openPanel]);

  useEffect(() => {
    if (!historyGlobal || !historySearch.trim()) {
      return;
    }

    let disposed = false;
    const timeoutId = window.setTimeout(() => {
      void loadProjectStorageModule()
        .then(({ searchAllRecords }) => searchAllRecords(historySearch.trim()))
        .then((results) => {
          if (!disposed) {
            setGlobalSearchResults(results);
          }
        });
    }, 180);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [historyGlobal, historySearch]);

  useEffect(() => {
    return subscribeToBrowserAiStatus(setBrowserAiStatus);
  }, []);

  // Ask the RyFine browser extension (if installed) for the user's open tab titles.
  // The content script relays the request to the background and posts the result back.
  useEffect(() => {
    if (onboardingDone) return;
    const handler = (event: MessageEvent<{ type?: string; tabs?: Array<{ title?: string }> }>) => {
      if (event.data?.type === "RYFINE_TAB_CONTEXT" && Array.isArray(event.data.tabs)) {
        const titles = event.data.tabs
          .map((t) => t.title ?? "")
          .filter(Boolean)
          .slice(0, 8);
        setExtensionTabTitles(titles);
      }
    };
    window.addEventListener("message", handler);
    // Fire the request — if the extension isn't installed the message is silently ignored
    window.postMessage({ type: "RYFINE_REQUEST_TAB_CONTEXT" }, window.location.origin);
    return () => window.removeEventListener("message", handler);
  }, [onboardingDone]);

  // When Browser AI is idle and we have context, generate personalized examples once.
  useEffect(() => {
    if (onboardingDone) return;
    if (browserAiStatus.state !== "idle") return;
    if (!browserAiStatus.model) return;
    if (examplesGenerating) return;

    setExamplesGenerating(true);
    void generatePersonalizedExamples(browserAiStatus.model, extensionTabTitles).then(
      (generated) => {
        if (generated) setExamples(generated);
        setExamplesGenerating(false);
      },
    );
  }, [browserAiStatus.state, browserAiStatus.model, extensionTabTitles, onboardingDone, examplesGenerating]);

  useEffect(() => {
    const scheduleAmbientGrid =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => setAmbientGridReady(true), {
            timeout: 1500,
          })
        : window.setTimeout(() => setAmbientGridReady(true), 900);

    return () => {
      if (typeof scheduleAmbientGrid === "number") {
        window.clearTimeout(scheduleAmbientGrid);
        return;
      }

      window.cancelIdleCallback?.(scheduleAmbientGrid);
    };
  }, []);

  useEffect(() => {
    if (!gridActive) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGridActive(false);
    }, 1400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [gridActive, input]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Elapsed-time counter — resets to 0 when loading stops
  useEffect(() => {
    if (openPanel !== "context" || !githubToken || githubRepos.length > 0) {
      return;
    }

    let disposed = false;
    void loadGitHubContextModule()
      .then(({ listGitHubRepos }) => listGitHubRepos(githubToken))
      .then((repos) => {
        if (!disposed) {
          setGitHubRepos(repos);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setGitHubError(
            error instanceof Error
              ? error.message
              : "Could not load GitHub repositories.",
          );
        }
      });

    return () => {
      disposed = true;
    };
  }, [githubRepos.length, githubToken, openPanel]);

  useEffect(() => {
    return () => {
      githubAuthAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const loading =
      singleResult.status === "loading" ||
      compareBaselineResult.status === "loading" ||
      compareRepoResult.status === "loading";

    if (!loading) {
      const resetId = window.setTimeout(() => setElapsedSecs(0), 0);
      return () => window.clearTimeout(resetId);
    }

    const resetId = window.setTimeout(() => setElapsedSecs(0), 0);
    const intervalId = window.setInterval(
      () => setElapsedSecs((s) => s + 1),
      1000,
    );

    return () => {
      window.clearTimeout(resetId);
      window.clearInterval(intervalId);
    };
  }, [
    singleResult.status,
    compareBaselineResult.status,
    compareRepoResult.status,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    localStorage.setItem(LS_THEME, theme);
  }, [theme]);

  function cycleTheme() {
    setTheme((prev) =>
      prev === "system" ? "light" : prev === "light" ? "dark" : "system",
    );
  }

  const classificationPreview = useMemo(() => {
    if (agent !== "auto") {
      return null;
    }

    const trimmedInput = deferredClassificationInput.trim();
    if (!trimmedInput) {
      return null;
    }

    return classifyIntent(trimmedInput);
  }, [agent, deferredClassificationInput]);

  const classificationDismissed = Boolean(
    classificationPreview?.primary &&
    dismissedClassificationPrimary === classificationPreview.primary,
  );

  const themeLabel = theme === "light" ? "☀" : theme === "dark" ? "☾" : null;
  const themeIcon =
    theme === "system" ? (
      <svg
        width="13"
        height="13"
        viewBox="0 0 13 13"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="6.5"
          cy="6.5"
          r="5.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M6.5 1a5.5 5.5 0 0 1 0 11V1z" fill="currentColor" />
      </svg>
    ) : (
      themeLabel
    );

  function persistSavedPrompts(prompts: SavedPromptTemplate[]) {
    setSavedPrompts(prompts);
    saveSavedPrompts(prompts);
  }

  const resetCompareResults = useCallback(() => {
    setCompareBaselineResult(EMPTY_RESULT);
    setCompareRepoResult(EMPTY_RESULT);
    setSelectedCompareResult(null);
  }, []);

  const resetPipelineTraceState = useCallback(() => {
    setLastTrace(null);
    setLastSystemPrompt("");
    setTraceExpanded(false);
  }, []);

  const resetTransientOutputState = useCallback(() => {
    setIterations([]);
    setAdjustInput("");
    setShowDiff(false);
    setCatMessageActive(false);
    resetPipelineTraceState();
  }, [resetPipelineTraceState]);

  const invalidatePipelineResults = useCallback(() => {
    abortRef.current?.abort();
    setSingleResult(EMPTY_RESULT);
    setSingleInputSnapshot("");
    resetCompareResults();
    resetTransientOutputState();
  }, [resetCompareResults, resetTransientOutputState]);

  const hasMountedPipelineInputs = useRef(false);
  const pipelineInvalidationKey = getPipelineInvalidationKey(
    activeProject?.id ?? null,
  );

  useEffect(() => {
    if (!hasMountedPipelineInputs.current) {
      hasMountedPipelineInputs.current = true;
      return;
    }

    invalidatePipelineResults();
  }, [
    agent,
    customBoostInstructions,
    image,
    input,
    invalidatePipelineResults,
    model,
    provider,
    pipelineInvalidationKey,
    repoContextFiles,
    userSkills,
  ]);

  function handleInputChange(nextInput: string) {
    setInput(nextInput);
    if (!nextInput.length) {
      setGridActive(false);
      return;
    }

    setGridActive(true);
  }

  function handleProviderChange(nextProvider: Provider) {
    setProvider(nextProvider);
    localStorage.setItem(LS_PROVIDER, nextProvider);
  }

  function handleApiKeyChange(nextProvider: Provider, key: string) {
    setApiKeys((previousKeys) => ({ ...previousKeys, [nextProvider]: key }));
    localStorage.setItem(LS_KEY(nextProvider), key);
  }

  function handleModelChange(nextModel: string) {
    setModel(nextModel);
    localStorage.setItem(LS_MODEL, nextModel);
  }

  function handleAgentChange(nextAgent: Agent) {
    setAgent(nextAgent);
    localStorage.setItem(LS_AGENT, nextAgent);
  }

  function handleCustomBoostInstructionsChange(nextInstructions: string) {
    setCustomBoostInstructions(nextInstructions);
    localStorage.setItem(LS_CUSTOM_INSTRUCTIONS, nextInstructions);
  }

  function handleCompareBProviderChange(next: Provider) {
    setCompareProvider(next);
    const nextModel = DEFAULT_MODEL[next];
    setCompareModel(nextModel);
    localStorage.setItem(LS_COMPARE_PROVIDER, next);
    localStorage.setItem(LS_COMPARE_MODEL, nextModel);
  }

  function handleCompareBModelChange(next: string) {
    setCompareModel(next);
    localStorage.setItem(LS_COMPARE_MODEL, next);
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    const project = createProject(newProjectName, newProjectDesc);
    const { saveProject } = await loadProjectStorageModule();
    await saveProject(project);
    const updated = [project, ...projects];
    setProjects(updated);
    setActiveProject(project);
    localStorage.setItem(LS_ACTIVE_PROJECT_ID, project.id);
    setNewProjectName("");
    setNewProjectDesc("");
    setShowNewProjectForm(false);
  }

  function handleSelectProject(project: Project | null) {
    setActiveProject(project);
    localStorage.setItem(LS_ACTIVE_PROJECT_ID, project?.id ?? "");
    setProjectHistory([]);
  }

  async function handleDeleteProject(project: Project) {
    const { deleteProject } = await loadProjectStorageModule();
    await deleteProject(project.id);
    const updated = projects.filter((p) => p.id !== project.id);
    setProjects(updated);
    if (activeProject?.id === project.id) {
      setActiveProject(null);
      localStorage.removeItem(LS_ACTIVE_PROJECT_ID);
    }
  }

  function applyPromptSettings(
    prompt: Pick<
      SavedPromptTemplate,
      "provider" | "model" | "agent" | "customBoostInstructions"
    >,
  ) {
    handleProviderChange(prompt.provider);
    handleModelChange(prompt.model);
    handleAgentChange(prompt.agent);
    handleCustomBoostInstructionsChange(prompt.customBoostInstructions);
  }

  function markPromptUsed(promptId: string) {
    persistSavedPrompts(
      savedPrompts.map((prompt) =>
        prompt.id === promptId ? touchSavedPrompt(prompt) : prompt,
      ),
    );
    resetCompareResults();
    setOutputMode("single");
  }

  async function pasteInput() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleInputChange(text);
      }
    } catch {
      /* clipboard permission denied */
    }
  }

  async function handleRepoFilesSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const inputElement = event.target;
    const selectedFiles = Array.from(inputElement.files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    const nextFiles: RepoContextFile[] = [];
    const failedFiles: string[] = [];
    let skippedLarge = 0;
    let runningChars = 0;
    let hitTotalLimit = false;

    for (const file of selectedFiles) {
      // Stop adding once we'd exceed the total stored file limit
      if (nextFiles.length >= MAX_UPLOAD_FILES) {
        hitTotalLimit = true;
        break;
      }

      try {
        const content = await file.text();

        // Skip individual files that are too large
        if (content.length > MAX_UPLOAD_FILE_CHARS) {
          skippedLarge++;
          continue;
        }

        // Stop if adding this file would exceed the total char budget
        if (runningChars + content.length > MAX_UPLOAD_TOTAL_CHARS) {
          hitTotalLimit = true;
          break;
        }

        runningChars += content.length;
        const path = file.webkitRelativePath || file.name;
        nextFiles.push(
          createRepoContextFile({
            id: `${path}:${file.lastModified}:${file.size}`,
            name: file.name,
            path,
            content,
          }),
        );
      } catch {
        failedFiles.push(file.name);
      }
    }

    if (nextFiles.length > 0) {
      setRepoContextFiles((previousFiles) =>
        mergeRepoContextFiles(previousFiles, nextFiles),
      );
    }

    const warnings: string[] = [];
    if (failedFiles.length > 0) {
      warnings.push(
        `Could not read ${failedFiles.length} file${failedFiles.length === 1 ? "" : "s"}: ${failedFiles.slice(0, 3).join(", ")}${failedFiles.length > 3 ? "…" : ""}`,
      );
    }
    if (skippedLarge > 0) {
      warnings.push(
        `Skipped ${skippedLarge} file${skippedLarge === 1 ? "" : "s"} over 100 KB`,
      );
    }
    if (hitTotalLimit) {
      warnings.push(`Stopped at ${MAX_UPLOAD_FILES} files / 5 MB limit`);
    }
    setRepoContextUploadError(warnings.join(" · "));

    inputElement.value = "";
  }

  async function handleGitFolderSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const inputElement = event.target;
    const allFiles = Array.from(inputElement.files ?? []);

    if (allFiles.length === 0) return;

    const {
      files: relevantFiles,
      totalCount,
      skippedCount,
      truncated,
    } = await filterFilesForGitContext(allFiles);

    const nextFiles: RepoContextFile[] = [];
    const failedFiles: string[] = [];
    let runningChars = 0;
    let hitCharLimit = false;

    for (const file of relevantFiles) {
      try {
        const content = await file.text();

        if (runningChars + content.length > MAX_UPLOAD_TOTAL_CHARS) {
          hitCharLimit = true;
          break;
        }

        runningChars += content.length;
        const path = file.webkitRelativePath || file.name;
        nextFiles.push(
          createRepoContextFile({
            id: `${path}:${file.lastModified}:${file.size}`,
            name: file.name,
            path,
            content,
          }),
        );
      } catch {
        failedFiles.push(file.name);
      }
    }

    if (nextFiles.length > 0) {
      setRepoContextFiles((previousFiles) =>
        mergeRepoContextFiles(previousFiles, nextFiles),
      );
    }

    const warnings: string[] = [];
    if (skippedCount > 0) {
      warnings.push(
        `Skipped ${skippedCount.toLocaleString()} of ${totalCount.toLocaleString()} (node_modules, build output, .gitignore, >500 KB files)`,
      );
    }
    if (truncated || hitCharLimit) {
      warnings.push(`Stopped at ${MAX_UPLOAD_FILES} files / 5 MB limit`);
    }
    if (failedFiles.length > 0) {
      warnings.push(
        `Could not read ${failedFiles.length} file${failedFiles.length === 1 ? "" : "s"}`,
      );
    }
    setRepoContextUploadError(
      warnings.length > 0
        ? `Loaded ${nextFiles.length} file${nextFiles.length === 1 ? "" : "s"} · ${warnings.join(" · ")}`
        : "",
    );

    inputElement.value = "";
  }

  async function refreshGitHubRepos(token = githubToken) {
    if (!token) {
      setGitHubRepos([]);
      return [];
    }

    const { listGitHubRepos } = await loadGitHubContextModule();
    const repos = await listGitHubRepos(token);
    setGitHubRepos(repos);
    return repos;
  }

  async function beginGitHubConnect() {
    if (!githubClientId) {
      return;
    }

    githubAuthAbortRef.current?.abort();
    const controller = new AbortController();
    githubAuthAbortRef.current = controller;

    setGitHubError("");
    setGitHubFlowState("awaiting_user");
    setGitHubRepoInput("");

    try {
      const { pollGitHubToken, startGitHubDeviceFlow } =
        await loadGitHubContextModule();
      const deviceSession = await startGitHubDeviceFlow(githubClientId);
      setGitHubDeviceSession({
        deviceCode: deviceSession.device_code,
        userCode: deviceSession.user_code,
        verificationUri: deviceSession.verification_uri,
        interval: deviceSession.interval,
      });
      setGitHubFlowState("polling");

      const token = await pollGitHubToken(
        githubClientId,
        deviceSession.device_code,
        deviceSession.interval,
        controller.signal,
      );

      localStorage.setItem(LS_GITHUB_TOKEN, token);
      setGitHubToken(token);
      setGitHubError("");
      setGitHubFlowState("picking_repo");
      setGitHubDeviceSession(null);
      await refreshGitHubRepos(token);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setGitHubFlowState("error");
      setGitHubError(
        error instanceof Error ? error.message : "Could not connect to GitHub.",
      );
    }
  }

  async function openGitHubRepoPicker() {
    if (!githubToken) {
      return;
    }

    setGitHubError("");
    setGitHubFlowState("picking_repo");
    if (githubRepos.length === 0) {
      try {
        await refreshGitHubRepos();
      } catch (error: unknown) {
        setGitHubFlowState("error");
        setGitHubError(
          error instanceof Error
            ? error.message
            : "Could not load GitHub repositories.",
        );
      }
    }
  }

  function disconnectGitHub() {
    githubAuthAbortRef.current?.abort();
    localStorage.removeItem(LS_GITHUB_TOKEN);
    setGitHubToken("");
    setGitHubRepos([]);
    setGitHubRepoInput("");
    setGitHubDeviceSession(null);
    setGitHubFlowState("idle");
    setGitHubError("");
  }

  async function importGitHubRepo(fullName: string) {
    if (!githubToken) {
      return;
    }

    const selectedRepo = githubRepos.find(
      (repo) => repo.full_name === fullName,
    );
    if (!selectedRepo) {
      setGitHubError("Choose a repository from the list.");
      return;
    }

    setGitHubError("");
    setGitHubFlowState("loading_files");

    try {
      const { fetchFileContent, fetchRepoTree } = await loadGitHubContextModule();
      const tree = await fetchRepoTree(
        githubToken,
        selectedRepo.full_name,
        selectedRepo.default_branch,
      );
      const nextFiles = await mapWithConcurrency(
        tree,
        GITHUB_FILE_FETCH_CONCURRENCY,
        async (file) => {
          try {
            const content = await fetchFileContent(
              githubToken,
              selectedRepo.full_name,
              file.path,
            );
            return createRepoContextFile({
              id: `github:${selectedRepo.full_name}:${file.path}`,
              name: file.path.split("/").pop() ?? file.path,
              path: `${selectedRepo.full_name}/${file.path}`,
              content,
            });
          } catch {
            return null;
          }
        },
      );

      if (nextFiles.length > 0) {
        setRepoContextFiles((previousFiles) =>
          mergeRepoContextFiles(previousFiles, nextFiles),
        );
        setRepoContextUploadError(
          `Loaded ${nextFiles.length.toLocaleString()} GitHub file${nextFiles.length === 1 ? "" : "s"} from ${selectedRepo.full_name}.`,
        );
      } else {
        setRepoContextUploadError(
          `No importable text files were found in ${selectedRepo.full_name}.`,
        );
      }

      setGitHubFlowState("picking_repo");
      setOpenPanel("context");
    } catch (error: unknown) {
      setGitHubFlowState("error");
      setGitHubError(
        error instanceof Error
          ? error.message
          : "Could not import files from GitHub.",
      );
    }
  }

  function handleRepoFileIncludeChange(fileId: string, included: boolean) {
    setRepoContextFiles((previousFiles) =>
      previousFiles.map((file) =>
        file.id === fileId ? { ...file, included } : file,
      ),
    );
  }

  function handleRepoFileRemove(fileId: string) {
    setRepoContextFiles((previousFiles) =>
      previousFiles.filter((file) => file.id !== fileId),
    );
    setPreviewedRepoFileId((currentFileId) =>
      currentFileId === fileId ? null : currentFileId,
    );
  }

  function clearRepoContextFiles() {
    setRepoContextFiles([]);
    setRepoContextUploadError("");
    setPreviewedRepoFileId(null);
    if (repoFileInputRef.current) {
      repoFileInputRef.current.value = "";
    }
  }

  function copyText(value: string, target: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedTarget(target);
      setTimeout(() => {
        setCopiedTarget((currentTarget) =>
          currentTarget === target ? null : currentTarget,
        );
      }, 2000);
    });
  }

  function getCompareResult(choice: CompareChoice) {
    return choice === "baseline" ? compareBaselineResult : compareRepoResult;
  }

  function copySelectedCompareResult() {
    if (!selectedCompareResult) {
      return;
    }

    const selectedResult = getCompareResult(selectedCompareResult);
    if (!selectedResult.output) {
      return;
    }

    copyText(selectedResult.output, "compare-selected");
  }

  function useSelectedCompareResult() {
    if (!selectedCompareResult) {
      return;
    }

    const selectedResult = getCompareResult(selectedCompareResult);
    if (!selectedResult.output) {
      return;
    }

    setSingleResult({ ...selectedResult });
    setSingleInputSnapshot(input);
    setOutputMode("single");
    resetTransientOutputState();
    setCopiedTarget(null);
    setSelectedCompareResult(null);
    if (isMobile) {
      setMobileTab("output");
    }
  }

  const executeBoostRequest = useCallback(
    async (
      request: BoostRunRequest,
      setResult: React.Dispatch<React.SetStateAction<BoostResult>>,
      controller: AbortController,
      activeProjectRef?: Project | null,
      inputText?: string,
      attachedImage?: AppImage | null,
      onTrace?: (trace: PipelineTraceData) => void,
    ) => {
      const providerInfo = PROVIDERS.find(
        (item) => item.id === request.provider,
      )!;
      const key = apiKeys[request.provider];

      if (providerInfo.requiresKey && !key) {
        const errorMessage = `Add your ${providerInfo.label} API key in Settings to get started.`;
        setResult({ ...EMPTY_RESULT, status: "error", error: errorMessage });
        return null;
      }

      // Load few-shot examples from active project history, deduplicating by input
      // so repeated refinements of the same prompt don't bloat the context.
      let fewShotExamples: { input: string; output: string }[] | undefined;
      if (activeProjectRef) {
        const { getRecentRecords } = await loadProjectStorageModule();
        const recent = await getRecentRecords(activeProjectRef.id, 6);
        if (recent.length > 0) {
          const seenInputs = new Set<string>();
          const deduped = recent.filter((r) => {
            const key = r.input.trim().slice(0, 120);
            if (seenInputs.has(key)) return false;
            seenInputs.add(key);
            return true;
          });
          fewShotExamples = buildFewShotExamples(deduped);
        }
      }

      let accumulated = "";
      const startedAt = performance.now();
      setResult({ ...EMPTY_RESULT, status: "loading" });
      setCurrentRecordId(null);

      try {
        const tokensUsed = await ryFine(
          {
            ...request,
            apiKey: key,
            image: attachedImage ?? undefined,
            fewShotExamples,
          },
          (chunk) => {
            accumulated += chunk;
            setResult((previousResult) => ({
              ...previousResult,
              output: previousResult.output + chunk,
            }));
          },
          controller.signal,
          onTrace,
          (attempt, delayMs) => {
            setResult((prev) => ({
              ...prev,
              error: `Network error — retrying (${attempt}/2) in ${delayMs / 1000}s…`,
            }));
          },
        );

        const finalResult: BoostResult = {
          output: accumulated,
          status: "done",
          error: "",
          outputIsAnswer: detectOutputType(accumulated) === "answer",
          durationMs: Math.round(performance.now() - startedAt),
          tokensUsed,
        };

        setResult(finalResult);

        if (!onboardingDone && accumulated) {
          setOnboardingDone(true);
          localStorage.setItem(LS_ONBOARDING_DONE, "true");
        }

        // Auto-archive to active project (fire-and-forget)
        if (activeProjectRef && inputText && accumulated) {
          const record = createPromptRecord(activeProjectRef.id, {
            input: inputText,
            output: accumulated,
            provider: request.provider,
            model: request.model,
            agent: request.agent,
            durationMs: finalResult.durationMs,
            tokensUsed: finalResult.tokensUsed,
            hadImage: !!attachedImage,
            hadRepoContext: !!request.repoContext,
          });
          void loadProjectStorageModule()
            .then(({ addPromptRecord }) => addPromptRecord(record))
            .then(() => {
              setProjectHistory((prev) => [record, ...prev]);
              setCurrentRecordId(record.id);
            });
        }

        return finalResult;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setResult((previousResult) =>
            previousResult.output
              ? { ...previousResult, status: "idle" }
              : EMPTY_RESULT,
          );
          return null;
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        setResult((previousResult) => ({
          ...previousResult,
          status: "error",
          error: errorMessage,
          outputIsAnswer: false,
          durationMs: null,
        }));
        return null;
      }
    },
    [apiKeys, onboardingDone],
  );

  const repoContext = buildRepoContext(repoContextFiles);
  const hasIncludedRepoContext = repoContext.length > 0;

  const boost = useCallback(async () => {
    if (!input.trim()) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOutputMode("single");
    setSingleInputSnapshot(input);
    resetTransientOutputState();
    setCopiedTarget(null);
    resetCompareResults();
    setSingleInputSnapshot(input);
    if (isMobile) {
      setMobileTab("output");
    }

    // 🐱 Cat / baby-proof gate — intercept keyboard mash before hitting the API
    if (!bypassCatRef.current && isGibberish(input)) {
      const providerDef = PROVIDERS.find((p) => p.id === provider)!;
      setCatMessageActive(true);
      setSingleResult({
        output: getCatMessage(
          navigator.language,
          providerDef.tier,
          providerDef.label,
        ),
        status: "done",
        error: "",
        outputIsAnswer: false,
        durationMs: 0,
        tokensUsed: null,
      });
      return;
    }
    bypassCatRef.current = false;
    setCatMessageActive(false);

    await executeBoostRequest(
      {
        promptText: input,
        provider,
        model,
        agent,
        customInstructions: customBoostInstructions,
        repoContext,
        userSkills,
      },
      setSingleResult,
      controller,
      activeProject,
      input,
      image,
      (trace) => {
        setLastTrace(trace);
        setLastSystemPrompt(trace.assembledSystemPrompt);
        setTraceExpanded(false);
      },
    );
  }, [
    activeProject,
    agent,
    customBoostInstructions,
    executeBoostRequest,
    image,
    input,
    isMobile,
    model,
    provider,
    repoContext,
    resetCompareResults,
    resetTransientOutputState,
    userSkills,
  ]);

  const boostBoth = useCallback(async () => {
    if (!input.trim() || !hasIncludedRepoContext) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOutputMode("compare");
    setCompareMode("repo");
    resetTransientOutputState();
    setCopiedTarget(null);
    setSingleResult(EMPTY_RESULT);
    resetCompareResults();

    const requestBase = {
      promptText: input,
      provider,
      model,
      agent,
      customInstructions: customBoostInstructions,
      userSkills,
    };

    const baselineResult = await executeBoostRequest(
      { ...requestBase, repoContext: undefined },
      setCompareBaselineResult,
      controller,
      activeProject,
      input,
      image,
    );

    if (!baselineResult || controller.signal.aborted) {
      return;
    }

    await executeBoostRequest(
      { ...requestBase, repoContext },
      setCompareRepoResult,
      controller,
      activeProject,
      input,
      image,
    );
  }, [
    activeProject,
    agent,
    customBoostInstructions,
    executeBoostRequest,
    hasIncludedRepoContext,
    image,
    input,
    model,
    provider,
    repoContext,
    resetCompareResults,
    resetTransientOutputState,
    userSkills,
  ]);

  const boostCompareModels = useCallback(async () => {
    if (!input.trim()) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOutputMode("compare");
    setCompareMode("models");
    resetTransientOutputState();
    setCopiedTarget(null);
    setSingleResult(EMPTY_RESULT);
    resetCompareResults();

    const requestBase = {
      promptText: input,
      agent,
      customInstructions: customBoostInstructions,
      repoContext,
      userSkills,
    };

    // Both models run in parallel — each streams independently into its own card.
    await Promise.allSettled([
      executeBoostRequest(
        { ...requestBase, provider, model },
        setCompareBaselineResult,
        controller,
        activeProject,
        input,
        image,
      ),
      executeBoostRequest(
        { ...requestBase, provider: compareProvider, model: compareModel },
        setCompareRepoResult,
        controller,
        activeProject,
        input,
        image,
      ),
    ]);
  }, [
    activeProject,
    agent,
    compareModel,
    compareProvider,
    customBoostInstructions,
    executeBoostRequest,
    image,
    input,
    model,
    provider,
    repoContext,
    resetCompareResults,
    resetTransientOutputState,
    userSkills,
  ]);

  function cancel() {
    abortRef.current?.abort();
    setSingleResult((previousResult) =>
      previousResult.status === "loading"
        ? { ...previousResult, status: "idle" }
        : previousResult,
    );
    setCompareBaselineResult((previousResult) =>
      previousResult.status === "loading"
        ? { ...previousResult, status: "idle" }
        : previousResult,
    );
    setCompareRepoResult((previousResult) =>
      previousResult.status === "loading"
        ? { ...previousResult, status: "idle" }
        : previousResult,
    );
  }

  function clear() {
    abortRef.current?.abort();
    setInput("");
    setSingleInputSnapshot("");
    setImage(null);
    setImageError("");
    setSingleResult(EMPTY_RESULT);
    resetTransientOutputState();
    resetCompareResults();
    setOutputMode("single");
    setCopiedTarget(null);
    setCatMessageActive(false);
    setGridActive(false);
    bypassCatRef.current = false;
    setMobileTab("input");
  }

  function handleCreatePrompt(draft: SavedPromptDraft) {
    persistSavedPrompts([createSavedPrompt(draft), ...savedPrompts]);
  }

  function handleUpdatePrompt(promptId: string, draft: SavedPromptDraft) {
    persistSavedPrompts(
      savedPrompts.map((prompt) =>
        prompt.id === promptId ? updateSavedPrompt(prompt, draft) : prompt,
      ),
    );
  }

  function handleDuplicatePrompt(promptId: string) {
    const prompt = savedPrompts.find((item) => item.id === promptId);
    if (!prompt) {
      return;
    }

    persistSavedPrompts([
      createSavedPrompt({
        title: `${prompt.title} copy`,
        body: prompt.body,
        tags: prompt.tags,
        notes: prompt.notes,
        provider: prompt.provider,
        model: prompt.model,
        agent: prompt.agent,
        customBoostInstructions: prompt.customBoostInstructions,
      }),
      ...savedPrompts,
    ]);
  }

  function handleDeletePrompt(promptId: string) {
    persistSavedPrompts(
      savedPrompts.filter((prompt) => prompt.id !== promptId),
    );
  }

  function handleLoadPrompt(
    prompt: SavedPromptTemplate,
    variables: Record<string, string>,
  ) {
    const renderedPrompt = renderTemplate(prompt.body, variables);
    abortRef.current?.abort();
    handleInputChange(renderedPrompt);
    setSingleResult(EMPTY_RESULT);
    resetCompareResults();
    setOutputMode("single");
    setShowDiff(false);
    setCopiedTarget(null);
    applyPromptSettings(prompt);
    markPromptUsed(prompt.id);
  }

  async function handleCopyPrompt(
    prompt: SavedPromptTemplate,
    variables: Record<string, string>,
  ) {
    await navigator.clipboard.writeText(renderTemplate(prompt.body, variables));
    markPromptUsed(prompt.id);
  }

  function handleBoostPrompt(
    prompt: SavedPromptTemplate,
    variables: Record<string, string>,
  ) {
    const renderedPrompt = renderTemplate(prompt.body, variables);
    handleInputChange(renderedPrompt);
    setSingleInputSnapshot(renderedPrompt);
    applyPromptSettings(prompt);
    markPromptUsed(prompt.id);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOutputMode("single");
    resetTransientOutputState();
    setCopiedTarget(null);
    resetCompareResults();
    if (isMobile) {
      setMobileTab("output");
    }

    void executeBoostRequest(
      {
        promptText: renderedPrompt,
        provider: prompt.provider,
        model: prompt.model,
        agent: prompt.agent,
        customInstructions: prompt.customBoostInstructions,
        repoContext,
        userSkills,
      },
      setSingleResult,
      controller,
      null,
      renderedPrompt,
      null,
      (trace) => {
        setLastTrace(trace);
        setLastSystemPrompt(trace.assembledSystemPrompt);
        setTraceExpanded(false);
      },
    );
  }

  const adjustRefinement = useCallback(async () => {
    if (!adjustInput.trim() || !singleResult.output) {
      return;
    }

    const basePrompt =
      iterations.length > 0
        ? iterations[iterations.length - 1].result.output
        : singleResult.output;
    const instruction = adjustInput.trim();
    setAdjustInput("");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const newIteration: Iteration = {
      id: crypto.randomUUID(),
      instruction,
      result: { ...EMPTY_RESULT, status: "loading" },
    };

    setIterations((previous) => [...previous.slice(-9), newIteration]);
    if (isMobile) {
      setMobileTab("output");
    }

    const setIterationResult: React.Dispatch<
      React.SetStateAction<BoostResult>
    > = (nextResult) => {
      setIterations((previous) =>
        previous.map((iteration) => {
          if (iteration.id !== newIteration.id) {
            return iteration;
          }

          return {
            ...iteration,
            result:
              typeof nextResult === "function"
                ? nextResult(iteration.result)
                : nextResult,
          };
        }),
      );
    };

    await executeBoostRequest(
      {
        promptText: basePrompt,
        provider,
        model,
        agent,
        customInstructions:
          instruction +
          (customBoostInstructions ? `\n\n${customBoostInstructions}` : ""),
        repoContext,
        userSkills,
      },
      setIterationResult,
      controller,
      null, // iterations are not individually archived — only the root refinement is
      basePrompt,
      image,
    );
  }, [
    adjustInput,
    agent,
    customBoostInstructions,
    executeBoostRequest,
    image,
    isMobile,
    iterations,
    model,
    provider,
    repoContext,
    singleResult.output,
    userSkills,
  ]);

  function handleImportPrompts(jsonText: string): ImportSavedPromptsResult {
    const result = importSavedPrompts(savedPrompts, jsonText);
    persistSavedPrompts(result.prompts);
    return result;
  }

  function handleExportPrompts() {
    const blob = new Blob([serializeSavedPrompts(savedPrompts)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ryft-prompts.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderBoostResult(
    result: BoostResult,
    emptyMessage: string,
    options?: {
      beforeText?: string;
      showDiff?: boolean;
      centerpieceMode?: SolMode | null;
    },
  ) {
    const isModelLoading = result.status === "loading" && !result.output;
    const isStreaming = result.status === "loading" && !!result.output;
    return (
      <>
        {result.status === "error" && !result.output && (
          <p className="error-msg">{result.error}</p>
        )}
        {result.status === "loading" && result.error && (
          <p className="retry-notice">
            <span className="loading-dot" aria-hidden="true" />
            {result.error}
          </p>
        )}
        {!result.output &&
          result.status !== "error" &&
          (options?.centerpieceMode != null ? (
            // Centerpiece takes over the empty/loading state
            <div className="output-centerpiece-wrap">
              <SeedOfLifeCenterpiece
                size={150}
                mode={options.centerpieceMode}
              />
              {isModelLoading ? (
                <p className="centerpiece-loading">
                  <span className="loading-dot" aria-hidden="true" />
                  {elapsedSecs < 3
                    ? "Starting…"
                    : `Loading model · ${elapsedSecs}s`}
                </p>
              ) : (
                <p className="centerpiece-hint">{emptyMessage}</p>
              )}
              {elapsedSecs >= 20 && (
                <p
                  className="loading-hint"
                  style={{ textAlign: "center", maxWidth: 320 }}
                >
                  {provider === "ollama"
                    ? "Ollama is loading the model into memory — slow on first run, faster after."
                    : "The provider is taking longer than usual. Check your connection or try a smaller model."}
                </p>
              )}
            </div>
          ) : isModelLoading ? (
            <div className="loading-state">
              <div className="loading-indicator">
                <span className="loading-dot" />
                <span className="loading-phase">
                  {elapsedSecs < 3 ? "Starting…" : "Loading model"}
                </span>
                {elapsedSecs >= 3 && (
                  <span className="loading-elapsed">{elapsedSecs}s</span>
                )}
              </div>
              {elapsedSecs >= 20 && (
                <p className="loading-hint">
                  {provider === "ollama"
                    ? "Ollama is loading the model into memory — this is slow on the first run. Subsequent requests will be faster."
                    : "The provider is taking longer than usual. Check your connection or try a smaller model."}
                </p>
              )}
            </div>
          ) : (
            <p className="placeholder-text">{emptyMessage}</p>
          ))}
        {isStreaming && (
          <div className="streaming-badge">
            <span className="streaming-dot" />
            Generating
          </div>
        )}
        {result.outputIsAnswer && result.output && (
          <div className="answer-warning">
            <span className="answer-warning-icon">⚠️</span>
            <span>
              The model answered your prompt instead of enhancing it. Try a
              different model or rephrase your input as an instruction (e.g.
              "Write a…" or "Analyze…").
            </span>
          </div>
        )}
        {result.output &&
          (options?.showDiff && options.beforeText ? (
            <Suspense fallback={renderMarkdownOutput(result.output)}>
              <LazyDiffView before={options.beforeText} after={result.output} />
            </Suspense>
          ) : (
            renderMarkdownOutput(result.output)
          ))}
      </>
    );
  }

  function renderMarkdownOutput(text: string) {
    return (
      <div className="markdown-output">
        <Suspense
          fallback={
            <pre
              style={{ margin: 0, whiteSpace: "pre-wrap", font: "inherit" }}
            >
              {text}
            </pre>
          }
        >
          <LazyReactMarkdown>{text}</LazyReactMarkdown>
        </Suspense>
      </div>
    );
  }

  function handleFeedback(value: "up" | "down") {
    if (currentRecordId) {
      void loadProjectStorageModule().then(({ updateRecordFeedback }) =>
        updateRecordFeedback(currentRecordId, value),
      );
    }
  }

  function togglePreview(fileId: string) {
    setPreviewedRepoFileId((currentFileId) =>
      currentFileId === fileId ? null : fileId,
    );
  }

  function openExternalDestination(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openIdeDestination(dest: IdeDestination, text: string) {
    // 1. Copy the prompt text to clipboard so the user can paste immediately.
    navigator.clipboard.writeText(text).catch(() => { /* silent — still open the IDE */ });
    // 2. window.open keeps the user-gesture chain intact better than a
    //    synthetic <a> click. Note: bringing a *minimized* window to the
    //    foreground is blocked by Windows focus-stealing prevention and
    //    cannot be worked around from a browser context.
    window.open(dest.uri, '_blank');
    // 3. Show feedback on the button for 2 s.
    setCopiedTarget(`ide-${dest.label}`);
    setTimeout(() => {
      setCopiedTarget((t) => t === `ide-${dest.label}` ? null : t);
    }, 2000);
  }

  const inputLen = input.length;
  const isAdjusting = iterations.some(
    (iteration) => iteration.result.status === "loading",
  );
  const isLoading =
    singleResult.status === "loading" ||
    compareBaselineResult.status === "loading" ||
    compareRepoResult.status === "loading" ||
    isAdjusting;
  const canBoost = inputLen > 0 && !isLoading;

  // Header logo — full animation state machine
  // Direction carries meaning: CCW = receiving, CW = giving back, radial = transforming
  const logoMode: SolMode = (() => {
    if (singleResult.status === "error" && !isLoading) return "error";
    if (isLoading) {
      // burst = clicked, waiting for first token (transformation igniting)
      // working = streaming — direction reverses CW, giving the result back
      return singleResult.output ? "working" : "burst";
    }
    if (singleResult.status === "done") return "done";
    if (showModelB && inputLen > 0) return "compare";
    if (inputLen > 0) return "thinking";
    return "idle";
  })();

  // Button icon — simplified: inviting when ready, active when loading
  const buttonMode: SolMode = isLoading
    ? "working"
    : canBoost
      ? "thinking"
      : "idle";
  const activeProvider = PROVIDERS.find((item) => item.id === provider)!;
  const repoContextStats = getRepoContextSelectionStats(repoContextFiles);
  const baselineMetrics = getOutputMetrics(compareBaselineResult.output);
  const repoMetrics = getOutputMetrics(compareRepoResult.output);
  const requestBudget = getRequestBudgetEstimate(
    provider,
    model,
    input,
    repoContext,
    customBoostInstructions,
  );
  const compareSummary = getCompareSummary(
    compareBaselineResult.output,
    compareRepoResult.output,
  );
  const compareBLabel =
    PROVIDERS.find((p) => p.id === compareProvider)?.label ?? compareProvider;
  const compareSummaryText = compareSummary
    ? compareSummary.identical
      ? "Both models produced the same result."
      : compareMode === "models"
        ? `${compareBLabel} result is ${formatCompareDelta(compareSummary.repoCharDelta, "char")} and ${formatCompareDelta(compareSummary.repoLineDelta, "line")} than Model A.`
        : `Repo-aware version is ${formatCompareDelta(compareSummary.repoCharDelta, "char")} and ${formatCompareDelta(compareSummary.repoLineDelta, "line")} than the baseline.`
    : compareMode === "models"
      ? "Both models run in parallel — choose the result you prefer."
      : "Run both boosts, then choose the version you want to keep or copy.";
  const hasCurrentSingleInput =
    Boolean(singleInputSnapshot) && input === singleInputSnapshot;
  const qualityScore = useMemo(
    () =>
      !catMessageActive &&
      outputMode === "single" &&
      hasCurrentSingleInput &&
      singleResult.status === "done" &&
      singleResult.output
        ? scorePrompt(singleInputSnapshot, singleResult.output)
        : null,
    [
      catMessageActive,
      hasCurrentSingleInput,
      outputMode,
      singleInputSnapshot,
      singleResult.output,
      singleResult.status,
    ],
  );
  const openInDestinations = singleResult.output
    ? getOpenInDestinations(singleResult.output)
    : [];
  const outputAvailable = Boolean(
    singleResult.output ||
    compareBaselineResult.output ||
    compareRepoResult.output,
  );
  const filteredGitHubRepos = useMemo(() => {
    const query = githubRepoInput.trim().toLowerCase();
    if (!query) {
      return githubRepos;
    }

    return githubRepos.filter((repo) =>
      repo.full_name.toLowerCase().includes(query),
    );
  }, [githubRepoInput, githubRepos]);
  const visibleHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();

    if (historyGlobal && query) {
      return globalSearchResults;
    }

    if (!query) {
      return projectHistory;
    }

    return projectHistory.filter(
      (record) =>
        record.input.toLowerCase().includes(query) ||
        record.output.toLowerCase().includes(query),
    );
  }, [globalSearchResults, historyGlobal, historySearch, projectHistory]);
  const paletteCommands: Command[] = [
    {
      id: "boost",
      label: "Ryft — refine prompt",
      shortcut: "⌘↵",
      action: () => void boost(),
      disabled: !canBoost,
    },
    {
      id: "clear",
      label: "Clear prompt and output",
      action: clear,
      disabled: !input && !singleResult.output,
    },
    {
      id: "copy-output",
      label: "Copy refined output",
      action: () => copyText(singleResult.output, "palette"),
      disabled: !singleResult.output,
    },
    {
      id: "paste",
      label: "Paste from clipboard",
      action: () => void pasteInput(),
    },
    {
      id: "toggle-diff",
      label: showDiff ? "Hide diff view" : "Show diff view",
      action: () => setShowDiff((value) => !value),
      disabled:
        outputMode !== "single" ||
        !singleResult.output ||
        !hasCurrentSingleInput,
    },
    {
      id: "toggle-trace",
      label: traceExpanded ? "Hide pipeline prompt" : "View pipeline prompt",
      action: () => setTraceExpanded((value) => !value),
      disabled: !lastTrace,
    },
    {
      id: "open-settings",
      label: "Open settings",
      action: () => setOpenPanel("settings"),
    },
    {
      id: "open-skills",
      label: "Open skills manager",
      action: () => setOpenPanel("skills"),
    },
    {
      id: "new-skill",
      label: "Create new skill",
      action: () => setOpenPanel("skills"),
    },
    {
      id: "open-context",
      label: "Open repo context",
      action: () => setOpenPanel("context"),
    },
    {
      id: "open-library",
      label: "Open prompt library",
      action: () => setOpenPanel("library"),
    },
    {
      id: "open-project",
      label: "Open projects",
      action: () => setOpenPanel("project"),
    },
    {
      id: "cycle-theme",
      label: "Cycle theme (light / dark / system)",
      action: cycleTheme,
    },
    {
      id: "toggle-ab",
      label: "Toggle A/B model comparison",
      action: () => setShowModelB((value) => !value),
    },
    {
      id: "open-claude",
      label: "Open in Claude",
      action: () => {
        const d = openInDestinations[0];
        if (d?.kind === 'url') openExternalDestination(d.url);
      },
      disabled: openInDestinations.length === 0,
    },
    {
      id: "open-chatgpt",
      label: "Open in ChatGPT",
      action: () => {
        const d = openInDestinations[1];
        if (d?.kind === 'url') openExternalDestination(d.url);
      },
      disabled: openInDestinations.length === 0,
    },
    {
      id: "open-perplexity",
      label: "Open in Perplexity",
      action: () => {
        const d = openInDestinations[2];
        if (d?.kind === 'url') openExternalDestination(d.url);
      },
      disabled: openInDestinations.length === 0,
    },
  ];
  const currentPromptDraft: SavedPromptDraft = {
    title: titleFromPrompt(input),
    body: input,
    tags: [],
    notes: "",
    provider,
    model,
    agent,
    customBoostInstructions,
  };

  const rulesActive = customBoostInstructions.trim().length > 0;
  const contextBadge = repoContextStats.selectedCount;
  const inputPane = (
    <div className="pane pane-input">
      <div className="pane-header">
        <span className="pane-title">Your prompt</span>
        {inputLen > 0 && <span className="char-count">{inputLen} chars</span>}
      </div>
      {input === "" &&
        !onboardingDone &&
        (() => {
          // Show a setup guide for users whose browser doesn't support WebGPU
          // and who haven't configured any API key yet.
          const hasAnyKey = Object.values(apiKeys).some(
            (k) => k.trim().length > 0,
          );
          const browserAiAvailable = isBrowserAiSupported();

          if (!browserAiAvailable && !hasAnyKey) {
            return (
              <div className="onboarding-examples">
                <p className="onboarding-label">Get started with Ryft</p>
                <p className="onboarding-sublabel">
                  Your browser doesn't support Browser AI (WebGPU). Choose a
                  provider to get started:
                </p>
                <div className="setup-guide-grid">
                  <button
                    className="setup-guide-card"
                    onClick={() => setOpenPanel("settings")}
                  >
                    <span className="setup-guide-icon">🦙</span>
                    <span className="setup-guide-name">Ollama</span>
                    <span className="setup-guide-desc">
                      Run models locally — free, private, no key needed
                    </span>
                  </button>
                  <button
                    className="setup-guide-card"
                    onClick={() => setOpenPanel("settings")}
                  >
                    <span className="setup-guide-icon">✦</span>
                    <span className="setup-guide-name">Anthropic</span>
                    <span className="setup-guide-desc">
                      Use Claude with your API key
                    </span>
                  </button>
                  <button
                    className="setup-guide-card"
                    onClick={() => setOpenPanel("settings")}
                  >
                    <span className="setup-guide-icon">⬡</span>
                    <span className="setup-guide-name">OpenAI / Others</span>
                    <span className="setup-guide-desc">
                      GPT-4, Gemini, Groq, DeepSeek & more
                    </span>
                  </button>
                </div>
                <p className="setup-guide-hint">
                  Try Chrome or Edge on a desktop with a GPU for Browser AI — no
                  key required.
                </p>
              </div>
            );
          }

          return (
            <div className="onboarding-examples">
              <div className="onboarding-examples-header">
                <p className="onboarding-label">
                  Try an example to see Ryft in action
                </p>
                {examplesGenerating && (
                  <span className="examples-generating-hint">personalising…</span>
                )}
              </div>
              <div className="example-carousel">
                {examples.map((example) => (
                  <button
                    key={example.label}
                    className="example-card"
                    onClick={() => {
                      handleInputChange(example.prompt);
                      handleAgentChange(example.agent);
                    }}
                  >
                    <span className="example-label">{example.label}</span>
                    <span className="example-preview">{example.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
      <textarea
        className="prompt-area"
        placeholder="Type or paste your raw prompt here..."
        value={input}
        onChange={(event) => handleInputChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            if (canBoost) {
              void boost();
            }
          }
        }}
        spellCheck={false}
        onPaste={(event) => {
          const file = event.clipboardData
            ? extractPasteImage(event.clipboardData)
            : null;
          if (!file) {
            return;
          }
          event.preventDefault();
          readImageFile(file)
            .then((img) => {
              setImage(img);
              setImageError("");
            })
            .catch((err: unknown) =>
              setImageError(
                err instanceof Error ? err.message : "Failed to read image",
              ),
            );
        }}
      />

      {(image || imageError) && (
        <div className="image-attachment">
          {image && (
            <>
              <img src={image.dataUrl} alt="Attached" className="image-thumb" />
              <div className="image-meta">
                <span className="image-name">{image.filename}</span>
                <span className="image-size">
                  {formatImageSize(image.sizeBytes)}
                </span>
                {PROVIDERS.find((item) => item.id === provider)
                  ?.visionSupport === "no" && (
                  <span className="image-warn">
                    ⚠ {PROVIDERS.find((item) => item.id === provider)?.label}{" "}
                    doesn't support images
                  </span>
                )}
              </div>
              <button
                className="image-remove btn-ghost small"
                onClick={() => setImage(null)}
                aria-label="Remove image"
              >
                ✕
              </button>
            </>
          )}
          {imageError && <p className="image-error">{imageError}</p>}
        </div>
      )}

      <input
        ref={imageInputRef}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          readImageFile(file)
            .then((img) => {
              setImage(img);
              setImageError("");
            })
            .catch((err: unknown) =>
              setImageError(
                err instanceof Error ? err.message : "Failed to read image",
              ),
            );
          event.target.value = "";
        }}
      />

      {provider === "browserai" && (
        <div
          className={`browser-ai-status-card state-${browserAiStatus.state}`}
        >
          <div className="browser-ai-status-header">
            <span className="browser-ai-status-title">Browser AI</span>
            <span className="compare-chip">{browserAiStatus.state}</span>
          </div>
          <p>
            {browserAiStatus.error || browserAiStatus.text}
            {browserAiStatus.model ? ` (${browserAiStatus.model})` : ""}
          </p>
          {browserAiStatus.state === "loading" && (
            <div className="browser-ai-progress" aria-hidden="true">
              <span
                style={{
                  width: `${Math.max(browserAiStatus.progress * 100, 6)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Disambiguation chip — auto-detection was uncertain; let user confirm or override */}
      {!classificationDismissed &&
        classificationPreview?.confidence === "medium" &&
        classificationPreview.primary && (
          <div className="classify-hint">
            <span className="classify-hint-text">
              Auto detected:{" "}
              <strong>
                {AGENTS.find((a) => a.id === classificationPreview.primary)
                  ?.label ?? classificationPreview.primary}
              </strong>{" "}
              · not sure
            </span>
            <button
              className="btn-ghost small"
              onClick={() =>
                handleAgentChange(classificationPreview.primary as Agent)
              }
            >
              Use it
            </button>
            <button
              className="classify-hint-dismiss"
              onClick={() =>
                setDismissedClassificationPrimary(
                  classificationPreview.primary ?? null,
                )
              }
              aria-label="Dismiss suggestion"
            >
              ×
            </button>
          </div>
        )}

      {/* Image drop warning with actionable CTA — more prominent than the small thumb label */}
      {image && activeProvider.visionSupport === "no" && (
        <div className="vision-drop-warning">
          <span>
            ⚠ {activeProvider.label} doesn't support images — they'll be ignored
          </span>
          <button
            className="btn-ghost small"
            onClick={() => setOpenPanel("settings")}
          >
            Switch provider
          </button>
        </div>
      )}

      <div className="pane-footer">
        <div className="footer-left">
          <div className="budget-popover-wrap">
            <button
              type="button"
              className={`budget-chip tone-${requestBudget.tone} ${budgetOpen ? "is-open" : ""}`}
              aria-expanded={budgetOpen}
              aria-label="Estimated request size"
              onClick={() => setBudgetOpen((prev) => !prev)}
            >
              <span className="budget-chip-spark" aria-hidden="true" />~
              {requestBudget.estimatedTokens.toLocaleString()} tokens
            </button>
            {budgetOpen && (
              <div
                className="budget-popover"
                role="dialog"
                aria-label="Request size breakdown"
              >
                <div className="request-budget-card">
                  <div className="request-budget-header">
                    <span className="request-budget-title">
                      Estimated request size
                    </span>
                    <span
                      className={`request-budget-chip tone-${requestBudget.tone}`}
                    >
                      ~{requestBudget.estimatedTokens.toLocaleString()} tokens
                    </span>
                  </div>
                  <div className="request-budget-track" aria-hidden="true">
                    <span
                      className={`request-budget-fill tone-${requestBudget.tone}`}
                      style={{
                        width: `${Math.max(requestBudget.usageRatio * 100, requestBudget.totalChars > 0 ? 6 : 0)}%`,
                      }}
                    />
                  </div>
                  <div className="request-budget-meta">
                    <span>
                      Prompt {requestBudget.promptChars.toLocaleString()} chars
                    </span>
                    <span>
                      Rules{" "}
                      {requestBudget.customInstructionChars.toLocaleString()}
                    </span>
                    <span>
                      Repo {requestBudget.repoContextChars.toLocaleString()}
                    </span>
                    <span>
                      Target ~{requestBudget.recommendedTokens.toLocaleString()}{" "}
                      tokens
                    </span>
                  </div>
                  <p className="request-budget-note">{requestBudget.message}</p>
                </div>
              </div>
            )}
          </div>
          <button className="btn-ghost" onClick={() => void pasteInput()}>
            Paste
          </button>
          <button
            className={`btn-ghost ${image ? "is-active" : ""}`}
            onClick={() => imageInputRef.current?.click()}
            title="Attach image (or paste one with Ctrl+V)"
            aria-label="Attach image"
          >
            {image ? "🖼 Image" : "📎"}
          </button>
        </div>
        <button
          className="btn-ghost"
          onClick={clear}
          disabled={
            !input &&
            !singleResult.output &&
            !compareBaselineResult.output &&
            !compareRepoResult.output
          }
        >
          Clear
        </button>
        {isLoading ? (
          <button className="btn-cancel" onClick={cancel}>
            Stop
          </button>
        ) : (
          <>
            <button
              className={`btn-ghost ${showModelB ? "is-active" : ""}`}
              onClick={() => setShowModelB((value) => !value)}
              title="Compare two models side by side"
            >
              A/B
            </button>
            {hasIncludedRepoContext && (
              <button
                className="btn-ghost"
                onClick={() => void boostBoth()}
                disabled={!canBoost}
              >
                Ryft both
              </button>
            )}
            <button
              className="btn-boost"
              onClick={() => void boost()}
              disabled={!canBoost}
              title="Ctrl+Enter"
            >
              <SeedOfLifeLogo size={18} mode={buttonMode} />
              Ryft
            </button>
          </>
        )}
      </div>

      {showModelB && !isLoading && (
        <div className="model-b-bar">
          <span className="model-b-label">vs</span>
          <select
            className="model-b-select"
            value={compareProvider}
            onChange={(event) =>
              handleCompareBProviderChange(event.target.value as Provider)
            }
            aria-label="Model B provider"
          >
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="model-b-select model-b-model"
            value={compareModel}
            onChange={(event) => handleCompareBModelChange(event.target.value)}
            aria-label="Model B model"
          >
            {MODELS[compareProvider].map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            className="btn-boost"
            onClick={() => void boostCompareModels()}
            disabled={!canBoost}
            title="Run both models in parallel"
          >
            <SeedOfLifeLogo size={18} mode={buttonMode} />
            A/B
          </button>
        </div>
      )}
    </div>
  );
  const outputPane = (
    <div className="pane pane-output">
      <div className="pane-header">
        <span className="pane-title">
          {outputMode === "compare" ? "Ryft comparison" : "Refined prompt"}
        </span>
        <div className="pane-header-actions">
          {qualityScore && <QualityScore score={qualityScore} />}
          {!catMessageActive &&
            outputMode === "single" &&
            singleResult.status === "done" &&
            singleResult.output &&
            hasCurrentSingleInput && (
              <button
                className={`btn-ghost small ${showDiff ? "is-active" : ""}`}
                onClick={() => setShowDiff((value) => !value)}
                aria-pressed={showDiff}
              >
                Diff
              </button>
            )}
          {outputMode === "single" && singleResult.output && (
            <button
              className="btn-ghost small"
              onClick={() => copyText(singleResult.output, "single-header")}
            >
              {copiedTarget === "single-header" ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      </div>
      {!catMessageActive &&
        outputMode === "single" &&
        lastTrace &&
        singleResult.status === "done" &&
        singleResult.output && (
          <Suspense fallback={null}>
            <LazyPipelineTrace
              trace={lastTrace}
              systemPrompt={lastSystemPrompt}
              onExpand={() => setTraceExpanded((value) => !value)}
              expanded={traceExpanded}
            />
          </Suspense>
        )}
      <div className="output-area">
        {outputMode === "compare" ? (
          <div className="compare-results-wrap">
            <div className="compare-toolbar">
              <div className="compare-summary-block">
                <span className="compare-summary-label">Compare mode</span>
                <p>{compareSummaryText}</p>
              </div>
              <div className="compare-toolbar-actions">
                <button
                  className="btn-ghost small"
                  onClick={copySelectedCompareResult}
                  disabled={!selectedCompareResult}
                >
                  {copiedTarget === "compare-selected"
                    ? "Copied!"
                    : "Copy selected"}
                </button>
                <button
                  className="btn-ghost small"
                  onClick={useSelectedCompareResult}
                  disabled={!selectedCompareResult}
                >
                  Use selected
                </button>
              </div>
            </div>

            <div className="compare-results">
              <section
                className={`compare-card ${selectedCompareResult === "baseline" ? "selected" : ""}`}
                aria-label={
                  compareMode === "models"
                    ? `Model A: ${provider} ${model}`
                    : "Baseline boost without repository context"
                }
              >
                <div className="compare-card-header">
                  <div>
                    <h3>
                      {compareMode === "models"
                        ? `${PROVIDERS.find((item) => item.id === provider)?.label} · ${model}`
                        : "Without repo context"}
                    </h3>
                    <p>
                      {compareMode === "models"
                        ? "Primary model — current provider and model selection."
                        : "Refined using only the prompt and current rules — no repo context."}
                    </p>
                  </div>
                  <div className="compare-card-actions">
                    <button
                      className={`btn-ghost small ${selectedCompareResult === "baseline" ? "is-active" : ""}`}
                      onClick={() => setSelectedCompareResult("baseline")}
                      aria-pressed={selectedCompareResult === "baseline"}
                    >
                      {selectedCompareResult === "baseline"
                        ? "Selected"
                        : "Choose"}
                    </button>
                    {compareBaselineResult.output && (
                      <button
                        className="btn-ghost small"
                        onClick={() =>
                          copyText(compareBaselineResult.output, "baseline")
                        }
                      >
                        {copiedTarget === "baseline" ? "Copied!" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
                {compareBaselineResult.output && (
                  <div className="compare-card-meta">
                    <span className="compare-chip">
                      {baselineMetrics.charCount.toLocaleString()} chars
                    </span>
                    <span className="compare-chip">
                      {baselineMetrics.lineCount.toLocaleString()} lines
                    </span>
                    {compareBaselineResult.durationMs !== null && (
                      <span className="compare-chip">
                        {formatDuration(compareBaselineResult.durationMs)}
                      </span>
                    )}
                    {compareBaselineResult.tokensUsed !== null && (
                      <span
                        className="compare-chip token-chip"
                        title={`${compareBaselineResult.tokensUsed.promptTokens} prompt + ${compareBaselineResult.tokensUsed.completionTokens} completion`}
                      >
                        {compareBaselineResult.tokensUsed.totalTokens.toLocaleString()}{" "}
                        tokens
                      </span>
                    )}
                  </div>
                )}
                {renderBoostResult(
                  compareBaselineResult,
                  "The baseline result will appear here.",
                )}
              </section>

              <section
                className={`compare-card ${selectedCompareResult === "repo" ? "selected" : ""}`}
                aria-label={
                  compareMode === "models"
                    ? `Model B: ${compareProvider} ${compareModel}`
                    : "Boost with repository context"
                }
              >
                <div className="compare-card-header">
                  <div>
                    <h3>
                      {compareMode === "models"
                        ? `${PROVIDERS.find((item) => item.id === compareProvider)?.label} · ${compareModel}`
                        : "With repo context"}
                    </h3>
                    <p>
                      {compareMode === "models"
                        ? "Comparison model — results streamed in parallel."
                        : "Refined using the selected repository files as grounding context."}
                    </p>
                  </div>
                  <div className="compare-card-actions">
                    <button
                      className={`btn-ghost small ${selectedCompareResult === "repo" ? "is-active" : ""}`}
                      onClick={() => setSelectedCompareResult("repo")}
                      aria-pressed={selectedCompareResult === "repo"}
                    >
                      {selectedCompareResult === "repo" ? "Selected" : "Choose"}
                    </button>
                    {compareRepoResult.output && (
                      <button
                        className="btn-ghost small"
                        onClick={() =>
                          copyText(compareRepoResult.output, "repo")
                        }
                      >
                        {copiedTarget === "repo" ? "Copied!" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
                {compareRepoResult.output && (
                  <div className="compare-card-meta">
                    <span className="compare-chip">
                      {repoMetrics.charCount.toLocaleString()} chars
                    </span>
                    <span className="compare-chip">
                      {repoMetrics.lineCount.toLocaleString()} lines
                    </span>
                    {compareRepoResult.durationMs !== null && (
                      <span className="compare-chip">
                        {formatDuration(compareRepoResult.durationMs)}
                      </span>
                    )}
                    {compareRepoResult.tokensUsed !== null && (
                      <span
                        className="compare-chip token-chip"
                        title={`${compareRepoResult.tokensUsed.promptTokens} prompt + ${compareRepoResult.tokensUsed.completionTokens} completion`}
                      >
                        {compareRepoResult.tokensUsed.totalTokens.toLocaleString()}{" "}
                        tokens
                      </span>
                    )}
                    {compareSummary && !compareSummary.identical && (
                      <span className="compare-chip accent">
                        {compareSummary.repoCharDelta === 0
                          ? "Same length as baseline"
                          : `${Math.abs(compareSummary.repoCharDelta).toLocaleString()} ${Math.abs(compareSummary.repoCharDelta) === 1 ? "char" : "chars"} ${compareSummary.repoCharDelta > 0 ? "vs" : "under"} baseline`}
                      </span>
                    )}
                  </div>
                )}
                {renderBoostResult(
                  compareRepoResult,
                  "The repo-aware result will appear here.",
                )}
              </section>
            </div>
          </div>
        ) : (
          <>
            {renderBoostResult(
              singleResult,
              "Your refined prompt will appear here.",
              {
                beforeText: hasCurrentSingleInput
                  ? singleInputSnapshot
                  : undefined,
                showDiff: showDiff && hasCurrentSingleInput,
                // Show the centerpiece in the output pane whenever there's no text yet.
                // Map logoMode → centerpiece mode (working/done don't apply here — output exists by then).
                centerpieceMode: !singleResult.output
                  ? logoMode === "error"
                    ? "error"
                    : logoMode === "burst"
                      ? "burst"
                      : logoMode === "thinking"
                        ? "thinking"
                        : "idle"
                  : null,
              },
            )}
            {catMessageActive && singleResult.status === "done" && (
              <div className="cat-bypass-bar">
                <span className="cat-bypass-note">
                  Determined to refine it anyway?
                </span>
                <button
                  className="btn-ghost small"
                  onClick={() => {
                    bypassCatRef.current = true;
                    void boost();
                  }}
                >
                  Override the cat →
                </button>
              </div>
            )}
            {!catMessageActive &&
              singleResult.status === "done" &&
              singleResult.output && (
                <Suspense fallback={null}>
                  <LazyBoostMeta
                    agent={agent}
                    model={model}
                    provider={provider}
                    input={singleInputSnapshot || input}
                    output={singleResult.output}
                    recordId={currentRecordId}
                    onFeedback={handleFeedback}
                  />
                </Suspense>
              )}
            {iterations.length > 0 && (
              <Suspense fallback={null}>
                <LazyIterationChain
                  iterations={iterations}
                  onCopy={copyText}
                  copiedTarget={copiedTarget}
                  formatDuration={formatDuration}
                />
              </Suspense>
            )}
          </>
        )}
      </div>
      {!catMessageActive &&
        singleResult.status === "done" &&
        singleResult.output &&
        outputMode === "single" && (
          <div className="adjust-bar">
            <input
              className="adjust-input"
              placeholder="Adjust: make it shorter, add TypeScript types, more formal…"
              value={adjustInput}
              onChange={(event) => setAdjustInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void adjustRefinement();
                }
              }}
            />
            <button
              className="btn-boost small-boost"
              onClick={() => void adjustRefinement()}
              disabled={!adjustInput.trim() || isLoading}
            >
              <SeedOfLifeLogo
                size={14}
                mode={
                  isLoading
                    ? "working"
                    : adjustInput.trim()
                      ? "thinking"
                      : "idle"
                }
              />
              Adjust
            </button>
          </div>
        )}
      {!catMessageActive && outputMode === "single" && singleResult.output && (
        <div className="pane-footer">
          <div className="footer-left">
            {singleResult.durationMs !== null &&
              singleResult.durationMs > 0 && (
                <span className="compare-chip">
                  {formatDuration(singleResult.durationMs)}
                </span>
              )}
            {singleResult.tokensUsed !== null && (
              <span
                className="compare-chip token-chip"
                title={`${singleResult.tokensUsed.promptTokens.toLocaleString()} prompt + ${singleResult.tokensUsed.completionTokens.toLocaleString()} completion`}
              >
                {singleResult.tokensUsed.totalTokens.toLocaleString()} tokens
              </span>
            )}
            <div className="open-in-row">
              <span className="open-in-label">Open in</span>
              {openInDestinations.map((destination) =>
                destination.kind === 'url' ? (
                  <a
                    key={destination.label}
                    href={destination.url}
                    target="_blank"
                    rel="noreferrer"
                    className="open-in-btn"
                  >
                    {destination.label} ↗
                  </a>
                ) : (
                  <button
                    key={destination.label}
                    type="button"
                    className={`open-in-btn open-in-btn--ide${copiedTarget === `ide-${destination.label}` ? ' open-in-btn--copied' : ''}`}
                    title={destination.hint}
                    onClick={() => openIdeDestination(destination, singleResult.output ?? '')}
                  >
                    {copiedTarget === `ide-${destination.label}` ? 'Copied ✓' : `${destination.label} ↗`}
                  </button>
                )
              )}
            </div>
          </div>
          <button
            className="btn-ghost"
            onClick={() => copyText(singleResult.output, "single-footer")}
          >
            {copiedTarget === "single-footer" ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
  const workspaceContent = isMobile ? (
    <div className="mobile-tabs">
      <div
        className="mobile-tab-bar"
        role="tablist"
        aria-label="Prompt workspace"
      >
        <button
          id="mobile-tab-input"
          role="tab"
          aria-controls="mobile-workspace-panel"
          aria-selected={mobileTab === "input"}
          className={`mobile-tab ${mobileTab === "input" ? "active-tab" : ""}`}
          onClick={() => setMobileTab("input")}
        >
          Your prompt
        </button>
        <button
          id="mobile-tab-output"
          role="tab"
          aria-controls="mobile-workspace-panel"
          aria-selected={mobileTab === "output"}
          className={`mobile-tab ${mobileTab === "output" ? "active-tab" : ""}`}
          onClick={() => setMobileTab("output")}
        >
          Refined prompt
          {outputAvailable && <span className="tab-dot" aria-hidden="true" />}
        </button>
      </div>
      <div
        id="mobile-workspace-panel"
        className="mobile-tabpanel"
        role="tabpanel"
        aria-labelledby={
          mobileTab === "input" ? "mobile-tab-input" : "mobile-tab-output"
        }
      >
        {mobileTab === "input" ? inputPane : outputPane}
      </div>
    </div>
  ) : (
    <div className="prompt-workspace">
      {inputPane}
      <div className="divider-col">
        <div className={`divider-line ${isLoading ? "active" : ""}`} />
      </div>
      {outputPane}
    </div>
  );

  return (
    <div className="app">
      {(ambientGridReady || gridActive || inputLen > 0) && (
        <Suspense fallback={null}>
          <LazyGridDots
            active={gridActive}
            hasInput={inputLen > 0}
            isMobile={isMobile}
          />
        </Suspense>
      )}
      <header className="command-bar">
        {/* ── Left: agent config ─────────────────────────────── */}
        <div className="command-zone command-left">
          <AgentSelector agent={agent} onChange={handleAgentChange} />
          <button
            type="button"
            className={`provider-chip ${openPanel === "settings" ? "is-open" : ""}`}
            aria-label="Settings"
            aria-expanded={openPanel === "settings"}
            onClick={() =>
              setOpenPanel((prev) => (prev === "settings" ? null : "settings"))
            }
          >
            <span
              className={`provider-chip-dot tier-${activeProvider.tier}`}
              aria-hidden="true"
            />
            <span className="provider-chip-name">{activeProvider.label}</span>
            <span className="provider-chip-model">{model}</span>
          </button>
        </div>

        {/* ── Centre: logo with hover tooltip ────────────────── */}
        <div className="command-zone command-center">
          <span
            className="logo"
            onMouseEnter={() => {
              if (logoPopoverTimerRef.current)
                clearTimeout(logoPopoverTimerRef.current);
              setLogoPopoverOpen(true);
            }}
            onMouseLeave={() => {
              logoPopoverTimerRef.current = setTimeout(
                () => setLogoPopoverOpen(false),
                180,
              );
            }}
            style={{ position: "relative" }}
          >
            {/* Clicking the icon or wordmark opens the about page */}
            <a
              href="https://ryft.dev/about"
              target="_blank"
              rel="noreferrer"
              className="logo-link"
              aria-label="Ryft — about page"
              tabIndex={0}
            >
              <SeedOfLifeLogo size={28} mode={logoMode} />
              <span className="logo-word">Ryft</span>
            </a>

            {logoPopoverOpen && (
              <div
                className="logo-popover"
                onMouseEnter={() => {
                  if (logoPopoverTimerRef.current)
                    clearTimeout(logoPopoverTimerRef.current);
                }}
                onMouseLeave={() => {
                  logoPopoverTimerRef.current = setTimeout(
                    () => setLogoPopoverOpen(false),
                    180,
                  );
                }}
              >
                <p className="logo-popover-title">
                  Your prompts stay on your device
                </p>
                <ul className="logo-popover-bullets">
                  <li>Refined using your own API keys</li>
                  <li>Nothing is sent to Ryft servers</li>
                  <li>No account or sign-up required</li>
                  <li>Browser AI runs fully offline</li>
                </ul>
                <a
                  href="https://ryft.dev/about#safety"
                  target="_blank"
                  rel="noreferrer"
                  className="logo-popover-link"
                >
                  Data &amp; Safety ↗
                </a>
              </div>
            )}
          </span>
        </div>

        {/* ── Right: tools & theme ───────────────────────────── */}
        <div className="command-zone command-right">
          <button
            type="button"
            className={`disclosure-trigger ${openPanel === "rules" ? "is-open" : ""} ${rulesActive ? "has-indicator" : ""}`}
            aria-label="Ryft Rules"
            aria-expanded={openPanel === "rules"}
            onClick={() =>
              setOpenPanel((prev) => (prev === "rules" ? null : "rules"))
            }
          >
            Rules
            {rulesActive && <span className="trigger-dot" aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={`disclosure-trigger ${openPanel === "skills" ? "is-open" : ""} ${userSkills.length > 0 ? "has-indicator" : ""}`}
            aria-label="Custom skills"
            aria-expanded={openPanel === "skills"}
            onClick={() =>
              setOpenPanel((prev) => (prev === "skills" ? null : "skills"))
            }
          >
            Skills
            {userSkills.length > 0 && (
              <span className="trigger-badge">{userSkills.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`disclosure-trigger ${openPanel === "context" ? "is-open" : ""}`}
            aria-label="Repo context"
            aria-expanded={openPanel === "context"}
            onClick={() =>
              setOpenPanel((prev) => (prev === "context" ? null : "context"))
            }
          >
            Context
            {contextBadge > 0 && (
              <span className="trigger-badge">{contextBadge}</span>
            )}
          </button>
          <button
            type="button"
            className={`disclosure-trigger ${openPanel === "library" ? "is-open" : ""}`}
            aria-label="Saved prompts"
            aria-expanded={openPanel === "library"}
            onClick={() =>
              setOpenPanel((prev) => (prev === "library" ? null : "library"))
            }
          >
            Library
          </button>
          <button
            type="button"
            className={`disclosure-trigger ${openPanel === "project" ? "is-open" : ""} ${activeProject ? "has-indicator" : ""}`}
            aria-label="Project"
            aria-expanded={openPanel === "project"}
            onClick={() =>
              setOpenPanel((prev) => (prev === "project" ? null : "project"))
            }
          >
            Project
            {activeProject && (
              <span className="trigger-dot" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={`theme-toggle theme-${theme}`}
            aria-label={`Theme: ${theme}. Click to cycle.`}
            onClick={cycleTheme}
          >
            {themeIcon}
          </button>
        </div>
      </header>

      <main className="focus-area">{workspaceContent}</main>

      {openPanel && (
        <div
          className="panel-scrim"
          role="presentation"
          onClick={() => setOpenPanel(null)}
        />
      )}

      <aside
        className={`drawer drawer-left ${openPanel === "library" ? "is-open" : ""}`}
        aria-hidden={openPanel !== "library"}
      >
        {openPanel === "library" && (
          <Suspense fallback={null}>
            <LazyPromptLibrary
              prompts={savedPrompts}
              currentDraft={currentPromptDraft}
              onCreatePrompt={handleCreatePrompt}
              onUpdatePrompt={handleUpdatePrompt}
              onDuplicatePrompt={handleDuplicatePrompt}
              onDeletePrompt={handleDeletePrompt}
              onLoadPrompt={handleLoadPrompt}
              onBoostPrompt={handleBoostPrompt}
              onCopyPrompt={handleCopyPrompt}
              onImportPrompts={handleImportPrompts}
              onExportPrompts={handleExportPrompts}
            />
          </Suspense>
        )}
      </aside>

      {openPanel === "context" && (
        <aside
          className="drawer drawer-right is-open"
          aria-label="Repository context files"
        >
          <header className="drawer-header">
            <div>
              <h2 className="drawer-title">Repo context</h2>
              <p className="drawer-subtitle">
                Upload files, preview the snippets, and choose which ones are
                sent as grounding context.
              </p>
            </div>
            <button
              className="drawer-close"
              type="button"
              aria-label="Close repo context"
              onClick={() => setOpenPanel(null)}
            >
              ×
            </button>
          </header>

          <div className="drawer-body">
            <div className="repo-context-summary">
              <span>
                {repoContextStats.uploadedCount === 0
                  ? "No files uploaded"
                  : `${repoContextStats.selectedCount} of ${repoContextStats.uploadedCount} included`}
              </span>
              {repoContextStats.selectedCount > 0 && (
                <span>
                  {repoContextStats.selectedChars.toLocaleString()} chars
                  selected
                </span>
              )}
            </div>

            {githubClientId && (
              <section
                className="github-connect-section"
                aria-label="GitHub repository import"
              >
                <div className="github-connected">
                  <div>
                    <span
                      className={`github-status-dot ${githubToken ? "connected" : ""}`}
                      aria-hidden="true"
                    />
                    <strong>
                      {githubToken ? "GitHub connected" : "Connect GitHub"}
                    </strong>
                  </div>
                  {githubToken ? (
                    <div className="github-connect-actions">
                      <button
                        className="btn-ghost small"
                        type="button"
                        onClick={() => void openGitHubRepoPicker()}
                      >
                        Pick repo
                      </button>
                      <button
                        className="btn-ghost small"
                        type="button"
                        onClick={disconnectGitHub}
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-ghost small"
                      type="button"
                      onClick={() => void beginGitHubConnect()}
                    >
                      Connect GitHub
                    </button>
                  )}
                </div>
                <p className="github-setup-note">
                  Create a GitHub OAuth App, enable device flow, and set{" "}
                  <code>VITE_GITHUB_CLIENT_ID</code> in your web app
                  environment.
                </p>
                {!githubToken && (
                  <p className="github-scope-warning">
                    ⚠ Connecting grants <strong>full repository access</strong>{" "}
                    (read and write) via the <code>repo</code> OAuth scope.
                    Ryft only reads file contents — it never writes to your
                    repositories.
                  </p>
                )}

                {githubDeviceSession &&
                  (githubFlowState === "awaiting_user" ||
                    githubFlowState === "polling") && (
                    <div className="github-device-card">
                      <p>
                        Open{" "}
                        <a
                          href={githubDeviceSession.verificationUri}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {githubDeviceSession.verificationUri}
                        </a>{" "}
                        and enter this code:
                      </p>
                      <button
                        className="device-code"
                        type="button"
                        onClick={() =>
                          copyText(
                            githubDeviceSession.userCode,
                            "github-device-code",
                          )
                        }
                      >
                        {githubDeviceSession.userCode}
                      </button>
                      <p className="github-hint">
                        {copiedTarget === "github-device-code"
                          ? "Code copied."
                          : "Ryft will keep polling until you approve the device."}
                      </p>
                    </div>
                  )}

                {githubToken && githubFlowState !== "loading_files" && (
                  <div className="repo-picker">
                    <input
                      className="palette-input"
                      type="search"
                      placeholder="Search GitHub repositories..."
                      value={githubRepoInput}
                      onChange={(event) =>
                        setGitHubRepoInput(event.target.value)
                      }
                    />
                    <div
                      className="repo-picker-list"
                      role="listbox"
                      aria-label="GitHub repositories"
                    >
                      {filteredGitHubRepos.slice(0, 30).map((repo) => (
                        <button
                          key={repo.full_name}
                          type="button"
                          className="repo-picker-item"
                          onClick={() => void importGitHubRepo(repo.full_name)}
                        >
                          <span>{repo.full_name}</span>
                          <span>
                            {repo.private ? "Private" : repo.default_branch}
                          </span>
                        </button>
                      ))}
                      {filteredGitHubRepos.length === 0 && (
                        <p className="repo-context-empty">
                          No repositories match that search.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {githubFlowState === "loading_files" && (
                  <p className="repo-context-note">
                    Loading repository files from GitHub…
                  </p>
                )}
                {githubError && (
                  <p className="repo-context-error">{githubError}</p>
                )}
              </section>
            )}

            <div className="repo-context-actions">
              <button
                className="btn-ghost"
                type="button"
                onClick={() => repoFileInputRef.current?.click()}
              >
                Upload files
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => repoFolderInputRef.current?.click()}
              >
                Upload folder
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => gitFolderInputRef.current?.click()}
              >
                Connect local Git
              </button>
              <input
                ref={repoFileInputRef}
                id="repo-context-upload"
                hidden
                type="file"
                multiple
                accept=".md,.txt,.ts,.tsx,.js,.jsx,.json,.css,.html,.yml,.yaml,.toml,.xml,.py,.java,.go,.rs,.c,.cpp,.h,.hpp,.cs,.rb,.php,.sql,.sh"
                onChange={(event) => void handleRepoFilesSelected(event)}
              />
              {/* webkitdirectory lets users pick a whole local folder */}
              <input
                ref={repoFolderInputRef}
                hidden
                type="file"
                multiple
                // @ts-expect-error webkitdirectory is not in React's HTMLInputElement types
                webkitdirectory=""
                onChange={(event) => void handleRepoFilesSelected(event)}
              />
              {/* Connect local Git: same folder picker but filters by gitignore + known excludes */}
              <input
                ref={gitFolderInputRef}
                hidden
                type="file"
                multiple
                // @ts-expect-error webkitdirectory is not in React's HTMLInputElement types
                webkitdirectory=""
                onChange={(event) => void handleGitFolderSelected(event)}
              />
              <button
                className="btn-ghost"
                type="button"
                onClick={clearRepoContextFiles}
                disabled={repoContextFiles.length === 0}
              >
                Clear files
              </button>
              <span className="repo-context-note">
                Upload files/folder manually, or use Connect local Git to
                auto-skip node_modules, build output, and .gitignore patterns.
              </span>
            </div>

            {repoContextUploadError && (
              <p className="repo-context-error">{repoContextUploadError}</p>
            )}
            {repoContextStorageError && (
              <p className="repo-context-error">{repoContextStorageError}</p>
            )}

            {repoContextFiles.length > 0 ? (
              <div className="repo-context-list">
                {repoContextFiles.map((file) => {
                  const preview = getRepoContextPreview(file.content);

                  return (
                    <div
                      key={file.id}
                      className={`repo-context-item ${file.included ? "included" : ""}`}
                    >
                      <div className="repo-context-item-row">
                        <label className="repo-context-item-main">
                          <input
                            type="checkbox"
                            checked={file.included}
                            onChange={(event) =>
                              handleRepoFileIncludeChange(
                                file.id,
                                event.target.checked,
                              )
                            }
                          />
                          <div className="repo-context-item-copy">
                            <span className="repo-context-item-path">
                              {file.path}
                            </span>
                            <span className="repo-context-item-meta">
                              {file.content.length.toLocaleString()} chars
                            </span>
                          </div>
                        </label>

                        <div className="repo-context-item-actions">
                          <button
                            className="btn-ghost small"
                            type="button"
                            onClick={() => togglePreview(file.id)}
                          >
                            {previewedRepoFileId === file.id
                              ? "Hide preview"
                              : "Preview"}
                          </button>
                          <button
                            className="btn-remove small"
                            type="button"
                            onClick={() => handleRepoFileRemove(file.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {previewedRepoFileId === file.id && (
                        <pre className="repo-context-preview">
                          {preview.text}
                          {preview.truncated ? "\n... [preview truncated]" : ""}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="repo-context-empty">
                Upload README files, package manifests, configs, or
                representative source files. Then check the ones you want
                included.
              </p>
            )}
          </div>
        </aside>
      )}

      {openPanel === "skills" && (
        <aside
          className="drawer drawer-right is-open"
          aria-label="Custom skills"
        >
          <header className="drawer-header">
            <div>
              <h2 className="drawer-title">Skills</h2>
              <p className="drawer-subtitle">
                Layer your own expertise on top of the built-in agents. Active
                on every refinement.
              </p>
            </div>
            <button
              className="drawer-close"
              type="button"
              aria-label="Close skills"
              onClick={() => setOpenPanel(null)}
            >
              ×
            </button>
          </header>
          <div className="drawer-body">
            <Suspense fallback={null}>
              <LazySkillManager
                skills={userSkills}
                onSave={(updated) => {
                  setUserSkills(updated);
                  saveUserSkills(updated);
                }}
              />
            </Suspense>
          </div>
        </aside>
      )}

      {openPanel === "rules" && (
        <aside
          className="drawer drawer-right is-open"
          aria-label="Custom boost instructions"
        >
          <header className="drawer-header">
            <div>
              <h2 className="drawer-title">Ryft Rules</h2>
              <p className="drawer-subtitle">
                Rules that shape every refinement — tone, structure, or
                constraints.
              </p>
            </div>
            <button
              className="drawer-close"
              type="button"
              aria-label="Close Ryft Rules"
              onClick={() => setOpenPanel(null)}
            >
              ×
            </button>
          </header>
          <div className="drawer-body">
            <textarea
              id="custom-boost-instructions"
              className="rules-textarea"
              value={customBoostInstructions}
              placeholder="Optional: add rules that should shape every boost, such as tone, structure, or constraints."
              onChange={(event) =>
                handleCustomBoostInstructionsChange(event.target.value)
              }
            />
          </div>
        </aside>
      )}

      {openPanel === "settings" && (
        <aside
          className="drawer drawer-right drawer-settings is-open"
          aria-label="Provider settings"
        >
          <header className="drawer-header">
            <div>
              <h2 className="drawer-title">Settings</h2>
              <p className="drawer-subtitle">
                Choose a provider, model, and key. Keys stay in this browser
                only.
              </p>
            </div>
            <button
              className="drawer-close"
              type="button"
              aria-label="Close settings"
              onClick={() => setOpenPanel(null)}
            >
              ×
            </button>
          </header>
          <div className="drawer-body">
            <Suspense fallback={null}>
              <LazyApiKeyInput
                provider={provider}
                apiKeys={apiKeys}
                model={model}
                onProviderChange={handleProviderChange}
                onApiKeyChange={handleApiKeyChange}
                onModelChange={handleModelChange}
                embedded
              />
            </Suspense>
          </div>
        </aside>
      )}

      {openPanel === "project" && (
        <aside
          className="drawer drawer-right drawer-project is-open"
          aria-label="Projects"
        >
          <header className="drawer-header">
            <div>
              <h2 className="drawer-title">Projects</h2>
              <p className="drawer-subtitle">
                {activeProject
                  ? `Active: ${activeProject.name} · ${projectHistory.length} refinements`
                  : "Group prompts into a project — recent results are injected as style examples."}
              </p>
            </div>
            <button
              className="drawer-close"
              type="button"
              aria-label="Close project panel"
              onClick={() => setOpenPanel(null)}
            >
              ×
            </button>
          </header>

          <div className="drawer-body">
            {/* Active project selector */}
            <div className="project-list">
              <button
                className={`project-item ${!activeProject ? "active" : ""}`}
                onClick={() => handleSelectProject(null)}
              >
                <span className="project-name">No project</span>
                <span className="project-meta">refinements not archived</span>
              </button>
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`project-item ${activeProject?.id === p.id ? "active" : ""}`}
                >
                  <button
                    className="project-item-select"
                    onClick={() => handleSelectProject(p)}
                  >
                    <span className="project-name">{p.name}</span>
                    {p.description && (
                      <span className="project-meta">{p.description}</span>
                    )}
                    <span className="project-meta">
                      {formatRelativeTime(p.updatedAt)}
                    </span>
                  </button>
                  <button
                    className="btn-remove small"
                    type="button"
                    onClick={() => void handleDeleteProject(p)}
                    aria-label={`Delete project ${p.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Create new project */}
            {showNewProjectForm ? (
              <div className="project-form">
                <input
                  className="project-form-input"
                  type="text"
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreateProject();
                  }}
                  autoFocus
                />
                <input
                  className="project-form-input"
                  type="text"
                  placeholder="Description (optional)"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                />
                <div className="project-form-actions">
                  <button
                    className="btn-primary"
                    onClick={() => void handleCreateProject()}
                    disabled={!newProjectName.trim()}
                  >
                    Create
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setShowNewProjectForm(false);
                      setNewProjectName("");
                      setNewProjectDesc("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn-ghost"
                style={{ marginTop: 8 }}
                onClick={() => setShowNewProjectForm(true)}
              >
                + New project
              </button>
            )}

            <div className="history-search-bar">
              <input
                className="library-search"
                placeholder="Search history…"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
              />
              <label className="history-global-toggle">
                <input
                  type="checkbox"
                  checked={historyGlobal}
                  onChange={(event) => setHistoryGlobal(event.target.checked)}
                />
                All projects
              </label>
            </div>

            {/* History for active project */}
            {(activeProject || (historyGlobal && historySearch.trim())) &&
              visibleHistory.length > 0 && (
                <div className="project-history">
                  <span className="project-history-label">
                    {historyGlobal && historySearch.trim()
                      ? `Global history — ${visibleHistory.length} matches`
                      : `History — ${visibleHistory.length} entr${visibleHistory.length === 1 ? "y" : "ies"}`}
                  </span>
                  {visibleHistory.map((record) => (
                    <div key={record.id} className="history-item">
                      <div className="history-item-header">
                        <span className="history-model">
                          {record.provider} · {record.model}
                        </span>
                        <span className="history-time">
                          {formatRelativeTime(record.createdAt)}
                        </span>
                      </div>
                      <p className="history-input">
                        {renderHighlightedText(record.input, historySearch)}
                      </p>
                      <p className="history-output">
                        {renderHighlightedText(record.output, historySearch)}
                      </p>
                      {record.tokensUsed && (
                        <span className="compare-chip">
                          {record.tokensUsed.totalTokens.toLocaleString()}{" "}
                          tokens
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

            {(activeProject || (historyGlobal && historySearch.trim())) &&
              visibleHistory.length === 0 && (
                <p className="repo-context-empty" style={{ marginTop: 12 }}>
                  {historySearch.trim()
                    ? "No history entries matched that search."
                    : "No refinements yet for this project. Run Ryft ✦ to start building history."}
                </p>
              )}
          </div>
        </aside>
      )}

      {paletteOpen && (
        <Suspense fallback={null}>
          <LazyCommandPalette
            commands={paletteCommands}
            onClose={() => setPaletteOpen(false)}
          />
        </Suspense>
      )}

      <footer className="app-footer">
        <span className={`footer-tier tier-${activeProvider.tier}`}>
          {activeProvider.tier === "free" ? "Free" : "Paid"}
        </span>
        <span>
          Using {activeProvider.label} ·{" "}
          {activeProvider.tier === "free" && provider !== "ollama"
            ? "free tier, keys stay in localStorage"
            : provider === "ollama"
              ? "runs locally on your machine"
              : "keys stay in localStorage only"}
        </span>
        <span className="footer-sep" aria-hidden="true">
          ·
        </span>
        <a
          href="https://ryft.dev/about"
          target="_blank"
          rel="noreferrer"
          className="footer-link"
        >
          About
        </a>
        <span className="footer-sep" aria-hidden="true">
          ·
        </span>
        <span className="footer-credits">
          Built by{" "}
          <a
            href="https://teambotics.app"
            target="_blank"
            rel="noreferrer"
            className="footer-link"
          >
            Teambotics
          </a>{" "}
          &amp;{" "}
          <a
            href="https://nikdesign.ca"
            target="_blank"
            rel="noreferrer"
            className="footer-link"
          >
            Nik Design
          </a>
        </span>
      </footer>
    </div>
  );
}
