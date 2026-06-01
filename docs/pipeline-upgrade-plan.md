# RyFine — Context Assembly Pipeline Upgrade

> **For the implementing agent:** work through each phase in order. Each phase is independently shippable. Run `npm --prefix web run build` and `npm --prefix web run lint` after every phase. Do not modify `site/` or any file outside `web/` unless explicitly stated.

---

## What this plan does

Today, every refinement passes through a single function — `buildSystemPrompt()` — that picks one of 8 hardcoded strings and returns it. The intelligence is static and cannot grow.

This plan replaces that single function with a **four-stage context assembly pipeline** that runs entirely client-side before the one LLM call:

```
Raw input
    │
    ▼
Stage 1 — Intent classifier        (pure TS, no LLM, < 1ms)
    │  Reads the raw prompt. Returns a scored, ranked list of domains.
    │
    ▼
Stage 2 — Skill selector           (pure TS, < 1ms)
    │  Chooses which built-in and user-defined skills to activate,
    │  based on the agent dropdown setting and classifier output.
    │
    ▼
Stage 3 — Context assembler        (pure TS, < 5ms)
    │  Composes skills + custom rules + repo context + few-shot
    │  examples into a single, structured system prompt.
    │  Produces a PipelineTrace for the UI.
    │
    ▼
Stage 4 — One LLM call             (unchanged — provider API call)
    │  Same boostAnthropic / boostOpenAICompat / boostGemini functions.
    │  Only what goes IN is richer.
    │
    ▼
Output (streams as before)
```

The LLM call count stays at **one**. Latency added by stages 1–3 is under 10ms. All provider functions in `ryFine.ts` below line 172 are **untouched**.

---

## Codebase orientation (unchanged from previous plan)

| Path | Role |
|---|---|
| `web/src/lib/ryFine.ts` | Core refinement logic — stages 1–4 live here |
| `web/src/lib/agents.ts` | `Agent` type + `AGENTS` array — unchanged |
| `web/src/App.tsx` | Root component — wires pipeline trace into UI |
| `web/src/App.css` | All styles — add new classes here |
| `web/src/index.css` | CSS custom property tokens — do not modify |

### Design tokens (reference only)

```
--accent: #c8f750   --accent-bg: rgba(200,247,80,0.10)
--accent-border: rgba(200,247,80,0.38)
--ok: #46d98a       --warn: #f5b73c     --danger: #ff5d5d   --info: #5cc8ff
--text: #8b8b99     --text-h: #f4f4f6
--surface: #131319  --surface-2: #1b1b23
--display: 'Bricolage Grotesque'   --sans: 'Hanken Grotesk'   --mono: 'Geist Mono'
```

---

## Phase 1 — Skill registry (`web/src/lib/skills.ts`)

### Goal

Define a `SkillDef` interface and a registry of 8 built-in skills that replace the `AGENT_SYSTEM_PROMPTS` record in `ryFine.ts`. Each skill is richer than the current one-paragraph strings — it has a structured role, a lens (what to look for and add), output guidance, and detection signals used by the classifier.

### Create `web/src/lib/skills.ts`

```ts
import type { Agent } from './agents';

export type SkillId = Agent; // skills map 1:1 to existing agents for now

export interface SkillSignal {
  pattern: RegExp | string; // string = exact word match (case-insensitive)
  weight: number;           // 1–20; higher = stronger signal for this domain
}

export interface SkillDef {
  id: SkillId;
  label: string;
  domain: string;           // human-readable domain name shown in trace
  role: string;             // what the LLM is told it IS
  lens: string[];           // bullet-point list of what to look for / add
  outputGuidance: string;   // domain-specific output format notes
  signals: SkillSignal[];   // used by the intent classifier
  priority: number;         // 1 = highest; used when multiple skills active
}
```

### Built-in skill definitions

Define and export the following constant:

```ts
export const BUILT_IN_SKILLS: Record<SkillId, SkillDef> = { ... };
```

Populate it with these 8 entries. **Copy the content verbatim** — every word matters for output quality.

---

#### `auto`

```ts
{
  id: 'auto',
  label: 'Auto',
  domain: 'Multi-domain',
  role: 'a professional prompt engineer with broad expertise across software engineering, content creation, data analysis, research, UX design, and project management',
  lens: [
    'Identify the primary domain of the prompt (engineering, content, data, research, design, or planning)',
    'Apply the terminology, constraints, and structure that professionals in that domain expect',
    'Add specificity where the original is vague — language, framework, audience, format, scope',
    'Ensure the prompt is unambiguous and actionable without changing the original intent',
  ],
  outputGuidance: 'Use Markdown. Present requirements and constraints as lists. Use a heading if the prompt has multiple distinct parts.',
  signals: [], // auto is activated by the dropdown, not the classifier
  priority: 5,
}
```

---

#### `coding`

