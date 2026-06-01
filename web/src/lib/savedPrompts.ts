import { isAgent, isProvider, type Agent, type Provider } from '@ryft/core';

export const SAVED_PROMPTS_STORAGE_KEY = 'ryfine_saved_prompts_v1';
const SAVED_PROMPTS_VERSION = 1;
const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_-]*)\s*\}\}/g;

export interface SavedPromptTemplate {
  id: string;
  title: string;
  body: string;
  tags: string[];
  notes: string;
  provider: Provider;
  model: string;
  agent: Agent;
  customBoostInstructions: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface SavedPromptDraft {
  title: string;
  body: string;
  tags: string[];
  notes: string;
  provider: Provider;
  model: string;
  agent: Agent;
  customBoostInstructions: string;
}

export interface ImportSavedPromptsResult {
  prompts: SavedPromptTemplate[];
  importedCount: number;
  skippedCount: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface FactoryOptions {
  id?: string;
  idFactory?: () => string;
  now?: string;
}

function getDefaultStorage(): StorageLike | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

function now(options?: FactoryOptions): string {
  return options?.now ?? new Date().toISOString();
}

function createId(options?: FactoryOptions): string {
  if (options?.id) {
    return options.id;
  }

  if (options?.idFactory) {
    return options.idFactory();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createTitleFromBody(body: string): string {
  const firstLine = body.split(/\r?\n/).find(line => line.trim());
  if (!firstLine) {
    return 'Untitled prompt';
  }

  const title = firstLine.trim().replace(/^#+\s*/, '');
  return title.length > 60 ? `${title.slice(0, 57)}...` : title;
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const cleanTags: string[] = [];

  for (const tag of tags) {
    const cleanTag = tag.trim();
    const key = cleanTag.toLowerCase();
    if (!cleanTag || seen.has(key)) {
      continue;
    }

    seen.add(key);
    cleanTags.push(cleanTag);
  }

  return cleanTags;
}

export function extractTemplateVariables(body: string): string[] {
  const variables: string[] = [];
  const seen = new Set<string>();

  for (const match of body.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    const variable = match[1];
    if (!seen.has(variable)) {
      seen.add(variable);
      variables.push(variable);
    }
  }

  return variables;
}

export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(TEMPLATE_VARIABLE_PATTERN, (match, variable: string) => {
    return Object.hasOwn(values, variable) ? values[variable] : match;
  });
}

export function createSavedPrompt(draft: SavedPromptDraft, options?: FactoryOptions): SavedPromptTemplate {
  const body = draft.body.trim();
  const timestamp = now(options);

  return {
    id: createId(options),
    title: draft.title.trim() || createTitleFromBody(body),
    body,
    tags: normalizeTags(draft.tags),
    notes: draft.notes.trim(),
    provider: draft.provider,
    model: draft.model.trim(),
    agent: draft.agent,
    customBoostInstructions: draft.customBoostInstructions.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
  };
}

export function updateSavedPrompt(
  existing: SavedPromptTemplate,
  draft: SavedPromptDraft,
  options?: FactoryOptions
): SavedPromptTemplate {
  const updated = createSavedPrompt(draft, { id: existing.id, now: now(options) });

  return {
    ...updated,
    createdAt: existing.createdAt,
    lastUsedAt: existing.lastUsedAt,
  };
}

export function touchSavedPrompt(
  prompt: SavedPromptTemplate,
  options?: Pick<FactoryOptions, 'now'>
): SavedPromptTemplate {
  return {
    ...prompt,
    lastUsedAt: now(options),
  };
}

function sanitizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeTags(value.filter((tag): tag is string => typeof tag === 'string'));
  }

  if (typeof value === 'string') {
    return normalizeTags(value.split(','));
  }

  return [];
}

function sanitizeSavedPrompt(value: unknown, options?: FactoryOptions): SavedPromptTemplate | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = cleanString(value.title);
  const body = cleanString(value.body);
  const model = cleanString(value.model);

  if (!body || !model || !isProvider(value.provider) || !isAgent(value.agent)) {
    return null;
  }

  const timestamp = now(options);

  return {
    id: cleanString(value.id) || createId(options),
    title: title || createTitleFromBody(body),
    body,
    tags: sanitizeTags(value.tags),
    notes: cleanString(value.notes),
    provider: value.provider,
    model,
    agent: value.agent,
    customBoostInstructions: cleanString(value.customBoostInstructions),
    createdAt: cleanString(value.createdAt) || timestamp,
    updatedAt: cleanString(value.updatedAt) || timestamp,
    lastUsedAt: typeof value.lastUsedAt === 'string' ? value.lastUsedAt : null,
  };
}

function readPromptCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value) && Array.isArray(value.prompts)) {
    return value.prompts;
  }

  return [];
}

export function loadSavedPrompts(storage: StorageLike | undefined = getDefaultStorage()): SavedPromptTemplate[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(SAVED_PROMPTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return readPromptCandidates(JSON.parse(raw))
      .map(prompt => sanitizeSavedPrompt(prompt))
      .filter((prompt): prompt is SavedPromptTemplate => prompt !== null);
  } catch {
    return [];
  }
}

export function serializeSavedPrompts(prompts: SavedPromptTemplate[]): string {
  return JSON.stringify({ version: SAVED_PROMPTS_VERSION, prompts }, null, 2);
}

export function saveSavedPrompts(
  prompts: SavedPromptTemplate[],
  storage: StorageLike | undefined = getDefaultStorage()
): void {
  if (!storage) {
    return;
  }

  storage.setItem(SAVED_PROMPTS_STORAGE_KEY, serializeSavedPrompts(prompts));
}

export function importSavedPrompts(
  existingPrompts: SavedPromptTemplate[],
  jsonText: string,
  options?: FactoryOptions
): ImportSavedPromptsResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { prompts: existingPrompts, importedCount: 0, skippedCount: 0 };
  }

  const existingIds = new Set(existingPrompts.map(prompt => prompt.id));
  const nextPrompts = [...existingPrompts];
  let importedCount = 0;
  let skippedCount = 0;

  for (const candidate of readPromptCandidates(parsed)) {
    const prompt = sanitizeSavedPrompt(candidate, options);
    if (!prompt) {
      skippedCount += 1;
      continue;
    }

    const id = existingIds.has(prompt.id) ? createId(options) : prompt.id;
    existingIds.add(id);
    nextPrompts.push({ ...prompt, id });
    importedCount += 1;
  }

  return { prompts: nextPrompts, importedCount, skippedCount };
}
