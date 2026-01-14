# Policy engine

The Gemini CLI includes a powerful policy engine that provides fine-grained
control over tool execution. It allows users and administrators to define rules
that determine whether a tool call should be allowed, denied, or require user
confirmation.

## Quick start

To create your first policy:

1.  **Create the policy directory** if it doesn't exist:
    ```bash
    mkdir -p ~/.gemini/policies
    ```
2.  **Create a new policy file** (e.g., `~/.gemini/policies/my-rules.toml`). You
    can use any filename ending in `.toml`; all such files in this directory
    will be loaded and combined:
    ```toml
    [[rule]]
    toolName = "run_shell_command"
    commandPrefix = "git status"
    decision = "allow"
    priority = 100
    ```
3.  **Run a command** that triggers the policy (e.g., ask Gemini CLI to
    `git status`). The tool will now execute automatically without prompting for
    confirmation.

## Core concepts

The policy engine operates on a set of rules. Each rule is a combination of
conditions and a resulting decision. When a large language model wants to
execute a tool, the policy engine evaluates all rules to find the
highest-priority rule that matches the tool call.

A rule consists of the following main components:

- **Conditions**: Criteria that a tool call must meet for the rule to apply.
  This can include the tool's name, the arguments provided to it, or the current
  approval mode.
- **Decision**: The action to take if the rule matches (`allow`, `deny`, or
  `ask_user`).
- **Priority**: A number that determines the rule's precedence. Higher numbers
  win.

For example, this rule will ask for user confirmation before executing any `git`
command.

```toml
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git "
decision = "ask_user"
priority = 100
```

### Conditions

Conditions are the criteria that a tool call must meet for a rule to apply. The
primary conditions are the tool's name and its arguments.

#### Tool Name

The `toolName` in the rule must match the name of the tool being called.

- **Wildcards**: For Model-hosting-protocol (MCP) servers, you can use a
  wildcard. A `toolName` of `my-server__*` will match any tool from the
  `my-server` MCP.

#### Arguments pattern

If `argsPattern` is specified, the tool's arguments are converted to a stable
JSON string, which is then tested against the provided regular expression. If
the arguments don't match the pattern, the rule does not apply.

### Decisions

There are three possible decisions a rule can enforce:

- `allow`: The tool call is executed automatically without user interaction.
- `deny`: The tool call is blocked and is not executed.
- `ask_user`: The user is prompted to approve or deny the tool call. (In
  non-interactive mode, this is treated as `deny`.)

### Priority system and tiers

The policy engine uses a sophisticated priority system to resolve conflicts when
multiple rules match a single tool call. The core principle is simple: **the
rule with the highest priority wins**.

To provide a clear hierarchy, policies are organized into three tiers. Each tier
has a designated number that forms the base of the final priority calculation.

| Tier    | Base | Description                                                                |
| :------ | :--- | :------------------------------------------------------------------------- |
| Default | 1    | Built-in policies that ship with the Gemini CLI.                           |
| User    | 2    | Custom policies defined by the user.                                       |
| Admin   | 3    | Policies managed by an administrator (e.g., in an enterprise environment). |

Within a TOML policy file, you assign a priority value from **0 to 999**. The
engine transforms this into a final priority using the following formula:

`final_priority = tier_base + (toml_priority / 1000)`

This system guarantees that:

- Admin policies always override User and Default policies.
- User policies always override Default policies.
- You can still order rules within a single tier with fine-grained control.

For example:

- A `priority: 50` rule in a Default policy file becomes `1.050`.
- A `priority: 100` rule in a User policy file becomes `2.100`.
- A `priority: 20` rule in an Admin policy file becomes `3.020`.

### Approval modes

Approval modes allow the policy engine to apply different sets of rules based on
the CLI's operational mode. A rule can be associated with one or more modes
(e.g., `yolo`, `autoEdit`). The rule will only be active if the CLI is running
in one of its specified modes. If a rule has no modes specified, it is always
active.

## Rule matching

When a tool call is made, the engine checks it against all active rules,
starting from the highest priority. The first rule that matches determines the
outcome.

