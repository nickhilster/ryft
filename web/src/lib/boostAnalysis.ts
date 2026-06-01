import type { Agent } from '@ryfine/core';

// ── Agent display names ───────────────────────────────────────────────────────

export const AGENT_DISPLAY: Record<Agent, string> = {
  auto:     'Auto',
  coding:   'Coding',
  content:  'Content',
  data:     'Data',
  research: 'Research',
  design:   'Design',
  planning: 'Planning',
  general:  'General',
};

// ── Skills applied per agent ─────────────────────────────────────────────────
// Plain English, no jargon. Shown as chips alongside the result.

export const AGENT_SKILLS: Record<Agent, string[]> = {
  auto:     ['Domain detection', 'Adaptive structure', 'Specificity boost'],
  coding:   ['Type specification', 'Error handling', 'Edge case coverage', 'API patterns'],
  content:  ['Audience targeting', 'Tone definition', 'Format clarity', 'CTA sharpness'],
  data:     ['Schema precision', 'Metric definition', 'Output formatting', 'Edge cases'],
  research: ['Scope bounding', 'Source constraints', 'Methodology framing'],
  design:   ['Accessibility', 'Interaction states', 'Component constraints', 'Viewport clarity'],
  planning: ['SMART goals', 'Milestone mapping', 'Dependency clarity', 'Success metrics'],
  general:  ['Clarity', 'Specificity boost', 'Intent preservation'],
};

// ── Rationale generation ─────────────────────────────────────────────────────
// Analyses the diff between input and output using lightweight heuristics.
// No extra API call — everything is derived from text structure.

interface ChangeSet {
  expanded: boolean;
  addedStructure: boolean;
  addedBullets: boolean;
  addedConstraints: boolean;
  addedAudience: boolean;
  addedOutputFormat: boolean;
  addedContext: boolean;
  expansionRatio: number;
}

function analyseChanges(input: string, output: string): ChangeSet {
  const inputWords  = input.trim().split(/\s+/).length;
  const outputWords = output.trim().split(/\s+/).length;
  const ratio       = outputWords / Math.max(inputWords, 1);

  const countPattern = (text: string, re: RegExp) => (text.match(re) ?? []).length;

  const inBullets  = countPattern(input,  /^[-*•]/gm);
  const outBullets = countPattern(output, /^[-*•]/gm);
  const inHeaders  = countPattern(input,  /^#+\s/gm);
  const outHeaders = countPattern(output, /^#+\s/gm);

  const hasNew = (re: RegExp) => re.test(output) && !re.test(input);

  return {
    expansionRatio:    ratio,
    expanded:          ratio > 1.3,
    addedStructure:    outHeaders > inHeaders,
    addedBullets:      outBullets > inBullets + 1,
    addedConstraints:  hasNew(/\b(must|should|ensure|require|avoid|only|never|always|restrict)\b/i),
    addedAudience:     hasNew(/\b(audience|reader|user|stakeholder|developer|customer|persona)\b/i),
    addedOutputFormat: hasNew(/\b(format|structure|table|list|return type|output|result should|response should)\b/i),
    addedContext:      hasNew(/\b(context|background|assume|given that|note that|consider)\b/i),
  };
}

function describeChanges(agent: Agent, changes: ChangeSet): string[] {
  const parts: string[] = [];

  if (changes.addedStructure) parts.push('organised into clear sections');
  if (changes.addedBullets)   parts.push('broken into an actionable list');

  if (changes.expansionRatio > 2.5)      parts.push('significantly expanded with domain-specific detail');
  else if (changes.expansionRatio > 1.6) parts.push('enriched with additional context and requirements');
  else if (changes.expanded)             parts.push('sharpened with targeted detail');

  if (changes.addedConstraints)  parts.push('explicit constraints added');
  if (changes.addedAudience)     parts.push('target audience defined');
  if (changes.addedOutputFormat) parts.push('expected output format specified');
  if (changes.addedContext)      parts.push('background context included');

  // Agent-specific fallbacks when heuristics detect nothing specific
  if (parts.length === 0) {
    const fallbacks: Record<Agent, string> = {
      auto:     'intent clarified and ambiguity removed',
      coding:   'technical requirements and type expectations tightened',
      content:  'voice, format, and audience made explicit',
      data:     'schema assumptions and output expectations clarified',
      research: 'scope and source requirements defined',
      design:   'platform, states, and accessibility constraints clarified',
      planning: 'goals reframed as measurable outcomes',
      general:  'language sharpened and intent preserved',
    };
    parts.push(fallbacks[agent]);
  }

  return parts;
}

export function generateRationale(agent: Agent, input: string, output: string): string {
  const changes = analyseChanges(input, output);
  const points  = describeChanges(agent, changes);

  const agentName = AGENT_DISPLAY[agent];
  const ratio     = changes.expansionRatio;
  const sizeNote  = ratio > 1.3
    ? ` The refined prompt is ${Math.round(ratio * 10) / 10}× longer than the original.`
    : '';

  // Combine into natural prose
  const last    = points.pop()!;
  const summary = points.length > 0
    ? `${points.join(', ')}, and ${last}`
    : last;

  return (
    `The ${agentName} agent ${summary}.${sizeNote} ` +
    `This reduces ambiguity so the AI model can produce a more focused, reliable response.`
  );
}
