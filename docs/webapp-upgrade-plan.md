# RyFine Web App — Upgrade Implementation Plan

> **For the implementing agent:** work through each phase in order. Each phase is self-contained and independently shippable. Run `npm --prefix web run build` and `npm --prefix web run lint` after each phase before moving to the next. Do not modify `site/` or `src/` unless a phase explicitly says to.

---

## Codebase orientation

| Path | Purpose |
|---|---|
| `web/src/App.tsx` | Root component — all state, all UI (≈1800 lines) |
| `web/src/App.css` | All component styles — "Voltage Instrument Deck" system |
| `web/src/index.css` | CSS custom properties (tokens) and resets |
| `web/src/lib/ryFine.ts` | Core refinement logic — `ryFine()`, `detectOutputType()`, `buildSystemPrompt()` |
| `web/src/lib/agents.ts` | `Agent` type and `AGENTS` array (8 agents) |
| `web/src/lib/providers.ts` | `Provider` type, `PROVIDERS` array, `MODELS` map |
| `web/src/lib/projects.ts` | `Project`, `PromptRecord`, `FewShotExample` types |
| `web/src/lib/projectStorage.ts` | IndexedDB persistence for projects and history |
| `web/src/lib/savedPrompts.ts` | `SavedPromptTemplate`, template rendering, import/export |
| `web/src/lib/repoContext.ts` | `RepoContextFile`, `buildRepoContext()`, `getRepoContextPreview()` |
| `web/src/lib/repoContextStorage.ts` | IndexedDB persistence for repo context files |
| `web/src/lib/imageUtils.ts` | `AppImage` type, paste and file reading helpers |
| `web/src/lib/gitFilter.ts` | Git-aware file filtering (skip node_modules, gitignore patterns) |
| `web/src/components/` | `AgentSelector`, `ApiKeyInput`, `PromptLibrary` components |

### Design system tokens (from `web/src/index.css`)

```css
--bg: #0a0a0c;          --surface: #131319;       --surface-2: #1b1b23;
--border: #26262f;       --border-strong: #383844;
--text: #8b8b99;         --text-h: #f4f4f6;        --code-bg: #15151b;
--accent: #c8f750;       --accent-ink: #0c1003;
--accent-bg: rgba(200,247,80,0.10);   --accent-border: rgba(200,247,80,0.38);
--accent-glow: rgba(200,247,80,0.45);
--ok: #46d98a;  --warn: #f5b73c;  --danger: #ff5d5d;  --info: #5cc8ff;
--display: 'Bricolage Grotesque'; --sans: 'Hanken Grotesk'; --mono: 'Geist Mono';
```

### Key `App.tsx` types and state to know

```ts
type BoostStatus = 'idle' | 'loading' | 'done' | 'error';
type AppTheme   = 'system' | 'light' | 'dark';
type CompareMode = 'repo' | 'models';
type CompareChoice = 'baseline' | 'repo';

interface BoostResult {
  output: string;
  status: BoostStatus;
  error: string;
  outputIsAnswer: boolean;
  durationMs: number | null;
  tokensUsed: BoostTokenUsage | null;
}
```

### `ryFine()` signature

```ts
export async function ryFine(
  request: RyFineRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<BoostTokenUsage | null>

interface RyFineRequest {
  promptText: string;
  provider: Provider;
  apiKey: string;
  model: string;
  agent: Agent;
  customInstructions?: string;
  repoContext?: string;
  image?: AppImage;
  fewShotExamples?: FewShotExample[];
}
```

---

## Phase 0 — Retire the VS Code extension

**Goal:** remove all VS Code extension code so the repo is purely a web product.

### Files to delete

- `src/` (entire directory)
- `resources/boostFile.png`, `resources/boostContextMenu.png`, `resources/boostChat.png` — replace with a single `resources/ryfine-preview.png` placeholder (can be a copy of any existing screenshot)
- `thirdpartynotice.txt` (extension-specific)

### Files to modify

**`package.json` (root):**
- Remove all fields that are VS Code extension metadata: `"publisher"`, `"displayName"`, `"engines"` (the `vscode` key), `"categories"`, `"activationEvents"`, `"contributes"`, `"main"`
- Remove dependencies: `@vscode/chat-extension-utils`, `@vscode/prompt-tsx`
- Remove devDependencies: `@types/vscode`
- Remove scripts: `"vscode:prepublish"`, `"compile"`, `"watch"`
- Keep: `"name"`, `"version"`, `"description"`, `"repository"`, `"license"`, `"scripts"` (build, build:web, build:site, lint)
- Update `"engines"` to only have `"node": "24.x"`

**`tsconfig.json` (root):**
- Remove `@types/vscode` from `compilerOptions.types` if present
- Remove `src/**` from `include` — the root tsconfig only needs to cover config files; `web/` has its own tsconfig

**`eslint.config.mjs` (root):**
- Remove any VS Code-specific lint rules or `src/` references

**`README.md`:**
- Remove the screenshot image tags that reference deleted resource files
- Keep the web app sections; remove the "VS Code extension" usage section

**`.github/copilot-instructions.md`:**
- Remove the extension entry from the repo map
- Remove `src/` from all references

