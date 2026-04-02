# TASK-06: External Agent Definitions and "Polyfill" Support

## Objective

Introduce a new `external` agent kind to support integrating and "polyfilling"
competitor agents like Claude Code and Codex into Gemini CLI teams.

## Implementation Details

### 1. Type Definitions (`packages/core/src/agents/types.ts`)

- [ ] Add `ExternalAgentDefinition` to the `AgentDefinition` union.
- [ ] Include fields for `provider` (e.g., `'claude-code'`, `'codex'`) and
      `providerOptions`.
  ```typescript
  export interface ExternalAgentDefinition extends BaseAgentDefinition {
    kind: 'external';
    provider: string;
    // Allow for provider-specific configuration
    providerConfig?: Record<string, unknown>;
  }
  ```

### 2. External Agent Invocation (`packages/core/src/agents/external-invocation.ts`)

- [ ] Implement `ExternalAgentInvocation` class.
- [ ] **The Polyfill Logic:**
  - Use the system's configured default model to "polyfill" the external agent.
  - Apply a "personality overlay" to the system prompt based on the `provider`.
  - Example (Claude Code): Prepend instructions to adopt the specific style,
    tool usage patterns, and "persona" of a high-performance, concise coding
    assistant.
  - Example (Codex): Prepend instructions to act as a specialized code
    generation model.
  - Ensure the overlay is model-agnostic and relies on the `providerConfig` for
    behavior tuning.

### 3. Tool Wrapping (`packages/core/src/agents/subagent-tool-wrapper.ts`)

- [ ] Update `createInvocation` to recognize `kind === 'external'` and return an
      `ExternalAgentInvocation`.

## Verification

- Unit tests for `ExternalAgentInvocation` ensuring provider-specific prompts
  are applied.
- Manual verification by creating an agent with `kind: external` and
  `provider: claude-code`.
