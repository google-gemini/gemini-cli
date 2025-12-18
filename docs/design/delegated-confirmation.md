# Delegated Tool Confirmation Design

## Objective

Enable sub-agents (running within the same process but logically separated) to
execute sensitive tools by delegating the confirmation decision to the parent
process/UI via a `MessageBus`.

## Problem Statement

Currently, tools executing in sub-agents (non-interactive mode) either fail or
must be whitelisted when they require user confirmation. We need a way to "ask
the user" even when the agent itself is running in a headless or non-interactive
context, by leveraging the parent's interactive session.

## Current Prototype Analysis

The current prototype (in `adh/feat/subagent-confirmation`) implements this by:

1.  Injecting a `MessageBus` into `BaseToolInvocation`.
2.  Setting a `_requiresParentUI` flag on invocations in `CoreToolScheduler`.
3.  Having `BaseToolInvocation` handle the bus publication/subscription logic.
4.  Using a shared handler in `CoreToolScheduler` to intercept `ASK_USER`
    decisions.

**Issues:**

- **Coupling:** Tool invocations are coupled to `MessageBus` logic.
- **Hidden Logic:** Confirmation behavior is split between Scheduler and
  Invocation.
- **Flag Hacking:** `_requiresParentUI` is a mutable flag injected after
  construction.

## Proposed Architecture

We will implement a **Strategy Pattern** for tool confirmation within
`CoreToolScheduler`.

### 1. `ConfirmationStrategy` Interface

```typescript
export interface ConfirmationStrategy {
  /**
   * Determines if and how a tool should be confirmed.
   * @param toolCall The tool call being processed
   * @param confirmationDetails The details provided by the tool (if any)
   * @returns A promise resolving to the outcome (Proceed, Cancel, etc.)
   */
  confirm(
    toolCall: ToolCallRequestInfo,
    confirmationDetails: ToolCallConfirmationDetails,
    signal: AbortSignal,
  ): Promise<ToolConfirmationOutcome>;
}
```

### 2. Strategies

- **`InteractiveConfirmationStrategy`**: The current behavior. It might simply
  return a special status that tells `CoreToolScheduler` to pause and wait for
  the UI to render (or in the new design, maybe it handles the CLI interaction
  directly? No, the CLI UI is React-based, so the Scheduler puts the tool in
  `awaiting_approval` state).
  - _Correction_: The `CoreToolScheduler` currently puts the tool in
    `awaiting_approval`. The UI observes this state. So the "Strategy" for the
    main thread is actually "Suspend and Wait for State Change".

- **`DelegatedConfirmationStrategy`**:
  - Takes a `MessageBus` in constructor.
  - Serializes `confirmationDetails`.
  - Publishes `TOOL_CONFIRMATION_REQUEST`.
  - Waits for `TOOL_CONFIRMATION_RESPONSE`.
  - Returns `ProceedOnce` or `Cancel` based on the response.

### 3. Refactored `CoreToolScheduler`

The scheduler will no longer hack `_requiresParentUI`. Instead, when a tool
requires confirmation (`invocation.shouldConfirmExecute` returns details):

```typescript
// Old Logic
// if (subAgent) throw Error("No interaction")
// else setStatus('awaiting_approval')

// New Logic
if (this.confirmationStrategy) {
   const outcome = await this.confirmationStrategy.confirm(request, details, signal);
   this.handleConfirmationOutcome(outcome);
} else {
   // Default interactive behavior (suspend and wait for UI)
   // OR we treat "Suspend and wait" as the default strategy?
   this.setStatusInternal(..., 'awaiting_approval', details);
}
```

Actually, `CoreToolScheduler` is designed to be reactive. It sets state, and the
UI reacts. For the **Delegated** case, we _don't_ want to set state and wait for
_local_ UI. We want to _actively_ query the bus.

So:

```typescript
const confirmationDetails = await invocation.shouldConfirmExecute(signal);
if (confirmationDetails) {
  if (this.config.isDelegatedConfirmationEnabled()) {
      // Use delegated strategy
      const strategy = new DelegatedConfirmationStrategy(this.config.getMessageBus());
      const outcome = await strategy.confirm(req, confirmationDetails, signal);
      this.handleConfirmationResponse(..., outcome);
  } else if (this.config.isInteractive()) {
      // Standard flow
      this.setStatusInternal(..., 'awaiting_approval', confirmationDetails);
  } else {
      throw new Error("Confirmation required but no interactive session or delegation available.");
  }
}
```

### 4. `MessageBus` Protocol

Defined in `packages/core/src/confirmation-bus/types.ts`.

- `ToolConfirmationRequest`: Includes `SerializableToolConfirmationDetails`.
- `ToolConfirmationResponse`: `confirmed: boolean`.

### 5. `BaseToolInvocation` Cleanup

Remove `messageBus`, `_requiresParentUI`, and `getMessageBusDecision` from
`BaseToolInvocation`. Tools should just return their confirmation details and
not care _how_ they are confirmed.

## Implementation Steps

1.  **Define Types:** Create `packages/core/src/confirmation-bus/types.ts` with
    the protocol.
2.  **Create Strategy:** Create
    `packages/core/src/core/confirmation/DelegatedConfirmationStrategy.ts`.
3.  **Refactor Scheduler:** Modify `CoreToolScheduler` to use the strategy when
    configured.
4.  **Refactor Tools:** Revert changes to `BaseToolInvocation` (from the
    prototype) if any, or ensure they remain clean.
5.  **Update Executor:** Update `nonInteractiveToolExecutor` (rename to
    `DelegatedToolExecutor`?) to configure the Scheduler with the delegated
    strategy.
6.  **UI Hook:** Implement `useToolConfirmationListener` in `packages/cli` to
    respond to the bus.

## Benefits

- **Decoupling:** Tools don't need to know about the MessageBus.
- **Flexibility:** We can easily add other confirmation strategies (e.g.,
  auto-approve all, log-only).
- **Testability:** Strategies can be unit tested in isolation.