**`.github/prompts/ryfine-chat-prompt.prompt.md`:**
- The `tools: ['ryFine']` tool no longer exists as a VS Code LM tool. Update the prompt to instruct Copilot to manually apply the prompt optimizer skill instead. Change `agent: 'agent'` to `agent: 'ask'`.

### Acceptance criteria

- `npm run build` succeeds (only builds web and site)
- `npm run lint` passes
- No `src/` directory exists
- `package.json` has no VS Code-specific fields

---

## Phase 1 — Prompt diff view

**Goal:** after refinement, a "Diff" toggle in the output pane header shows a word-level diff between the raw input and the refined output (green = added, strikethrough red = removed). Toggling back shows the full refined text.

### New file: `web/src/lib/wordDiff.ts`

Implement a word-level diff using the Myers diff algorithm or a simple LCS approach. Export:

```ts
export type DiffPart = { text: string; type: 'equal' | 'added' | 'removed' };
export function wordDiff(before: string, after: string): DiffPart[];
```

Rules:
- Tokenise on whitespace boundaries, preserving the whitespace as separate tokens
- Return an array of `DiffPart` objects
- Do not depend on any external library — implement in pure TypeScript

### New component: `web/src/components/DiffView.tsx`

```tsx
interface DiffViewProps {
  before: string;   // raw input
  after: string;    // refined output
}
```

Renders `wordDiff(before, after)` as inline `<span>` elements:
- `type === 'added'` → `<span class="diff-added">`
- `type === 'removed'` → `<span class="diff-removed">`
- `type === 'equal'` → plain text node

### Changes to `web/src/App.tsx`

Add state: `const [showDiff, setShowDiff] = useState(false);`

Reset `showDiff` to `false` whenever a new boost starts (inside `boost()` and `boostBoth()`).

In the output pane header (`.pane-header` for `pane-output`), add a "Diff" toggle button **only when** `singleResult.status === 'done' && singleResult.output && input`:

```tsx
<button
  className={`btn-ghost small ${showDiff ? 'is-active' : ''}`}
  onClick={() => setShowDiff(v => !v)}
  aria-pressed={showDiff}
>
  Diff
</button>
```

In `renderBoostResult()`, when `showDiff && result.output && input` is true, render `<DiffView before={input} after={result.output} />` instead of the `<ReactMarkdown>` block. Only apply in single output mode, not in compare cards.

### New CSS in `web/src/App.css`

```css
.diff-added {
  background: rgba(70, 217, 138, 0.18);
  color: var(--ok);
  border-radius: 3px;
  padding: 0 2px;
}

.diff-removed {
  background: rgba(255, 93, 93, 0.15);
  color: var(--danger);
  text-decoration: line-through;
  border-radius: 3px;
  padding: 0 2px;
  opacity: 0.8;
}
```

### Acceptance criteria

- Diff toggle button appears in the output pane header only after a successful single-mode refinement
- Clicking "Diff" shows an inline word-level diff rendered in the same area as the markdown output
- Added words are green, removed words are red with strikethrough
- Clicking "Diff" again restores the full refined markdown view
- Toggle resets to off whenever a new refinement starts
- Does not appear in compare mode

---

## Phase 2 — Mobile layout (tabbed)

**Goal:** on screens narrower than 720px, replace the side-by-side panes with a tab bar (Input / Output). A dot indicator on the Output tab signals when output is available.

### Changes to `web/src/App.tsx`

Add state: `const [mobileTab, setMobileTab] = useState<'input' | 'output'>('input');`

When `singleResult.status` transitions to `'done'` and `window.innerWidth < 720`, auto-switch to `'output'` tab. Use a `useEffect` watching `singleResult.status`.

After `boost()` is called, switch to `'output'` tab on mobile.

Wrap the entire `.prompt-workspace` content conditionally: on mobile (use a `useMobile` hook that returns `window.innerWidth < 720` and updates on resize), render:

```tsx
<div className="mobile-tabs">
  <div className="mobile-tab-bar" role="tablist">
    <button
      role="tab"
      aria-selected={mobileTab === 'input'}
      className={`mobile-tab ${mobileTab === 'input' ? 'active-tab' : ''}`}
      onClick={() => setMobileTab('input')}
    >
      Your prompt
    </button>
    <button
      role="tab"
      aria-selected={mobileTab === 'output'}
      className={`mobile-tab ${mobileTab === 'output' ? 'active-tab' : ''}`}
      onClick={() => setMobileTab('output')}
    >
      Refined prompt
      {singleResult.output && <span className="tab-dot" aria-hidden="true" />}
    </button>
  </div>
  <div role="tabpanel" hidden={mobileTab !== 'input'}>
    {/* existing .pane.pane-input content */}
  </div>
  <div role="tabpanel" hidden={mobileTab !== 'output'}>
    {/* existing .pane.pane-output content */}
  </div>
</div>
```

### New CSS in `web/src/App.css`

```css
@media (max-width: 720px) {
  .mobile-tabs { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .mobile-tab-bar {
    display: flex;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }
  .mobile-tab {
    flex: 1;
    padding: 12px 16px;
    font-size: 13px;
    font-weight: 600;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: color 0.15s, border-color 0.15s;
  }
  .mobile-tab.active-tab {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }
  .tab-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent-glow);
  }
}
```