A rule matches a tool call if all of its conditions are met:

1.  **Tool name**: The `toolName` in the rule must match the name of the tool
    being called.
    - **Wildcards**: For Model-hosting-protocol (MCP) servers, you can use a
      wildcard. A `toolName` of `my-server__*` will match any tool from the
      `my-server` MCP.
2.  **Arguments pattern**: If `argsPattern` is specified, the tool's arguments
    are converted to a stable JSON string, which is then tested against the
    provided regular expression. If the arguments don't match the pattern, the
    rule does not apply.

## Configuration

Policies are defined in `.toml` files. The CLI loads these files from Default,
User, and (if configured) Admin directories.

### TOML rule schema

Here is a breakdown of the fields available in a TOML policy rule:

```toml
[[rule]]
# A unique name for the tool, or an array of names.
toolName = "run_shell_command"

# (Optional) The name of an MCP server. Can be combined with toolName
# to form a composite name like "mcpName__toolName".
mcpName = "my-custom-server"

# (Optional) A regex to match against the tool's arguments.
argsPattern = '"command":"(git|npm)'

# (Optional) A string or array of strings that a shell command must start with.
# This is syntactic sugar for `toolName = "run_shell_command"` and an `argsPattern`.
commandPrefix = "git "

# (Optional) A regex to match against the entire shell command.
# This is also syntactic sugar for `toolName = "run_shell_command"`.
# Note: This pattern is tested against the JSON representation of the arguments (e.g., `{"command":"<your_command>"}`), so anchors like `^` or `$` will apply to the full JSON string, not just the command text.
# You cannot use commandPrefix and commandRegex in the same rule.
commandRegex = "^git (commit|push)"

# The decision to take. Must be "allow", "deny", or "ask_user".
decision = "ask_user"

# The priority of the rule, from 0 to 999.
priority = 10

# (Optional) An array of approval modes where this rule is active.
modes = ["autoEdit"]
```

### Using arrays (lists)

To apply the same rule to multiple tools or command prefixes, you can provide an
array of strings for the `toolName` and `commandPrefix` fields.

**Example:**

This single rule will apply to both the `write_file` and `replace` tools.

```toml
[[rule]]
toolName = ["write_file", "replace"]
decision = "ask_user"
priority = 10
```

### Special syntax for `run_shell_command`

To simplify writing policies for `run_shell_command`, you can use
`commandPrefix` or `commandRegex` instead of the more complex `argsPattern`.

- `commandPrefix`: Matches if the `command` argument starts with the given
  string.
- `commandRegex`: Matches if the `command` argument matches the given regular
  expression.

**Example:**

This rule will ask for user confirmation before executing any `git` command.

```toml
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git "
decision = "ask_user"
priority = 100
```

### Special syntax for MCP tools

You can create rules that target tools from Model-hosting-protocol (MCP) servers
using the `mcpName` field or a wildcard pattern.

**1. Using `mcpName`**

To target a specific tool from a specific server, combine `mcpName` and
`toolName`.

```toml
# Allows the `search` tool on the `my-jira-server` MCP
[[rule]]
mcpName = "my-jira-server"
toolName = "search"
decision = "allow"
priority = 200
```

**2. Using a wildcard**

To create a rule that applies to _all_ tools on a specific MCP server, specify
only the `mcpName`.

```toml
# Denies all tools from the `untrusted-server` MCP
[[rule]]
mcpName = "untrusted-server"
decision = "deny"
priority = 500
```

## Default policies

The Gemini CLI ships with a set of default policies to provide a safe
out-of-the-box experience.

- **Read-only tools** (like `read_file`, `glob`) are generally **allowed**.
- **Agent delegation** (like `delegate_to_agent`) defaults to **`ask_user`** to
  ensure remote agents can prompt for confirmation, but local sub-agent actions
  are executed silently and checked individually.
- **Write tools** (like `write_file`, `run_shell_command`) default to
  **`ask_user`**.
- In **`yolo`** mode, a high-priority rule allows all tools.
- In **`autoEdit`** mode, rules allow certain write operations to happen without
  prompting.
