import type { Agent } from '@ryfine/core';
import { quickGenerateWithBrowserAi } from './webllmProvider';

export interface ExamplePrompt {
  agent: Agent;
  label: string;
  prompt: string;
}

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    agent: 'coding',
    label: 'API endpoint',
    prompt: 'Write an endpoint that takes a user id and returns their recent orders',
  },
  {
    agent: 'content',
    label: 'Blog intro',
    prompt: 'Write an intro for a blog post about why developers should care about prompt engineering',
  },
  {
    agent: 'data',
    label: 'SQL query',
    prompt: 'Write a query to find the top 10 customers by revenue in the last 90 days',
  },
  {
    agent: 'auto',
    label: 'Code review',
    prompt: 'Review this pull request for security issues and suggest improvements',
  },
];

/** Collect lightweight browser signals — no cross-origin data, no PII. */
export function gatherBrowserContext(tabTitles?: string[]): string {
  const parts: string[] = [];

  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  parts.push(`Time of day: ${timeOfDay}`);

  const lang = navigator.language || 'en';
  parts.push(`Language: ${lang}`);

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) parts.push(`Timezone: ${tz}`);
  } catch { /* ignore */ }

  const savedAgent = localStorage.getItem('ryfine_agent');
  if (savedAgent && savedAgent !== 'auto') {
    parts.push(`Preferred domain: ${savedAgent}`);
  }

  try {
    const rawSkills = localStorage.getItem('ryfine_user_skills');
    if (rawSkills) {
      const skills = JSON.parse(rawSkills) as Array<{ name: string }>;
      if (skills.length > 0) {
        parts.push(`User skills: ${skills.map((s) => s.name).join(', ')}`);
      }
    }
  } catch { /* ignore */ }

  const customInstructions = localStorage.getItem('ryfine_custom_boost_instructions');
  if (customInstructions && customInstructions.trim().length > 10) {
    // Include a short excerpt as a domain hint — not the full text
    parts.push(`Custom instructions excerpt: "${customInstructions.slice(0, 80).trim()}..."`);
  }

  if (tabTitles && tabTitles.length > 0) {
    parts.push(`Currently open tabs: ${tabTitles.slice(0, 6).join(' | ')}`);
  }

  return parts.join('\n');
}

const SESSION_CACHE_KEY = 'ryfine_example_cache';

function cacheExamples(examples: ExamplePrompt[]): void {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(examples));
  } catch { /* ignore quota errors */ }
}

function loadCachedExamples(): ExamplePrompt[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExamplePrompt[];
    return Array.isArray(parsed) && parsed.length >= 2 ? parsed : null;
  } catch {
    return null;
  }
}

const VALID_AGENTS: Agent[] = [
  'coding', 'content', 'data', 'research', 'design', 'planning', 'auto',
];

function parseExamplesFromLlmOutput(raw: string): ExamplePrompt[] | null {
  // Find the first JSON array in the output (model may prepend/append text)
  const match = raw.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Array<{
      label?: unknown;
      prompt?: unknown;
      agent?: unknown;
    }>;
    const examples: ExamplePrompt[] = parsed
      .map((item) => ({
        label: String(item.label ?? '').trim().toUpperCase().slice(0, 24),
        prompt: String(item.prompt ?? '').trim().slice(0, 160),
        agent: (VALID_AGENTS.includes(item.agent as Agent) ? item.agent : 'auto') as Agent,
      }))
      .filter((e) => e.label.length > 0 && e.prompt.length > 10);
    return examples.length >= 2 ? examples.slice(0, 4) : null;
  } catch {
    return null;
  }
}

/**
 * Uses the already-loaded Browser AI model to generate 4 contextual examples.
 * Returns null if generation is unavailable or fails — caller should fall back
 * to EXAMPLE_PROMPTS.
 */
export async function generatePersonalizedExamples(
  model: string,
  tabTitles?: string[],
): Promise<ExamplePrompt[] | null> {
  // Serve from session cache so we don't re-generate on every render cycle
  const cached = loadCachedExamples();
  if (cached) return cached;

  const context = gatherBrowserContext(tabTitles);

  const system = `You generate prompt examples for a prompt-refinement tool.
Return ONLY a JSON array with exactly 4 objects, no prose.
Schema: [{"label":"2-3 WORDS UPPERCASE","prompt":"one sentence task","agent":"..."}]
Valid agents: coding, content, data, research, design, planning, auto`;

  const user = `User context:\n${context}\n\nGenerate 4 relevant, varied examples.`;

  const raw = await quickGenerateWithBrowserAi(model, system, user);
  if (!raw) return null;

  const examples = parseExamplesFromLlmOutput(raw);
  if (examples) cacheExamples(examples);
  return examples;
}
