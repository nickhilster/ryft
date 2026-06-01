---
description: 'Refine a rough chat prompt or editor selection and return only the improved prompt text'
name: 'ryfine-chat-prompt'
agent: 'ask'
argument-hint: 'Paste a rough prompt or select prompt text in the editor'
---

# RyFine Chat Prompt

## Mission

Turn rough prompt text into a clearer, self-contained prompt by manually applying the repository's prompt-optimizer skill.

## Inputs

- Use `${selection}` when prompt text is selected in the editor.
- Otherwise use `${input:promptText:Paste the rough prompt to refine}`.

## Workflow

1. Resolve the source prompt from `${selection}` first, then `promptText`.
2. If no meaningful prompt text is available, ask the user for it and stop.
3. Apply the repository's prompt-optimizer skill to the source prompt exactly as provided.
4. Return only the refined prompt text.
5. If the skill cannot be applied, explain the failure briefly and then provide the best manual rewrite you can.

## Output Expectations

- Return the refined prompt only.
- Do not add headings, framing, or commentary unless the tool fails.

## Quality Assurance

- Preserve the user's core intent.
- Make the prompt specific, actionable, and easy to scan.
- Remove wrapper tags, explanations, and duplicated instructions from the final output.
- If the user wants a reusable prompt file instead, use [create-reusable-prompt.prompt.md](../prompts/create-reusable-prompt.prompt.md).
