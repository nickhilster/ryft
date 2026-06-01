# RyFine Browser Extension Implementation Plan

> Status: Implemented on 2026-05-31. This file is preserved as a planning artifact; the shipped extension follows the same monorepo/core-extraction direction, but uses the custom Vite-based build and packaging scripts in `extension/scripts/build.mjs` and `extension/scripts/pack.mjs` rather than WXT.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the shared boost engine into `packages/core/`, then build a Manifest V3 browser extension (Chrome, Edge, Firefox) that lets users boost prompts via context menu or popup from any web page.

**Architecture:** The repo becomes a monorepo with npm workspaces: `packages/core/` holds the provider-agnostic boost logic (`ryFine.ts`, `agents.ts`, `providers.ts`, `imageUtils.ts`); `web/` and `extension/` both import from `@ryfine/core`. The implemented extension uses a custom Vite-based build pipeline, a background service worker for API calls and context menu handling, a content script for DOM text injection, and a React popup for the manual boost UI.

**Tech Stack:** Custom Vite build scripts, React 19, TypeScript 6, Vitest, `@ryfine/core` workspace package, Manifest V3, `chrome.storage.local`, port-based streaming between background and popup.

---

## File Map

### New files
```
packages/core/
  package.json
  tsconfig.json
  src/
    index.ts            ← re-exports everything public
    ryFine.ts           ← MOVED from web/src/lib/ryFine.ts
    agents.ts           ← MOVED from web/src/lib/agents.ts
    providers.ts        ← MOVED from web/src/lib/providers.ts
    imageUtils.ts       ← MOVED from web/src/lib/imageUtils.ts

extension/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    background.ts       ← background service worker
    content.ts          ← content script
    popup/
      index.html
      main.tsx
      App.tsx
      App.css
    shared/
      types.ts          ← ExtensionSettings, message types
      storage.ts        ← chrome.storage.local helpers
  assets/
    icon-16.png
    icon-32.png
    icon-48.png
    icon-128.png
  tests/
    storage.test.ts
    inject.test.ts
```

### Modified files
```
package.json                              ← add workspaces array + build:extension script
web/package.json                          ← add @ryfine/core workspace dep
web/tsconfig.app.json                     ← add @ryfine/core path alias
web/src/App.tsx                           ← update 5 import lines
web/src/lib/boostAnalysis.ts              ← Agent import → @ryfine/core
web/src/lib/contextAssembler.ts           ← Agent import → @ryfine/core
web/src/lib/examples.ts                   ← Agent import → @ryfine/core
web/src/lib/gitFilter.ts                  ← scoreFilePath import stays (repoContext stays in web)
web/src/lib/savedPrompts.ts               ← Agent + Provider imports → @ryfine/core
web/src/lib/skills.ts                     ← Agent import → @ryfine/core
```

---

## Phase 0 — Monorepo & Core Extraction

> All tasks in this phase are sequential. The webapp must build cleanly at the end before any extension work starts.

---

### Task 1: Add npm workspaces to root

**Files:**
- Modify: `package.json`

- [ ] **Update root package.json**

```json
{
  "name": "ryfine-monorepo",
  "private": true,
  "workspaces": [
    "packages/*",
    "web",
    "extension",
    "site"
  ],
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "build": "npm run build:web && npm run build:site && npm run build:extension",
    "build:site": "npm --prefix site run build",
    "build:web": "npm --prefix web run build",
    "build:extension": "npm --prefix extension run build",
    "build:extension:firefox": "npm --prefix extension run build:firefox",
    "lint": "eslint"
  },
  "devDependencies": {
    "@eslint/js": "^9.13.0",
    "@stylistic/eslint-plugin": "^2.9.0",
    "@types/node": "^20.0.0",
    "eslint": "^9.13.0",
    "typescript": "^5.8.2",
    "typescript-eslint": "^8.26.0"
  }
}
```

- [ ] **Commit**

```bash
git add package.json
git commit -m "chore: add npm workspaces to root"
```

---

### Task 2: Create packages/core scaffold

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`

- [ ] **Create packages/core/package.json**

```json
{
  "name": "@ryfine/core",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.99.0",
    "openai": "^6.39.0"
  },
  "devDependencies": {
    "typescript": "~6.0.2"
  }
}
```

- [ ] **Create packages/core/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Install workspace deps from root**

```bash
npm install
```

Expected: `node_modules/@ryfine/core` symlinked to `packages/core`.

- [ ] **Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.json
git commit -m "chore: scaffold packages/core workspace"
```

---

### Task 3: Move ryFine.ts, agents.ts, providers.ts, imageUtils.ts to core

**Files:**
- Create: `packages/core/src/ryFine.ts` (moved)
- Create: `packages/core/src/agents.ts` (moved)
- Create: `packages/core/src/providers.ts` (moved)
- Create: `packages/core/src/imageUtils.ts` (moved)

- [ ] **Create packages/core/src/ and copy the four files**

```bash
mkdir packages/core/src
cp web/src/lib/ryFine.ts packages/core/src/ryFine.ts
cp web/src/lib/agents.ts packages/core/src/agents.ts
cp web/src/lib/providers.ts packages/core/src/providers.ts
cp web/src/lib/imageUtils.ts packages/core/src/imageUtils.ts
```

