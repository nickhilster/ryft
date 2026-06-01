import type { Agent } from '@ryft/core';

export type SkillId = Agent;

export interface SkillSignal {
  pattern: RegExp | string;
  weight: number;
}

export interface SkillDef {
  id: SkillId;
  label: string;
  domain: string;
  role: string;
  lens: string[];
  outputGuidance: string;
  signals: SkillSignal[];
  priority: number;
}

export const BUILT_IN_SKILLS: Record<SkillId, SkillDef> = {
  auto: {
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
    signals: [],
    priority: 5,
  },
  coding: {
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
      { pattern: /[A-Z][a-z]+[A-Z]/, weight: 8 },
      { pattern: /\bgit\b|\bpr\b|\bpull request\b/i, weight: 8 },
    ],
    priority: 1,
  },
  content: {
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
      { pattern: /\bblog post\b|\barticle\b/i, weight: 26 },
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
  },
  data: {
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
  },
  research: {
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
  },
  design: {
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
  },
  planning: {
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
  },
  general: {
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
    signals: [],
    priority: 5,
  },
};

export function getSkill(id: SkillId): SkillDef {
  return BUILT_IN_SKILLS[id];
}

export function getAllSkills(): SkillDef[] {
  return Object.values(BUILT_IN_SKILLS);
}