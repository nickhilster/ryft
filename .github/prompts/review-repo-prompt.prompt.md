---
description: 'Review an existing .prompt.md file for structure, inputs, tool scope, and RyFine fit'
name: 'review-repo-prompt'
agent: 'Prompt Builder'
argument-hint: 'Run this from a .prompt.md file or provide a prompt file path'
---

# Review Repo Prompt

## Mission

Review an existing `.prompt.md` file for quality, clarity, and execution readiness.

## Context

- Prefer the current file when `${file}` points to a `.prompt.md`.
- Otherwise ask for a prompt file path and stop if the user does not provide one.
- Compare the prompt against [prompt.instructions.md](../instructions/prompt.instructions.md) and nearby repo conventions.

## Workflow

1. Resolve the target prompt file.
2. Read the frontmatter, body structure, inputs, tools, and validation steps.
3. Identify gaps in specificity, missing guardrails, bad tool scope, confusing inputs, or weak output definitions.
4. If the fix is obvious and low-risk, update the prompt file directly.
5. Run one Prompt Tester scenario that reflects a real repo use case.
6. Report the result with concrete findings or the edits you made.

## Output Expectations

- If the prompt is solid, say so and note any residual risk.
- If you edit the file, keep the change minimal and explain what improved.
- Include the validation scenario and whether the prompt passed it.

## Quality Assurance

- Do not widen scope beyond the target prompt file unless a linked instruction file must also change.
- Keep examples and file paths aligned with this repository.
- Avoid placeholders that require manual cleanup unless the prompt is intentionally templated.