---
name: 'prompt-optimizer'
description: 'Use when the user wants a rough prompt, prompt idea, or task description rewritten into a finished prompt for a chat interface. Output a ready-to-send prompt, not a template.'
---

# Prompt Optimizer

Use this skill when the user wants a finished prompt for a chat interface, not a `.prompt.md` file and not an API/system prompt.

## Two Hard Rules

### 1. No placeholders

Never return `[paste here]`, `{topic}`, `<your_input_here>`, or any other fill-in-the-blank syntax.

### 2. Ship a finished prompt

- If the user already provided the real content, bake it into the prompt.
- If the user only described a class of task, write a self-contained prompt that asks for the missing information in the next turn.

## Output Format

- Return exactly one fenced code block.
- Put the full prompt inside that code block.
- Do not add preamble or explanation unless the user explicitly asks for it afterward.

## Rewrite Workflow

1. Identify the real goal and output type.
2. Decide whether the user provided actual content or only a task class.
3. Fill non-essential gaps with defensible assumptions.
4. Use a simple structure for simple tasks and a tagged structure for complex tasks.
5. End with a closing line that asks the target model to think carefully before responding.

## Quality Bar

- Be direct and specific.
- Explain constraints when that helps the model follow them.
- Use examples only when they materially improve format or tone control.
- For long-document tasks, ask the model to ground its answer in extracted quotes or evidence.
- If the user actually wants a repository prompt file, switch to prompt-file guidance instead of this skill.