# Enterprise Customization Matrix

Full reference for mapping enterprise needs to Gemini CLI mechanisms. For each
row, the **Mechanism** column is the preferred solution; only escalate to the
next row if the preferred one is insufficient.

---

## Authentication & Access Control

| Need                        | Mechanism                          | Config Key / File                    | Notes                                                    |
| --------------------------- | ---------------------------------- | ------------------------------------ | -------------------------------------------------------- |
| Corporate SSO / OIDC        | MCP auth-proxy server              | `mcpServers.<name>.env.CORP_TOKEN`   | Proxy handles token exchange; CLI never sees credentials |
| API key per team            | Workspace `settings.json`          | `GEMINI_API_KEY` env var or settings | Different keys per `.gemini/settings.json`               |
| Prevent unauthenticated use | Policy file (system-level)         | `/etc/gemini-cli/policies/auth.toml` | Block run if env var absent                              |
| Role-based tool access      | `tools.allowedTools` per workspace | `settings.json → tools.allowedTools` | Restrict devs vs admins                                  |

---

## Tool Restrictions & Guardrails

| Need                             | Mechanism                                | Config Key / File                                         | Notes                                     |
| -------------------------------- | ---------------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| Block specific built-in tools    | `tools.excludeTools`                     | `settings.json` or `gemini-extension.json → excludeTools` | e.g. `["shell", "web-fetch"]`             |
| Allow only an approved set       | `tools.allowedTools`                     | `settings.json`                                           | Whitelist mode; all others blocked        |
| Require approval before any tool | `general.defaultApprovalMode: "default"` | `settings.json`                                           | User confirms every call                  |
| Plan-only mode (no execution)    | `general.defaultApprovalMode: "plan"`    | `settings.json`                                           | Model plans; user approves before any run |
| Block dangerous shell patterns   | PreToolCall hook                         | `.gemini/settings.json → hooks`                           | Shell script that exits non-zero to block |
| Audit every tool invocation      | PostToolCall hook                        | `.gemini/settings.json → hooks`                           | Write to syslog, SIEM, or file            |

---

## Custom Tools & Data Sources

| Need                                | Mechanism              | Config Key / File           | Notes                               |
| ----------------------------------- | ---------------------- | --------------------------- | ----------------------------------- |
| Internal database queries           | MCP stdio server       | `mcpServers.<name>.command` | Node/Python process, SQL behind it  |
| REST API integration                | MCP HTTP server        | `mcpServers.<name>.url`     | Expose endpoints as MCP tools       |
| File system with custom permissions | MCP server + extension | Trust level: workspace      | Sandboxed access to internal shares |
| Proprietary search index            | MCP server             | —                           | Returns structured results to model |
| CI/CD pipeline triggers             | MCP server             | —                           | Wrap `gh`, `jenkins-cli`, etc.      |

---

## Context & System Prompt

| Need                                        | Mechanism                      | Config Key / File                         | Notes                                  |
| ------------------------------------------- | ------------------------------ | ----------------------------------------- | -------------------------------------- |
| Org-specific instructions always in context | `contextFileName` in extension | `gemini-extension.json → contextFileName` | Markdown file auto-loaded each session |
| Team-specific context per repo              | Workspace `GEMINI.md`          | `.gemini/GEMINI.md`                       | Committed to repo                      |
| Dynamic context injection                   | PreSession hook                | `.gemini/settings.json → hooks`           | Script writes to a temp context file   |
| Persona / brand voice                       | `contextFileName`              | Extension context file                    | Include tone and style guide           |

---

## UI & Theming

| Need                      | Mechanism               | Config Key / File                | Notes                          |
| ------------------------- | ----------------------- | -------------------------------- | ------------------------------ |
| Corporate colour scheme   | `themes` in extension   | `gemini-extension.json → themes` | Named theme selectable by user |
| Disable interactive UI    | `output.format: "json"` | `settings.json`                  | Machine-readable output for CI |
| Accessibility adjustments | `ui.accessibility`      | `settings.json`                  | Reduces motion, high contrast  |

---

## Network & Proxy

| Need                      | Mechanism                             | Config Key / File             | Notes                             |
| ------------------------- | ------------------------------------- | ----------------------------- | --------------------------------- |
| HTTP proxy for Gemini API | `HTTPS_PROXY` / `HTTP_PROXY` env vars | Shell environment             | Standard Node.js proxy support    |
| Air-gapped deployment     | Local model endpoint                  | `GEMINI_API_BASE_URL` env var | Point to on-prem inference server |
| TLS certificate pinning   | Custom CA in Node env                 | `NODE_EXTRA_CA_CERTS` env var | No source change needed           |
| Disable telemetry         | `general.telemetry: false`            | `settings.json`               | Prevents usage data upload        |

---

## Multi-Team / Multi-Workspace Isolation

| Need                          | Mechanism                 | Config Key / File                    | Notes                                  |
| ----------------------------- | ------------------------- | ------------------------------------ | -------------------------------------- |
| Per-project settings          | Workspace `settings.json` | `.gemini/settings.json` in each repo | Committed to VCS                       |
| Shared org-wide defaults      | System settings           | `/etc/gemini-cli/settings.json`      | Applied before user/workspace settings |
| Team-specific extensions      | Extension per team        | Installed at user scope              | Each team bundles their MCP + context  |
| Compliance policy enforcement | System-level policy TOML  | `/etc/gemini-cli/policies/`          | Cannot be overridden by users          |

---

## When a Fork Is Actually Required

Only resort to forking when the change **must alter compiled TypeScript** and
cannot be isolated:

| Scenario                        | Why Fork?                                    | Upstream Path                               |
| ------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Custom loop detection algorithm | Changes `loopDetectionService.ts` core logic | Open upstream issue/PR to make configurable |
| Modified UI rendering engine    | Changes React/Ink components directly        | Contribute theme API upstream               |
| Altered tool execution pipeline | Changes `client.ts` internals                | Propose plugin hook API upstream            |
| Custom turn management          | Changes `turn.ts`                            | Open RFC upstream                           |

**For every fork item**: open an upstream issue explaining the need. Many
"fork-required" items today become configuration options in the next release.
