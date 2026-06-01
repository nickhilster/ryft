export interface PromptScore {
  total: number;
  specificity: number;
  structure: number;
  clarity: number;
}

const SPECIFICITY_PATTERNS = [
  /\b(?:at most|must|must not|should|should not|returns|throws|input|output|schema|type|interface|generic|endpoint|query|constraint|latency|timeout|token|json|typescript|react|sql|api|function|class|component|wcag|accessibility|oauth|device flow|webgpu)\b/gi,
  /\b(?:\d+(?:ms|s|m|h|kb|mb|gb|%)|[A-Z][a-z]+(?:[A-Z][a-z]+)+|[A-Z]{2,}|[A-Za-z]+<[A-Za-z0-9_,\s]+>)\b/g,
];

const FILLER_PATTERNS = [
  /\bplease\b/gi,
  /\bjust\b/gi,
  /\bsimply\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\ba bit\b/gi,
  /\bdo something\b/gi,
  /\bhandle it\b/gi,
];

function countMatches(value: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + (value.match(pattern)?.length ?? 0), 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function scorePrompt(raw: string, refined: string): PromptScore {
  const refinedTrimmed = refined.trim();
  const rawWords = raw.trim().split(/\s+/).filter(Boolean).length || 1;
  const refinedWords = refinedTrimmed.split(/\s+/).filter(Boolean).length;
  const specificTerms = countMatches(refinedTrimmed, SPECIFICITY_PATTERNS);
  const structuralElements = [
    refinedTrimmed.match(/^\s*[-*]\s+/gm)?.length ?? 0,
    refinedTrimmed.match(/^\s*\d+\.\s+/gm)?.length ?? 0,
    refinedTrimmed.match(/^\s*#+\s+/gm)?.length ?? 0,
    refinedTrimmed.match(/```/g)?.length ?? 0,
  ].reduce((sum, value) => sum + value, 0);
  const fillerPenalty = countMatches(refinedTrimmed, FILLER_PATTERNS) * 4;
  const sentenceCount = refinedTrimmed.split(/[.!?]+/).filter((part) => part.trim().length > 0).length;
  const growthScore = clamp((refinedWords - rawWords) / rawWords, 0, 1) * 20;

  const specificity = Math.min(33, specificTerms * 3);
  const structure = Math.min(33, structuralElements * 5);
  const clarity = clamp(Math.round(growthScore + sentenceCount * 2 - fillerPenalty), 0, 34);
  const total = specificity + structure + clarity;

  return {
    total,
    specificity,
    structure,
    clarity,
  };
}