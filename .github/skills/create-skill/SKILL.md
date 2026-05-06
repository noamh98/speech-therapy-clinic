---
name: create-skill
user-invocable: true
description: "Create or update a VS Code skill definition file (SKILL.md) for workspace or user-level customizations. Guides scope selection, frontmatter, workflow steps, and validation checks."
---

# Create a SKILL.md

## When to use

Use this skill when you want to create a reusable workspace or user-level VS Code skill that documents a multi-step workflow, captures decision logic, and provides a clear prompt surface for future invocations.

## What this skill does

- Asks whether the new skill should be workspace-scoped or personal
- Identifies the workflow outcome the skill should produce
- Drafts required YAML frontmatter and a descriptive purpose statement
- Offers a clear set of steps, triggers, and validation checks
- Saves the skill to the appropriate location

## Creation steps

1. Confirm the goal: What task or workflow should the skill solve?
2. Confirm the scope: workspace-scoped (`.github/skills/`) or personal/user-scoped (`{{VSCODE_USER_PROMPTS_FOLDER}}/`)
3. Draft a `SKILL.md` structure with:
   - `name`
   - `user-invocable`
   - `description`
   - workflow guidance, examples, and validation notes
4. Save the skill file in the chosen location
5. Review and verify the frontmatter syntax and description clarity

## Checklist before finishing

- [ ] Does the skill name reflect the workflow clearly?
- [ ] Is `user-invocable` set correctly?
- [ ] Is the `description` actionable and keyword-rich?
- [ ] Does it include a concise workflow and any decision points?
- [ ] Is the path correct for workspace vs user scope?

## Example prompts to try

- `Create a new SKILL.md for completing code reviews` 
- `Draft a skill for generating test plans from feature tickets`
- `Generate a workspace skill for project onboarding tasks`

## Notes

- Prefer `SKILL.md` only for multi-step workflows or reusable guidance.
- If the task is a single focused action, consider a prompt (`*.prompt.md`) instead.
- If the behavior should apply automatically to files, consider agent or file instructions instead.
