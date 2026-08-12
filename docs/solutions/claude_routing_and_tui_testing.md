# Claude Routing & Interactive TUI Testing Solution Guide

This document provides a comprehensive troubleshooting guide, antipattern
reference, and test methodology for routing Claude models and verifying
interactive terminal user interface (TUI) rendering in Gemini CLI.

For architectural details, see the companion guide
[Claude Model Routing Architecture](../../docs/core/claude-model-routing.md).

## 1. Common Agent Antipatterns

When implementing model routing or verifying CLI features, AI agents often fall
into anti-patterns that create brittle implementations, hidden runtime bugs, or
false verification reports.

### Antipattern 1: System Prompt Identity Tricks

**Problem**: Attempting to fake model support by injecting identity prompts (for
example, `"You are Claude 3.5 Sonnet, a helpful assistant..."`) into system
instructions while sending requests to a Gemini or proxy model endpoint, rather
than implementing true SDK model routing.

```typescript
// ❌ BAD: Fake identity injection without changing backend content generator
const systemInstruction = 'You are Claude 3.5 Sonnet running via Vertex AI.';
const response = await geminiContentGenerator.generateContent({
  contents: ['Hello'],
  config: { systemInstruction },
});
```

**Consequences**:

- Does not invoke the Anthropic model or Vertex AI Claude infrastructure.
- Results in mismatched tool calling formats, missing feature capabilities, and
  incorrect token usage accounting.
- Violates empirical verification standards.

**Solution**: Route requests to
[`AnthropicContentGenerator`](../../packages/core/src/core/anthropicContentGenerator.ts)
via true SDK parameters (`AuthType.ANTHROPIC_DIRECT` or
`AuthType.VERTEX_CLAUDE`).

```typescript
// ✅ GOOD: Direct instantiation of AnthropicContentGenerator
const generator = new AnthropicContentGenerator(config, 'claude-sonnet-5');
const response = await generator.generateContent(request);
```

---

### Antipattern 2: Raw Unmapped Model Strings

**Problem**: Passing full upstream or legacy model identifier strings (such as
`claude-3-5-sonnet-v2@20241022` or `claude-3-7-sonnet-20250219`) directly to
Vertex AI API endpoints, which expect canonical model IDs like
`claude-sonnet-5`.

```bash
# ❌ BAD: Passing raw unmapped model string directly to Vertex AI API
gemini-claude-direct -m "claude-3-5-sonnet-v2@20241022" -p "hello"
```

**Consequences**:

- Vertex AI returns an immediate HTTP 404 error: `ModelNotFoundError` or
  `Publisher Model not found`.

