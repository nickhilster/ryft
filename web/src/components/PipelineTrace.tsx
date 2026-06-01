import type { PipelineTrace as PipelineTraceData } from '../lib/ryFine';

interface PipelineTraceProps {
  trace: PipelineTraceData;
  systemPrompt?: string;
  onExpand: () => void;
  expanded: boolean;
}

function SkillChip({ label, trace }: { label: string; trace: PipelineTraceData }) {
  const isAutoFallback = label === 'Auto' && trace.detectedDomain !== null;
  const isUncertain = trace.confidence === 'medium' || trace.confidence === 'low';

  const title = isAutoFallback && isUncertain
    ? `Auto (${trace.confidence} confidence — classifier detected "${trace.detectedDomain}" but fell back to Auto)`
    : isAutoFallback
    ? `Auto (fell back — low classifier confidence)`
    : undefined;

  return (
    <span
      className={`trace-chip skill-chip ${isAutoFallback && isUncertain ? 'skill-chip-uncertain' : ''}`}
      title={title}
    >
      {label}{isAutoFallback && isUncertain ? ' ~' : ''}
    </span>
  );
}

export function PipelineTrace({ trace, systemPrompt, onExpand, expanded }: PipelineTraceProps) {
  return (
    <>
      <div className="pipeline-trace" aria-label="Pipeline summary">
        <span className="trace-label">Applied:</span>

        {trace.skillsApplied.map((skill) => (
          <SkillChip key={skill} label={skill} trace={trace} />
        ))}

        {trace.userSkillsApplied.map((skill) => (
          <span key={skill} className="trace-chip user-skill-chip">{skill}</span>
        ))}

        {trace.hasRepoContext && (
          <span className="trace-chip context-chip">Repo context</span>
        )}

        {trace.hasCustomRules && (
          <span className="trace-chip rules-chip">Custom rules</span>
        )}

        {trace.hasFewShot && (
          <span className="trace-chip fewshot-chip">Style examples</span>
        )}

        <button className="trace-expand-btn" onClick={onExpand} aria-expanded={expanded}>
          {expanded ? 'Hide prompt' : 'View prompt'}
        </button>
      </div>
      {expanded && systemPrompt && (
        <pre className="trace-system-prompt">{systemPrompt}</pre>
      )}
    </>
  );
}