### Acceptance criteria

- Below 720px the app shows a tab bar instead of side-by-side panes
- Tapping "Your prompt" shows the input pane; tapping "Refined prompt" shows the output
- A lime dot appears on the "Refined prompt" tab when output is available
- On desktop (≥720px) the layout is unchanged
- Drawers still open and close correctly on mobile

---

## Phase 3 — Iterative refinement loop

**Goal:** after a refinement completes, an "Adjust" input bar appears below the output. The user types a follow-up instruction (e.g. "make it shorter", "add TypeScript generics"). Submitting runs a new refinement where the previous output becomes the new input and the follow-up instruction is prepended to `customInstructions`. Each adjustment is tracked as an iteration with its own copy button. Up to 10 iterations are stored per session.

### New types (add to `web/src/App.tsx` or a new `web/src/lib/iterations.ts`)

```ts
interface Iteration {
  id: string;           // crypto.randomUUID()
  instruction: string;  // the follow-up the user typed
  result: BoostResult;
}
```

### Changes to `web/src/App.tsx`

Add state:
```ts
const [iterations, setIterations] = useState<Iteration[]>([]);
const [adjustInput, setAdjustInput] = useState('');
```

Reset `iterations` and `adjustInput` to `[]` and `''` inside `clear()` and whenever `input` changes (add a `useEffect` on `input`).

Add function `adjustRefinement()`:

```ts
const adjustRefinement = useCallback(async () => {
  if (!adjustInput.trim() || !singleResult.output) return;

  const basePrompt = iterations.length > 0
    ? iterations[iterations.length - 1].result.output
    : singleResult.output;

  const instruction = adjustInput.trim();
  setAdjustInput('');

  const controller = new AbortController();
  abortRef.current = controller;

  const iterResult: BoostResult = { ...EMPTY_RESULT, status: 'loading' };
  const newIteration: Iteration = { id: crypto.randomUUID(), instruction, result: iterResult };
  setIterations(prev => [...prev.slice(-9), newIteration]); // cap at 10

  await executeBoostRequest(
    {
      promptText: basePrompt,
      provider,
      model,
      agent,
      customInstructions: instruction + (customBoostInstructions ? '\n\n' + customBoostInstructions : ''),
      repoContext,
    },
    (updatedResult) => {
      setIterations(prev => prev.map(it =>
        it.id === newIteration.id ? { ...it, result: updatedResult } : it
      ));
    },
    controller,
  );
}, [adjustInput, singleResult.output, iterations, ...]);
```

### New component: `web/src/components/IterationChain.tsx`

Renders the list of `Iteration[]` objects. Each iteration card shows:
- A header: iteration number + the instruction text in italics
- The `BoostResult` output (rendered with `ReactMarkdown`)
- A Copy button
- Token count and duration chips (same `.compare-chip` class as existing)

The most recent iteration is visually highlighted with `border-color: var(--accent-border)`.

### Render in `web/src/App.tsx`

In the output pane, after `renderBoostResult(singleResult, ...)` and only in `outputMode === 'single'`:

```tsx
{iterations.length > 0 && (
  <IterationChain
    iterations={iterations}
    onCopy={(text) => copyText(text, 'iteration')}
    copiedTarget={copiedTarget}
  />
)}

{singleResult.status === 'done' && singleResult.output && outputMode === 'single' && (
  <div className="adjust-bar">
    <input
      className="adjust-input"
      placeholder="Adjust: make it shorter, add TypeScript types, more formal…"
      value={adjustInput}
      onChange={e => setAdjustInput(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          void adjustRefinement();
        }
      }}
    />
    <button
      className="btn-boost small-boost"
      onClick={() => void adjustRefinement()}
      disabled={!adjustInput.trim() || isLoading}
    >
      Adjust ✦
    </button>
  </div>
)}
```

### New CSS in `web/src/App.css`

```css
.adjust-bar {
  display: flex;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--accent-border);
  background: var(--accent-bg);
  flex-shrink: 0;
}

.adjust-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-h);
  font-size: 13px;
  font-family: var(--sans);
  outline: none;
}

.adjust-input:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 2px var(--accent-bg);
}

.adjust-input::placeholder {
  color: var(--text);
  opacity: 0.45;
  font-style: italic;
}

.iteration-chain { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }

.iteration-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
  transition: border-color 0.2s;
}

.iteration-card.latest { border-color: var(--accent-border); }

.iteration-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.iteration-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent);
}

.iteration-instruction {
  font-size: 12px;
  color: var(--text);
  font-style: italic;
  margin-left: 8px;
}

.iteration-body { padding: 14px; }
```

### Acceptance criteria

- Adjust bar appears below the output after a successful single-mode refinement
- Pressing Enter or clicking "Adjust ✦" runs a new refinement using the most recent output as input and the adjustment instruction as the guiding constraint
- Each adjustment renders as a new card in the iteration chain with its iteration number and instruction shown
- The most recent card has the lime accent border
- Each card has its own Copy button
- Clearing the main input also clears all iterations
- Works correctly in both dark and light themes

