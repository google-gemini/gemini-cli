# Gemini CLI Core (`@google/gemini-cli-core`)

Backend logic for Gemini CLI: API orchestration, prompt construction, tool
execution, and agent management.

## Architecture

- `src/agent/` & `src/agents/`: Agent lifecycle and sub-agent management.
- `src/availability/`: Model availability checks.
- `src/billing/`: Billing and usage tracking.
- `src/code_assist/`: Code assistance features.
- `src/commands/`: Built-in CLI command implementations.
- `src/config/`: Configuration management.
- `src/confirmation-bus/`: User confirmation flow for tool execution.
- `src/core/`: Core types and shared logic.
- `src/fallback/`: Fallback and retry strategies.
- `src/hooks/`: Hook system for extensibility.
- `src/ide/`: IDE integration interfaces.
- `src/mcp/`: MCP (Model Context Protocol) client and server integration.
- `src/output/`: Output formatting and rendering.
- `src/policy/`: Policy enforcement (e.g., tool confirmation policies).
- `src/prompts/`: System prompt construction and prompt snippets.
- `src/resources/`: Resource management.
- `src/routing/`: Model routing and selection logic.
- `src/safety/`: Safety filtering and guardrails.
- `src/scheduler/`: Task scheduling.
- `src/services/`: Shared service layer.
- `src/skills/`: Skill discovery and activation.
- `src/telemetry/`: Usage telemetry and logging.
- `src/tools/`: Built-in tool implementations (file system, shell, web, MCP).
- `src/utils/`: Shared utility functions.
- `src/voice/`: Voice input/output support.

## Coding Conventions

- **Legacy Snippets:** `src/prompts/snippets.legacy.ts` is a snapshot of an
  older system prompt. Avoid changing the prompting verbiage to preserve its
  historical behavior; however, structural changes to ensure compilation or
  simplify the code are permitted.
- **Style:** Follow existing backend logic patterns. This package has no UI
  dependencies — keep it framework-agnostic.

## Testing

- Run tests: `npm test -w @google/gemini-cli-core`
- Run a specific test:
  `npm test -w @google/gemini-cli-core -- src/path/to/file.test.ts`
