# Plan Mode (experimental)

Plan Mode is a read-only environment for architecting robust solutions before
implementation. With Plan Mode, you can:

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

## How to enable Plan Mode

Enable Plan Mode in **Settings** or by editing your configuration file.

- **Settings:** Use the `/settings` command and set **Plan** to `true`.
- **Configuration:** Add the following to your `settings.json`:

  ```json
  {
    "experimental": {
      "plan": true
    }
  }
  ```

## How to enter Plan Mode

Plan Mode integrates seamlessly into your workflow, letting you switch between
planning and execution as needed.

You can either configure Gemini CLI to start in Plan Mode by default or enter
Plan Mode manually during a session.

### Launch in Plan Mode

To start Gemini CLI directly in Plan Mode by default:

1.  Use the `/settings` command.
2.  Set **Default Approval Mode** to `Plan`.

To launch Gemini CLI in plan mode once:

1. Use `gemini --approval-mode=plan` when launching Gemini CLI.

### Enter Plan Mode manually

To start Plan Mode while using Gemini CLI:

- **Keyboard shortcut:** Press `Shift+Tab` to cycle through approval modes
  (`Default` -> `Auto-Edit` -> `Plan`).

  > **Note:** Plan Mode is automatically removed from the rotation when Gemini
  > CLI is actively processing or showing confirmation dialogs.

- **Command:** Type `/plan` in the input box.

- **Natural Language:** Ask Gemini CLI to "start a plan for...". Gemini CLI
  calls the [`enter_plan_mode`] tool to switch modes.

## How to use Plan Mode

Follow this structured approach to maximize the benefits of Plan Mode.

1.  **Explore and analyze:** Analyze requirements and use read-only tools to map
    the codebase and validate assumptions. For complex tasks, identify at least
    two viable implementation approaches.
2.  **Consult:** Present a summary of the identified approaches using
    [`ask_user`] to obtain a selection. For simple or canonical tasks, this step
    may be skipped.
3.  **Draft:** Once an approach is selected, write a detailed implementation
    plan to the plans directory.
4.  **Review and approval:** Use the [`exit_plan_mode`] tool to present the
    finalized plan and formally request approval.
    - **Approve:** Exit Plan Mode and start implementation.
    - **Iterate:** Provide feedback to refine the plan.

For more complex or specialized planning tasks, you can
[customize the planning workflow with skills](#custom-planning-with-skills).

## How to exit Plan Mode

Once you have a solid plan, you can exit Plan Mode to start coding.

- **Keyboard shortcut:** Press `Shift+Tab` to cycle to the desired mode.

- **Tool:** Gemini CLI calls the [`exit_plan_mode`] tool to present the
  finalized plan for your approval.

## Customization and best practices

Plan Mode is secure by default, but you can adapt it to fit your specific
workflows. You can customize how Gemini CLI plans by using skills, adjusting
safety policies, or changing where plans are stored.

### Tool restrictions

Plan Mode enforces strict safety policies to prevent accidental changes.

These are the only allowed tools:

- **FileSystem (Read):** [`read_file`], [`list_directory`], [`glob`]
- **Search:** [`grep_search`], [`google_web_search`]
- **Interaction:** [`ask_user`]
- **MCP tools (Read):** Read-only [MCP tools] (for example, `github_read_issue`,
  `postgres_read_schema`) are allowed.
- **Planning (Write):** [`write_file`] and [`replace`] only allowed for `.md`
  files in the `~/.gemini/tmp/<project>/<session-id>/plans/` directory or your
  [custom plans directory](#custom-plan-directory-and-policies).
- **Skills:** [`activate_skill`] (lets you load specialized instructions and
  resources in a read-only manner).

### Custom planning with skills

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

### Custom policies

Plan Mode is read-only by default to ensure safety during the research phase.
However, you may occasionally need to enable specific tools to assist in your
planning.

Because user policies (Tier 2) have a higher base priority than built-in
policies (Tier 1), you can override Plan Mode's default restrictions by creating
a rule in your `~/.gemini/policies/` directory.

#### Example: Allow git commands in Plan Mode

This rule lets you check the repository status and see changes while in Plan
Mode.

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

### Custom plan directory and policies

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
