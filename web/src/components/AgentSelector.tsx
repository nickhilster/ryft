import { AGENTS, type Agent } from '../lib/agents';

interface Props {
  agent: Agent;
  onChange: (agent: Agent) => void;
}

export function AgentSelector({ agent, onChange }: Props) {
  const active = AGENTS.find(a => a.id === agent) ?? AGENTS[0];

  return (
    <label className="agent-select" title={active.description}>
      <span className="agent-select-label">Agent</span>
      <select
        className="agent-select-control"
        value={agent}
        onChange={event => onChange(event.target.value as Agent)}
        aria-label="Specialization agent"
      >
        {AGENTS.map(a => (
          <option key={a.id} value={a.id}>{a.label}</option>
        ))}
      </select>
    </label>
  );
}