- [ ] **Verify the copied files have no relative imports that need fixing**

```bash
grep -n "from '\." packages/core/src/ryFine.ts
grep -n "from '\." packages/core/src/agents.ts
grep -n "from '\." packages/core/src/providers.ts
grep -n "from '\." packages/core/src/imageUtils.ts
```

`ryFine.ts` imports `./agents`, `./providers`, `./imageUtils` — update those to sibling paths (they'll resolve correctly since all four files are now in the same `src/` folder, so no change needed). Confirm no other relative imports exist.

- [ ] **Create packages/core/src/index.ts**

```typescript
// packages/core/src/index.ts
// Core boost engine — shared by webapp and extension.
export * from './agents';
export * from './providers';
export * from './imageUtils';
export * from './ryFine';
```

- [ ] **Commit**

```bash
git add packages/core/src/
git commit -m "feat(core): move ryFine, agents, providers, imageUtils to @ryfine/core"
```

---

### Task 4: Add @ryfine/core as a dependency in web/ and configure path alias

**Files:**
- Modify: `web/package.json`
- Modify: `web/tsconfig.app.json`

- [ ] **Add @ryfine/core to web/package.json dependencies**

Open `web/package.json`. Add to `"dependencies"`:

```json
"@ryfine/core": "*"
```

The full `dependencies` block becomes:
```json
"dependencies": {
  "@ryfine/core": "*",
  "@anthropic-ai/sdk": "^0.99.0",
  "@mlc-ai/web-llm": "^0.2.84",
  "openai": "^6.39.0",
  "react": "^19.2.6",
  "react-dom": "^19.2.6",
  "react-markdown": "^10.1.0"
}
```

Note: `@anthropic-ai/sdk` and `openai` remain in `web/package.json` because `web/` bundles them directly via Vite — `packages/core` uses them as peer deps at runtime via the workspace symlink.

- [ ] **Add path alias to web/tsconfig.app.json**

Open `web/tsconfig.app.json`. Add inside `"compilerOptions"`:

```json
"paths": {
  "@ryfine/core": ["../../packages/core/src/index.ts"]
}
```

- [ ] **Run npm install from root to link the workspace**

```bash
npm install
```

- [ ] **Commit**

```bash
git add web/package.json web/tsconfig.app.json
git commit -m "chore(web): depend on @ryfine/core workspace package"
```

---

### Task 5: Update web/src/App.tsx imports

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Replace the five lib imports that moved to core**

Find these lines near the top of `web/src/App.tsx`:

```typescript
} from "./lib/ryFine";
```
```typescript
} from "./lib/providers";
```
```typescript
} from "./lib/imageUtils";
```
```typescript
import { AGENTS } from "./lib/agents";
import type { Agent } from "./lib/agents";
```

Replace ALL FIVE with a single consolidated import block (preserve the exact named exports — add or remove nothing):

```typescript
import {
  detectOutputType,
  ryFine,
  type BoostTokenUsage,
  type RyFineRequest,
} from '@ryfine/core';
import {
  DEFAULT_MODEL,
  MODELS,
  PROVIDERS,
  type Provider,
} from '@ryfine/core';
import {
  type AppImage,
  extractPasteImage,
  formatImageSize,
  readImageFile,
} from '@ryfine/core';
import { AGENTS } from '@ryfine/core';
import type { Agent } from '@ryfine/core';
```

Keep every other `./lib/` import untouched.

- [ ] **Commit**

```bash
git add web/src/App.tsx
git commit -m "refactor(web): import ryFine/agents/providers/imageUtils from @ryfine/core"
```

---

### Task 6: Update cross-imports in remaining web/src/lib/ files

**Files:**
- Modify: `web/src/lib/boostAnalysis.ts`
- Modify: `web/src/lib/contextAssembler.ts`
- Modify: `web/src/lib/examples.ts`
- Modify: `web/src/lib/savedPrompts.ts`
- Modify: `web/src/lib/skills.ts`

Each change is a single import line replacement. Do all five in one commit.

- [ ] **web/src/lib/boostAnalysis.ts** — line 1

```typescript
// Before:
import type { Agent } from './agents';
// After:
import type { Agent } from '@ryfine/core';
```

- [ ] **web/src/lib/contextAssembler.ts** — line 1

```typescript
// Before:
import type { Agent } from './agents.ts';
// After:
import type { Agent } from '@ryfine/core';
```

- [ ] **web/src/lib/examples.ts** — line 1

```typescript
// Before:
import type { Agent } from './agents';
// After:
import type { Agent } from '@ryfine/core';
```

- [ ] **web/src/lib/savedPrompts.ts** — lines 1-2

```typescript
// Before:
import { isAgent, type Agent } from './agents.ts';
import { isProvider, type Provider } from './providers.ts';
// After:
import { isAgent, type Agent } from '@ryfine/core';
import { isProvider, type Provider } from '@ryfine/core';
```

- [ ] **web/src/lib/skills.ts** — line 1

```typescript
// Before:
import type { Agent } from './agents.ts';
// After:
import type { Agent } from '@ryfine/core';
```

- [ ] **Commit**

```bash
git add web/src/lib/boostAnalysis.ts web/src/lib/contextAssembler.ts \
        web/src/lib/examples.ts web/src/lib/savedPrompts.ts web/src/lib/skills.ts
git commit -m "refactor(web): update lib cross-imports to use @ryfine/core"
```

---

### Task 7: Verify webapp still builds and tests pass

**Files:** none (verification only)

- [ ] **Run the webapp build**

```bash
npm run build:web
```

Expected: `✓ built in <N>ms` with no TypeScript errors. If errors appear they will all be import-not-found errors — fix the path in the relevant file.

- [ ] **Run the webapp tests**

```bash
npm --prefix web test
```

Expected: all tests pass. The `repoContext.test.ts` and `savedPrompts.test.ts` tests import from `./src/lib/` directly — update any failing imports to `@ryfine/core` following the same pattern as Task 5-6.

- [ ] **Commit any test-file import fixes**

```bash
git add web/tests/
git commit -m "fix(web): update test imports after core extraction"
```

---

## Phase 1 — Extension Scaffold

> Sequential. Depends on Task 7 completing successfully.

---

### Task 8: Create extension/ with WXT

**Files:**
- Create: `extension/package.json`
- Create: `extension/wxt.config.ts`
- Create: `extension/tsconfig.json`
- Create: `extension/vitest.config.ts`

- [ ] **Create extension/package.json**

```json
{
  "name": "ryfine-extension",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt --browser firefox",
    "build": "wxt build",
    "build:firefox": "wxt build --browser firefox",
    "pack": "wxt zip",
    "pack:firefox": "wxt zip --browser firefox",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ryfine/core": "*",
    "react": "^19.2.6",
    "react-dom": "^19.2.6"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "@wxt-dev/module-react": "^1.0.0",
    "jsdom": "^26.0.0",
    "typescript": "~6.0.2",
    "vitest": "^3.0.0",
    "wxt": "^0.20.0"
  }
}
```

- [ ] **Create extension/wxt.config.ts**

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: '.output',
  manifest: {
    name: 'RyFine',
    description: 'Boost prompts in any tab — context menu or popup.',
    version: '1.0.0',
    permissions: ['contextMenus', 'storage', 'activeTab', 'scripting'],
    action: {
      default_title: 'RyFine — Boost Prompt',
    },
  },
});
```

- [ ] **Create extension/tsconfig.json**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@ryfine/core": ["../../packages/core/src/index.ts"]
    }
  }
}
```

