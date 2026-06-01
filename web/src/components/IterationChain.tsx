import ReactMarkdown from 'react-markdown';
import type { BoostTokenUsage } from '../lib/ryFine';

interface IterationResult {
  output: string;
  status: 'idle' | 'loading' | 'done' | 'error';
  error: string;
  durationMs: number | null;
  tokensUsed: BoostTokenUsage | null;
}

interface Iteration {
  id: string;
  instruction: string;
  result: IterationResult;
}

interface IterationChainProps {
  iterations: Iteration[];
  onCopy: (text: string, target: string) => void;
  copiedTarget: string | null;
  formatDuration: (durationMs: number | null) => string;
}

export function IterationChain({ iterations, onCopy, copiedTarget, formatDuration }: IterationChainProps) {
  return (
    <div className="iteration-chain" aria-label="Refinement iterations">
      {iterations.map((iteration, index) => {
        const isLatest = index === iterations.length - 1;

        return (
          <section key={iteration.id} className={`iteration-card ${isLatest ? 'latest' : ''}`}>
            <header className="iteration-header">
              <div>
                <span className="iteration-label">Iteration {index + 1}</span>
                <span className="iteration-instruction">{iteration.instruction}</span>
              </div>
              {iteration.result.output && (
                <button className="btn-ghost small" onClick={() => onCopy(iteration.result.output, `iteration-${iteration.id}`)}>
                  {copiedTarget === `iteration-${iteration.id}` ? 'Copied!' : 'Copy'}
                </button>
              )}
            </header>
            <div className="iteration-body">
              {iteration.result.status === 'error' && !iteration.result.output && (
                <p className="error-msg">{iteration.result.error}</p>
              )}
              {iteration.result.output ? (
                <div className="markdown-output">
                  <ReactMarkdown>{iteration.result.output}</ReactMarkdown>
                </div>
              ) : iteration.result.status === 'loading' ? (
                <div className="streaming-badge">
                  <span className="streaming-dot" />
                  Adjusting
                </div>
              ) : null}
              <div className="iteration-meta-row">
                {iteration.result.durationMs !== null && (
                  <span className="compare-chip">{formatDuration(iteration.result.durationMs)}</span>
                )}
                {iteration.result.tokensUsed !== null && (
                  <span className="compare-chip token-chip" title={`${iteration.result.tokensUsed.promptTokens.toLocaleString()} prompt + ${iteration.result.tokensUsed.completionTokens.toLocaleString()} completion`}>
                    {iteration.result.tokensUsed.totalTokens.toLocaleString()} tokens
                  </span>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}