```ts
{
  id: 'coding',
  label: 'Coding',
  domain: 'Software Engineering',
  role: 'a professional prompt engineer specialising in software engineering',
  lens: [
    'Specify the programming language, framework, runtime, or library where implied or missing',
    'Clarify input and output types, function signatures, and return value semantics',
    'Add error handling expectations: which errors to catch, how to surface them',
    'Include edge cases: empty input, null values, boundary conditions, concurrent access',
    'Add performance or security constraints where relevant (time complexity, auth, sanitisation)',
    'Reference standard patterns, idioms, or library conventions appropriate to the stack',
    'Ensure the prompt is testable — a reader should be able to write a unit test from it',
  ],
  outputGuidance: 'Use Markdown. List requirements as bullet points. Put function signatures or type definitions in a code block.',
  signals: [
    { pattern: /\bfunction\b/i, weight: 12 },
    { pattern: /\bclass\b/i, weight: 10 },
    { pattern: /\bapi\b/i, weight: 10 },
    { pattern: /\bendpoint\b/i, weight: 14 },
    { pattern: /\btypescript\b/i, weight: 18 },
    { pattern: /\bjavascript\b/i, weight: 16 },
    { pattern: /\bpython\b/i, weight: 16 },
    { pattern: /\breact\b/i, weight: 14 },
    { pattern: /\bnodejs\b|\bnode\.js\b/i, weight: 14 },
    { pattern: /\bdatabase\b/i, weight: 8 },
    { pattern: /\brefactor\b/i, weight: 14 },
    { pattern: /\bunit test\b|\btest case\b/i, weight: 16 },
    { pattern: /\bcomponent\b/i, weight: 8 },
    { pattern: /\bbug\b|\bfix\b/i, weight: 8 },
    { pattern: /\bimplement\b/i, weight: 6 },
    { pattern: /\basync\b|\bawait\b/i, weight: 14 },
    { pattern: /\binterface\b|\btype\b/i, weight: 10 },
    { pattern: /\brest\b|\bgraphql\b/i, weight: 12 },
    { pattern: /[A-Z][a-z]+[A-Z]/, weight: 8 },   // camelCase identifier
    { pattern: /\bgit\b|\bpr\b|\bpull request\b/i, weight: 8 },
  ],
  priority: 1,
}
```

---

#### `content`

```ts
{
  id: 'content',
  label: 'Content',
  domain: 'Content & Copywriting',
  role: 'a professional prompt engineer specialising in content creation, copywriting, and brand communication',
  lens: [
    'Define the target audience: who they are, what they know, what they care about',
    'Specify the tone of voice: formal, conversational, authoritative, playful, empathetic',
    'Clarify the content format: word count or length range, structure (sections, bullet points, narrative), medium (email, blog, social, ad)',
    'State the primary goal: inform, persuade, entertain, or convert',
    'Add brand voice constraints or key messages if implied',
    'Specify any calls to action and where they should appear',
    'Distinguish between must-have content elements and nice-to-have',
  ],
  outputGuidance: 'Use Markdown. Structure requirements as a brief and include a "Constraints" section at the end.',
  signals: [
    { pattern: /\bblog post\b|\barticle\b/i, weight: 18 },
    { pattern: /\bemail\b/i, weight: 10 },
    { pattern: /\bnewsletter\b/i, weight: 16 },
    { pattern: /\blanding page\b/i, weight: 14 },
    { pattern: /\bcopy\b|\bcopywriting\b/i, weight: 16 },
    { pattern: /\bheadline\b|\btagline\b/i, weight: 16 },
    { pattern: /\btone\b|\btone of voice\b/i, weight: 14 },
    { pattern: /\baudience\b|\breader\b/i, weight: 12 },
    { pattern: /\bcall to action\b|\bcta\b/i, weight: 16 },
    { pattern: /\bpersuasive\b|\bpersuade\b/i, weight: 14 },
    { pattern: /\bseo\b/i, weight: 12 },
    { pattern: /\bsocial media\b|\btweet\b|\blinkedin\b/i, weight: 14 },
    { pattern: /\bdraft\b/i, weight: 6 },
    { pattern: /\bwrite\b/i, weight: 4 },
  ],
  priority: 2,
}
```

---

#### `data`

```ts
{
  id: 'data',
  label: 'Data',
  domain: 'Data & Analytics',
  role: 'a professional prompt engineer specialising in data analysis, SQL, and data science',
  lens: [
    'Specify table names, column names, and data types where implied',
    'Clarify the metric definition: what is being measured and how',
    'Add aggregation logic: GROUP BY fields, time window, granularity',
    'Specify output format: table rows, chart type, decimal precision, null handling',
    'Identify edge cases: null values, duplicate rows, outliers, date boundary behaviour',
    'Reference the relevant tool or language: SQL dialect, Python library, BI platform',
    'Add performance considerations for large datasets if implied',
  ],
  outputGuidance: 'Use Markdown. Put schema definitions and sample queries in code blocks. List assumptions separately.',
  signals: [
    { pattern: /\bsql\b/i, weight: 20 },
    { pattern: /\bquery\b/i, weight: 14 },
    { pattern: /\bdataset\b|\bdataframe\b/i, weight: 18 },
    { pattern: /\baggregate\b|\bgroup by\b/i, weight: 18 },
    { pattern: /\bmetric\b|\bkpi\b/i, weight: 16 },
    { pattern: /\bchart\b|\bvisuali[sz]e\b/i, weight: 14 },
    { pattern: /\bpandas\b|\bspark\b|\bbigquery\b/i, weight: 20 },
    { pattern: /\bschema\b|\btable\b|\bcolumn\b/i, weight: 12 },
    { pattern: /\bjoin\b/i, weight: 12 },
    { pattern: /\banalys[ei]s\b|\banalyse\b|\banalyze\b/i, weight: 8 },
    { pattern: /\bstatistic\b|\bregression\b|\bcorrelation\b/i, weight: 16 },
    { pattern: /\bdashboard\b/i, weight: 12 },
    { pattern: /\bretention\b|\bconversion\b|\bfunnel\b/i, weight: 12 },
  ],
  priority: 1,
}
```

