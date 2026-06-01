import { cp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { build } from 'vite';

const browser = process.argv[2] === 'firefox' ? 'firefox' : 'chrome';
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(rootDir, '.output', `${browser}-mv3`);
const MAX_JS_CHUNK_BYTES = 1024 * 1024;

const iconFiles = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'];

await rm(outDir, { recursive: true, force: true });

const webllmProviderSrcSlug = 'packages/core/src/webllmProvider';
const webllmProviderStub = path.resolve(rootDir, 'src/stubs/webllmProvider.ts');

// Vite plugin that stubs @ryfine/core webllmProvider with a no-op so the dynamic
// import('@mlc-ai/web-llm') inside it is never emitted. Without this stub, Vite wraps
// that dynamic import with a preload helper that calls document.getElementsByTagName,
// which throws in the MV3 service worker.
const stubWebllmProviderPlugin = {
  name: 'stub-webllm-provider',
  enforce: 'pre',
  resolveId(id, importer) {
    if (!importer) return null;
    // Normalise to forward slashes for cross-platform matching.
    const norm = (s) => s.replace(/\\/g, '/');
    try {
      const resolved = norm(path.resolve(norm(path.dirname(importer)), id));
      if (resolved.includes(webllmProviderSrcSlug)) return webllmProviderStub;
    } catch {
      // ignore
    }
    return null;
  },
};

const buildResult = await build({
  root: rootDir,
  configFile: false,
  base: './',
  plugins: [react(), stubWebllmProviderPlugin],
  resolve: {
    alias: {
      '@mlc-ai/web-llm': path.join(rootDir, 'src/stubs/webllm.ts'),
    },
  },
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: false,
    // Disable module preloading entirely — the preload helper injects document.getElementsByTagName
    // which throws ReferenceError in the MV3 service worker (no DOM).
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: path.join(rootDir, 'src/popup/index.html'),
        background: path.join(rootDir, 'src/background.ts'),
        content: path.join(rootDir, 'src/content.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background' || chunkInfo.name === 'content') {
            return '[name].js';
          }

          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});

const buildResults = Array.isArray(buildResult) ? buildResult : [buildResult];
const oversizedJsChunks = buildResults.flatMap((result) => {
  if (!('output' in result)) {
    return [];
  }

  return result.output
    .filter((item) => item.type === 'chunk' && item.fileName.endsWith('.js'))
    .map((item) => ({
      fileName: item.fileName,
      sizeBytes: Buffer.byteLength(item.code, 'utf8'),
    }))
    .filter((item) => item.sizeBytes > MAX_JS_CHUNK_BYTES);
});

if (oversizedJsChunks.length > 0) {
  const details = oversizedJsChunks
    .map((item) => `${item.fileName} (${Math.round(item.sizeBytes / 1024)} KiB)`)
    .join(', ');

  throw new Error(
    `Extension bundle regression: oversized JavaScript chunk detected: ${details}. This usually means a large runtime leaked back into the extension bundle.`,
  );
}

for (const iconFile of iconFiles) {
  await cp(path.join(rootDir, 'assets', iconFile), path.join(outDir, iconFile));
}

const manifest = {
  manifest_version: 3,
  name: 'RyFine',
  description: 'Boost prompts in any tab from a popup or context menu.',
  version: '1.0.0',
  permissions: ['contextMenus', 'storage', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['content.js'],
      run_at: 'document_idle',
    },
  ],
  icons: {
    16: 'icon-16.png',
    32: 'icon-32.png',
    48: 'icon-48.png',
    128: 'icon-128.png',
  },
  action: {
    default_title: 'RyFine - Boost Prompt',
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icon-16.png',
      32: 'icon-32.png',
    },
  },
  ...(browser === 'firefox'
    ? {
        browser_specific_settings: {
          gecko: {
            id: 'ryfine@ryfine.app',
            strict_min_version: '109.0',
          },
        },
      }
    : {}),
};

await writeFile(
  path.join(outDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);