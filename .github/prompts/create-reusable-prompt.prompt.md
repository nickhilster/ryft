---
description: 'Create or update a reusable .prompt.md file for a RyFine workflow in this repository'
name: 'create-reusable-prompt'
agent: 'Prompt Builder'
argument-hint: 'Describe the reusable task and the prompt filename'
---

# Create Reusable Prompt

## Mission

Create or update a reusable `.prompt.md` file under `.github/prompts/` for this repository.

## Context

- Follow [prompt.instructions.md](../instructions/prompt.instructions.md).
- Keep the prompt grounded in actual repo behavior, commands, and file paths.
- Use repo custom agents or skills when they sharpen the prompt.

## Inputs

- Task goal: `${input:goal:Describe the task the prompt should handle}`
- Prompt filename: `${input:fileName:Use kebab-case without the .prompt.md suffix}`
- Optional repo area: `${input:repoArea:extension, web, docs, prompts, or mixed}`

## Workflow

1. If the goal or file name is missing, ask for it and stop.
2. Inspect the relevant docs, code, and existing customizations for the requested repo area.
3. Create or update `.github/prompts/${input:fileName}.prompt.md`.
4. Add YAML frontmatter with a useful `description`, `name`, and `agent`. Add `tools` only when they are truly required.
5. Structure the body with purpose, inputs, workflow, outputs, and validation.
6. Prefer `${input:...}` variables over vague placeholders.
7. Run one Prompt Tester scenario against the finished prompt and fix any obvious gap you find.

## Output Expectations

- Save the prompt file in the workspace.
- Summarize the prompt's purpose in 2-4 sentences.
- Include the validation scenario and the main issue, if any, that was corrected.

## Quality Assurance

- Keep tool access least-privilege.
- Do not invent scripts, files, or commands.
- Link to nearby instructions or docs instead of duplicating long reference material.
- If the user wants a one-off chat prompt instead of a reusable file, use the `prompt-optimizer` skill or [boost-chat-prompt.prompt.md](../prompts/boost-chat-prompt.prompt.md).