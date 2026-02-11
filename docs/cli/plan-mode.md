# Plan Mode (experimental)

Plan Mode is a safe, read-only mode for researching and designing complex
changes. It prevents modifications while you research, design and plan an
implementation strategy.

> **Note: Plan Mode is currently an experimental feature.**
>
> Experimental features are subject to change. To use Plan Mode, enable it via
> `/settings` (search for `Plan`) or add the following to your `settings.json`:
>
> ```json
> {
>   "experimental": {
>     "plan": true
>   }
> }
> ```
>
> Your feedback is invaluable as we refine this feature. If you have ideas,
> suggestions, or encounter issues:
>
> - Use the `/bug` command within the CLI to file an issue.
> - [Open an issue](https://github.com/google-gemini/gemini-cli/issues) on
>   GitHub.

- [Starting in Plan Mode](#starting-in-plan-mode)
- [How to use Plan Mode](#how-to-use-plan-mode)
  - [Entering Plan Mode](#entering-plan-mode)
  - [The Planning Workflow](#the-planning-workflow)
  - [Exiting Plan Mode](#exiting-plan-mode)
- [Tool Restrictions](#tool-restrictions)
  - [Customizing Policies](#customizing-policies)

## Starting in Plan Mode

You can configure Gemini CLI to start directly in Plan Mode by default:

1.  Type `/settings` in the CLI.
2.  Search for `Default Approval Mode`.
3.  Set the value to `Plan`.

Other ways to start in Plan Mode:

- **CLI Flag:** `gemini --approval-mode=plan`
- **Manual Settings:** Manually update your `settings.json`:

  ```json
  {
    "general": {
      "defaultApprovalMode": "plan"
    }
  }
  ```

## How to use Plan Mode

### Entering Plan Mode

You can enter Plan Mode in three ways:

1.  **Keyboard Shortcut:** Press `Shift+Tab` to cycle through approval modes
    (`Default` -> `Plan` -> `Auto-Edit`).
2.  **Command:** Type `/plan` in the input box.
3.  **Natural Language:** Ask the agent to "start a plan for...".

### The Planning Workflow

1.  **Requirements:** The agent clarifies goals using `ask_user`.
2.  **Exploration:** The agent uses read-only tools (like [`read_file`]) to map
    the codebase and validate assumptions.
3.  **Design:** The agent proposes alternative approaches with a recommended
    solution for you to choose from.
4.  **Planning:** A detailed plan is written to a temporary Markdown file.
5.  **Review:** You review the plan.
    - **Approve:** Exit Plan Mode and start implementation (switching to
      Auto-Edit or Default approval mode).
    - **Iterate:** Provide feedback to refine the plan.

### Exiting Plan Mode

To exit Plan Mode:

1. **Keyboard Shortcut:** Press `Shift+Tab` to cycle to the desired mode.
1. **Tool:** The agent calls the `exit_plan_mode` tool to present the finalized
   plan for your approval.

## Tool Restrictions

Plan Mode enforces strict safety policies to prevent accidental changes.

These are the only allowed tools:

- **FileSystem (Read):** [`read_file`], [`list_directory`], [`glob`]
- **Search:** [`grep_search`], [`google_web_search`]
- **Interaction:** `ask_user`
- **MCP Tools (Read):** Read-only [MCP tools] (e.g., `github_read_issue`,
  `postgres_read_schema`) are allowed.
- **Planning (Write):** [`write_file`] and [`replace`] ONLY allowed for `.md`
  files in the `~/.gemini/tmp/<project>/plans/` directory.

### Customizing Policies

Plan Mode is designed to be read-only by default to ensure safety during the
research phase. However, you may occasionally need to allow specific tools to
assist in your planning.

Because user policies (Tier 2) have a higher base priority than built-in
policies (Tier 1), you can override Plan Mode's default restrictions by creating
a rule in your `~/.gemini/policies/` directory.

#### Example: Allow `git status` and `git diff` in Plan Mode

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

#### Example: Enable research sub-agents in Plan Mode

You can enable [experimental research sub-agents] like `codebase_investigator`
to help gather architecture details during the planning phase.

`~/.gemini/policies/research-subagents.toml`

```toml
[[rule]]
toolName = "codebase_investigator"
decision = "allow"
priority = 100
modes = ["plan"]
```

Tell the agent it can use these tools in your prompt, for example: _"You can
check ongoing changes in git."_

For more information on how the policy engine works, see the [Policy Engine
Guide].

[`list_directory`]: /docs/tools/file-system.md#1-list_directory-readfolder
[`read_file`]: /docs/tools/file-system.md#2-read_file-readfile
[`grep_search`]: /docs/tools/file-system.md#5-grep_search-searchtext
[`write_file`]: /docs/tools/file-system.md#3-write_file-writefile
[`glob`]: /docs/tools/file-system.md#4-glob-findfiles
[`google_web_search`]: /docs/tools/web-search.md
[`replace`]: /docs/tools/file-system.md#6-replace-edit
[MCP tools]: /docs/tools/mcp-server.md
[experimental research sub-agents]: /docs/core/subagents.md
[Policy Engine Guide]: /docs/core/policy-engine.md