---

## Phase 4 — Onboarding / empty state

**Goal:** when the app loads with no input and no output, show 4 example prompts in the input pane that the user can click to load. The examples are dismissed permanently (localStorage) after the first successful boost.

### New file: `web/src/lib/examples.ts`

```ts
export interface ExamplePrompt {
  agent: Agent;
  label: string;
  prompt: string;
}

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    agent: 'coding',
    label: 'API endpoint',
    prompt: 'Write an endpoint that takes a user id and returns their recent orders',
  },
  {
    agent: 'content',
    label: 'Blog intro',
    prompt: 'Write an intro for a blog post about why developers should care about prompt engineering',
  },
  {
    agent: 'data',
    label: 'SQL query',
    prompt: 'Write a query to find the top 10 customers by revenue in the last 90 days',
  },
  {
    agent: 'auto',
    label: 'Code review',
    prompt: 'Review this pull request for security issues and suggest improvements',
  },
];
```

### Changes to `web/src/App.tsx`

Add constant: `const LS_ONBOARDING_DONE = 'ryfine_onboarding_done';`

Add state: `const [onboardingDone, setOnboardingDone] = useState(() => localStorage.getItem(LS_ONBOARDING_DONE) === 'true');`

Inside `boost()` (after a successful first run), set:
```ts
if (!onboardingDone) {
  setOnboardingDone(true);
  localStorage.setItem(LS_ONBOARDING_DONE, 'true');
}
```

In the input pane body, when `input === '' && !onboardingDone`, render above the `<textarea>`:

```tsx
<div className="onboarding-examples">
  <p className="onboarding-label">Try an example to see RyFine in action</p>
  <div className="example-grid">
    {EXAMPLE_PROMPTS.map(ex => (
      <button
        key={ex.label}
        className="example-card"
        onClick={() => {
          setInput(ex.prompt);
          handleAgentChange(ex.agent);
        }}
      >
        <span className="example-label">{ex.label}</span>
        <span className="example-preview">{ex.prompt}</span>
      </button>
    ))}
  </div>
</div>
```

The `<textarea>` should still be rendered but can be below the examples or the examples can live in the placeholder area (above the textarea, inside `.pane-input`).

### New CSS in `web/src/App.css`

```css
.onboarding-examples {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}

.onboarding-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.example-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.example-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.example-card:hover {
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--accent-bg) 60%, var(--surface-2));
}

.example-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent);
}

.example-preview {
  font-size: 12px;
  color: var(--text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

### Acceptance criteria

- On first load with empty input, four example cards appear in the input pane
- Clicking a card loads the prompt text into the textarea and sets the matching agent
- After the first successful refinement, the examples never appear again (persisted in localStorage)
- Examples do not appear if the user has previously used the app
- The textarea is still editable when examples are visible

---

## Phase 5 — GitHub repo context (OAuth device flow)

**Goal:** add a "Connect GitHub" button in the Context drawer that authenticates via GitHub's OAuth Device Flow (no redirect, no backend required). After auth, the user picks a repository; its file tree is fetched via the GitHub REST API and merged into `repoContextFiles` using the existing `createRepoContextFile` / `mergeRepoContextFiles` helpers.

### GitHub OAuth App setup (document in the UI)

The user must create a GitHub OAuth App with **no callback URL** (device flow only). The `client_id` is stored in a Vite env var: `VITE_GITHUB_CLIENT_ID`. If not set, the Connect GitHub button is hidden.

### New file: `web/src/lib/githubContext.ts`

```ts
export interface GitHubRepo {
  full_name: string;   // e.g. "nickhilster/ryfine"
  default_branch: string;
  private: boolean;
}

export interface GitHubFile {
  path: string;
  type: 'blob' | 'tree';
  url: string;
}

// Step 1: start device flow — returns device_code, user_code, verification_uri, interval
export async function startGitHubDeviceFlow(clientId: string): Promise<{
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
}>;

// Step 2: poll for token until approved or expired
export async function pollGitHubToken(
  clientId: string,
  deviceCode: string,
  interval: number,
  signal?: AbortSignal
): Promise<string>; // returns access_token

// Step 3: list user's repos (first 100, sorted by updated)
export async function listGitHubRepos(token: string): Promise<GitHubRepo[]>;

// Step 4: fetch all blob paths from the default branch tree (recursive)
export async function fetchRepoTree(token: string, fullName: string, branch: string): Promise<GitHubFile[]>;

// Step 5: fetch file content for a single blob path
export async function fetchFileContent(token: string, fullName: string, path: string): Promise<string>;
```

Implement each function against:
- `https://github.com/login/device/code`
- `https://github.com/login/oauth/access_token`
- `https://api.github.com/user/repos`
- `https://api.github.com/repos/{full_name}/git/trees/{branch}?recursive=1`
- `https://api.github.com/repos/{full_name}/contents/{path}`

All requests include `Accept: application/vnd.github+json` and `Authorization: Bearer {token}`.

Apply the same git-aware filtering as `web/src/lib/gitFilter.ts` to exclude `node_modules`, build dirs, binary extensions, and large files (>500 KB).

