# Pipeline Upgrade Completion

## Overview
Implemented the context assembly pipeline upgrade for the RyFine web app end to end. The web app now uses a deterministic client-side pipeline for intent classification, skill selection, context assembly, custom user skills, and a visible pipeline trace while preserving a single downstream model call per refinement.

## Completed Work
- Added a built-in skills registry in [web/src/lib/skills.ts](../..//web/src/lib/skills.ts) and deterministic intent classification in [web/src/lib/intentClassifier.ts](../..//web/src/lib/intentClassifier.ts).
- Added structured prompt assembly and trace generation in [web/src/lib/contextAssembler.ts](../..//web/src/lib/contextAssembler.ts).
- Rewired [web/src/lib/ryFine.ts](../..//web/src/lib/ryFine.ts) to assemble prompts once, emit pipeline trace data before streaming, and pass assembled user messages directly to provider helpers.
- Added persisted user skills support in [web/src/lib/userSkills.ts](../..//web/src/lib/userSkills.ts) and the custom skills manager in [web/src/components/SkillManager.tsx](../..//web/src/components/SkillManager.tsx).
- Integrated custom skills, drawer entry points, command palette actions, and request propagation through [web/src/App.tsx](../..//web/src/App.tsx).
- Added the pipeline trace UI in [web/src/components/PipelineTrace.tsx](../..//web/src/components/PipelineTrace.tsx) and supporting styles in [web/src/App.css](../..//web/src/App.css).
- Added focused regression coverage in [web/tests/pipelineContracts.test.ts](../..//web/tests/pipelineContracts.test.ts) and [web/tests/pipelineInvalidation.test.ts](../..//web/tests/pipelineInvalidation.test.ts).
- Updated [README.md](../../README.md) and [web/README.md](../../web/README.md) to match the shipped behavior.
- Fixed the existing lint blocker in [web/src/components/SeedOfLifeLogo.tsx](../..//web/src/components/SeedOfLifeLogo.tsx) while restoring the final validation baseline.

## Validation
- Passed `npm --prefix web run test`
- Passed `npm --prefix web run build`
- Passed `npm --prefix web run lint`
- Passed `npm run build`
- Browser validation passed the requested functional checklist, including auto-skill fallback, custom-skill matching, prompt expansion, trace chips, and compare-mode trace exclusion.

## Review Outcome
A final lightweight review found no remaining concrete regression issues.

## Residual Risks
- Intent classification remains heuristic by design, so mixed-domain prompts may still fall back to `Auto` or choose a less specific built-in skill.
- Compare-mode trace exclusion is covered by App render gating and browser validation, but there is still limited automated UI-only coverage around that presentation detail.

## Next Steps
- If desired, add a dedicated browser regression covering project switching alongside trace invalidation.
- If desired, extend automated tests to cover more mixed-domain classification examples.
