export type Agent =
  | 'auto'
  | 'coding'
  | 'content'
  | 'data'
  | 'research'
  | 'design'
  | 'planning'
  | 'general';

export interface AgentDef {
  id: Agent;
  label: string;
  description: string;
}

export const AGENTS: AgentDef[] = [
  { id: 'auto', label: 'Auto', description: 'Detect domain and apply matching expertise' },
  { id: 'coding', label: 'Coding', description: 'Software engineering: types, edge cases, patterns' },
  { id: 'content', label: 'Content', description: 'Writing & copy: audience, tone, structure' },
  { id: 'data', label: 'Data', description: 'Analytics & SQL: schema, metrics, output format' },
  { id: 'research', label: 'Research', description: 'Scope, methodology, source constraints' },
  { id: 'design', label: 'Design', description: 'UX & systems: states, accessibility, flows' },
  { id: 'planning', label: 'Planning', description: 'PM & strategy: goals, milestones, metrics' },
  { id: 'general', label: 'General', description: 'Minimal enhancement - saves tokens' },
];

export function isAgent(value: unknown): value is Agent {
  return typeof value === 'string' && AGENTS.some(agent => agent.id === value);
}
