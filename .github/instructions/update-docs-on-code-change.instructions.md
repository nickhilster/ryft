---
description: 'Check whether README or other user-facing docs need updates when extension or web app code changes'
applyTo: '{package.json,src/**/*.ts,web/package.json,web/src/**/*.ts,web/src/**/*.tsx,web/tests/**/*.ts,web/tests/**/*.tsx}'
---

# Update Documentation on Code Change

When changing code or package metadata in this repository, check whether the user-facing documentation needs to move with it.

## Update docs when changes affect

- RyFine behavior, commands, or user workflow
- `.prompt.md` authoring or execution guidance
- Extension setup, build, packaging, or minimum runtime requirements
- Web app features, provider behavior, saved prompt behavior, or deployment/setup steps
- Package scripts, configuration, or file paths mentioned in docs

## Primary docs to review

- `README.md`
- `web/README.md`
- Any examples or prompt assets that describe the changed behavior

## Expectations

- Keep command names, flags, and script examples aligned with both `package.json` files.
- Keep screenshots, examples, and step-by-step flows consistent with the actual UI and extension behavior.
- If a change affects external users, update docs in the same change when practical.
- If no doc update is needed, make sure that is because the behavior stayed internal.

## Validation

- Re-read affected README sections after the code change.
- Verify that referenced commands, files, and paths still exist.
- Prefer updating existing docs over inventing new documentation folders or templates that this repo does not already use.