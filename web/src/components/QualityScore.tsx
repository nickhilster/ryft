import type { PromptScore } from '../lib/promptScore';

interface QualityScoreProps {
  score: PromptScore;
}

function getScoreTone(total: number) {
  if (total >= 75) {
    return 'score-high';
  }

  if (total >= 50) {
    return 'score-mid';
  }

  return 'score-low';
}

export function QualityScore({ score }: QualityScoreProps) {
  const tone = getScoreTone(score.total);
  const tooltip = `Specificity ${score.specificity}/33 • Structure ${score.structure}/33 • Clarity ${score.clarity}/34`;

  return (
    <div className={`quality-score ${tone}`} title={tooltip} aria-label={`Prompt quality score ${score.total} out of 100. ${tooltip}`}>
      <span>{score.total}</span>
      <div className="quality-sub-bars" aria-hidden="true">
        <span className="quality-sub-bar"><span className="quality-sub-fill" style={{ width: `${(score.specificity / 33) * 100}%` }} /></span>
        <span className="quality-sub-bar"><span className="quality-sub-fill" style={{ width: `${(score.structure / 33) * 100}%` }} /></span>
        <span className="quality-sub-bar"><span className="quality-sub-fill" style={{ width: `${(score.clarity / 34) * 100}%` }} /></span>
      </div>
    </div>
  );
}