### State additions in `web/src/App.tsx`

```ts
const LS_GITHUB_TOKEN = 'ryfine_github_token';

const [githubToken, setGithubToken] = useState(() => localStorage.getItem(LS_GITHUB_TOKEN) ?? '');
const [githubFlowState, setGithubFlowState] = useState<
  'idle' | 'awaiting_user' | 'polling' | 'picking_repo' | 'loading_files' | 'error'
>('idle');
const [githubDeviceInfo, setGithubDeviceInfo] = useState<{ user_code: string; verification_uri: string } | null>(null);
const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
const [githubError, setGithubError] = useState('');
```

### UI additions in the Context drawer (`openPanel === 'context'`)

At the top of the Context drawer body, before the existing repo-context-actions, render:

```tsx
{import.meta.env.VITE_GITHUB_CLIENT_ID && (
  <div className="github-connect-section">
    {githubToken ? (
      <div className="github-connected">
        <span className="github-status-dot connected" />
        <span>GitHub connected</span>
        <button className="btn-ghost small" onClick={disconnectGitHub}>Disconnect</button>
        <button className="btn-ghost small" onClick={openRepoPicker}>Load repo…</button>
      </div>
    ) : (
      <button className="btn-ghost" onClick={startGitHubConnect} disabled={githubFlowState !== 'idle'}>
        Connect GitHub
      </button>
    )}

    {githubFlowState === 'awaiting_user' && githubDeviceInfo && (
      <div className="github-device-card">
        <p>Open <a href={githubDeviceInfo.verification_uri} target="_blank" rel="noreferrer">{githubDeviceInfo.verification_uri}</a> and enter:</p>
        <code className="device-code">{githubDeviceInfo.user_code}</code>
        <p className="github-hint">Waiting for approval…</p>
      </div>
    )}

    {githubFlowState === 'picking_repo' && (
      <select
        className="repo-picker"
        defaultValue=""
        onChange={e => void handleRepoPicked(e.target.value)}
      >
        <option value="" disabled>Pick a repository…</option>
        {githubRepos.map(r => (
          <option key={r.full_name} value={r.full_name}>{r.full_name}</option>
        ))}
      </select>
    )}

    {githubFlowState === 'loading_files' && (
      <p className="github-hint">Loading repository files…</p>
    )}

    {githubError && <p className="repo-context-error">{githubError}</p>}
  </div>
)}
```

`disconnectGitHub` clears the token from state and localStorage. `handleRepoPicked` fetches the tree, then fetches each file's content (in parallel, max 20 concurrent), converts each to a `RepoContextFile` via `createRepoContextFile`, and merges into `repoContextFiles` with `mergeRepoContextFiles`.

### New CSS in `web/src/App.css`

```css
.github-connect-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}

.github-connected {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-h);
}

.github-status-dot.connected {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 6px rgba(70, 217, 138, 0.5);
}

.github-device-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
}

.device-code {
  font-family: var(--mono);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--accent);
  padding: 8px 12px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  text-align: center;
}

.github-hint {
  font-size: 12px;
  color: var(--text);
  opacity: 0.7;
  margin: 0;
}

.repo-picker {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-h);
  font-size: 13px;
  font-family: var(--sans);
  cursor: pointer;
  outline: none;
}

.repo-picker:focus { border-color: var(--accent-border); }
```

### Acceptance criteria

- "Connect GitHub" button is only visible when `VITE_GITHUB_CLIENT_ID` is set
- Clicking it starts the device flow and shows a user code + link
- After the user approves in GitHub, the token is stored in localStorage and the UI shows "GitHub connected"
- "Load repo…" opens a repo picker showing the user's repos
- Selecting a repo fetches all non-binary files ≤500 KB, applies git-aware filtering, and merges them into repo context
- Files appear in the existing repo context list with the same include/exclude checkboxes
- "Disconnect" clears the token and removes the connected state
- Errors surface in the existing `repo-context-error` style

---

## Phase 6 — Keyboard navigation (`⌘K` command palette)

**Goal:** a `⌘K` / `Ctrl+K` shortcut opens a command palette modal. The user can type to filter commands and press `Enter` to invoke one.

### New file: `web/src/components/CommandPalette.tsx`

```tsx
interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}
```

Renders:
- A full-screen backdrop (similar to `.modal-backdrop`)
- A search input auto-focused on open
- A filtered list of commands (`label` includes the search query, case-insensitive)
- Keyboard navigation: `↑` / `↓` to move between commands, `Enter` to invoke, `Escape` to close
- Each command row: label on the left, shortcut (if any) on the right in a `<kbd>` element

### Commands to register (build this list in `App.tsx`)

