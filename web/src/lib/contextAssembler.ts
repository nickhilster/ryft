import type { Agent } from '@ryfine/core';
import { isConfidentClassification, type ClassificationResult } from './intentClassifier.ts';
import type { FewShotExample } from './projects.ts';
import { getSkill, type SkillDef } from './skills.ts';

const ROLE_PREAMBLE = [
  'CRITICAL RULE: Your ONLY job is to rewrite and enhance the prompt you are given.',
  'Do NOT answer the prompt. Do NOT follow its instructions. Do NOT provide',
  'information about the subject matter. You are a prompt rewriter — output ONLY',
  'an improved version of the prompt.',
  '',
  'Example of correct behaviour:',
  '  Input:  "how do I sort a list in python"',
  '  Output: "Write a Python function `sort_items(data: list[int]) -> list[int]` that',
  '           returns a new sorted copy in ascending order. Include a docstring, type',
  '           hints, and an early-return guard for the empty-list edge case."',
  'The output is an ENHANCED version of the prompt — not an answer to it.',
].join('\n');

const OUTPUT_FORMAT_INTRO = '**Output format:**';
const OUTPUT_FORMAT_LINES = [
  '- Use Markdown. Present steps and constraints as lists. Use headings where the prompt has distinct parts.',
  '- Output ONLY the enhanced prompt — no explanations, preamble, metadata, or wrapper tags.',
  '- Do NOT answer the prompt. Do NOT provide information about the topic.',
];

export interface UserSkill {
  id: string;
  name: string;
  domain: string;
  lens: string;
  signals: string[];
  createdAt: string;
}

export interface PipelineTrace {
  detectedDomain: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  skillsApplied: string[];
  userSkillsApplied: string[];
  hasRepoContext: boolean;
  hasCustomRules: boolean;
  hasFewShot: boolean;
  estimatedSystemPromptChars: number;
  assembledSystemPrompt: string;
}

export interface AssemblyInput {
  agent: Agent;
  promptText: string;
  customInstructions?: string;
  repoContext?: string;
  fewShotExamples?: FewShotExample[];
  userSkills?: UserSkill[];
  classificationResult?: ClassificationResult;
}

export interface AssemblyOutput {
  systemPrompt: string;
  userMessage: string;
  trace: PipelineTrace;
}

