import { Fragment, useMemo } from 'react';
import { wordDiff } from '../lib/wordDiff';

interface DiffViewProps {
  before: string;
  after: string;
}

export function DiffView({ before, after }: DiffViewProps) {
  const parts = useMemo(() => wordDiff(before, after), [before, after]);

  return (
    <div className="markdown-output diff-view" aria-label="Prompt diff view">
      {parts.map((part, index) => {
        if (part.type === 'equal') {
          return <Fragment key={`${part.type}-${index}`}>{part.text}</Fragment>;
        }

        return (
          <span key={`${part.type}-${index}`} className={part.type === 'added' ? 'diff-added' : 'diff-removed'}>
            {part.text}
          </span>
        );
      })}
    </div>
  );
}