**Solution**: Always pass requested model strings through
[`resolveModel()`](../../packages/core/src/config/models.ts#L158-L255) before
initializing the content generator.

```typescript
// ✅ GOOD: Normalize model string using resolveModel
const canonicalModel = resolveModel(requestedModel); // 'claude-sonnet-5'
const generator = new AnthropicContentGenerator(config, canonicalModel);
```

---

### Antipattern 3: Unmapped Model Strings Disguised as Regional Errors

**Problem**: Assuming that the error message `Model "claude-sonnet-5" is not available in region "global"` means `global` is an invalid location.

```text
Model "claude-sonnet-5" is not available in region "global".
To see which models are available in this region, please visit:
https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations
/model to switch models.
```

**Root Cause**:
1. `GOOGLE_CLOUD_LOCATION="global"` is the **correct and required** location for Anthropic models on Vertex AI (`locations/global`).
2. However, if an unmapped model string (such as `claude-3-5-sonnet-v2@20241022`) is sent to Vertex AI without passing through `resolveModel()`, Vertex AI returns an HTTP 404 `ModelNotFoundError`.
3. When `useQuotaAndFallback.ts` catches that 404, it formats the message using `GOOGLE_CLOUD_LOCATION` (`"global"`), incorrectly framing an unmapped model name bug as a regional availability issue.

**Solution**:
1. Keep `GOOGLE_CLOUD_LOCATION="global"` set for Vertex AI Claude models.
2. Ensure all incoming model flags and configuration strings pass through `resolveModel()` to map `claude-3-5-sonnet-v2@20241022` to `claude-sonnet-5` before making the API call.

```bash
# ✅ GOOD: Setting global location with canonical or mapped model string
export GOOGLE_CLOUD_PROJECT="eat-with-images"
export GOOGLE_CLOUD_LOCATION="global"
gemini-claude-direct -m claude-sonnet-5 -p "hello"
```

---

### Antipattern 4: Verification Theater

**Problem**: Claiming that interactive React Ink TUI rendering, keyboard input
handling, terminal resizing, and stream rendering are working based solely on
unit test mocks or non-interactive CLI runs (`-p` / stdin mode).

```bash
# ❌ BAD: Non-interactive run used as proof of TUI functionality
gemini-claude-direct -p "hello"
```

**Consequences**:

- Non-interactive mode (`-p`) bypasses React Ink component mounting, raw
  terminal mode initialization, ANSI escape sequences, and stdin keybinding
  listeners.
- TUI-specific regressions (such as terminal flickering, broken input focus, or
  unhandled escape sequences) remain undetected.

**Solution**: Perform live end-to-end interactive testing using a
Pseudo-Terminal (PTY) harness.

---

## 2. Interactive TUI Test Methodology

Standard non-interactive testing modes (such as passing `-p "prompt"` or piping
via stdin) do not test full React Ink TUI rendering.

### Why Non-Interactive Tests Are Insufficient

- **No React Ink Mount**: Non-interactive mode executes a single request loop
  and writes raw text directly to stdout, bypassing the Ink renderer lifecycle.
- **No Raw Terminal Mode**: Standard unit tests do not set
  `process.stdin.setRawMode(true)`, leaving keybinding shortcuts and interactive
  input unverified.
- **No PTY Window Dimensions**: Interactive components require active terminal
  row and column signals (`SIGWINCH`) to calculate responsive UI layouts.

### PTY-Based Interactive Harness Pattern

To test interactive React Ink TUI rendering programmatically, run a Python
pseudo-terminal (PTY) test harness that spawns the CLI process inside a real PTY
slave file descriptor.

#### Harness Script Pattern (`scratch/test_pty_interactive.py`)

```python
#!/usr/bin/env python3
"""PTY Interactive Test Harness for Gemini CLI React Ink UI."""

import os
import pty
import select
import sys
import time


def run_interactive_tui_test(command, prompt_text, timeout=15):
  master, slave = pty.openpty()

  # Set environment for direct Vertex AI Claude routing
  env = os.environ.copy()
  env["GEMINI_CONFIG_DIR"] = os.path.expanduser("~/.gemini-claude-direct")
  env["GOOGLE_CLOUD_LOCATION"] = "us-east5"
  # Clear proxy variables
  env.pop("ANTHROPIC_BASE_URL", None)
  env.pop("GEMINI_CLI_CUSTOM_HEADERS", None)

  pid = os.fork()
  if pid == 0:
    # Child process: attach slave PTY to standard streams
    os.close(master)
    os.setsid()
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    os.close(slave)
    os.execvpe(command[0], command, env)
  else:
    # Parent process: monitor master PTY
    os.close(slave)
    output_buffer = b""
    start_time = time.time()

    # Send interactive prompt input once TUI has loaded
    time.sleep(2)
    os.write(master, prompt_text.encode("utf-8") + b"\r\n")

    while time.time() - start_time < timeout:
      r, _, _ = select.select([master], [], [], 0.5)
      if master in r:
        try:
          data = os.read(master, 1024)
          if not data:
            break
          output_buffer += data
        except OSError:
          break

    os.close(master)
    os.waitpid(pid, 0)

    decoded = output_buffer.decode("utf-8", errors="replace")
    return decoded


if __name__ == "__main__":
  cmd = ["gemini-claude-direct", "-m", "claude-sonnet-5"]
  output = run_interactive_tui_test(cmd, "Hello from PTY test")
  print("Captured PTY Output:\n", output)
  assert "Remote provider returned message model ID: claude-sonnet-5" in output
  print("PASS: Interactive PTY TUI test verified successfully.")
```

---

## 3. Automated End-to-End Verification

To verify both unit model translation and live remote provider routing, run the
suite verification script
[`scripts/verify-claude-direct.sh`](../../scripts/verify-claude-direct.sh).

### Script Walkthrough (`scripts/verify-claude-direct.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "========================================================"
echo "Running gemini-claude-direct model routing verification"
echo "========================================================"

# Test 1: Unit tests for AnthropicContentGenerator and resolveModel
echo "[1/3] Running AnthropicContentGenerator unit tests..."
npx vitest run packages/core/src/core/anthropicContentGenerator.test.ts

# Test 2: Live end-to-end verification for claude-sonnet-5
echo "[2/3] Running live model check for claude-sonnet-5..."
OUTPUT_SONNET=$(gemini-claude-direct -m claude-sonnet-5 -p "hello" 2>&1)
echo "$OUTPUT_SONNET" | grep -q "Remote provider returned message model ID: claude-sonnet-5" || {
  echo "FAIL: Expected remote model ID 'claude-sonnet-5' not found in output!"
  exit 1
}
echo "PASS: Remote provider returned model ID 'claude-sonnet-5'"

# Test 3: Live end-to-end verification for claude-opus-5
echo "[3/3] Running live model check for claude-opus-5..."
OUTPUT_OPUS=$(gemini-claude-direct -m claude-opus-5 -p "hello" 2>&1)
echo "$OUTPUT_OPUS" | grep -q "Remote provider returned message model ID: claude-opus-5" || {
  echo "FAIL: Expected remote model ID 'claude-opus-5' not found in output!"
  exit 1
}
echo "PASS: Remote provider returned model ID 'claude-opus-5'"

echo "========================================================"
echo "ALL MODEL ROUTING VERIFICATION CHECKS PASSED SUCCESSFULLY!"
echo "========================================================"
```

### Running the Verification Script

Run the verification script from the root of the repository:

```bash
./scripts/verify-claude-direct.sh
```

A passing test suite confirms:

1. `resolveModel()` properly translates legacy model strings to canonical IDs.
2. `AnthropicContentGenerator` connects to the Vertex AI endpoint without model
   name errors.
3. Both `claude-sonnet-5` and `claude-opus-5` models respond cleanly.
