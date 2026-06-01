import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assembleContext, type UserSkill } from '../src/lib/contextAssembler.ts';
import { classifyIntent, isConfidentClassification, type ClassificationResult } from '../src/lib/intentClassifier.ts';
import { detectOutputType, ryFine } from '../src/lib/ryFine.ts';
import { createUserSkill, loadUserSkills, saveUserSkills, updateUserSkill } from '../src/lib/userSkills.ts';

class MemoryStorage {
  private values = new Map<string, string>();

  constructor(initialValues: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initialValues)) {
      this.values.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const fixedDate = '2026-05-29T10:00:00.000Z';

function withMockedStorage<T>(storage: Storage, run: () => T): T {
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });

  try {
    return run();
  } finally {
    if (original === undefined) {
      delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: original,
      });
    }
  }
}

function withMockedDateAndUuid<T>(run: () => T): T {
  const originalDate = Date;
  const originalCrypto = globalThis.crypto;

  class MockDate extends Date {
    constructor(value?: string | number | Date) {
      super(value ?? fixedDate);
    }

    static override now(): number {
      return new originalDate(fixedDate).getTime();
    }
  }

  Object.defineProperty(globalThis, 'Date', {
    configurable: true,
    value: MockDate,
  });
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      ...originalCrypto,
      randomUUID: () => 'skill-123',
    },
  });

  try {
    return run();
  } finally {
    Object.defineProperty(globalThis, 'Date', {
      configurable: true,
      value: originalDate,
    });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  }
}

describe('pipeline classifier coverage', () => {
  it('matches the documented acceptance examples', () => {
    const dataPrompt = classifyIntent('write a sql query to find duplicate rows');
    const contentPrompt = classifyIntent('write a blog post about AI');
    const codingPrompt = classifyIntent('create a react component with typescript types');
    const helloPrompt = classifyIntent('hello');
    const emptyPrompt = classifyIntent('');

    assert.equal(dataPrompt.primary, 'data');
    assert.equal(dataPrompt.confidence, 'high');
    assert.equal(contentPrompt.primary, 'content');
    assert.equal(contentPrompt.confidence, 'high');
    assert.equal(codingPrompt.primary, 'coding');
    assert.equal(codingPrompt.confidence, 'high');
    assert.equal(helloPrompt.primary, null);
    assert.equal(helloPrompt.confidence, 'low');
    assert.deepEqual(emptyPrompt.scores, {
      auto: 0,
      coding: 0,
      content: 0,
      data: 0,
      research: 0,
      design: 0,
      planning: 0,
      general: 0,
    });
  });

  it('keeps domain signals separated and respects confidence thresholds', () => {
    const contentPrompt = classifyIntent('write a blog post headline and CTA for our newsletter audience');
    const lowPlanningPrompt = classifyIntent('plan');
    const mediumPlanningPrompt = classifyIntent('timeline goals objectives');
    const highPlanningPrompt = classifyIntent('roadmap sprint milestone stakeholder q3');

    assert.equal(contentPrompt.primary, 'content');
    assert.equal(contentPrompt.scores.coding, 0);
    assert.equal(contentPrompt.confidence, 'high');
    assert.equal(lowPlanningPrompt.confidence, 'low');
    assert.equal(isConfidentClassification(lowPlanningPrompt), false);
    assert.equal(mediumPlanningPrompt.primary, 'planning');
    assert.equal(mediumPlanningPrompt.confidence, 'medium');
    assert.equal(isConfidentClassification(mediumPlanningPrompt), true);
    assert.equal(highPlanningPrompt.primary, 'planning');
    assert.equal(highPlanningPrompt.confidence, 'high');
  });
});

