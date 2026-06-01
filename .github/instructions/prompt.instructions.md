---
description: 'Guidelines for creating high-quality prompt files for GitHub Copilot'
applyTo: '**/*.prompt.md'
---

# Copilot Prompt Files Guidelines

Instructions for creating effective and maintainable prompt files that guide GitHub Copilot in delivering consistent, high-quality outcomes across this repository.

## Frontmatter Requirements

Every prompt file should include YAML frontmatter with the fields that matter for execution clarity.

- `description`: recommended, one sentence, outcome-oriented
- `name`: optional, slash-command display name
- `agent`: recommended, `ask`, `edit`, `agent`, or a custom agent name
- `model`: optional, only when a specific model is required
- `tools`: optional, least-privilege tool list
- `argument-hint`: optional, only when it improves usability

## File Naming and Placement

- Use kebab-case filenames ending with `.prompt.md`.
- Prefer `.github/prompts/` unless the repo deliberately uses another location.
- Pick names that describe the action, not a generic number or placeholder.

## Body Structure

- Start with an `#` heading that matches the prompt intent.
- Organize sections in a predictable flow: purpose, context, inputs, workflow, outputs, and validation.
- Keep instructions imperative, specific, and easy to execute in order.

## Inputs and Tools

- Use `${input:variableName[:placeholder]}` when the prompt needs explicit user input.
- Use `${selection}`, `${file}`, and `${workspaceFolder}` only when they are truly required.
- If tools are listed, keep them minimal and mention any destructive side effects.
- If required context is missing, instruct Copilot to ask for it and stop.

## Output Definition

- Define the format, structure, and destination of the result.
- Include success criteria and failure conditions.
- Add practical validation steps such as commands, manual checks, or review criteria.

## Maintenance Guidance

- Keep prompt files versioned with the code they support.
- Update prompts when workflows, tool choices, or repository conventions change.
- Prefer links to authoritative docs over copying long reference material into the prompt.