```ts
const paletteCommands: Command[] = [
  { id: 'boost',         label: 'RyFine — refine prompt',         shortcut: '⌘↵',  action: () => void boost(),          disabled: !canBoost },
  { id: 'clear',         label: 'Clear prompt and output',                          action: clear,                        disabled: !input && !singleResult.output },
  { id: 'copy-output',   label: 'Copy refined output',                              action: () => copyText(singleResult.output, 'palette'), disabled: !singleResult.output },
  { id: 'paste',         label: 'Paste from clipboard',                             action: () => void pasteInput() },
  { id: 'toggle-diff',   label: showDiff ? 'Hide diff view' : 'Show diff view',    action: () => setShowDiff(v => !v),  disabled: !singleResult.output },
  { id: 'open-settings', label: 'Open settings',                                   action: () => setOpenPanel('settings') },
  { id: 'open-context',  label: 'Open repo context',                                action: () => setOpenPanel('context') },
  { id: 'open-library',  label: 'Open prompt library',                              action: () => setOpenPanel('library') },
  { id: 'open-project',  label: 'Open projects',                                   action: () => setOpenPanel('project') },
  { id: 'cycle-theme',   label: 'Cycle theme (light / dark / system)',              action: cycleTheme },
  { id: 'toggle-ab',     label: 'Toggle A/B model comparison',                     action: () => setShowModelB(v => !v) },
];
```

### Global keydown handler in `App.tsx`

```ts
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setPaletteOpen(v => !v);
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

Add state: `const [paletteOpen, setPaletteOpen] = useState(false);`

Render `<CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />` when `paletteOpen`.

### New CSS in `web/src/App.css`

Style the palette using the same `.modal-backdrop` and `.prompt-modal` pattern already in the codebase. Add:

```css
.palette-input {
  width: 100%;
  padding: 12px 14px;
  font-size: 15px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-h);
  font-family: var(--sans);
  outline: none;
  border-radius: 12px 12px 0 0;
}

.palette-list { list-style: none; max-height: 320px; overflow-y: auto; }

.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-h);
  transition: background 0.1s;
}

.palette-item:hover,
.palette-item.focused { background: var(--surface-2); }

.palette-item.disabled { opacity: 0.35; pointer-events: none; }

.palette-kbd {
  font-family: var(--mono);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--bg);
  border: 1px solid var(--border-strong);
  color: var(--text);
}
```

### Acceptance criteria

- `⌘K` / `Ctrl+K` opens the command palette from anywhere in the app
- Typing filters the command list in real time
- `↑` / `↓` navigate; `Enter` invokes; `Escape` closes
- Disabled commands appear greyed out and are not invocable
- All listed commands execute correctly
- Palette closes after invoking a command

---

## Phase 7 — Output actions bar

**Goal:** after a successful refinement, an "Open in…" row below the Copy button lets users send the refined prompt directly to Claude, ChatGPT, or Perplexity in a new tab. Each destination encodes the refined output as a URL parameter.

### URL schemes

| Destination | URL |
|---|---|
| Claude | `https://claude.ai/new?q={encodeURIComponent(output)}` |
| ChatGPT | `https://chatgpt.com/?q={encodeURIComponent(output)}` |
| Perplexity | `https://www.perplexity.ai/search?q={encodeURIComponent(output)}` |

### Changes to `web/src/App.tsx`

In the output pane footer (`.pane-footer` when `singleResult.output`), add an "Open in" section after the Copy button:

```tsx
<div className="open-in-row">
  <span className="open-in-label">Open in</span>
  {[
    { label: 'Claude', url: `https://claude.ai/new?q=${encodeURIComponent(singleResult.output)}` },
    { label: 'ChatGPT', url: `https://chatgpt.com/?q=${encodeURIComponent(singleResult.output)}` },
    { label: 'Perplexity', url: `https://www.perplexity.ai/search?q=${encodeURIComponent(singleResult.output)}` },
  ].map(dest => (
    <a
      key={dest.label}
      href={dest.url}
      target="_blank"
      rel="noreferrer"
      className="open-in-btn"
    >
      {dest.label} ↗
    </a>
  ))}
</div>
```

Also add these to the command palette (Phase 6): "Open in Claude", "Open in ChatGPT", "Open in Perplexity".

### New CSS in `web/src/App.css`

```css
.open-in-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.open-in-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text);
  opacity: 0.55;
}

.open-in-btn {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  text-decoration: none;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.open-in-btn:hover {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-bg);
}
```

### Acceptance criteria

- "Open in" row appears in the output pane footer after a successful single-mode refinement
- Clicking each button opens the provider in a new tab with the refined output pre-filled in the query
- Row does not appear during loading or in compare mode
- Works correctly in both themes

---

## Phase 8 — WebLLM in-browser AI provider

**Goal:** add a `browser` provider powered by `@mlc-ai/web-llm` that runs a small model entirely in the browser. No API key, no Ollama required. The model is downloaded once and cached in the browser's cache storage.

### Install

```bash
npm --prefix web install @mlc-ai/web-llm
```

### New file: `web/src/lib/webllmProvider.ts`

```ts
import * as webllm from '@mlc-ai/web-llm';

// Supported models (small enough to run in-browser)
export const WEBLLM_MODELS = [
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Phi 3.5 Mini (2.2 GB)' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 1.5B (1.0 GB)' },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', label: 'SmolLM2 1.7B (1.1 GB)' },
];

export type WebLLMLoadStatus = {
  stage: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';
  progress?: number; // 0–1
  label?: string;
  error?: string;
};

// Singleton engine — reuse across requests for same model
let engine: webllm.MLCEngine | null = null;
let loadedModelId: string | null = null;

