import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FILE_CONTEXT_CHARS,
  buildRepoContext,
  createRepoContextFile,
  getRepoContextSelectionStats,
  getRepoContextPreview,
  mergeRepoContextFiles,
  REPO_CONTEXT_PREVIEW_CHARS,
} from '../src/lib/repoContext.ts';

describe('repo context helpers', () => {
  it('formats only manually included files into repository context', () => {
    const readme = createRepoContextFile({
      id: 'readme',
      name: 'README.md',
      path: 'README.md',
      content: '# Product\n\nImportant overview',
    });
    const ignored = createRepoContextFile({
      id: 'secret',
      name: 'draft.txt',
      path: 'notes/draft.txt',
      content: 'Should not be included',
      included: false,
    });

    const context = buildRepoContext([readme, ignored]);

    assert.match(context, /Path: README\.md/);
    assert.doesNotMatch(context, /notes\/draft\.txt/);
  });

  it('truncates oversized files before injecting repository context', () => {
    const oversized = createRepoContextFile({
      id: 'big',
      name: 'big.ts',
      path: 'src/big.ts',
      content: 'a'.repeat(MAX_FILE_CONTEXT_CHARS + 25),
    });

    const context = buildRepoContext([oversized]);

    assert.match(context, /Path: src\/big\.ts/);
    assert.match(context, /\.\.\. \[truncated\]/);
  });

  it('tracks uploaded and selected repository files', () => {
    const files = [
      createRepoContextFile({ id: 'one', name: 'README.md', content: 'hello' }),
      createRepoContextFile({ id: 'two', name: 'app.ts', content: 'console.log(1);', included: false }),
    ];

    assert.deepEqual(getRepoContextSelectionStats(files), {
      uploadedCount: 2,
      selectedCount: 1,
      selectedChars: 5,
    });
  });

  it('replaces files with the same path when new uploads arrive', () => {
    const existing = createRepoContextFile({
      id: 'old',
      name: 'README.md',
      path: 'README.md',
      content: 'old content',
    });
    const replacement = createRepoContextFile({
      id: 'new',
      name: 'README.md',
      path: 'README.md',
      content: 'new content',
    });

    const merged = mergeRepoContextFiles([existing], [replacement]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, 'new');
    assert.equal(merged[0]?.content, 'new content');
  });

  it('creates truncated preview snippets for file inspection', () => {
    const preview = getRepoContextPreview('z'.repeat(REPO_CONTEXT_PREVIEW_CHARS + 10));

    assert.equal(preview.text.length, REPO_CONTEXT_PREVIEW_CHARS);
    assert.equal(preview.truncated, true);
  });
});