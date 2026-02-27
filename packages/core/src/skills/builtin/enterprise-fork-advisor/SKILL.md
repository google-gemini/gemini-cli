---
name: enterprise-fork-advisor
description: Guides enterprises on customizing Gemini CLI without forking. Use when asked whether to fork Gemini CLI, how to configure it for enterprise use, how to enforce security policies, restrict tools, add custom integrations, or migrate away from an existing fork toward configuration-based customization.
---

# Enterprise Fork Advisor

You are helping an enterprise team decide how to customize Gemini CLI for their organization. Your goal is to **prevent unnecessary forks** by identifying configuration, extension, MCP, and policy mechanisms that satisfy the requirement. Only recommend forking as a last resort, and if you do, explain the long-term maintenance cost clearly.

## Decision Framework

Work through these questions in order:

1. **What is the exact customization needed?** Get one concrete sentence.
2. **Can it be done via `settings.json`?** Check `references/customization-matrix.md` — most auth, tool restrictions, UI, and approval settings live here.
3. **Can it be done via an Extension?** Extensions bundle MCP servers, custom context files, themes, excluded tools, and extra settings — no code fork needed.
4. **Can it be done via an MCP server?** Custom tools, data sources, auth proxies, and audit loggers all fit here.
5. **Can it be done via Hooks?** Pre/post tool execution hooks handle audit logging, guardrails, and side-effects.
6. **Is a fork truly required?** Only if the change must alter core CLI logic (loop control, UI rendering, built-in tool behaviour) and cannot be isolated.

## Quick Customization Map

| Need | Mechanism | Notes |
|------|-----------|-------|
| Restrict which tools users can invoke | `tools.allowedTools` / `tools.excludeTools` in settings or extension | Supports wildcards |
| Require approval for all tool calls | `general.defaultApprovalMode: "default"` | Per workspace or globally |
| Force plan-mode only | `general.defaultApprovalMode: "plan"` | Prevents any auto-execution |
| Custom system prompt / context | `contextFileName` in `gemini-extension.json` | Loads a markdown file into every session |
| Add proprietary data tools | MCP server + extension `mcpServers` entry | Stdio or HTTP transport |
| SSO / corporate auth | MCP server acting as auth proxy | Credentials never touch Gemini CLI source |
| Audit every tool call | Hooks (`PreToolCall`, `PostToolCall`) | Shell script, no TS changes |
| Custom UI theme | `themes` array in `gemini-extension.json` | CSS-like colour config |
| Air-gapped / local model | `model.name` pointing to local endpoint | Set `GEMINI_API_BASE_URL` env var |
| Multi-team isolation | Workspace-level `.gemini/settings.json` per repo | Committed to VCS |
| Policy enforcement | TOML policy files at system or user level | Evaluated before every run |

See `references/customization-matrix.md` for the full matrix with rationale, and `references/configuration-examples.md` for copy-paste JSON.

## Assessing an Existing Fork

If the org **already has a fork**, run the assessment script to categorize their changes:

```bash
node assess_fork_need.cjs [--diff <path/to/diff.patch>]
# or run from inside the fork repo (no arguments needed)
```

The script reads the diff between `upstream/main` and `HEAD` and prints a report with four buckets:

- `AVOIDABLE_VIA_CONFIG` — changes expressible in `settings.json`
- `AVOIDABLE_VIA_EXTENSION` — changes that belong in an extension
- `AVOIDABLE_VIA_MCP` — custom tools that should be MCP servers
- `REQUIRES_FORK` — changes that genuinely cannot be done any other way

For each `REQUIRES_FORK` item, explain the upstream contribution path: if the customization is broadly useful, encourage opening an issue or PR upstream to make it configurable.

## Migration Path (Fork → Config)

1. Run `assess_fork_need.cjs` and share the report.
2. For each `AVOIDABLE_*` item, show the equivalent config snippet from `references/configuration-examples.md`.
3. Create an extension bundle (`gemini-extension.json`) that aggregates all the replacements.
4. Test the extension against the org's workflows before removing the fork.
5. For unavoidable fork items: document them explicitly, open upstream issues, and activate the `upstream-sync` skill to keep the fork current.

## Key Principles to Communicate

- **Forks compound in cost**: each upstream release requires manual merge work that grows with the diff size.
- **Extensions are the right abstraction**: they bundle MCP servers, context, themes, and settings into a distributable unit with no source changes.
- **MCP servers are additive, not subtractive**: they add capabilities without touching CLI internals.
- **Policy files enforce guardrails**: system-level TOML policies apply before a user's session even starts.
