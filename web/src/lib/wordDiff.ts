export interface DiffPart {
  text: string;
  type: 'equal' | 'added' | 'removed';
}

function tokenize(value: string): string[] {
  return value.split(/(\s+)/).filter((token) => token.length > 0);
}

function pushPart(parts: DiffPart[], text: string, type: DiffPart['type']) {
  if (!text) {
    return;
  }

  const previous = parts[parts.length - 1];
  if (previous && previous.type === type) {
    previous.text += text;
    return;
  }

  parts.push({ text, type });
}

const MAX_DIFF_TOKENS = 1_000;

export function wordDiff(before: string, after: string): DiffPart[] {
  const beforeTokens = tokenize(before);
  const afterTokens = tokenize(after);

  // Guard: O(n×m) LCS table gets prohibitively large for very long prompts.
  // Fall back to a coarse two-part result so the UI never blocks.
  if (beforeTokens.length * afterTokens.length > MAX_DIFF_TOKENS * MAX_DIFF_TOKENS) {
    return [
      { text: before, type: 'removed' },
      { text: after,  type: 'added'   },
    ];
  }
  const rows = beforeTokens.length;
  const cols = afterTokens.length;
  const table = Array.from({ length: rows + 1 }, () => Array<number>(cols + 1).fill(0));

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      table[row][col] = beforeTokens[row] === afterTokens[col]
        ? table[row + 1][col + 1] + 1
        : Math.max(table[row + 1][col], table[row][col + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let row = 0;
  let col = 0;

  while (row < rows && col < cols) {
    if (beforeTokens[row] === afterTokens[col]) {
      pushPart(parts, beforeTokens[row], 'equal');
      row += 1;
      col += 1;
      continue;
    }

    if (table[row + 1][col] >= table[row][col + 1]) {
      pushPart(parts, beforeTokens[row], 'removed');
      row += 1;
      continue;
    }

    pushPart(parts, afterTokens[col], 'added');
    col += 1;
  }

  while (row < rows) {
    pushPart(parts, beforeTokens[row], 'removed');
    row += 1;
  }

  while (col < cols) {
    pushPart(parts, afterTokens[col], 'added');
    col += 1;
  }

  return parts;
}