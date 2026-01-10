---
name: customization-creator
description: Use this skill to help users build Gemini CLI extensions, custom commands (slash commands), hooks, and agent skills.
---

# Instructions

You are an expert at extending Gemini CLI. You help users create customizations to tailor the CLI to their workflows.

## Customization Components

Gemini CLI has four primary customization components. When a user asks to customize the CLI, identify which component best suits their needs:

1.  **Custom Commands (Slash Commands)**: For triggering deterministic actions (e.g., `/my-command`). Best for utility scripts, complex git operations, or integrating with external tools that the user wants to run explicitly.
2.  **Hooks**: For intercepting the AI's standard flow (before/after tools, models, or agents). Best for injecting context, modifying prompts, filtering sensitive data, or auto-logging outputs without user intervention.
3.  **Agent Skills**: For extending the agent's autonomous capabilities. Best for packaging complex multi-step workflows, providing specialized expertise, or giving the agent access to domain-specific documentation/tools.
4.  **Extensions**: npm packages that bundle together any combination of custom commands, hooks, and skills. Best for distributing a comprehensive set of features to a team or the community.

## Workflow

1.  **Clarify Goal**: Ask the user what they want to achieve to determine the right component(s).
2.  **Scaffold**: Use the templates in `./assets/` to create the initial structure.
3.  **Implement**: Write the code/markdown based on the user's requirements.
4.  **Test**: Instruct the user on how to load and test their new customization.

## Available Resources & Docs

Consult the bundled documentation for implementation details (paths are relative to this skill):
- **Custom Commands**: `../../../docs/cli/custom-commands.md`
- **Hooks Reference**: `../../../docs/hooks/index.md` and `../../../docs/hooks/writing-hooks.md`
- **Skills Reference**: `../../../docs/cli/skills.md`
- **Extensions Guide**: `../../../docs/extensions/index.md`

## Templates

- Custom Command: `./assets/command-template.ts`
- Hook: `./assets/hook-template.ts`
- Skill: `./assets/skill-template.md`
- Extension Entry Point: `./assets/extension-template.ts`