---

#### `research`

```ts
{
  id: 'research',
  label: 'Research',
  domain: 'Research & Synthesis',
  role: 'a professional prompt engineer specialising in research and information synthesis',
  lens: [
    'Define the research question precisely — what specifically needs to be answered',
    'Set scope boundaries: time period, geography, industry, or subject area',
    'Specify source requirements: primary vs. secondary, recency, academic vs. practitioner',
    'Clarify the output format: executive summary, comparison table, annotated list, literature review',
    'Add methodology constraints if appropriate: systematic review, qualitative, quantitative',
    'State what should be explicitly excluded or treated as out of scope',
    'Include a bias-awareness requirement if the topic is contested or sensitive',
  ],
  outputGuidance: 'Use Markdown. Separate the research question, scope, sources, and output format as distinct sections.',
  signals: [
    { pattern: /\bresearch\b/i, weight: 18 },
    { pattern: /\bliterature review\b/i, weight: 20 },
    { pattern: /\bsources\b|\bcitations\b|\breferences\b/i, weight: 16 },
    { pattern: /\bacademic\b|\bpeer.reviewed\b/i, weight: 18 },
    { pattern: /\bstudy\b|\bsurvey\b/i, weight: 12 },
    { pattern: /\bmethodology\b|\bhypothesis\b/i, weight: 18 },
    { pattern: /\bbibliography\b|\bcite\b/i, weight: 16 },
    { pattern: /\bsynthesi[sz]e\b|\bsummar[iy]ze\b/i, weight: 10 },
    { pattern: /\bfind\b|\bgather\b/i, weight: 4 },
    { pattern: /\bcompar[ei]\b/i, weight: 6 },
  ],
  priority: 3,
}
```

---

#### `design`

```ts
{
  id: 'design',
  label: 'Design',
  domain: 'UX & Product Design',
  role: 'a professional prompt engineer specialising in UX, product design, and design systems',
  lens: [
    'Specify the platform and viewport: web, mobile, tablet, or native app',
    'Name the accessibility standard required: WCAG 2.1 AA, AAA, or platform-specific',
    'Clarify all interaction states that must be designed: default, hover, focus, active, disabled, loading, error, empty',
    'Define the user goal and the specific screen or flow context',
    'Add design token or component library constraints if the prompt implies a system',
    'Separate layout, content, and behaviour concerns into distinct requirements',
    'Include responsive behaviour or breakpoints if the design spans screen sizes',
  ],
  outputGuidance: 'Use Markdown. List states and requirements as a numbered checklist. Include a Constraints section.',
  signals: [
    { pattern: /\bux\b|\bui\b/i, weight: 18 },
    { pattern: /\buser interface\b/i, weight: 18 },
    { pattern: /\bwireframe\b|\bprototype\b/i, weight: 18 },
    { pattern: /\bfigma\b|\bsketch\b/i, weight: 20 },
    { pattern: /\baccessibility\b|\bwcag\b/i, weight: 18 },
    { pattern: /\bdesign system\b|\bcomponent library\b/i, weight: 18 },
    { pattern: /\binteraction\b|\bflow\b|\buser journey\b/i, weight: 14 },
    { pattern: /\bhover\b|\bfocus state\b|\bdisabled\b/i, weight: 14 },
    { pattern: /\blayout\b/i, weight: 8 },
    { pattern: /\bvisual\b|\baesthetic\b/i, weight: 6 },
    { pattern: /\bdesign\b/i, weight: 4 },
    { pattern: /\bmobile\b|\bresponsive\b/i, weight: 8 },
  ],
  priority: 2,
}
```

---

#### `planning`

```ts
{
  id: 'planning',
  label: 'Planning',
  domain: 'Project & Product Planning',
  role: 'a professional prompt engineer specialising in project management and product planning',
  lens: [
    'Frame objectives as SMART goals: Specific, Measurable, Achievable, Relevant, Time-bound',
    'Specify timeline and milestones or sprint scope if applicable',
    'Clarify ownership: who is responsible, who is consulted, who must approve',
    'List dependencies and blocking conditions explicitly',
    'Add success metrics and acceptance criteria',
    'Distinguish between strategic intent and tactical execution steps',
    'Specify the audience for the output: engineering, executive, customer, cross-functional',
  ],
  outputGuidance: 'Use Markdown. Use a table for milestones or owners. Separate goals, constraints, and metrics into labelled sections.',
  signals: [
    { pattern: /\broadmap\b/i, weight: 18 },
    { pattern: /\bsprint\b|\bbacklog\b/i, weight: 18 },
    { pattern: /\bmilestone\b/i, weight: 16 },
    { pattern: /\bokr\b|\bkpi\b/i, weight: 18 },
    { pattern: /\bstakeholder\b/i, weight: 16 },
    { pattern: /\bepic\b|\buser story\b/i, weight: 16 },
    { pattern: /\bproject plan\b|\bproject brief\b/i, weight: 18 },
    { pattern: /\btimeline\b|\bdeliverable\b/i, weight: 14 },
    { pattern: /\binitiative\b|\bquarter\b|\bq[1-4]\b/i, weight: 12 },
    { pattern: /\bplan\b|\bstrategy\b/i, weight: 6 },
    { pattern: /\bgoal[s]?\b|\bobjective[s]?\b/i, weight: 8 },
  ],
  priority: 3,
}
```

