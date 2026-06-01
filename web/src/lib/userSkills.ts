import type { UserSkill } from './contextAssembler.ts';

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

export function updateUserSkill(
  existing: UserSkill,
  draft: Omit<UserSkill, 'id' | 'createdAt'>
): UserSkill {
  return { ...existing, ...draft };
}