Note: WXT generates `.wxt/tsconfig.json` on first run. The `extends` will be satisfied after the first `wxt build`.

- [ ] **Create extension/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@ryfine/core': new URL('../../packages/core/src/index.ts', import.meta.url).pathname,
    },
  },
});
```

- [ ] **Create extension/tests/setup.ts** (Chrome API stub)

```typescript
// extension/tests/setup.ts
import { vi } from 'vitest';

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    connect: vi.fn(),
    onConnect: { addListener: vi.fn() },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  tabs: {
    sendMessage: vi.fn(),
  },
});
```

- [ ] **Install extension deps from root**

```bash
npm install
```

- [ ] **Run first WXT build to generate .wxt/tsconfig.json**

```bash
npm --prefix extension run build
```

Expected: builds successfully and creates `extension/.output/chrome-mv3/`. A `manifest.json` will be generated inside.

- [ ] **Commit**

```bash
git add extension/
git commit -m "feat(extension): scaffold WXT extension with React and Vitest"
```

---

### Task 9: Add icon assets

**Files:**
- Create: `extension/assets/icon-16.png`
- Create: `extension/assets/icon-32.png`
- Create: `extension/assets/icon-48.png`
- Create: `extension/assets/icon-128.png`

- [ ] **Copy and resize the existing icon**

Source: `resources/icon.png` (exists at repo root)

Using any image tool (ImageMagick, sharp CLI, or manually in an image editor), produce four PNG files at exact sizes:

```bash
# If ImageMagick is available:
mkdir -p extension/assets
convert resources/icon.png -resize 16x16  extension/assets/icon-16.png
convert resources/icon.png -resize 32x32  extension/assets/icon-32.png
convert resources/icon.png -resize 48x48  extension/assets/icon-48.png
convert resources/icon.png -resize 128x128 extension/assets/icon-128.png
```

If ImageMagick is not available, copy `resources/icon.png` to all four paths as a placeholder — the extension will work; only the icon resolution will be suboptimal.

- [ ] **Reference icons in wxt.config.ts**

Update the `manifest` section in `extension/wxt.config.ts`:

```typescript
manifest: {
  name: 'RyFine',
  description: 'Boost prompts in any tab — context menu or popup.',
  version: '1.0.0',
  permissions: ['contextMenus', 'storage', 'activeTab', 'scripting'],
  icons: {
    16: 'icon-16.png',
    32: 'icon-32.png',
    48: 'icon-48.png',
    128: 'icon-128.png',
  },
  action: {
    default_title: 'RyFine — Boost Prompt',
    default_icon: {
      16: 'icon-16.png',
      32: 'icon-32.png',
    },
  },
},
```

- [ ] **Commit**

```bash
git add extension/assets/ extension/wxt.config.ts
git commit -m "feat(extension): add icon assets"
```

---

### Task 10: Define shared types and storage module

**Files:**
- Create: `extension/src/shared/types.ts`
- Create: `extension/src/shared/storage.ts`
- Create: `extension/tests/storage.test.ts`

- [ ] **Write the failing storage tests first**

```typescript
// extension/tests/storage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});

