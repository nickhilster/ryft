import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getPipelineInvalidationKey } from '../src/lib/pipelineInvalidation.ts';

describe('pipeline invalidation key', () => {
  it('returns an empty string when there is no active project', () => {
    assert.equal(getPipelineInvalidationKey(null), '');
  });

  it('returns the project id when a project is active', () => {
    assert.equal(getPipelineInvalidationKey('project-123'), 'project-123');
  });

  it('changes when the active project changes', () => {
    const withoutProject = getPipelineInvalidationKey(null);
    const withProject    = getPipelineInvalidationKey('project-123');
    assert.notEqual(withProject, withoutProject);
  });
});
