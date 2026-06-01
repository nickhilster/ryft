export const MAX_FILE_CONTEXT_CHARS = 6000;
export const MAX_TOTAL_CONTEXT_CHARS = 24000;
export const REPO_CONTEXT_PREVIEW_CHARS = 1200;

// Upload safety limits — prevent the browser from hanging on huge repos
export const MAX_UPLOAD_FILES = 500;
export const MAX_UPLOAD_FILE_CHARS = 100_000;        // 100 KB per file
export const MAX_UPLOAD_TOTAL_CHARS = 5_000_000;     // 5 MB across all stored files

// ── File relevance scoring ────────────────────────────────────────────────────
// Used in two places:
//   1. filterFilesForGitContext — ranks before the 500-file cap so the best
//      files survive, not just the first alphabetically.
//   2. buildRepoContext — sorts before filling the 24 KB AI window so the
//      most architecturally important files are sent first.

const HIGH_VALUE_FILENAMES = new Set([
  // Package manifests — tell you the whole stack at a glance
  'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod',
  'requirements.txt', 'Gemfile', 'composer.json',
  // Docs
  'README.md', 'README.mdx', 'CONTRIBUTING.md',
  // Framework / build configs — strong architecture signals
  'tsconfig.json', 'tsconfig.app.json', 'jsconfig.json',
  'vite.config.ts', 'vite.config.js',
  'next.config.ts', 'next.config.js', 'next.config.mjs',
  'nuxt.config.ts', 'svelte.config.js', 'astro.config.mjs',
  'tailwind.config.ts', 'tailwind.config.js',
  'drizzle.config.ts', 'schema.prisma',
  'Makefile', 'Dockerfile',
  '.env.example', '.env.sample',
]);

const LOW_VALUE_PATTERNS = [
  /\.test\.[^.]+$/,     // foo.test.ts
  /\.spec\.[^.]+$/,     // foo.spec.ts
  /\.stories\.[^.]+$/,  // foo.stories.tsx
  /\.snap$/,            // jest snapshots
  /\.min\.[^.]+$/,      // minified files
];

const CORE_SEGMENTS = new Set([
  'lib', 'libs', 'types', 'type', 'utils', 'util',
  'core', 'shared', 'common', 'helpers', 'hooks', 'composables',
]);

/**
 * Score a repo-relative file path by how useful it is as AI context.
 * Higher = more relevant. Used for both selection and ordering.
 */
export function scoreFilePath(filePath: string): number {
  const parts = filePath.split('/');
  const depth = parts.length - 1;   // 0 = root-level file
  const filename = parts[parts.length - 1];

  let score = 100;

  // Prefer files closer to root — each nesting level costs points
  score -= depth * 8;

  // Strongly boost high-value named files
  if (HIGH_VALUE_FILENAMES.has(filename)) score += 60;

  // Penalise test / snapshot / story files
  if (LOW_VALUE_PATTERNS.some((p) => p.test(filename))) score -= 50;

  // Boost entry-point files (index.*, main.*, app.*)
  if (/^(index|main|app)\.[^.]+$/.test(filename)) score += 20;

  // Boost files that live in core utility directories
  if (parts.slice(0, -1).some((seg) => CORE_SEGMENTS.has(seg))) score += 15;

  return score;
}

export interface RepoContextFile {
  id: string;
  name: string;
  path: string;
  content: string;
  included: boolean;
}

interface CreateRepoContextFileInput {
  id: string;
  name: string;
  path?: string;
  content: string;
  included?: boolean;
}

export function createRepoContextFile({
  id,
  name,
  path,
  content,
  included = true,
}: CreateRepoContextFileInput): RepoContextFile {
  return {
    id,
    name,
    path: (path?.trim() || name).replace(/\\/g, '/'),
    content: content.replace(/\r\n/g, '\n'),
    included,
  };
}

export function mergeRepoContextFiles(existing: RepoContextFile[], incoming: RepoContextFile[]): RepoContextFile[] {
  const filesByPath = new Map(existing.map((file) => [file.path.toLowerCase(), file]));

  for (const file of incoming) {
    filesByPath.set(file.path.toLowerCase(), file);
  }

  return Array.from(filesByPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

export function getRepoContextSelectionStats(files: RepoContextFile[]) {
  const selectedFiles = files.filter((file) => file.included);
  const selectedChars = selectedFiles.reduce((total, file) => total + file.content.length, 0);

  return {
    uploadedCount: files.length,
    selectedCount: selectedFiles.length,
    selectedChars,
  };
}

export function buildRepoContext(files: RepoContextFile[]): string {
  // Sort by relevance score so the most important files consume the 24 KB
  // AI window first, regardless of how the list is ordered in the UI.
  const selectedFiles = files
    .filter((file) => file.included && file.content.trim())
    .sort((a, b) => scoreFilePath(b.path) - scoreFilePath(a.path));

  if (selectedFiles.length === 0) {
    return '';
  }

  let remainingChars = MAX_TOTAL_CONTEXT_CHARS;
  const blocks: string[] = [];

  for (const file of selectedFiles) {
    if (remainingChars <= 0) {
      break;
    }

    const trimmedContent = file.content.trim();
    const excerptLength = Math.min(MAX_FILE_CONTEXT_CHARS, remainingChars);
    const excerpt = trimmedContent.slice(0, excerptLength);
    const wasTruncated = trimmedContent.length > excerpt.length;

    remainingChars -= excerpt.length;

    blocks.push([
      `Path: ${file.path}`,
      '```text',
      excerpt,
      wasTruncated ? '... [truncated]' : '',
      '```',
    ].filter(Boolean).join('\n'));
  }

  if (blocks.length === 0) {
    return '';
  }

  return [
    'Repository context files are provided below.',
    'Use them only when they help make the boosted prompt more specific, repo-aware, and accurate.',
    'Prefer concrete stack, file-path, configuration, and architecture details from these files.',
    'Do not invent additional files, dependencies, or patterns beyond what the files support.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

export function getRepoContextPreview(content: string, maxChars = REPO_CONTEXT_PREVIEW_CHARS) {
  const normalizedContent = content.replace(/\r\n/g, '\n').trim();
  const preview = normalizedContent.slice(0, maxChars);

  return {
    text: preview,
    truncated: normalizedContent.length > preview.length,
  };
}