describe('saveSettings', () => {
  it('writes settings to chrome.storage.local under the "settings" key', async () => {
    const newSettings = { ...DEFAULT_SETTINGS, provider: 'gemini' as const };
    await saveSettings(newSettings);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ settings: newSettings });
  });
});
```

- [ ] **Run the failing tests**

```bash
npm --prefix extension test
```

Expected: FAIL — `Cannot find module '../src/shared/storage'`

- [ ] **Create extension/src/shared/types.ts**

```typescript
// extension/src/shared/types.ts
import type { Agent } from '@ryfine/core';
import type { Provider } from '@ryfine/core';
import type { BoostTokenUsage, RyFineRequest } from '@ryfine/core';

export interface ExtensionSettings {
  provider: Provider;
  model: string;
  /** Per-provider API keys. Key is the Provider value. */
  apiKeys: Partial<Record<Provider, string>>;
  agent: Agent;
  customInstructions: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: 'anthropic',
  model: 'claude-opus-4-5',
  apiKeys: {},
  agent: 'auto',
  customInstructions: '',
};

// ── Messages sent from popup → background via chrome.runtime.connect port ──

export type PortBoostRequest = {
  type: 'START';
  request: RyFineRequest;
};

export type PortBoostResponse =
  | { type: 'CHUNK'; text: string }
  | { type: 'DONE'; tokenUsage: BoostTokenUsage | null }
  | { type: 'ERROR'; error: string };

// ── One-shot messages sent to content script ────────────────────────────────

export type ContentMessage =
  | { type: 'INJECT_TEXT'; text: string }
  | { type: 'GET_SELECTED_TEXT' };

export type ContentResponse =
  | { type: 'SELECTED_TEXT'; text: string }
  | { type: 'INJECTED' };
```

- [ ] **Create extension/src/shared/storage.ts**

```typescript
// extension/src/shared/storage.ts
import type { ExtensionSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'settings';

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export function getApiKey(settings: ExtensionSettings): string {
  return settings.apiKeys[settings.provider] ?? '';
}
```

- [ ] **Run tests — verify they pass**

```bash
npm --prefix extension test
```

Expected: 3 tests pass.

- [ ] **Commit**

```bash
git add extension/src/shared/ extension/tests/storage.test.ts extension/tests/setup.ts
git commit -m "feat(extension): shared types and storage module with tests"
```

---

## Phase 2 — Background, Content Script, Popup

> **⚡ PARALLEL EXECUTION — Tasks 11, 12, and 13 are independent and can be dispatched to three separate agents simultaneously. All three depend on Task 10 completing first. Each agent works only in its own files and commits independently.**

---

### Task 11: Background service worker  *(Agent A)*

**Files:**
- Create: `extension/src/background.ts`

The background service worker owns three responsibilities:
1. Register the context menu on install
2. Handle context menu clicks: silently boost the selection and inject the result
3. Serve streaming boosts to the popup via a named port connection

- [ ] **Create extension/src/background.ts**

```typescript
// extension/src/background.ts
import { ryFine } from '@ryfine/core';
import { getSettings, getApiKey } from './shared/storage';
import type { PortBoostRequest, PortBoostResponse, ContentMessage } from './shared/types';

export default defineBackground(() => {

  // ── 1. Context menu registration ─────────────────────────────────────────

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'ryfine-boost',
      title: 'Boost with RyFine',
      contexts: ['selection'],
    });
  });

  // ── 2. Context menu click → silent boost → inject into page ──────────────

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'ryfine-boost') return;
    if (!info.selectionText || !tab?.id) return;

    const tabId = tab.id;

    // Show loading badge
    browser.action.setBadgeText({ text: '…', tabId });
    browser.action.setBadgeBackgroundColor({ color: '#6b7280', tabId });

    try {
      const settings = await getSettings();
      const apiKey = getApiKey(settings);

      if (!apiKey) {
        browser.action.setBadgeText({ text: '!', tabId });
        browser.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
        setTimeout(() => browser.action.setBadgeText({ text: '', tabId }), 3000);
        return;
      }

      let output = '';
      await ryFine(
        {
          promptText: info.selectionText,
          provider: settings.provider,
          model: settings.model,
          apiKey,
          agent: settings.agent,
          customInstructions: settings.customInstructions || undefined,
        },
        (chunk) => { output += chunk; },
      );

      const msg: ContentMessage = { type: 'INJECT_TEXT', text: output };
      await browser.tabs.sendMessage(tabId, msg);

      browser.action.setBadgeText({ text: '✓', tabId });
      browser.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
      setTimeout(() => browser.action.setBadgeText({ text: '', tabId }), 2000);

    } catch (err) {
      console.error('[RyFine background] context menu boost failed', err);
      browser.action.setBadgeText({ text: '!', tabId });
      browser.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
      setTimeout(() => browser.action.setBadgeText({ text: '', tabId }), 3000);
    }
  });

  // ── 3. Port-based streaming for popup boost ───────────────────────────────
  //
  // Popup opens: const port = browser.runtime.connect({ name: 'boost' })
  // Popup sends: { type: 'START', request: RyFineRequest }
  // Background replies with CHUNK* then DONE or ERROR

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'boost') return;

    port.onMessage.addListener(async (msg: PortBoostRequest) => {
      if (msg.type !== 'START') return;

      try {
        const usage = await ryFine(
          msg.request,
          (chunk) => {
            const reply: PortBoostResponse = { type: 'CHUNK', text: chunk };
            port.postMessage(reply);
          },
        );
        const done: PortBoostResponse = { type: 'DONE', tokenUsage: usage };
        port.postMessage(done);
      } catch (err) {
        const error: PortBoostResponse = { type: 'ERROR', error: String(err) };
        port.postMessage(error);
      }
    });
  });

});
```

- [ ] **Run build to verify no TypeScript errors**

```bash
npm --prefix extension run build
```

Expected: builds without errors. Ignore warnings about chunk size.

- [ ] **Commit**

```bash
git add extension/src/background.ts
git commit -m "feat(extension): background service worker with context menu and port streaming"
```

---

### Task 12: Content script  *(Agent B)*

**Files:**
- Create: `extension/src/content.ts`
- Create: `extension/tests/inject.test.ts`

The content script owns two responsibilities:
1. Listen for `INJECT_TEXT` messages and write boosted text into the focused input/textarea/contenteditable
2. Listen for `GET_SELECTED_TEXT` messages and reply with the current selection

- [ ] **Write the failing inject tests first**

```typescript
// extension/tests/inject.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

