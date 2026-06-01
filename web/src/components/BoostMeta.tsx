import { useEffect, useRef, useState } from 'react';
import type { Agent } from '../lib/agents';
import {
  AGENT_DISPLAY,
  AGENT_SKILLS,
  generateRationale,
} from '../lib/boostAnalysis';
import './BoostMeta.css';

interface BoostMetaProps {
  agent: Agent;
  model: string;
  provider: string;
  input: string;
  output: string;
  /** ID of the saved PromptRecord, if one exists (active project). */
  recordId: string | null;
  onFeedback: (value: 'up' | 'down') => void;
}

export function BoostMeta({
  agent,
  model,
  input,
  output,
  onFeedback,
}: BoostMetaProps) {
  const [popoverOpen, setPopoverOpen]   = useState(false);
  const [feedback, setFeedback]         = useState<'up' | 'down' | null>(null);
  const [showThanks, setShowThanks]     = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const infoRef    = useRef<HTMLButtonElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current  && !popoverRef.current.contains(e.target as Node) &&
        infoRef.current     && !infoRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popoverOpen]);

  function handleFeedback(value: 'up' | 'down') {
    if (feedback === value) return;   // already selected, no-op
    setFeedback(value);
    setShowThanks(true);
    onFeedback(value);
    setTimeout(() => setShowThanks(false), 2200);
  }

  const rationale = generateRationale(agent, input, output);
  const skills    = AGENT_SKILLS[agent];

  return (
    <div className="boost-meta">
      {/* ── Left: agent + skills + rationale info ── */}
      <div className="boost-meta-left">
        <span className="boost-meta-agent">
          {AGENT_DISPLAY[agent]}
        </span>

        <div className="boost-meta-skills">
          {skills.map((skill) => (
            <span key={skill} className="boost-meta-skill">{skill}</span>
          ))}
        </div>

        {/* Rationale tooltip */}
        <div className="boost-meta-info-wrap">
          <button
            ref={infoRef}
            className={`boost-meta-info-btn ${popoverOpen ? 'is-open' : ''}`}
            aria-label="Why this refinement?"
            aria-expanded={popoverOpen}
            onClick={() => setPopoverOpen((v) => !v)}
          >
            i
          </button>

          {popoverOpen && (
            <div ref={popoverRef} className="boost-meta-popover" role="tooltip">
              <p className="boost-meta-popover-title">Why this refinement?</p>
              <p className="boost-meta-popover-text">{rationale}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: feedback ── */}
      <div className="boost-meta-right">
        {showThanks ? (
          <span className="boost-meta-thanks">Thanks for the feedback</span>
        ) : (
          <>
            <span className="boost-meta-feedback-label">Helpful?</span>
            <button
              className={`boost-meta-feedback-btn ${feedback === 'up' ? 'is-selected-up' : ''}`}
              aria-label="This refinement was helpful"
              aria-pressed={feedback === 'up'}
              onClick={() => handleFeedback('up')}
              title={`Using ${model}`}
            >
              👍
            </button>
            <button
              className={`boost-meta-feedback-btn ${feedback === 'down' ? 'is-selected-down' : ''}`}
              aria-label="This refinement missed the mark"
              aria-pressed={feedback === 'down'}
              onClick={() => handleFeedback('down')}
            >
              👎
            </button>
          </>
        )}
      </div>
    </div>
  );
}
