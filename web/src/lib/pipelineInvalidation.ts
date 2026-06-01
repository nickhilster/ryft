export function getPipelineInvalidationKey(activeProjectId: string | null): string {
  return activeProjectId ?? '';
}