export async function ensureWebLLMEngine(
  modelId: string,
  onStatus: (status: WebLLMLoadStatus) => void,
  signal?: AbortSignal,
): Promise<webllm.MLCEngine>;

export async function runWebLLMCompletion(
  engine: webllm.MLCEngine,
  systemPrompt: string,
  userMessage: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<{ promptTokens: number; completionTokens: number; totalTokens: number } | null>;
```

### Changes to `web/src/lib/providers.ts`

Add to `Provider` type:
```ts
export type Provider = 'ollama' | 'openrouter' | 'gemini' | 'groq' | 'anthropic' | 'openai' | 'deepseek' | 'browser';
```

Add to `PROVIDERS` array:
```ts
{ id: 'browser', label: 'Browser AI', tier: 'free', placeholder: '', requiresKey: false, visionSupport: 'no' }
```

Add to `MODELS`:
```ts
browser: WEBLLM_MODELS.map(m => ({ id: m.id, label: m.label })),
```

Add to `DEFAULT_MODEL`:
```ts
browser: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
```

### Changes to `web/src/lib/ryFine.ts`

Add a `boostWebLLM` case to `ryFine()`:

```ts
case 'browser': {
  // import ensureWebLLMEngine and runWebLLMCompletion from './webllmProvider'
  const eng = await ensureWebLLMEngine(request.model, () => {}, signal);
  return runWebLLMCompletion(eng, systemPrompt, wrapUserMessage(request.promptText, request.repoContext), onChunk, signal);
}
```

The `onStatus` callback should surface download/load progress. Wire this up via a new app-level state `webllmStatus: WebLLMLoadStatus` that is passed through from `App.tsx` via a ref or context.

### UI additions in `web/src/App.tsx`

Add state: `const [webllmStatus, setWebllmStatus] = useState<WebLLMLoadStatus>({ stage: 'idle' });`

When `provider === 'browser'` and `webllmStatus.stage === 'downloading'` or `'loading'`, show a progress indicator in the output pane instead of the standard loading state:

```tsx
<div className="webllm-status">
  <div className="webllm-bar">
    <div className="webllm-fill" style={{ width: `${(webllmStatus.progress ?? 0) * 100}%` }} />
  </div>
  <span className="webllm-label">
    {webllmStatus.stage === 'downloading' ? 'Downloading model…' : 'Loading model into memory…'}
    {webllmStatus.progress != null && ` ${Math.round(webllmStatus.progress * 100)}%`}
  </span>
</div>
```

Show a note in the Settings drawer when `browser` is selected:

```tsx
<p className="ollama-note">
  Browser AI runs the model locally in this tab — no API key or Ollama required. The model is downloaded once (~1–2 GB) and cached in your browser.
</p>
```

### New CSS in `web/src/App.css`

```css
.webllm-status { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }

.webllm-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.webllm-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--accent-soft));
  transition: width 0.3s;
}

.webllm-label {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text);
}
```

### Acceptance criteria

- "Browser AI" appears as a provider option
- Selecting it shows the available model list and a note about local execution
- First use downloads the model with a visible progress bar
- Subsequent uses (same model) skip downloading — engine is reused
- Refinement streams normally after the model is loaded
- No network call is made to any external API during refinement
- Works in Chromium-based browsers (WebGPU required); shows a helpful error in unsupported browsers

---

## Phase 9 — Prompt history search

**Goal:** a search input at the top of the project history panel filters history entries in real time. A "Global search" toggle searches across all projects, not just the active one.

### New function in `web/src/lib/projectStorage.ts`

```ts
export async function searchAllRecords(query: string, limit = 50): Promise<PromptRecord[]>;
```

Opens the IndexedDB `records` object store, iterates all entries, and returns those where `input` or `output` contains the query string (case-insensitive). Sort descending by `createdAt`.

### Changes to `web/src/App.tsx`

Add state:
```ts
const [historySearch, setHistorySearch] = useState('');
const [historyGlobal, setHistoryGlobal] = useState(false);
const [globalSearchResults, setGlobalSearchResults] = useState<PromptRecord[]>([]);
```

In the project drawer (`openPanel === 'project'`), add above the history list:

```tsx
<div className="history-search-bar">
  <input
    className="library-search"
    placeholder="Search history…"
    value={historySearch}
    onChange={e => setHistorySearch(e.target.value)}
  />
  <label className="history-global-toggle">
    <input
      type="checkbox"
      checked={historyGlobal}
      onChange={e => setHistoryGlobal(e.target.checked)}
    />
    All projects
  </label>