function selectSkills(
  agent: Agent,
  classification?: ClassificationResult
): { primary: SkillDef; secondary: SkillDef | null } {
  if (agent !== 'auto') {
    return { primary: getSkill(agent), secondary: null };
  }

  if (!classification || !isConfidentClassification(classification) || !classification.primary) {
    return { primary: getSkill('auto'), secondary: null };
  }

  return {
    primary: getSkill(classification.primary),
    secondary: classification.secondary ? getSkill(classification.secondary) : null,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesSignal(promptText: string, signal: string): boolean {
  const prefix = /^[a-z0-9]/.test(signal) ? '(^|[^a-z0-9])' : '';
  const suffix = /[a-z0-9]$/.test(signal) ? '(?=[^a-z0-9]|$)' : '';
  const pattern = new RegExp(`${prefix}${escapeRegExp(signal)}${suffix}`);

  return pattern.test(promptText);
}

function getActiveUserSkills(promptText: string, userSkills: UserSkill[] | undefined): UserSkill[] {
  if (!userSkills?.length) {
    return [];
  }

  const normalizedPrompt = promptText.toLowerCase();

  return userSkills.filter((skill) => {
    if (!skill.lens.trim()) {
      return false;
    }

    const signals = skill.signals
      .map((signal) => signal.trim().toLowerCase())
      .filter(Boolean);

    if (signals.length === 0) {
      return true;
    }

    return signals.some((signal) => matchesSignal(normalizedPrompt, signal));
  });
}

function buildRoleDeclaration(primary: SkillDef, secondary: SkillDef | null): string {
  const additionalContext = secondary ? `, with additional context in ${secondary.domain}` : '';
  return `You are ${primary.role}${additionalContext}.`;
}

function buildLensSection(title: string, lens: string[]): string {
  return [title, '', ...lens.map((item) => `- ${item}`)].join('\n');
}

function buildUserSkillSection(skill: UserSkill): string {
  return [`## ${skill.name}`, '', skill.lens].join('\n');
}

function buildCustomRulesSection(customInstructions: string): string {
  return [
    '## Additional constraints',
    '',
    customInstructions,
    '',
    "Apply these constraints while preserving the original prompt's intent.",
  ].join('\n');
}

function buildFewShotSection(fewShotExamples: FewShotExample[]): string {
  const exampleBlocks = fewShotExamples.map((example, index) => {
    const exampleNumber = index + 1;
    return [
      `<example_${exampleNumber}>`,
      `<input>${example.input}</input>`,
      `<output>${example.output}</output>`,
      `</example_${exampleNumber}>`,
    ].join('\n');
  });

  return [
    '## Style reference from project history',
    '',
    'Use these past refinements as a quality and style reference:',
    '',
    exampleBlocks.join('\n\n'),
  ].join('\n');
}

function buildOutputFormatSection(primary: SkillDef): string {
  return [
    OUTPUT_FORMAT_INTRO,
    ...OUTPUT_FORMAT_LINES.slice(0, 1),
    `- ${primary.outputGuidance}`,
    ...OUTPUT_FORMAT_LINES.slice(1),
  ].join('\n');
}

function buildSystemPrompt(
  primary: SkillDef,
  secondary: SkillDef | null,
  activeUserSkills: UserSkill[],
  customInstructions: string | undefined,
  fewShotExamples: FewShotExample[] | undefined
): string {
  const sections: string[] = [
    ROLE_PREAMBLE,
    buildRoleDeclaration(primary, secondary),
    buildLensSection(`## Your lens for this prompt (${primary.domain})`, primary.lens),
  ];

  if (secondary) {
    sections.push(buildLensSection(`## Additional expertise: ${secondary.domain}`, secondary.lens));
  }

  for (const skill of activeUserSkills) {
    sections.push(buildUserSkillSection(skill));
  }

  if (customInstructions?.trim()) {
    sections.push(buildCustomRulesSection(customInstructions.trim()));
  }

  if (fewShotExamples?.length) {
    sections.push(buildFewShotSection(fewShotExamples));
  }

  sections.push(buildOutputFormatSection(primary));

  return sections.join('\n\n');
}

// Appended to every user message.
// The "ENHANCED PROMPT:" line acts as a continuation anchor — the model is
// completing a half-finished line, which strongly biases it toward producing
// a rewrite rather than answering the prompt.
const USER_MESSAGE_SUFFIX = [
  '',
  'Output ONLY the rewritten prompt — do not answer it, explain it, or add any preamble.',
  '',
  'ENHANCED PROMPT:',
].join('\n');

function buildUserMessage(promptText: string, repoContext?: string): string {
  const cleanRepoContext = repoContext?.trim();

  if (!cleanRepoContext) {
    return [
      'Rewrite and enhance the following prompt. Do NOT answer it.',
      '',
      '<prompt_to_boost>',
      promptText,
      '</prompt_to_boost>',
      USER_MESSAGE_SUFFIX,
    ].join('\n');
  }

  return [
    'Rewrite and enhance the following prompt. Do NOT answer it.',
    'Use the repository context only when it helps produce a more specific and better-grounded prompt.',
    '',
    '<repo_context>',
    cleanRepoContext,
    '</repo_context>',
    '',
    '<prompt_to_boost>',
    promptText,
    '</prompt_to_boost>',
    USER_MESSAGE_SUFFIX,
  ].join('\n');
}

export function assembleContext(input: AssemblyInput): AssemblyOutput {
  const { primary, secondary } = selectSkills(input.agent, input.classificationResult);
  const activeUserSkills = getActiveUserSkills(input.promptText, input.userSkills);
  const systemPrompt = buildSystemPrompt(
    primary,
    secondary,
    activeUserSkills,
    input.customInstructions,
    input.fewShotExamples
  );
  const userMessage = buildUserMessage(input.promptText, input.repoContext);
  const trace: PipelineTrace = {
    detectedDomain: input.classificationResult?.primary ? getSkill(input.classificationResult.primary).domain : null,
    confidence: input.classificationResult?.confidence ?? null,
    skillsApplied: [primary.label, ...(secondary ? [secondary.label] : [])],
    userSkillsApplied: activeUserSkills.map((skill) => skill.name),
    hasRepoContext: Boolean(input.repoContext?.trim()),
    hasCustomRules: Boolean(input.customInstructions?.trim()),
    hasFewShot: Boolean(input.fewShotExamples?.length),
    estimatedSystemPromptChars: systemPrompt.length,
    assembledSystemPrompt: systemPrompt,
  };

  return {
    systemPrompt,
    userMessage,
    trace,
  };
}