// Import the pure helper directly — not the WXT entrypoint
import { injectText, getSelectedText } from '../src/content';

describe('injectText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('replaces selected text in a textarea', () => {
    document.body.innerHTML = '<textarea id="t">hello world</textarea>';
    const el = document.getElementById('t') as HTMLTextAreaElement;
    el.focus();
    el.setSelectionRange(0, 5); // select "hello"

    injectText(el, 'boosted');

    expect(el.value).toBe('boosted world');
  });

  it('replaces entire textarea content when nothing is selected', () => {
    document.body.innerHTML = '<textarea id="t">original</textarea>';
    const el = document.getElementById('t') as HTMLTextAreaElement;
    el.focus();
    el.setSelectionRange(8, 8); // cursor at end, no selection

    injectText(el, 'replaced');

    expect(el.value).toBe('replaced');
  });

  it('replaces selected text in an input', () => {
    document.body.innerHTML = '<input id="i" value="foo bar" />';
    const el = document.getElementById('i') as HTMLInputElement;
    el.focus();
    el.setSelectionRange(4, 7); // select "bar"

    injectText(el, 'baz');

    expect(el.value).toBe('foo baz');
  });
});

describe('getSelectedText', () => {
  it('returns the window selection as a string', () => {
    document.body.innerHTML = '<p id="p">select me</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p')!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    expect(getSelectedText()).toBe('select me');
  });

  it('returns empty string when nothing is selected', () => {
    window.getSelection()!.removeAllRanges();
    expect(getSelectedText()).toBe('');
  });
});
```

- [ ] **Run the failing tests**

```bash
npm --prefix extension test -- tests/inject.test.ts
```

Expected: FAIL — `Cannot find module '../src/content'`

- [ ] **Create extension/src/content.ts**

```typescript
// extension/src/content.ts
import type { ContentMessage, ContentResponse } from './shared/types';

// ── Exported helpers (also imported by tests) ─────────────────────────────

/**
 * Inject text into a standard input or textarea, replacing the current
 * selection (or the entire value if nothing is selected).
 * Fires an 'input' event so React-controlled fields pick up the change.
 */
