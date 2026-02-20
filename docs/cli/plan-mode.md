# Plan Mode (experimental)

Plan Mode is a read-only environment for architecting robust solutions before
implementation. It allows you to:

- **Research:** Explore the project in a read-only state to prevent accidental
  changes.
- **Design:** Understand problems, evaluate trade-offs, and choose a solution.
- **Plan:** Align on an execution strategy before any code is modified.

> **Note:** This is a preview feature currently under active development. Your
> feedback is invaluable as we refine this feature. If you have ideas,
> suggestions, or encounter issues:
>
> - [Open an issue](https://github.com/google-gemini/gemini-cli/issues) on
>   GitHub.
> - Use the **/bug** command within Gemini CLI to file an issue.

- [Enabling Plan Mode](#enabling-plan-mode)
- [How to use Plan Mode](#how-to-use-plan-mode)
  - [Entering Plan Mode](#entering-plan-mode)
  - [Planning Workflow](#planning-workflow)
  - [Exiting Plan Mode](#exiting-plan-mode)
- [Tool Restrictions](#tool-restrictions)
  - [Customizing Planning with Skills](#customizing-planning-with-skills)
  - [Customizing Policies](#customizing-policies)
    - [Example: Allow git commands in Plan Mode](#example-allow-git-commands-in-plan-mode)
    - [Example: Enable research subagents in Plan Mode](#example-enable-research-subagents-in-plan-mode)
  - [Custom Plan Directory and Policies](#custom-plan-directory-and-policies)

## Enabling Plan Mode

To use Plan Mode, enable it via **/settings** (search for **Plan**) or add the
following to your `settings.json`:

```json
{
  "experimental": {
    "plan": true
  }
}
```

## How to use Plan Mode

### Entering Plan Mode

You can configure Gemini CLI to start in Plan Mode by default or enter it
manually during a session.

- **Configuration:** Configure Gemini CLI to start directly in Plan Mode by
  default:
  1.  Type `/settings` in the CLI.
  2.  Search for **Default Approval Mode**.
  3.  Set the value to **Plan**.

  Alternatively, use the `gemini --approval-mode=plan` CLI flag or manually
  update:

  ```json
  {
    "general": {
      "defaultApprovalMode": "plan"
    }
  }
  ```

- **Keyboard Shortcut:** Press `Shift+Tab` to cycle through approval modes
  (`Default` -> `Auto-Edit` -> `Plan`).

  > **Note:** Plan Mode is automatically removed from the rotation when Gemini
  > CLI is actively processing or showing confirmation dialogs.

- **Command:** Type `/plan` in the input box.

- **Natural Language:** Ask Gemini CLI to "start a plan for...". Gemini CLI then
  calls the [`enter_plan_mode`] tool to switch modes.
  > **Note:** This tool is not available when Gemini CLI is in [YOLO mode].

### Planning Workflow

1.  **Explore & Analyze:** Analyze requirements and use read-only tools to map
    the codebase and validate assumptions. For complex tasks, identify at least
    two viable implementation approaches.
2.  **Consult:** Present a summary of the identified approaches via [`ask_user`]
    to obtain a selection. For simple or canonical tasks, this step may be
    skipped.
3.  **Draft:** Once an approach is selected, write a detailed implementation
    plan to the plans directory.
4.  **Review & Approval:** Use the [`exit_plan_mode`] tool to present the plan
    and formally request approval.
    - **Approve:** Exit Plan Mode and start implementation.
    - **Iterate:** Provide feedback to refine the plan.

For more complex or specialized planning tasks, you can
[customize the planning workflow with skills](#customizing-planning-with-skills).

### Exiting Plan Mode

To exit Plan Mode, you can:

- **Keyboard Shortcut:** Press `Shift+Tab` to cycle to the desired mode.

- **Tool:** Gemini CLI calls the [`exit_plan_mode`] tool to present the
  finalized plan for your approval.

## Tool Restrictions

Plan Mode enforces strict safety policies to prevent accidental changes.

These are the only allowed tools:

- **FileSystem (Read):** [`read_file`], [`list_directory`], [`glob`]
- **Search:** [`grep_search`], [`google_web_search`]
- **Interaction:** [`ask_user`]
- **MCP Tools (Read):** Read-only [MCP tools] (e.g., `github_read_issue`,
  `postgres_read_schema`) are allowed.
- **Planning (Write):** [`write_file`] and [`replace`] only allowed for `.md`
  files in the `~/.gemini/tmp/<project>/<session-id>/plans/` directory or your
  [custom plans directory](#custom-plan-directory-and-policies).
- **Skills:** [`activate_skill`] (allows loading specialized instructions and
  resources in a read-only manner)

### Customizing Planning with Skills

You can use [Agent Skills](./skills.md) to customize how Gemini CLI approaches
planning for specific types of tasks. When a skill is activated during Plan
Mode, its specialized instructions and procedural workflows will guide the
research, design and planning phases.

For example:

- A **"Database Migration"** skill could ensure the plan includes data safety
  checks and rollback strategies.
- A **"Security Audit"** skill could prompt Gemini CLI to look for specific
  vulnerabilities during codebase exploration.
- A **"Frontend Design"** skill could guide Gemini CLI to use specific UI
  components and accessibility standards in its proposal.

To use a skill in Plan Mode, you can explicitly ask Gemini CLI to "use the
`<skill-name>` skill to plan..." or Gemini CLI may autonomously activate it
based on the task description.

### Customizing Policies

Plan Mode is designed to be read-only by default to ensure safety during the
research phase. However, you may occasionally need to allow specific tools to
assist in your planning.

Because user policies (Tier 2) have a higher base priority than built-in
policies (Tier 1), you can override Plan Mode's default restrictions by creating
a rule in your `~/.gemini/policies/` directory.

#### Example: Allow git commands in Plan Mode

This rule allows you to check the repository status and see changes while in
Plan Mode.

`~/.gemini/policies/git-research.toml`

```toml
[[rule]]
toolName = "run_shell_command"
commandPrefix = ["git status", "git diff"]
decision = "allow"
priority = 100
modes = ["plan"]
```

#### Example: Enable research subagents in Plan Mode

You can enable experimental research [subagents] like `codebase_investigator` to
help gather architecture details during the planning phase.

`~/.gemini/policies/research-subagents.toml`

```toml
[[rule]]
toolName = "codebase_investigator"
decision = "allow"
priority = 100
modes = ["plan"]
```

Tell Gemini CLI it can use these tools in your prompt, for example: _"You can
check ongoing changes in git."_

For more information on how the policy engine works, see the [policy engine]
docs.

### Custom Plan Directory and Policies

By default, planning artifacts are stored in a managed temporary directory
outside your project: `~/.gemini/tmp/<project>/<session-id>/plans/`.

You can configure a custom directory for plans in your `settings.json`. For
example, to store plans in a `.gemini/plans` directory within your project:

```json
{
  "general": {
    "plan": {
      "directory": ".gemini/plans"
    }
  }
}
```

To maintain the safety of Plan Mode, user-configured paths for the plans
directory are restricted to the project root. This ensures that custom planning
locations defined within a project's workspace cannot be used to escape and
overwrite sensitive files elsewhere. Any user-configured directory must reside
within the project boundary.

Using a custom directory requires updating your [policy engine] configurations
to allow `write_file` and `replace` in that specific location. For example, to
allow writing to the `.gemini/plans` directory within your project, create a
policy file at `~/.gemini/policies/plan-custom-directory.toml`:

```toml
[[rule]]
toolName = ["write_file", "replace"]
decision = "allow"
priority = 100
modes = ["plan"]
# Adjust the pattern to match your custom directory.
# This example matches any .md file in a .gemini/plans directory within the project.
argsPattern = "\"file_path\":\"[^\"]*/\\.gemini/plans/[a-zA-Z0-9_-]+\\.md\""
```

[`list_directory`]: /docs/tools/file-system.md#1-list_directory-readfolder
[`read_file`]: /docs/tools/file-system.md#2-read_file-readfile
[`grep_search`]: /docs/tools/file-system.md#5-grep_search-searchtext
[`write_file`]: /docs/tools/file-system.md#3-write_file-writefile
[`glob`]: /docs/tools/file-system.md#4-glob-findfiles
[`google_web_search`]: /docs/tools/web-search.md
[`replace`]: /docs/tools/file-system.md#6-replace-edit
[MCP tools]: /docs/tools/mcp-server.md
[`activate_skill`]: /docs/cli/skills.md
[subagents]: /docs/core/subagents.md
[policy engine]: /docs/reference/policy-engine.md
[`enter_plan_mode`]: /docs/tools/planning.md#1-enter_plan_mode-enterplanmode
[`exit_plan_mode`]: /docs/tools/planning.md#2-exit_plan_mode-exitplanmode
[`ask_user`]: /docs/tools/ask-user.md
[YOLO mode]: /docs/reference/configuration.md#command-line-arguments
