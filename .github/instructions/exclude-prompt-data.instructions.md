---
description: 'Write only the resulting content into files. Never echo prompt instructions, rationale, or meta-commentary into produced files.'
applyTo: '**/*.{md,ts,tsx,js,jsx,json,css,html}'
---

# Exclude Prompt Data

Write the result, not the story of how you got there.

## Never include

- `as requested`
- `per the prompt`
- `per your instruction`
- comments or prose that narrate the change instead of describing the file content
- copied rationale or planning text unless the user explicitly asked to insert it verbatim

## What belongs in the file

- The feature, fix, or documentation itself
- Comments that explain behavior, constraints, or intent
- Examples that use generic placeholder data such as `Jane Doe` or `example.com`

## Exceptions

- Prompt files, instruction files, skills, and agent definitions may contain instructional text because that is their payload.
- Changelog-style notes may describe the change, but not the request that caused it.
- Verbatim user text is allowed only when the user explicitly asks to paste it into the file.

## Self-check

Before saving, scan the diff for prompt leakage and rewrite any text that reads like a response to the user instead of normal file content.