export function injectText(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
): void {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? el.value.length;
  const hadSelection = start !== end;

  if (hadSelection) {
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    el.selectionStart = start;
    el.selectionEnd = start + text.length;
  } else {
    el.value = text;
    el.selectionStart = 0;
    el.selectionEnd = text.length;
  }

  // Trigger React's synthetic event system
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLInputElement
      ? window.HTMLInputElement.prototype
      : window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(el, el.value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Inject text into a contenteditable element by replacing the selection
 * or inserting at the cursor position.
 */
export function injectIntoContentEditable(
  el: HTMLElement,
  text: string,
): void {
  el.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    document.execCommand('selectAll');
  }
  document.execCommand('insertText', false, text);
}

export function getSelectedText(): string {
  return window.getSelection()?.toString() ?? '';
}

// ── WXT content script entrypoint ────────────────────────────────────────

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    browser.runtime.onMessage.addListener(
      (msg: ContentMessage, _sender, sendResponse) => {

        if (msg.type === 'GET_SELECTED_TEXT') {
          const response: ContentResponse = {
            type: 'SELECTED_TEXT',
            text: getSelectedText(),
          };
          sendResponse(response);
          return false; // synchronous response
        }

        if (msg.type === 'INJECT_TEXT') {
          const active = document.activeElement;

          if (
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement
          ) {
            injectText(active, msg.text);
          } else if (
            active instanceof HTMLElement &&
            active.isContentEditable
          ) {
            injectIntoContentEditable(active, msg.text);
          } else {
            // No focused field — write to clipboard as fallback
            navigator.clipboard.writeText(msg.text).catch(() => {});
          }

          const response: ContentResponse = { type: 'INJECTED' };
          sendResponse(response);
          return false;
        }

        return false;
      },
    );
  },
});
```

- [ ] **Run the inject tests — verify they pass**

```bash
npm --prefix extension test -- tests/inject.test.ts
```

Expected: 5 tests pass.

- [ ] **Run full build**

```bash
npm --prefix extension run build
```

Expected: builds without TypeScript errors.

- [ ] **Commit**

```bash
git add extension/src/content.ts extension/tests/inject.test.ts
git commit -m "feat(extension): content script with text injection and tests"
```

---

### Task 13: Popup UI  *(Agent C)*

**Files:**
- Create: `extension/src/popup/index.html`
- Create: `extension/src/popup/main.tsx`
- Create: `extension/src/popup/App.tsx`
- Create: `extension/src/popup/App.css`

The popup mounts a React app. It has three views controlled by a `view` state string:
- `'boost'` — main view: agent/provider/model selectors, text area, boost button, output
- `'settings'` — API key fields per provider, custom instructions, save button

- [ ] **Create extension/src/popup/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RyFine</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Create extension/src/popup/main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Create extension/src/popup/App.tsx**

```typescript
import React, { useEffect, useRef, useState } from 'react';
import { AGENTS, MODELS, PROVIDERS, DEFAULT_MODEL } from '@ryfine/core';
import type { Agent, Provider, RyFineRequest } from '@ryfine/core';
import { getSettings, saveSettings } from '../shared/storage';
import type {
  ExtensionSettings,
  PortBoostRequest,
  PortBoostResponse,
  ContentMessage,
  ContentResponse,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';

type View = 'boost' | 'settings';
type Status = 'idle' | 'loading' | 'done' | 'error';

export default function App() {
  const [view, setView] = useState<View>('boost');
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [tokens, setTokens] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  // Load settings and pre-fill selected text from the active tab
  useEffect(() => {
    getSettings().then(setSettings);

    browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (!tab?.id) return;
        const msg: ContentMessage = { type: 'GET_SELECTED_TEXT' };
        browser.tabs
          .sendMessage<ContentMessage, ContentResponse>(tab.id, msg)
          .then((resp) => {
            if (resp?.type === 'SELECTED_TEXT' && resp.text.trim()) {
              setInput(resp.text.trim());
            }
          })
          .catch(() => {}); // content script not injected on this tab
      });
  }, []);

  function handleBoost() {
    const apiKey = settings.apiKeys[settings.provider] ?? '';
    if (!apiKey) {
      setError(`No API key configured for ${settings.provider}. Open settings ⚙`);
      return;
    }
    if (!input.trim()) {
      setError('Enter a prompt to boost.');
      return;
    }

    setOutput('');
    setError('');
    setTokens(null);
    setStatus('loading');

    const request: RyFineRequest = {
      promptText: input.trim(),
      provider: settings.provider,
      model: settings.model,
      apiKey,
      agent: settings.agent,
      customInstructions: settings.customInstructions || undefined,
    };

    const port = browser.runtime.connect({ name: 'boost' });
    portRef.current = port;
    let accumulated = '';

    port.onMessage.addListener((msg: PortBoostResponse) => {
      if (msg.type === 'CHUNK') {
        accumulated += msg.text;
        setOutput(accumulated);
      } else if (msg.type === 'DONE') {
        setTokens(msg.tokenUsage?.totalTokens ?? null);
        setStatus('done');
        port.disconnect();
        portRef.current = null;
      } else if (msg.type === 'ERROR') {
        setError(msg.error);
        setStatus('error');
        port.disconnect();
        portRef.current = null;
      }
    });

    const startMsg: PortBoostRequest = { type: 'START', request };
    port.postMessage(startMsg);
  }

  function handleCopy() {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleProviderChange(provider: Provider) {
    const model = DEFAULT_MODEL[provider];
    setSettings((s) => ({ ...s, provider, model }));
  }

  async function handleSaveSettings() {
    await saveSettings(settings);
    setView('boost');
  }

  // ── Settings view ──────────────────────────────────────────────────────

  if (view === 'settings') {
    return (
      <div className="popup">
        <header className="popup-header">
          <span className="popup-title">RyFine Settings</span>
          <button className="icon-btn" onClick={() => setView('boost')} title="Back">←</button>
        </header>

        <div className="settings-body">
          <label className="field-label">Provider</label>
          <select
            className="select"
            value={settings.provider}
            onChange={(e) => handleProviderChange(e.target.value as Provider)}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <label className="field-label">Model</label>
          <select
            className="select"
            value={settings.model}
            onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
          >
            {(MODELS[settings.provider] ?? []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <label className="field-label">API Key — {settings.provider}</label>
          <input
            className="input"
            type="password"
            placeholder="sk-..."
            value={settings.apiKeys[settings.provider] ?? ''}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                apiKeys: { ...s.apiKeys, [s.provider]: e.target.value },
              }))
            }
          />

          <label className="field-label">Custom instructions</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Always respond in bullet points…"
            value={settings.customInstructions}
            onChange={(e) =>
              setSettings((s) => ({ ...s, customInstructions: e.target.value }))
            }
          />

          <button className="btn-primary" onClick={handleSaveSettings}>
            Save
          </button>
        </div>
      </div>
    );
  }

  // ── Boost view ─────────────────────────────────────────────────────────

  return (
    <div className="popup">
      <header className="popup-header">
        <span className="popup-title">RyFine</span>
        <div className="popup-header-right">
          <select
            className="select-inline"
            value={settings.agent}
            onChange={(e) =>
              setSettings((s) => ({ ...s, agent: e.target.value as Agent }))
            }
          >
            {Object.keys(AGENTS).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button className="icon-btn" onClick={() => setView('settings')} title="Settings">⚙</button>
        </div>
      </header>

      <div className="boost-body">
        <textarea
          className="textarea"
          rows={5}
          placeholder="Paste or type your prompt…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        {error && <p className="error-text">{error}</p>}

        <button
          className="btn-primary"
          onClick={handleBoost}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Boosting…' : 'RyFine ↑'}
        </button>

        {output && (
          <div className="output-block">
            <div className="output-text">{output}</div>
            <div className="output-footer">
              {tokens !== null && (
                <span className="token-count">{tokens.toLocaleString()} tokens</span>
              )}
              <button className="btn-ghost-sm" onClick={handleCopy}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="popup-footer">
        <a
          href="https://www.ryfine.app"
          target="_blank"
          rel="noreferrer"
          className="footer-link"
        >
          Open full RyFine ↗
        </a>
      </footer>
    </div>
  );
}
```

- [ ] **Create extension/src/popup/App.css**

```css
/* extension/src/popup/App.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f0f0f;
  --surface: #1a1a1a;
  --border: #2a2a2a;
  --text: #e5e5e5;
  --muted: #888;
  --accent: #f97316;
  --accent-bg: rgba(249,115,22,0.1);
  --accent-border: rgba(249,115,22,0.4);
  --error: #ef4444;
  --radius: 6px;
  font-family: system-ui, -apple-system, sans-serif;
}

body { background: var(--bg); color: var(--text); }

.popup {
  width: 340px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

/* Header */
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border);
}
.popup-title { font-size: 13px; font-weight: 700; color: var(--accent); }
.popup-header-right { display: flex; align-items: center; gap: 6px; }
.icon-btn {
  background: none; border: none; cursor: pointer;
  color: var(--muted); font-size: 14px; padding: 2px 4px;
  border-radius: var(--radius);
}
.icon-btn:hover { color: var(--text); }

