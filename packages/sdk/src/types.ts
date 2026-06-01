export type FindingType =
  | 'instruction_override'
  | 'persona_hijack'
  | 'structural_abuse'
  | 'encoding_obfuscation'
  | 'context_poisoning';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'clean';

export interface Finding {
  type: FindingType;
  severity: Severity;
  segment: string;
  startIndex: number;
  endIndex: number;
  explanation: string;
}

export interface RyftAnalysis {
  risk: RiskLevel;
  score: number;
  findings: Finding[];
  sanitized: string;
  sanitizationChanges: string[];
  layer: 1;
}