</div>
```

Filter `projectHistory` client-side when `historySearch` is set and `!historyGlobal`.

When `historyGlobal` is true, call `searchAllRecords(historySearch)` in a debounced `useEffect` and display `globalSearchResults` instead.

Highlight matching substrings in the history item preview using a `<mark>` element styled with:

```css
mark { background: var(--accent-bg); color: var(--accent); border-radius: 2px; }
```

### Acceptance criteria

- Search input in the project drawer filters history entries in real time
- Matching is case-insensitive and covers both `input` and `output` fields
- "All projects" checkbox triggers a cross-project search
- Clearing the search restores the full project history
- Empty search state shows the normal unfiltered list

---

## Phase 10 — PWA (installable app)

**Goal:** make the web app installable as a desktop or home-screen app via a PWA manifest and service worker.

### Install

```bash
npm --prefix web install -D vite-plugin-pwa
```

### Changes to `web/vite.config.ts`

```ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'RyFine',
        short_name: 'RyFine',
        description: 'Sharpen every prompt.',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
});
```

### New assets in `web/public/`

Create `icon-192.png` and `icon-512.png` — both should be the ⚡ bolt on the `#0a0a0c` background. Use the existing `resources/icon.png` as the source; resize to 192×192 and 512×512 using sharp or a similar tool, or generate simple SVG-based icons.

### Acceptance criteria

- `npm --prefix web run build` produces a service worker and manifest
- In Chrome, the install prompt appears after visiting the built app
- Installed app opens without a browser chrome bar
- App loads offline (cached shell)
- Theme colour is `#0a0a0c` (dark)

---

## Phase 11 — Prompt quality scoring

**Goal:** after a refinement, display a lightweight quality score (0–100) with three sub-scores: Specificity, Structure, and Clarity. Computed entirely client-side — no extra API call.

### New file: `web/src/lib/promptScore.ts`

```ts
export interface PromptScore {
  total: number;        // 0–100
  specificity: number;  // 0–33
  structure: number;    // 0–33
  clarity: number;      // 0–34
}

export function scorePrompt(raw: string, refined: string): PromptScore;
```

**Specificity (0–33):** counts technical nouns, type names, constraint phrases ("at most", "must", "should not", "returns", "throws"), proper nouns, and quantifiers. Score = `min(33, specificTerms * 3)`.

**Structure (0–33):** rewards bullet lists (`-` or `*` lines), numbered lists, headings (`#`), and code fences. Score = `min(33, structuralElements * 5)`.

**Clarity (0–34):** penalises filler phrases ("please", "just", "simply", "kind of", "sort of", "a bit"), vague imperatives ("do something", "handle it"), and rewards length increase relative to raw (`clamp((refinedWords - rawWords) / rawWords, 0, 1) * 20`) plus sentence count.

### New component: `web/src/components/QualityScore.tsx`

```tsx
interface QualityScoreProps {
  score: PromptScore;
}
```

Renders a compact row of three mini gauges (filled bars) and the total score. Colour:
- 0–49: `var(--danger)`
- 50–74: `var(--warn)`
- 75–100: `var(--ok)`

### Changes to `web/src/App.tsx`

Compute the score after `singleResult.status === 'done'`:

```ts
const qualityScore = useMemo(() =>
  singleResult.status === 'done' && singleResult.output && input
    ? scorePrompt(input, singleResult.output)
    : null,
  [singleResult.status, singleResult.output, input]
);
```

Render `<QualityScore score={qualityScore} />` in the output pane header row, next to the Diff toggle, when `qualityScore !== null`.

### New CSS in `web/src/App.css`

```css
.quality-score {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
}

.quality-score.score-high  { color: var(--ok);    border-color: rgba(70,217,138,0.3); background: rgba(70,217,138,0.08); }
.quality-score.score-mid   { color: var(--warn);   border-color: rgba(245,183,60,0.3);  background: rgba(245,183,60,0.08); }
.quality-score.score-low   { color: var(--danger); border-color: rgba(255,93,93,0.3);  background: rgba(255,93,93,0.08); }

.quality-sub-bars {
  display: flex;
  gap: 3px;
  align-items: center;
}

.quality-sub-bar {
  width: 16px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  overflow: hidden;
}

.quality-sub-fill {
  height: 100%;
  border-radius: inherit;
  background: currentColor;
}
```

### Acceptance criteria

- A compact score chip appears in the output pane header after successful single-mode refinement
- Total score is 0–100; colour reflects the range (green / amber / red)
- Hovering the chip shows a tooltip or inline breakdown of the three sub-scores
- Score is not shown during loading, in error state, or in compare mode
- Score resets when input changes or output is cleared

---

## Implementation order summary

| Phase | Feature | Effort | Depends on |
|---|---|---|---|
| 0 | Extension retirement | XS | — |
| 1 | Diff view | S | Phase 0 |
| 2 | Mobile layout | S | Phase 0 |
| 3 | Iterative refinement | M | Phase 0 |
| 4 | Onboarding | S | Phase 0 |
| 5 | GitHub repo context | L | Phase 0 |
| 6 | Command palette | M | Phases 1–4 (references their state) |
| 7 | Output actions bar | XS | Phase 0 |
| 8 | WebLLM provider | L | Phase 0 |
| 9 | History search | S | Phase 0 |
| 10 | PWA | S | Phase 0 |
| 11 | Quality scoring | M | Phase 1 (shares output pane header) |

---

## Validation after all phases

```bash
npm --prefix web run build   # must succeed with no errors
npm --prefix web run lint    # must pass with no new warnings
npm run build                # full build including site/ must succeed
```

Manually verify in Chrome and Firefox:
- All 11 phases work independently
- Dark and light themes render correctly at every phase
- Mobile layout (≤720px) looks correct
- No console errors on load or during normal use