/* Body */
.boost-body, .settings-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Inputs */
.textarea, .input, .select {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 12px;
  padding: 7px 9px;
  resize: vertical;
  outline: none;
}
.textarea:focus, .input:focus, .select:focus {
  border-color: var(--accent-border);
}
.select-inline {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 11px;
  padding: 3px 6px;
  outline: none;
}

.field-label { font-size: 11px; color: var(--muted); font-weight: 600; }

/* Buttons */
.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-primary:hover { opacity: 0.88; }
.btn-primary:disabled { opacity: 0.45; cursor: default; }

.btn-ghost-sm {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}
.btn-ghost-sm:hover { color: var(--text); border-color: var(--accent-border); }

/* Output */
.output-block {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.output-text {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.55;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
}
.output-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 5px 10px;
  border-top: 1px solid var(--border);
}
.token-count { font-size: 10px; color: var(--muted); }

/* Misc */
.error-text { font-size: 11px; color: var(--error); }

/* Footer */
.popup-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  text-align: center;
}
.footer-link {
  font-size: 11px;
  color: var(--muted);
  text-decoration: none;
}
.footer-link:hover { color: var(--accent); }
```

- [ ] **Run build to verify no TypeScript errors**

```bash
npm --prefix extension run build
```

Expected: builds without errors.

- [ ] **Commit**

```bash
git add extension/src/popup/
git commit -m "feat(extension): popup UI with boost and settings views"
```

---

## Phase 3 — Integration

> Sequential. Depends on Tasks 11, 12, and 13 completing.

---

### Task 14: Wire popup selected-text pre-fill and end-to-end smoke test

**Files:** none (verification only — code was written in Task 12 and 13)

This task verifies the two main user flows work end-to-end.

- [ ] **Load the extension in Chrome**

1. Run `npm --prefix extension run build`
2. Open `chrome://extensions`
3. Enable **Developer mode** (toggle, top-right)
4. Click **Load unpacked** → select `extension/.output/chrome-mv3/`

- [ ] **Smoke test: context menu boost**

1. Open any webpage with a text input (e.g. `https://chatgpt.com` or a blank HTML page with `<textarea>`)
2. Click into the textarea and type "write a hello world function"
3. Select all the text
4. Right-click → **Boost with RyFine**
5. Expected: badge shows `…` then `✓`; the selected text is replaced with the boosted version

If the badge shows `!` (red), open the extension popup → Settings and add an API key for the active provider.

- [ ] **Smoke test: popup manual boost**