---

#### `general`

```ts
{
  id: 'general',
  label: 'General',
  domain: 'General',
  role: 'a prompt engineer',
  lens: [
    'Improve clarity: remove ambiguity and vague imperatives',
    'Improve specificity: replace "something" with the actual thing',
    'Tighten language: cut filler words without losing meaning',
    'Preserve the original intent exactly — do not change what the user is asking for',
  ],
  outputGuidance: 'Return the improved prompt as plain prose or a short list. Minimal formatting.',
  signals: [], // catch-all, never selected by classifier — only via explicit dropdown
  priority: 5,
}
```

---

### Also export

```ts
export function getSkill(id: SkillId): SkillDef {
  return BUILT_IN_SKILLS[id];
}

export function getAllSkills(): SkillDef[] {
  return Object.values(BUILT_IN_SKILLS);
}
```

### Acceptance criteria

- `BUILT_IN_SKILLS` has exactly 8 entries matching the `Agent` type
- `getSkill('coding')` returns the coding skill def
- TypeScript compiles with no errors
- No changes to any other file in this phase

---

## Phase 2 — Intent classifier (`web/src/lib/intentClassifier.ts`)

### Goal

A pure TypeScript function that scores the raw prompt text against each skill's signal list. Returns a ranked result with no LLM call. Used by Stage 1 of the pipeline and also by the `auto` agent to select skills automatically.

### Create `web/src/lib/intentClassifier.ts`

```ts
import { BUILT_IN_SKILLS, type SkillId } from './skills';

export interface ClassificationResult {
  /** Highest-scoring domain. Null only if prompt is empty. */
  primary: SkillId | null;
  /** Second-highest domain if its score is > 40% of the primary score. */
  secondary: SkillId | null;
  /** Raw score 0–100 per domain. */
  scores: Record<SkillId, number>;
  /** Human-readable list of matched signal patterns, for display in trace. */
  signals: string[];
  /** Confidence in the classification. */
  confidence: 'high' | 'medium' | 'low';
}
```

### Implement `classifyIntent(promptText: string): ClassificationResult`

Algorithm:

1. Normalise the input: `text = promptText.toLowerCase().trim()`
2. For each skill in `BUILT_IN_SKILLS` that has at least one signal:
   - For each signal in `skill.signals`:
     - If signal is a `RegExp`: test against the original (not lowercased) prompt text. If it matches, add `signal.weight` to the skill's raw score and push the matched string to `signals[]`
     - If signal is a `string`: check if `text` includes the string lowercased. If so, add `signal.weight` and push the string to `signals[]`
