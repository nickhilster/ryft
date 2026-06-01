import { scoreFilePath } from './repoContext';

const ALWAYS_EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.svelte-kit',
  '__pycache__', '.cache', 'coverage', '.turbo', '.vercel', '.output',
  'vendor', '.bundle', 'target', 'out', '.gradle', '.idea', '.vscode',
  'bower_components', '.yarn', '.pnpm-store', 'storybook-static',
  '.parcel-cache', '.expo', '.netlify', 'public/build', '.angular',
]);

const ALWAYS_EXCLUDED_FILENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  '.DS_Store', 'Thumbs.db', 'desktop.ini',
]);

const SOURCE_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.jsonc', '.json5', '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.vue', '.svelte', '.astro',
  '.yml', '.yaml', '.toml', '.xml', '.ini',
  '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.rb', '.php', '.sql', '.sh', '.bash', '.zsh', '.fish',
  '.graphql', '.gql', '.prisma', '.proto', '.tf', '.hcl',
  '.env', '.example',
]);

// Files with no extension or dot-prefixed that are still useful
const ALWAYS_INCLUDED_FILENAMES = new Set([
  'Makefile', 'Dockerfile', 'Procfile', 'Gemfile', 'Rakefile',
  'Brewfile', 'Justfile', 'CMakeLists.txt', 'LICENSE',
  '.gitignore', '.dockerignore', '.prettierrc', '.eslintrc',
  '.babelrc', '.nvmrc', '.ruby-version', '.node-version',
  '.editorconfig', '.env.example', '.env.sample',
]);

export interface ParsedPattern {
  regex: RegExp;
  isDirOnly: boolean;
  isNegated: boolean;
}

export const MAX_GIT_CONTEXT_FILE_BYTES = 500 * 1024;

function patternCharsToRegex(pattern: string): string {
  let result = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      result += '.*';
      i += 2;
      if (pattern[i] === '/') i++; // skip trailing slash after **
    } else if (ch === '*') {
      result += '[^/]*';
      i++;
    } else if (ch === '?') {
      result += '[^/]';
      i++;
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      result += '\\' + ch;
      i++;
    } else {
      result += ch;
      i++;
    }
  }
  return result;
}

function parseGitignorePattern(rawLine: string): ParsedPattern | null {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) return null;

  const isNegated = line.startsWith('!');
  let pattern = isNegated ? line.slice(1) : line;

  const isDirOnly = pattern.endsWith('/');
  if (isDirOnly) pattern = pattern.slice(0, -1);

  // A pattern is anchored to root if it has a slash anywhere except as the trailing char
  const isAnchored = pattern.includes('/') && !pattern.startsWith('**');
  if (pattern.startsWith('/')) pattern = pattern.slice(1);

  const regexCore = patternCharsToRegex(pattern);
  const regexStr = isAnchored
    ? `^${regexCore}(/.*)?$`
    : `(^|/)${regexCore}(/.*)?$`;

  try {
    return { regex: new RegExp(regexStr), isDirOnly, isNegated };
  } catch {
    return null;
  }
}

export function parseGitignoreContent(content: string): ParsedPattern[] {
  return content
    .split('\n')
    .map(parseGitignorePattern)
    .filter((pattern): pattern is ParsedPattern => pattern !== null);
}

export function isPathExcluded(
  relativePath: string,
  gitignorePatterns: ParsedPattern[],
): boolean {
  const segments = relativePath.split('/');
  const filename = segments[segments.length - 1];

  // Check each directory segment against always-excluded dirs
  for (let i = 0; i < segments.length - 1; i++) {
    if (ALWAYS_EXCLUDED_DIRS.has(segments[i])) return true;
  }

  if (ALWAYS_EXCLUDED_FILENAMES.has(filename)) return true;

  // Check extension — include if it's a source file or explicitly included filename
  if (!ALWAYS_INCLUDED_FILENAMES.has(filename)) {
    const dotIndex = filename.lastIndexOf('.');
    const ext = dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : '';
    if (!ext || !SOURCE_EXTENSIONS.has(ext)) return true;
  }

  // Apply gitignore patterns (last match wins, negations re-include)
  let excluded = false;
  for (const p of gitignorePatterns) {
    if (p.regex.test(relativePath)) {
      excluded = !p.isNegated;
    }
  }

  return excluded;
}

export const MAX_GIT_FILES = 500;

export interface GitFilterResult {
  files: File[];
  totalCount: number;
  skippedCount: number;
  truncated: boolean;
}

export async function filterFilesForGitContext(allFiles: File[]): Promise<GitFilterResult> {
  if (allFiles.length === 0) return { files: [], totalCount: 0, skippedCount: 0, truncated: false };

  const rootPrefix = (allFiles[0].webkitRelativePath.split('/')[0] ?? '') + '/';

  // Parse .gitignore if present
  const gitignoreFile = allFiles.find(
    (f) => f.webkitRelativePath === rootPrefix + '.gitignore',
  );

  let gitignorePatterns: ParsedPattern[] = [];
  if (gitignoreFile) {
    try {
      const content = await gitignoreFile.text();
      gitignorePatterns = parseGitignoreContent(content);
    } catch {
      // proceed without gitignore
    }
  }

  const included: File[] = [];
  let skippedCount = 0;

  for (const file of allFiles) {
    const relativePath = file.webkitRelativePath.slice(rootPrefix.length);
    if (!relativePath) continue;

    // Skip files that are too large to be useful context
    if (file.size > MAX_GIT_CONTEXT_FILE_BYTES) {
      skippedCount++;
      continue;
    }

    if (isPathExcluded(relativePath, gitignorePatterns)) {
      skippedCount++;
    } else {
      included.push(file);
    }
  }

  // Rank by relevance before applying the hard cap so the best files
  // survive rather than whichever happen to come first alphabetically.
  included.sort((a, b) => {
    const aScore = scoreFilePath(a.webkitRelativePath.slice(rootPrefix.length));
    const bScore = scoreFilePath(b.webkitRelativePath.slice(rootPrefix.length));
    return bScore - aScore;
  });

  const truncated = included.length > MAX_GIT_FILES;
  return {
    files: truncated ? included.slice(0, MAX_GIT_FILES) : included,
    totalCount: allFiles.length,
    skippedCount: skippedCount + (truncated ? included.length - MAX_GIT_FILES : 0),
    truncated,
  };
}