1. Click the RyFine extension icon
2. Expected: popup opens; if text was selected in the active tab, it should pre-fill the textarea
3. Type a prompt if not pre-filled, select an agent, click **RyFine ↑**
4. Expected: streaming output appears token by token; token count shows at bottom
5. Click **Copy** → paste in any editor to verify content

- [ ] **Smoke test: settings round-trip**

1. Click ⚙ in popup
2. Change provider to `openai`, enter a real OpenAI API key, click Save
3. Popup returns to boost view
4. Boost a prompt → expected: uses OpenAI

- [ ] **Commit (no code changes — this is a verification task)**

If bugs were found and fixed during testing, commit any fixes:

```bash
git add -A
git commit -m "fix(extension): smoke test fixes"
```

---

### Task 15: Firefox compatibility

**Files:**
- Modify: `extension/wxt.config.ts`

- [ ] **Add Firefox-specific manifest settings to wxt.config.ts**

WXT handles most cross-browser differences automatically. Add only the Firefox-specific gecko ID required for AMO submission:

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: '.output',
  manifest: {
    name: 'RyFine',
    description: 'Boost prompts in any tab — context menu or popup.',
    version: '1.0.0',
    permissions: ['contextMenus', 'storage', 'activeTab', 'scripting'],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_title: 'RyFine — Boost Prompt',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
      },
    },
    // Required for Firefox AMO listing
    browser_specific_settings: {
      gecko: {
        id: 'ryfine@ryfine.app',
        strict_min_version: '109.0',
      },
    },
  },
});
```

- [ ] **Build the Firefox version**

```bash
npm --prefix extension run build:firefox
```

Expected: creates `extension/.output/firefox-mv3/` with a Firefox-compatible `manifest.json`.

- [ ] **Load in Firefox**

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Navigate to `extension/.output/firefox-mv3/` and select `manifest.json`
4. Verify the extension icon appears in the Firefox toolbar
5. Run the same smoke tests from Task 14

- [ ] **Commit**

```bash
git add extension/wxt.config.ts
git commit -m "feat(extension): add Firefox gecko ID for AMO compatibility"
```

---

### Task 16: Build scripts and packaging

**Files:**
- Modify: `extension/package.json` (already has pack scripts — verify)
- No other changes

- [ ] **Verify pack scripts in extension/package.json**

Confirm these scripts are present (they were added in Task 8):

```json
"pack": "wxt zip",
"pack:firefox": "wxt zip --browser firefox"
```

- [ ] **Produce the Chrome ZIP**

```bash
npm --prefix extension run pack
```

Expected: creates `extension/.output/ryfine-1.0.0-chrome.zip` (or similar). This file is ready for Chrome Web Store submission.

- [ ] **Produce the Firefox ZIP**

```bash
npm --prefix extension run pack:firefox
```

Expected: creates `extension/.output/ryfine-1.0.0-firefox.zip`. Ready for AMO submission.

- [ ] **Run all tests one final time**

```bash
npm --prefix extension test
```

Expected: all tests pass.

- [ ] **Run full workspace build**

```bash
npm run build
```

Expected: `web`, `site`, and `extension` all build without errors.

- [ ] **Commit**

```bash
git add -A
git commit -m "feat(extension): production build and packaging scripts verified"
```

---

### Task 17: Add .output to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Add extension build output to .gitignore**

Open `.gitignore` and add at the bottom:

```
extension/.output/
extension/.wxt/
```

- [ ] **Commit**

```bash
git add .gitignore
git commit -m "chore: ignore extension build artifacts"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| npm workspaces monorepo | Task 1 |
| packages/core extraction | Tasks 2–6 |
| Webapp still builds after extraction | Task 7 |
| WXT scaffold, manifest V3 | Task 8 |
| Shared types + storage with tests | Tasks 9–10 |
| Background service worker + context menu | Task 11 |
| Content script + DOM injection with tests | Task 12 |
| Popup UI with streaming, settings, copy | Task 13 |
| End-to-end smoke test | Task 14 |
| Firefox compatibility | Task 15 |
| Build + packaging scripts | Task 16 |
| .gitignore for build output | Task 17 |

### Placeholder scan
- No "TBD" or "TODO" strings in code steps ✓
- All file contents are complete, no partial stubs ✓
- All imports shown explicitly ✓
- All commands shown with expected output ✓

### Type consistency check
- `ExtensionSettings` defined in `types.ts` Task 10, used in `storage.ts` Task 10, `background.ts` Task 11, `App.tsx` Task 13 ✓
- `PortBoostRequest` / `PortBoostResponse` defined Task 10, sent/received in Task 11 (background) and Task 13 (popup) ✓
- `ContentMessage` / `ContentResponse` defined Task 10, sent in Task 11 and Task 13, received in Task 12 ✓
- `RyFineRequest` comes from `@ryfine/core` — used in Task 11 and Task 13 ✓
- `DEFAULT_SETTINGS` defined in `types.ts`, imported in `storage.ts` and `App.tsx` ✓
- `injectText` exported from `content.ts` Task 12, imported in tests Task 12 ✓
- `getSelectedText` exported from `content.ts` Task 12, imported in tests Task 12 ✓
