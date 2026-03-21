# Creating Behavioral Evals

## 🔬 Rig Selection

| Rig Type          | Import From            | Architecture                                                         | Use When                                                                                              |
| :---------------- | :--------------------- | :------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| **`evalTest`**    | `./test-helper.js`     | **Subprocess**. Runs the CLI in a separate process + waits for exit. | Standard workspace tests. **Do not use `setBreakpoint`**; auditing history (`readToolLogs`) is safer. |
| **`appEvalTest`** | `./app-test-helper.js` | **In-Process**. Runs directly inside the runner loop.                | UI/Ink rendering. Safe for `setBreakpoint` triggers.                                                  |

---

## ✋ Testing Patterns

### 1. Breakpoints

Verifies the agent _intends_ to use a tool BEFORE executing it. Useful for
interactive prompts or safety checks.

```typescript
// ⚠️ Only works with appEvalTest (AppRig)
setup: async (rig) => {
  rig.setBreakpoint(['ask_user']);
},
assert: async (rig) => {
  const confirmation = await rig.waitForPendingConfirmation('ask_user');
  expect(confirmation).toBeDefined();
}
```

### 2. Tool Confirmation Race

When asserting multiple triggers (e.g., "enters plan mode then asks question"):

```typescript
assert: async (rig) => {
  let confirmation = await rig.waitForPendingConfirmation([
    'enter_plan_mode',
    'ask_user',
  ]);

  if (confirmation?.name === 'enter_plan_mode') {
    rig.acceptConfirmation('enter_plan_mode');
    confirmation = await rig.waitForPendingConfirmation('ask_user');
  }
  expect(confirmation?.toolName).toBe('ask_user');
};
```

### 3. Audit Tool Logs

Audit exact operations to ensure efficiency (e.g., no redundant reads).

```typescript
assert: async (rig, result) => {
  await rig.waitForTelemetryReady();
  const toolLogs = rig.readToolLogs();

  const writeCall = toolLogs.find(
    (log) => log.toolRequest.name === 'write_file',
  );
  expect(writeCall).toBeDefined();
};
```

---

## ⚠️ Safety & Efficiency Guardrails

### 1. Breakpoint Deadlocks

Breakpoints (`setBreakpoint`) pause execution. In standard `evalTest`,
`rig.run()` waits for the process to exit _before_ assertions run. **This will
hang indefinitely.**

- **Use Breakpoints** for `appEvalTest` or interactive simulations.
- **Use Audit Tool Logs** (above) for standard trajectory tests.

### 2. Runaway Timeout

Always set a budget boundary in the `EvalCase` to prevent runaway loops on
quota:

```typescript
evalTest('USUALLY_PASSES', {
  name: '...',
  timeout: 60000, // 1 minute safety limit
  // ...
});
```

### 3. Efficiency Assertion (Turn limits)

Check if a tool is called _early_ using index checks:

```typescript
assert: async (rig) => {
  const toolLogs = rig.readToolLogs();
  const toolCallIndex = toolLogs.findIndex(
    (log) => log.toolRequest.name === 'cli_help',
  );

  expect(toolCallIndex).toBeGreaterThan(-1);
  expect(toolCallIndex).toBeLessThan(5); // Called within first 5 turns
};
```
