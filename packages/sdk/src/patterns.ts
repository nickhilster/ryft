import type { FindingType, Severity } from './types';

export interface Pattern {
  id: string;
  type: FindingType;
  severity: Severity;
  pattern: RegExp;
  explanation: string;
}

export const PATTERNS: Pattern[] = [
  // ── Instruction override ──────────────────────────────────
  {
    id: 'inj-001',
    type: 'instruction_override',
    severity: 'critical',
    pattern: /\b(ignore|disregard|forget|override|bypass)\s+(all\s+)?(your\s+)?(previous|prior|above|earlier|your)\s+(instructions?|rules?|constraints?|guidelines?)/i,
    explanation: 'Attempts to nullify existing instructions.',
  },
  {
    id: 'inj-002',
    type: 'instruction_override',
    severity: 'critical',
    pattern: /\b(your\s+new\s+instructions?\s+(are|will\s+be))\b/i,
    explanation: 'Attempts to replace existing instructions with new ones.',
  },
  {
    id: 'inj-003',
    type: 'instruction_override',
    severity: 'high',
    pattern: /\b(do\s+not\s+follow|stop\s+following|no\s+longer\s+follow)\s+(your\s+)?(previous|prior|original|system)?\s*(instructions?|prompt|rules?)/i,
    explanation: 'Instructs the model to stop following its original instructions.',
  },

  // ── Persona hijack ────────────────────────────────────────
  {
    id: 'per-001',
    type: 'persona_hijack',
    severity: 'critical',
    pattern: /\byou\s+(are\s+now|will\s+be|have\s+become)\s+(DAN|an?\s+AI\s+with\s+no|a\s+helpful\s+AI\s+that\s+has\s+no)/i,
    explanation: 'Assigns an unrestricted alternative persona to the model.',
  },
  {
    id: 'per-002',
    type: 'persona_hijack',
    severity: 'high',
    pattern: /\b(pretend\s+(you\s+are|to\s+be)|act\s+as\s+if\s+you\s+(are|have\s+no)|roleplay\s+as\s+)/i,
    explanation: 'Asks the model to adopt an alternative persona.',
  },
  {
    id: 'per-003',
    type: 'persona_hijack',
    severity: 'medium',
    pattern: /\b(you\s+have\s+no\s+(restrictions?|limitations?|rules?|guidelines?|filters?)|you\s+(are\s+not\s+bound|are\s+free\s+to|can\s+say\s+anything))\b/i,
    explanation: 'Claims the model operates without restrictions.',
  },

  // ── Structural abuse ──────────────────────────────────────
  {
    id: 'str-001',
    type: 'structural_abuse',
    severity: 'high',
    pattern: /#{2,}SYSTEM#{2,}|<\/?system>/i,
    explanation: 'Uses fake system-prompt delimiters to inject a hidden instruction block.',
  },
  {
    id: 'str-002',
    type: 'structural_abuse',
    severity: 'high',
    pattern: /\[SYSTEM\]|\[INST\]|\[ASSISTANT\]/,
    explanation: 'Uses chat-template markers to inject a fake system message.',
  },
  {
    id: 'str-003',
    type: 'structural_abuse',
    severity: 'medium',
    pattern: /^(HUMAN|USER|ASSISTANT|SYSTEM)\s*:\s*.{10,}/m,
    explanation: 'Injects fake dialogue turns to shift model context.',
  },

  // ── Encoding obfuscation ──────────────────────────────────
  {
    id: 'enc-001',
    type: 'encoding_obfuscation',
    severity: 'high',
    pattern: /\b[A-Za-z0-9+/]{30,}={0,2}\b/,
    explanation: 'Contains a long base64-encoded string that may conceal instructions.',
  },
  {
    id: 'enc-002',
    type: 'encoding_obfuscation',
    severity: 'medium',
    pattern: /[​‌‍﻿⁠]/,
    explanation: 'Contains zero-width or invisible unicode characters.',
  },
];
