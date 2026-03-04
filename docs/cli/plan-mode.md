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

To launch Gemini CLI in Plan Mode once:

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
  > **Note:** This tool is not available when Gemini CLI is in [YOLO mode].

## How to use Plan Mode

Plan Mode lets you collaborate with Gemini CLI to design a solution before
Gemini CLI takes action.

1.  **Provide a goal:** Start by describing what you want to achieve. Gemini CLI
    will then enter Plan Mode (if it's not already) to research the task.
2.  **Review research and provide input:** As Gemini CLI analyzes your codebase,
    it may ask you questions or present different implementation options using
    [`ask_user`]. Provide your preferences to help guide the design.
3.  **Review the plan:** Once Gemini CLI has a proposed strategy, it creates a
    detailed implementation plan as a Markdown file in your plans directory. You
    can open and read this file to understand the proposed changes.
4.  **Approve or iterate:** Gemini CLI will present the finalized plan for your
    approval.
    - **Approve:** If you're satisfied with the plan, approve it to start the
      implementation immediately: **Yes, automatically accept edits** or **Yes,
      manually accept edits**.
    - **Iterate:** If the plan needs adjustments, provide feedback. Gemini CLI
      will refine the strategy and update the plan.
    - **Cancel:** You can cancel your plan with `Esc`.

For more complex or specialized planning tasks, you can
[customize the planning workflow with skills](#custom-planning-with-skills).

## How to exit Plan Mode

You can exit Plan Mode at any time, whether you have finalized a plan or want to
switch back to another mode.

- **Approve a plan:** When Gemini CLI presents a finalized plan, approving it
  automatically exits Plan Mode and starts the implementation.
- **Keyboard shortcut:** Press `Shift+Tab` to cycle to the desired mode.
- **Natural language:** Ask Gemini CLI to "exit plan mode" or "stop planning."

## Customization and best practices

Plan Mode is secure by default, but you can adapt it to fit your specific
workflows. You can customize how Gemini CLI plans by using skills, adjusting
safety policies, or changing where plans are stored.

## Commands

- **`/plan copy`**: Copy the currently approved plan to your clipboard.

## Tool Restrictions

Plan Mode enforces strict safety policies to prevent accidental changes.

These are the only allowed tools:

- **FileSystem (Read):** [`read_file`], [`list_directory`], [`glob`]
- **Search:** [`grep_search`], [`google_web_search`]
- **Research Subagents:** [`codebase_investigator`], [`cli_help`]
- **Interaction:** [`ask_user`]
- **MCP tools (Read):** Read-only [MCP tools] (for example, `github_read_issue`,
  `postgres_read_schema`) are allowed.
- **Planning (Write):** [`write_file`] and [`replace`] only allowed for `.md`
  files in the `~/.gemini/tmp/<project>/<session-id>/plans/` directory or your
  [custom plans directory](#custom-plan-directory-and-policies).
- **Memory:** [`save_memory`]
- **Skills:** [`activate_skill`] (allows loading specialized instructions and
  resources in a read-only manner)

### Custom planning with skills

You can use [Agent Skills](./skills.md) to customize how Gemini CLI approaches
planning for specific types of tasks. When a skill is activated during Plan
Mode, its specialized instructions and procedural workflows will guide the
research, design, and planning phases.

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

Plan Mode's default tool restrictions are managed by the [policy engine] and
defined in the built-in [`plan.toml`] file. The built-in policy (Tier 1)
enforces the read-only state, but you can customize these rules by creating your
own policies in your `~/.gemini/policies/` directory (Tier 2).

#### Example: Automatically approve read-only MCP tools

By default, read-only MCP tools require user confirmation in Plan Mode. You can
use `toolAnnotations` and the `mcpName` wildcard to customize this behavior for
your specific environment.

`~/.gemini/policies/mcp-read-only.toml`

```toml
[[rule]]
mcpName = "*"
toolAnnotations = { readOnlyHint = true }
decision = "allow"
priority = 100
modes = ["plan"]
```

For more information on how the policy engine works, see the [policy engine]
docs.

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

#### Example: Enable custom subagents in Plan Mode

Built-in research [subagents] like [`codebase_investigator`] and [`cli_help`]
are enabled by default in Plan Mode. You can enable additional [custom
subagents] by adding a rule to your policy.

`~/.gemini/policies/research-subagents.toml`

```toml
[[rule]]
toolName = "my_custom_subagent"
decision = "allow"
priority = 100
modes = ["plan"]
```

Tell Gemini CLI it can use these tools in your prompt, for example: _"You can
check ongoing changes in git."_

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
argsPattern = "\"file_path\":\"[^\"]+[\\\\/]+\\.gemini[\\\\/]+plans[\\\\/]+[\\w-]+\\.md\""
```

## Automatic Model Routing

When using an [**auto model**], Gemini CLI automatically optimizes [**model
routing**] based on the current phase of your task:

1.  **Planning Phase:** While in Plan Mode, the CLI routes requests to a
    high-reasoning **Pro** model to ensure robust architectural decisions and
    high-quality plans.
2.  **Implementation Phase:** Once a plan is approved and you exit Plan Mode,
    the CLI detects the existence of the approved plan and automatically
    switches to a high-speed **Flash** model. This provides a faster, more
    responsive experience during the implementation of the plan.

This behavior is enabled by default to provide the best balance of quality and
performance. You can disable this automatic switching in your settings:

```json
{
  "general": {
    "plan": {
      "modelRouting": false
    }
  }
}
```

## Cleanup

By default, Gemini CLI automatically cleans up old session data, including all
associated plan files and task trackers.

- **Default behavior:** Sessions (and their plans) are retained for **30 days**.
- **Configuration:** You can customize this behavior via the `/settings` command
  (search for **Session Retention**) or in your `settings.json` file. See
  [session retention] for more details.

Manual deletion also removes all associated artifacts:

- **Command Line:** Use `gemini --delete-session <index|id>`.
- **Session Browser:** Press `/resume`, navigate to a session, and press `x`.

If you use a [custom plans directory](#custom-plan-directory-and-policies),
those files are not automatically deleted and must be managed manually.

[`list_directory`]: /docs/tools/file-system.md#1-list_directory-readfolder
[`read_file`]: /docs/tools/file-system.md#2-read_file-readfile
[`grep_search`]: /docs/tools/file-system.md#5-grep_search-searchtext
[`write_file`]: /docs/tools/file-system.md#3-write_file-writefile
[`glob`]: /docs/tools/file-system.md#4-glob-findfiles
[`google_web_search`]: /docs/tools/web-search.md
[`replace`]: /docs/tools/file-system.md#6-replace-edit
[MCP tools]: /docs/tools/mcp-server.md
[`save_memory`]: /docs/tools/memory.md
[`activate_skill`]: /docs/cli/skills.md
[`codebase_investigator`]: /docs/core/subagents.md#codebase_investigator
[`cli_help`]: /docs/core/subagents.md#cli_help
[subagents]: /docs/core/subagents.md
[custom subagents]: /docs/core/subagents.md#creating-custom-subagents
[policy engine]: /docs/reference/policy-engine.md
[`enter_plan_mode`]: /docs/tools/planning.md#1-enter_plan_mode-enterplanmode
[`exit_plan_mode`]: /docs/tools/planning.md#2-exit_plan_mode-exitplanmode
[`ask_user`]: /docs/tools/ask-user.md
[YOLO mode]: /docs/reference/configuration.md#command-line-arguments
[`plan.toml`]:
  https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/policy/policies/plan.toml
[auto model]: /docs/reference/configuration.md#model-settings
[model routing]: /docs/cli/telemetry.md#model-routing
[preferred external editor]: /docs/reference/configuration.md#general
[session retention]: /docs/cli/session-management.md#session-retention
