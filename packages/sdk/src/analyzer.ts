import { PATTERNS } from './patterns';
import type { Finding, RiskLevel, RyftAnalysis, Severity } from './types';

const SEVERITY_SCORE: Record<Severity, number> = {
  critical: 1.0,
  high: 0.7,
  medium: 0.4,
  low: 0.2,
};

export function analyse(input: string): RyftAnalysis {
  const findings: Finding[] = [];

  for (const p of PATTERNS) {
    const match = p.pattern.exec(input);
    if (match === null) continue;

    findings.push({
      type: p.type,
      severity: p.severity,
      segment: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      explanation: p.explanation,
    });
  }

  const score =
    findings.length === 0
      ? 0
      : Math.min(1, Math.max(...findings.map(f => SEVERITY_SCORE[f.severity])));

  const risk = scoreToRisk(score);
  const sanitized = sanitize(input, findings);
  const sanitizationChanges = buildChangelog(findings);

  return { risk, score, findings, sanitized, sanitizationChanges, layer: 1 };
}

function scoreToRisk(score: number): RiskLevel {
  if (score === 0) return 'clean';
  if (score >= 0.8) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.25) return 'medium';
  return 'low';
}

function sanitize(input: string, findings: Finding[]): string {
  if (findings.length === 0) return input;

  // Replace from end to start so earlier indices stay valid
  const sorted = [...findings].sort((a, b) => b.startIndex - a.startIndex);
  let result = input;
  for (const f of sorted) {
    result = result.slice(0, f.startIndex) + '[REMOVED]' + result.slice(f.endIndex);
  }
  return result;
}

function buildChangelog(findings: Finding[]): string[] {
  return findings.map(f => {
    const preview = f.segment.length > 40 ? `${f.segment.slice(0, 40)}…` : f.segment;
    return `Removed ${f.type} (${f.severity}): "${preview}"`;
  });
}
