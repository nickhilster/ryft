import { getAllSkills, type SkillId } from './skills.ts';

export interface ClassificationResult {
  primary: SkillId | null;
  secondary: SkillId | null;
  scores: Record<SkillId, number>;
  signals: string[];
  confidence: 'high' | 'medium' | 'low';
}

function createEmptyScores(): Record<SkillId, number> {
  return {
    auto: 0,
    coding: 0,
    content: 0,
    data: 0,
    research: 0,
    design: 0,
    planning: 0,
    general: 0,
  };
}

export function classifyIntent(promptText: string): ClassificationResult {
  const text = promptText.toLowerCase().trim();
  const rawScores = createEmptyScores();
  const matchedSignals = new Set<string>();

  if (!text) {
    return {
      primary: null,
      secondary: null,
      scores: rawScores,
      signals: [],
      confidence: 'low',
    };
  }

  for (const skill of getAllSkills()) {
    if (skill.signals.length === 0) {
      continue;
    }

    for (const signal of skill.signals) {
      if (signal.pattern instanceof RegExp) {
        const match = promptText.match(signal.pattern);
        if (!match) {
          continue;
        }

        rawScores[skill.id] += signal.weight;
        matchedSignals.add(match[0]);
        continue;
      }

      const normalizedPattern = signal.pattern.toLowerCase();
      if (!text.includes(normalizedPattern)) {
        continue;
      }

      rawScores[skill.id] += signal.weight;
      matchedSignals.add(signal.pattern);
    }
  }

  const maxRawScore = Math.max(...Object.values(rawScores));
  if (maxRawScore === 0) {
    return {
      primary: null,
      secondary: null,
      scores: createEmptyScores(),
      signals: [],
      confidence: 'low',
    };
  }

  const scores = createEmptyScores();
  for (const skill of getAllSkills()) {
    scores[skill.id] = Math.min(100, Math.round((rawScores[skill.id] / maxRawScore) * 100));
  }

  const rankedSkills = getAllSkills()
    .filter(skill => rawScores[skill.id] > 0)
    .sort((left, right) => {
      const scoreDifference = scores[right.id] - scores[left.id];
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const priorityDifference = left.priority - right.priority;
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return left.id.localeCompare(right.id);
    });

  const primary = rankedSkills[0]?.id ?? null;
  const secondary = rankedSkills[1] && scores[rankedSkills[1].id] >= 40 ? rankedSkills[1].id : null;
  const primaryRawScore = primary ? rawScores[primary] : 0;

  let confidence: ClassificationResult['confidence'] = 'low';
  if (primaryRawScore >= 30) {
    confidence = 'high';
  } else if (primaryRawScore >= 15) {
    confidence = 'medium';
  }

  return {
    primary,
    secondary,
    scores,
    signals: Array.from(matchedSignals),
    confidence,
  };
}

export function isConfidentClassification(result: ClassificationResult): boolean {
  return result.primary !== null && result.confidence !== 'low';
}