---
name: vscode-ext-commands
description: 'Use when adding or updating VS Code extension commands. Covers command naming, visibility, categories, icons, and related contribution details.'
---

# VS Code Extension Command Contribution

Use this skill when you need to add or update commands in the RyFine VS Code extension.

## Core Rules

- Every contributed command must define a `title`.
- Commands intended for the Command Palette should also define a `category`.
- Side bar only commands should use the underscore-plus-suffix pattern, include an `icon`, and avoid unintended Command Palette exposure.
- For view title or context-menu commands, define the right `group` and a meaningful `when` clause.
- Keep command contribution metadata in sync with the implementation in `src/extension.ts` and related package contributions.