3. Find `maxScore = Math.max(...rawScores)`. If `maxScore === 0`, return null primary with all scores 0 and confidence `'low'`.
4. Normalise: `score[id] = Math.min(100, Math.round((rawScore[id] / maxScore) * 100))`
5. Sort skills by normalised score descending.
6. `primary` = highest-scoring skill id (if its raw score > 0)
7. `secondary` = second-highest if `scores[second] >= 40` (i.e. ≥ 40% of the primary's normalised 100)
8. `confidence`:
   - `'high'` if primary normalised score ≥ 70 (before normalisation, primary raw score ≥ 30)
   - `'medium'` if primary raw score ≥ 15
   - `'low'` otherwise

```ts
export function classifyIntent(promptText: string): ClassificationResult {
  // ... implementation following algorithm above
}
```

### Also export

```ts
/** Returns true if the classifier result is reliable enough to override
 *  a user's 'auto' agent choice with a specific skill. */
export function isConfidentClassification(result: ClassificationResult): boolean {
  return result.primary !== null && result.confidence !== 'low';
}
```

### Acceptance criteria

- `classifyIntent('write a sql query to find duplicate rows')` → primary: `'data'`, confidence: `'high'`
- `classifyIntent('write a blog post about AI')` → primary: `'content'`, confidence: `'high'`
- `classifyIntent('create a react component with typescript types')` → primary: `'coding'`, confidence: `'high'`
- `classifyIntent('hello')` → primary: `null` or `confidence: 'low'`
- `classifyIntent('')` → primary: `null`, all scores 0
- Signal patterns from `coding` skill do not fire on a content prompt and vice versa
- No external dependencies — pure TypeScript

---

## Phase 3 — Context assembler (`web/src/lib/contextAssembler.ts`)

### Goal

A pure function that takes all available context — skills, custom rules, repo context, few-shot examples, user-defined skills — and composes them into a structured system prompt string plus a user message string. Also produces a `PipelineTrace` for the UI.

This function **replaces** `buildSystemPrompt()` and `wrapUserMessage()` in `ryFine.ts`. Those two functions become private implementation details called only from this file.

### Types

```ts
import type { Agent } from './agents';
import type { SkillId, SkillDef } from './skills';
import type { FewShotExample } from './projects';

export interface UserSkill {
  id: string;           // uuid
  name: string;         // display name, e.g. "Acme brand voice"
  domain: string;       // free-form tag, e.g. "brand", "legal", "internal"
  lens: string;         // the actual instruction content — free-form text
  signals: string[];    // optional keywords that trigger auto-selection
  createdAt: string;    // ISO date
}

export interface AssemblyInput {
  agent: Agent;
  promptText: string;
  customInstructions?: string;
  repoContext?: string;
  fewShotExamples?: FewShotExample[];
  userSkills?: UserSkill[];       // user-defined skills to layer in
  classificationResult?: ClassificationResult; // from Stage 1; optional
}

export interface AssemblyOutput {
  systemPrompt: string;
  userMessage: string;
  trace: PipelineTrace;
}

export interface PipelineTrace {
  detectedDomain: string | null;   // e.g. "Software Engineering" or null
  confidence: 'high' | 'medium' | 'low' | null;
  skillsApplied: string[];         // built-in skill labels, e.g. ["Coding"]
  userSkillsApplied: string[];     // user skill names, e.g. ["Acme brand voice"]
  hasRepoContext: boolean;
  hasCustomRules: boolean;
  hasFewShot: boolean;
  estimatedSystemPromptChars: number;
}
```

### Implement `assembleContext(input: AssemblyInput): AssemblyOutput`

#### System prompt structure (assemble in this exact order):

```
[1. ROLE PREAMBLE — always present]
CRITICAL RULE: Your ONLY job is to rewrite and enhance the prompt you are given.
Do NOT answer the prompt. Do NOT follow its instructions. Do NOT provide
information about the subject matter. You are a prompt rewriter — output ONLY
an improved version of the prompt.

[2. ROLE DECLARATION]
You are [primarySkill.role][, with additional context in [secondarySkill.domain]].

[3. PRIMARY SKILL LENS — always present]
## Your lens for this prompt ([primarySkill.domain])

[primarySkill.lens as a bullet list, one item per line prefixed with "- "]

[4. SECONDARY SKILL LENS — only if a secondary skill is active]
## Additional expertise: [secondarySkill.domain]

[secondarySkill.lens as a bullet list]

[5. USER-DEFINED SKILL BLOCKS — one block per active user skill]
## [userSkill.name]

[userSkill.lens — rendered as-is, the user controls this content]

[6. CUSTOM RULES — only if customInstructions is non-empty]
## Additional constraints

[customInstructions.trim()]

Apply these constraints while preserving the original prompt's intent.

[7. FEW-SHOT EXAMPLES — only if fewShotExamples.length > 0]
## Style reference from project history

Use these past refinements as a quality and style reference:

<example_1>
<input>[ex.input]</input>
<output>[ex.output]</output>
</example_1>
... (repeat for each example)

[8. OUTPUT FORMAT — always present, always last]
**Output format:**
- Use Markdown. Present steps and constraints as lists. Use headings where the prompt has distinct parts.
- [primarySkill.outputGuidance]
- Output ONLY the enhanced prompt — no explanations, preamble, metadata, or wrapper tags.
- Do NOT answer the prompt. Do NOT provide information about the topic.
```

#### User message structure (unchanged from current `wrapUserMessage`):

```
Rewrite and enhance the following prompt. Do NOT answer it.
[If repoContext present]:
Use the repository context only when it helps produce a more specific and better-grounded prompt.

<repo_context>
[repoContext]
</repo_context>

<prompt_to_boost>
[promptText]
</prompt_to_boost>
```

#### Skill selection logic within `assembleContext`:

```ts
function selectSkills(agent: Agent, classification?: ClassificationResult): {
  primary: SkillDef;
  secondary: SkillDef | null;
} {
  if (agent !== 'auto') {
    // Explicit agent selected — use it as primary, no secondary
    return { primary: getSkill(agent), secondary: null };
  }

  // Auto mode: use classifier result
  if (!classification || !isConfidentClassification(classification) || !classification.primary) {
    // Classifier not confident — fall back to the current auto behaviour
    return { primary: getSkill('auto'), secondary: null };
  }

  const primary = getSkill(classification.primary);
  const secondary = classification.secondary ? getSkill(classification.secondary) : null;
  return { primary, secondary };
}
```

#### User skill selection logic:

A user skill is active if:
- It has no signals defined (always active), OR
- At least one of its signal strings appears in the prompt text (case-insensitive)

Only include user skills with non-empty `lens` content.

#### PipelineTrace construction:

Populate `PipelineTrace` using the selected skills and inputs. `estimatedSystemPromptChars` = `systemPrompt.length`.

### Export

```ts
export { assembleContext };
export type { AssemblyInput, AssemblyOutput, PipelineTrace, UserSkill };
```

### Acceptance criteria

- `assembleContext({ agent: 'coding', promptText: 'write a sort function' })` produces a system prompt containing the coding skill's lens bullet points
- `assembleContext({ agent: 'auto', promptText: 'write a blog post', classificationResult: { primary: 'content', ... } })` uses the content skill
- `assembleContext({ agent: 'auto', promptText: 'hello', classificationResult: { primary: null, confidence: 'low', ... } })` falls back to the `auto` skill
- System prompt sections appear in the order defined above — no exceptions
- `trace.skillsApplied` always has at least one entry
- `trace.hasFewShot` is true only when `fewShotExamples` is non-empty
- The user message always ends with `</prompt_to_boost>`
- No external dependencies

---

## Phase 4 — Wire pipeline into `ryFine.ts`

### Goal

Replace the two private functions `buildSystemPrompt` and `wrapUserMessage` in `ryFine.ts` with calls to `assembleContext`. Add a `onTrace` callback to `ryFine()` so the UI can receive the pipeline trace without changing the return type.

### Changes to `web/src/lib/ryFine.ts`

#### Add import at the top

```ts
import { assembleContext, classifyIntent, type AssemblyInput, type PipelineTrace } from './contextAssembler';
```

#### Remove

- The `ROLE_PREAMBLE` constant (lines 43–47)
- The `FORMATTING` constant (lines 49–53)
- The `AGENT_SYSTEM_PROMPTS` record (lines 55–124)
- The `buildSystemPrompt` function (lines 126–148)
- The `wrapUserMessage` function (lines 150–171)

#### Update `RyFineRequest` interface

Add one optional field:

```ts
export interface RyFineRequest {
  promptText: string;
  provider: Provider;
  apiKey: string;
  model: string;
  agent: Agent;
  customInstructions?: string;
  repoContext?: string;
  image?: AppImage;
  fewShotExamples?: FewShotExample[];
  userSkills?: UserSkill[];   // ← new
}
```

Also export `UserSkill` from this file:

```ts
export type { UserSkill } from './contextAssembler';
```

#### Update `ryFine()` signature

```ts
export async function ryFine(
  request: RyFineRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  onTrace?: (trace: PipelineTrace) => void,   // ← new optional callback
): Promise<BoostTokenUsage | null>
```

#### Update `ryFine()` body

Replace the current first two lines of the function body:

```ts
// BEFORE:
const systemPrompt = buildSystemPrompt(request.agent, request.customInstructions, request.fewShotExamples);
const noVision = ...

// AFTER:
const classificationResult = request.agent === 'auto'
  ? classifyIntent(request.promptText)
  : undefined;

const assembly = assembleContext({
  agent: request.agent,
  promptText: request.promptText,
  customInstructions: request.customInstructions,
  repoContext: request.repoContext,
  fewShotExamples: request.fewShotExamples,
  userSkills: request.userSkills,
  classificationResult,
});

onTrace?.(assembly.trace);

const systemPrompt = assembly.systemPrompt;
// userMessage is now produced by assembleContext — pass it to each provider
// instead of re-calling wrapUserMessage inside boostAnthropic etc.
```

**Important:** the individual `boostAnthropic`, `boostOpenAICompat`, `boostGemini` functions currently call `wrapUserMessage(promptText, repoContext)` internally. After this phase, they should instead receive `userMessage: string` as a parameter and use that directly, since `assembleContext` now produces the user message.

Update each provider function signature to accept `userMessage: string` instead of `promptText: string` + `repoContext: string | undefined`. Pass `assembly.userMessage` from the `ryFine()` switch statement.

The provider function bodies: replace every occurrence of `wrapUserMessage(promptText, repoContext)` with the `userMessage` parameter.

#### Also export PipelineTrace

```ts
export type { PipelineTrace } from './contextAssembler';
```

### Acceptance criteria

- `npm --prefix web run build` passes with no errors
- `npm --prefix web run lint` passes
- The `onTrace` callback fires before the first streaming chunk
- Calling `ryFine(request, onChunk, signal)` without `onTrace` works identically to before
- The `AGENT_SYSTEM_PROMPTS` record no longer exists anywhere in the codebase

---

## Phase 5 — User-defined skills (`web/src/lib/userSkills.ts` + `SkillManager` component)

### Goal

Let users define their own skill layers (e.g. "Acme brand voice", "Legal review checklist"). Each is a name + domain tag + free-form instruction text + optional trigger keywords. Stored in `localStorage`. Rendered in a new Skills drawer panel in the app.

### Create `web/src/lib/userSkills.ts`

```ts
import type { UserSkill } from './contextAssembler';

const LS_KEY = 'ryfine_user_skills';

export function loadUserSkills(): UserSkill[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as UserSkill[];
  } catch {
    return [];
  }
}

export function saveUserSkills(skills: UserSkill[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(skills));
}

export function createUserSkill(draft: Omit<UserSkill, 'id' | 'createdAt'>): UserSkill {
  return {
    ...draft,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export function updateUserSkill(existing: UserSkill, draft: Omit<UserSkill, 'id' | 'createdAt'>): UserSkill {
  return { ...existing, ...draft };
}
```

### Create `web/src/components/SkillManager.tsx`

A self-contained drawer panel component with the following behaviour:

**Props:**

```tsx
interface SkillManagerProps {
  skills: UserSkill[];
  onSave: (skills: UserSkill[]) => void;
}
```

**Layout (three regions, top to bottom):**

1. **Skill list** — renders each saved skill as a card showing `name`, `domain` tag, and first 80 characters of `lens`. Each card has an Edit and Delete button.

2. **Skill editor** — appears below the list when the user clicks "New skill" or "Edit". Fields:
   - `name`: text input (required)
   - `domain`: text input with placeholder "e.g. brand, legal, tone"
   - `signals`: text input, comma-separated keywords, placeholder "e.g. email, proposal, legal"
   - `lens`: `<textarea>` (min-height 120px), placeholder "Describe what this skill should add or look for. Write as bullet points or plain instructions."
   - Save button (disabled if `name` or `lens` is empty)
   - Cancel button

3. **Empty state** — if no skills exist and the editor is closed, show a brief explanation:
   > "Skills layer your own expertise on top of the built-in agents. Add a brand voice, legal constraints, or any domain knowledge you want applied to every refinement."

**CSS classes to add to `web/src/App.css`:**

```css
.skill-manager { display: flex; flex-direction: column; gap: 12px; }

.skill-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}

.skill-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.skill-card-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-h);
}

.skill-domain-tag {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
}

.skill-lens-preview {
  font-size: 12px;
  color: var(--text);
  line-height: 1.45;
  opacity: 0.8;
}

.skill-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent-bg) 50%, var(--surface));
}

.skill-editor-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-editor-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text);
  opacity: 0.7;
}

.skill-editor-input,
.skill-editor-textarea {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-h);
  font-size: 13px;
  font-family: var(--sans);
  outline: none;
}

.skill-editor-input:focus,
.skill-editor-textarea:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 2px var(--accent-bg);
}

.skill-editor-textarea {
  min-height: 120px;
  resize: vertical;
  line-height: 1.55;
}

.skill-editor-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.skill-empty {
  font-size: 13px;
  color: var(--text);
  opacity: 0.7;
  line-height: 1.55;
  padding: 8px 0;
}
```

### Changes to `web/src/App.tsx`

#### New state

```ts
const [userSkills, setUserSkills] = useState<UserSkill[]>(loadUserSkills);
```

#### New panel type

Add `'skills'` to the `openPanel` union type:

```ts
const [openPanel, setOpenPanel] = useState<'rules' | 'context' | 'library' | 'settings' | 'project' | 'skills' | null>(null);
```

#### New trigger in the command bar (right zone)

Add a "Skills" disclosure trigger button between "Rules" and "Context":

```tsx
<button
  type="button"
  className={`disclosure-trigger ${openPanel === 'skills' ? 'is-open' : ''} ${userSkills.length > 0 ? 'has-indicator' : ''}`}
  aria-label="Custom skills"
  aria-expanded={openPanel === 'skills'}
  onClick={() => setOpenPanel((prev) => (prev === 'skills' ? null : 'skills'))}
>
  Skills
  {userSkills.length > 0 && <span className="trigger-badge">{userSkills.length}</span>}
</button>
```

#### Pass `userSkills` to `executeBoostRequest`

In the `executeBoostRequest` call inside `boost()`, `boostBoth()`, `boostCompareModels()`, and `adjustRefinement()`, add `userSkills` to the request object:

```ts
await executeBoostRequest({
  ...request,
  userSkills,
}, ...);
```

#### New drawer for skills panel

```tsx
{openPanel === 'skills' && (
  <aside className="drawer drawer-right is-open" aria-label="Custom skills">
    <header className="drawer-header">
      <div>
        <h2 className="drawer-title">Skills</h2>
        <p className="drawer-subtitle">Layer your own expertise on top of the built-in agents. Active on every refinement.</p>
      </div>
      <button className="drawer-close" type="button" aria-label="Close skills" onClick={() => setOpenPanel(null)}>×</button>
    </header>
    <div className="drawer-body">
      <SkillManager
        skills={userSkills}
        onSave={(updated) => {
          setUserSkills(updated);
          saveUserSkills(updated);
        }}
      />
    </div>
  </aside>
)}
```

#### Update command palette

Add two commands:

```ts
{ id: 'open-skills', label: 'Open skills manager', action: () => setOpenPanel('skills') },
{ id: 'new-skill',   label: 'Create new skill',    action: () => { setOpenPanel('skills'); /* SkillManager handles new form */ } },
```

### Acceptance criteria

- "Skills" button appears in the command bar between Rules and Context
- Counter badge shows number of active user skills
- Creating a skill: enter name + lens → Save → appears in list immediately
- Editing a skill: click Edit → form pre-filled → Save → list updated
- Deleting a skill: click Delete → removed immediately
- Skills persist across page reloads (localStorage)
- Active user skills are included in every `ryFine()` call via `request.userSkills`
- A skill with no signal keywords is always active; one with keywords is only active when a keyword appears in the prompt

---

## Phase 6 — Pipeline trace UI (`web/src/components/PipelineTrace.tsx` + App.tsx wiring)

### Goal

After each successful refinement, a small trace strip in the output pane header shows the user exactly what the pipeline applied: which skills fired, whether repo context was used, whether few-shot examples were injected, and a link to expand the full assembled system prompt.

### Create `web/src/components/PipelineTrace.tsx`

**Props:**

```tsx
interface PipelineTraceProps {
  trace: PipelineTrace;
  onExpand: () => void;   // opens the full system prompt in a modal
  expanded: boolean;
}
```

**Render (compact strip):**

```tsx
<div className="pipeline-trace" aria-label="Pipeline summary">
  <span className="trace-label">Applied:</span>

  {trace.skillsApplied.map(skill => (
    <span key={skill} className="trace-chip skill-chip">{skill}</span>
  ))}

  {trace.userSkillsApplied.map(skill => (
    <span key={skill} className="trace-chip user-skill-chip">{skill}</span>
  ))}

  {trace.hasRepoContext && (
    <span className="trace-chip context-chip">Repo context</span>
  )}

  {trace.hasCustomRules && (
    <span className="trace-chip rules-chip">Custom rules</span>
  )}

  {trace.hasFewShot && (
    <span className="trace-chip fewshot-chip">Style examples</span>
  )}

  <button className="trace-expand-btn" onClick={onExpand} aria-expanded={expanded}>
    {expanded ? 'Hide prompt' : 'View prompt'}
  </button>
</div>
```

When `expanded` is true, render the full assembled system prompt in a `<pre>` block beneath the trace strip (inside a collapsible `<details>`-like div). The system prompt text is passed as a separate prop: `systemPrompt?: string`.

**Full props:**

```tsx
interface PipelineTraceProps {
  trace: PipelineTrace;
  systemPrompt?: string;
  onExpand: () => void;
  expanded: boolean;
}
```

### CSS classes for `web/src/App.css`

```css
.pipeline-trace {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex-shrink: 0;
}

.trace-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text);
  opacity: 0.55;
  flex-shrink: 0;
}

.trace-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.skill-chip {
  border-color: var(--accent-border);
  background: var(--accent-bg);
  color: var(--accent);
}

.user-skill-chip {
  border-color: rgba(92, 200, 255, 0.35);
  background: rgba(92, 200, 255, 0.08);
  color: var(--info);
}

.context-chip {
  border-color: rgba(70, 217, 138, 0.3);
  background: rgba(70, 217, 138, 0.08);
  color: var(--ok);
}

.rules-chip, .fewshot-chip {
  border-color: var(--border-strong);
  background: var(--surface-2);
  color: var(--text);
}

.trace-expand-btn {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 5px;
  opacity: 0.65;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.trace-expand-btn:hover { opacity: 1; color: var(--text-h); }

.trace-system-prompt {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--code-bg);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-h);
  white-space: pre-wrap;
  overflow-x: auto;
  max-height: 320px;
  overflow-y: auto;
  flex-shrink: 0;
}
```

### Changes to `web/src/App.tsx`

#### New state

```ts
const [lastTrace, setLastTrace] = useState<PipelineTrace | null>(null);
const [lastSystemPrompt, setLastSystemPrompt] = useState<string>('');
const [traceExpanded, setTraceExpanded] = useState(false);
```

Reset `lastTrace`, `lastSystemPrompt`, and `traceExpanded` inside `clear()` and `resetTransientOutputState()`.

#### Pass `onTrace` to `executeBoostRequest` → `ryFine()`

In `executeBoostRequest`, add a fourth argument to the `ryFine()` call:

```ts
const tokensUsed = await ryFine(
  { ...request, apiKey: key, image: attachedImage ?? undefined, fewShotExamples },
  (chunk) => { ... },
  controller.signal,
  (trace) => {
    setLastTrace(trace);
    // Capture the assembled system prompt for the "View prompt" expansion.
    // assembleContext is already called inside ryFine — expose systemPrompt
    // by adding it to PipelineTrace (see below).
  },
);
```

**Add `assembledSystemPrompt` to `PipelineTrace`** in `contextAssembler.ts`:

```ts
export interface PipelineTrace {
  // ... existing fields ...
  assembledSystemPrompt: string;   // ← new: the full system prompt string
}
```

Populate it in `assembleContext`: `assembledSystemPrompt: systemPrompt`.

In the `onTrace` callback in App.tsx:

```ts
(trace) => {
  setLastTrace(trace);
  setLastSystemPrompt(trace.assembledSystemPrompt);
  setTraceExpanded(false);
}
```

#### Render `PipelineTrace` in the output pane

In the output pane, between the `.pane-header` and `.output-area`, render:

```tsx
{outputMode === 'single' && lastTrace && singleResult.status === 'done' && singleResult.output && (
  <>
    <PipelineTrace
      trace={lastTrace}
      systemPrompt={lastSystemPrompt}
      onExpand={() => setTraceExpanded(v => !v)}
      expanded={traceExpanded}
    />
    {traceExpanded && (
      <pre className="trace-system-prompt">{lastSystemPrompt}</pre>
    )}
  </>
)}
```

#### Add to command palette

```ts
{ id: 'toggle-trace', label: traceExpanded ? 'Hide pipeline prompt' : 'View pipeline prompt', action: () => setTraceExpanded(v => !v), disabled: !lastTrace },
```

### Acceptance criteria

- Pipeline trace strip appears between the output pane header and the output body after every successful single-mode refinement
- Skill chips are lime (accent colour); user skill chips are blue (info colour); repo context chip is green (ok colour)
- "View prompt" button expands the full assembled system prompt as monospace text
- "Hide prompt" collapses it
- Trace resets when the user clears the input or starts a new refinement
- Trace does not appear in compare mode
- Both dark and light themes render correctly

---

## Validation after all phases

```bash
npm --prefix web run build   # must succeed with no type errors
npm --prefix web run lint    # must pass with no new warnings
npm run build                # full repo build including site/ must succeed
```

### Functional checklist (manual)

- [ ] Auto agent on a coding prompt → skill chip shows "Coding", not "Auto"
- [ ] Auto agent on a vague prompt → skill chip shows "Auto" (low confidence fallback)
- [ ] Explicit coding agent → skill chip shows "Coding" regardless of input content
- [ ] User creates a skill with no signal keywords → appears in every refinement
- [ ] User creates a skill with keywords "legal, contract" → only fires when prompt contains those words
- [ ] "View prompt" shows the full assembled system prompt with all sections visible
- [ ] Project with 3 history records → "Style examples" chip appears in trace
- [ ] Repo context uploaded → "Repo context" chip appears in trace
- [ ] Custom rules set → "Custom rules" chip appears in trace
- [ ] All features work correctly in light and dark themes
- [ ] `npm --prefix web run lint` produces zero warnings