describe('context assembly coverage', () => {
  it('assembles sections in a deterministic order and preserves the prompt wrapper contract', () => {
    const keywordSkill: UserSkill = {
      id: 'brand',
      name: 'Acme brand voice',
      domain: 'brand',
      lens: 'Use Acme brand tone and product naming.',
      signals: ['launch', 'brand'],
      createdAt: fixedDate,
    };
    const alwaysOnSkill: UserSkill = {
      id: 'compliance',
      name: 'Legal review',
      domain: 'legal',
      lens: 'Avoid unsupported claims and mention approval checkpoints.',
      signals: [],
      createdAt: fixedDate,
    };
    const classificationResult: ClassificationResult = {
      primary: 'content',
      secondary: 'planning',
      scores: {
        auto: 0,
        coding: 10,
        content: 100,
        data: 0,
        research: 0,
        design: 0,
        planning: 47,
        general: 0,
      },
      signals: ['blog post', 'timeline'],
      confidence: 'high',
    };

    const assembled = assembleContext({
      agent: 'auto',
      promptText: 'Write a launch blog post for our Q3 product release.',
      customInstructions: 'Keep the draft under 500 words.',
      repoContext: 'Path: README.md\n- Product positioning',
      fewShotExamples: [
        {
          input: 'Old prompt',
          output: 'Improved prompt',
        },
      ],
      userSkills: [keywordSkill, alwaysOnSkill],
      classificationResult,
    });

    const systemPrompt = assembled.systemPrompt;
    const roleIndex = systemPrompt.indexOf('You are a professional prompt engineer specialising in content creation, copywriting, and brand communication, with additional context in Project & Product Planning.');
    const primaryIndex = systemPrompt.indexOf('## Your lens for this prompt (Content & Copywriting)');
    const secondaryIndex = systemPrompt.indexOf('## Additional expertise: Project & Product Planning');
    const brandSkillIndex = systemPrompt.indexOf('## Acme brand voice');
    const legalSkillIndex = systemPrompt.indexOf('## Legal review');
    const constraintsIndex = systemPrompt.indexOf('## Additional constraints');
    const fewShotIndex = systemPrompt.indexOf('## Style reference from project history');
    const outputIndex = systemPrompt.indexOf('**Output format:**');

    assert.notEqual(roleIndex, -1);
    assert.ok(roleIndex < primaryIndex);
    assert.ok(primaryIndex < secondaryIndex);
    assert.ok(secondaryIndex < brandSkillIndex);
    assert.ok(brandSkillIndex < legalSkillIndex);
    assert.ok(legalSkillIndex < constraintsIndex);
    assert.ok(constraintsIndex < fewShotIndex);
    assert.ok(fewShotIndex < outputIndex);
    assert.match(assembled.userMessage, /^Rewrite and enhance the following prompt\. Do NOT answer it\./);
    assert.match(assembled.userMessage, /<repo_context>[\s\S]*Path: README\.md/);
    assert.match(assembled.userMessage, /<prompt_to_boost>[\s\S]*Write a launch blog post for our Q3 product release\.[\s\S]*<\/prompt_to_boost>$/);
    assert.deepEqual(assembled.trace.skillsApplied, ['Content', 'Planning']);
    assert.deepEqual(assembled.trace.userSkillsApplied, ['Acme brand voice', 'Legal review']);
    assert.equal(assembled.trace.hasRepoContext, true);
    assert.equal(assembled.trace.hasCustomRules, true);
    assert.equal(assembled.trace.hasFewShot, true);
  });

  it('falls back to Auto for low-confidence classification and ignores keyword-mismatched or empty user skills', () => {
    const assembled = assembleContext({
      agent: 'auto',
      promptText: 'hello',
      userSkills: [
        {
          id: 'unused-keyword',
          name: 'Keyword gated',
          domain: 'brand',
          lens: 'Only apply on launch prompts.',
          signals: ['launch'],
          createdAt: fixedDate,
        },
        {
          id: 'empty-lens',
          name: 'Empty skill',
          domain: 'ops',
          lens: '   ',
          signals: [],
          createdAt: fixedDate,
        },
      ],
      classificationResult: classifyIntent('plan'),
    });

    assert.deepEqual(assembled.trace.skillsApplied, ['Auto']);
    assert.deepEqual(assembled.trace.userSkillsApplied, []);
    assert.equal(assembled.trace.detectedDomain, 'Project & Product Planning');
    assert.equal(assembled.trace.confidence, 'low');
    assert.doesNotMatch(assembled.systemPrompt, /## Keyword gated/);
    assert.doesNotMatch(assembled.systemPrompt, /## Empty skill/);
  });

  it('prefers an explicit agent over classifier output', () => {
    const assembled = assembleContext({
      agent: 'coding',
      promptText: 'Write a blog post about our API migration.',
      classificationResult: classifyIntent('write a blog post about our API migration'),
    });

    assert.deepEqual(assembled.trace.skillsApplied, ['Coding']);
    assert.match(assembled.systemPrompt, /software engineering/);
    assert.doesNotMatch(assembled.systemPrompt, /Content & Copywriting/);
  });

  it('matches user skill signals on whole terms instead of partial words', () => {
    const sqlSkill: UserSkill = {
      id: 'sql-review',
      name: 'SQL review',
      domain: 'data',
      lens: 'Double-check query correctness and database constraints.',
      signals: ['sql'],
      createdAt: fixedDate,
    };

    const exactMatch = assembleContext({
      agent: 'auto',
      promptText: 'Write a SQL query to find duplicate rows.',
      userSkills: [sqlSkill],
    });
    const partialMatch = assembleContext({
      agent: 'auto',
      promptText: 'Explain PostgreSQL indexing strategy for our app.',
      userSkills: [sqlSkill],
    });

    assert.deepEqual(exactMatch.trace.userSkillsApplied, ['SQL review']);
    assert.match(exactMatch.systemPrompt, /## SQL review/);
    assert.deepEqual(partialMatch.trace.userSkillsApplied, []);
    assert.doesNotMatch(partialMatch.systemPrompt, /## SQL review/);
  });
});

describe('user skill helpers', () => {
  it('creates, updates, saves, and loads user skills deterministically', () => {
    withMockedDateAndUuid(() => {
      const created = createUserSkill({
        name: 'Acme voice',
        domain: 'brand',
        lens: 'Use Acme terminology.',
        signals: ['acme'],
      });

      assert.deepEqual(created, {
        id: 'skill-123',
        name: 'Acme voice',
        domain: 'brand',
        lens: 'Use Acme terminology.',
        signals: ['acme'],
        createdAt: fixedDate,
      });

      const updated = updateUserSkill(created, {
        name: 'Acme enterprise voice',
        domain: 'brand',
        lens: 'Use Acme enterprise terminology.',
        signals: ['enterprise'],
      });

      assert.equal(updated.id, created.id);
      assert.equal(updated.createdAt, created.createdAt);
      assert.equal(updated.name, 'Acme enterprise voice');

      const storage = new MemoryStorage() as unknown as Storage;
      withMockedStorage(storage, () => {
        saveUserSkills([updated]);
        assert.deepEqual(loadUserSkills(), [updated]);
      });
    });
  });

  it('returns an empty list when persisted user skills are corrupt', () => {
    const storage = new MemoryStorage({ ryfine_user_skills: '{bad-json' }) as unknown as Storage;

    withMockedStorage(storage, () => {
      assert.deepEqual(loadUserSkills(), []);
    });
  });
});

describe('runtime contracts', () => {
  it('emits trace data before a provider-level Browser AI failure in Node', async () => {
    const traces: Array<{ skillsApplied: string[]; userMessageIncludesRepo?: boolean }> = [];
    const chunks: string[] = [];

    await assert.rejects(
      () =>
        ryFine(
          {
            promptText: 'create a react component with typescript types',
            provider: 'browserai',
            apiKey: '',
            model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
            agent: 'auto',
            repoContext: 'Path: src/App.tsx',
          },
          (chunk) => {
            chunks.push(chunk);
          },
          undefined,
          (trace) => {
            traces.push({
              skillsApplied: trace.skillsApplied,
              userMessageIncludesRepo: trace.hasRepoContext,
            });
          }
        ),
      /WebGPU is unavailable/
    );

    assert.deepEqual(chunks, []);
    assert.deepEqual(traces, [
      {
        skillsApplied: ['Coding'],
        userMessageIncludesRepo: true,
      },
    ]);
  });

  it('distinguishes answer-shaped output from prompt-shaped output', () => {
    assert.equal(detectOutputType('Here are the steps to secure your API.'), 'answer');
    assert.equal(detectOutputType('## Goal\n\nRewrite the prompt to require JWT validation.'), 'prompt');
  });
});