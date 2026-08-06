You are a senior test architect creating a non-visual CLI verifier playbook for
the gemini-cli monorepo project.

Generate a strictly formatted JSON file that will be saved to
`.agents/verifier_playbook.json`.

Project Details:

- Project Name: gemini-cli
- Target Binary: `node ./bundle/gemini.js`
- Test Scenarios to cover:
  1. Headless Prompt Execution
     (`node ./bundle/gemini.js --allowed-mcp-server-names "" -p "Hello"`)
     - Assert exit code 0
     - Assert stdout contains response output
     - Assert absence of 401 Unauthorized or CREDENTIALS_MISSING errors
     - Assert total execution time < 10s
  2. Startup Health Check Hook Execution
     (`bash ~/.agents/hooks/startup-health-check.sh`)
     - Assert exit code 0
     - Assert execution time < 5s
  3. Core Unit Test Suite
     (`npm test -w @google/gemini-cli-core -- src/core/contentGenerator.test.ts`)
     - Assert exit code 0
     - Assert all 55 tests pass
  4. Core MCP Client Manager Test Suite
     (`npm test -w @google/gemini-cli-core -- src/tools/mcp-client-manager.test.ts`)
     - Assert exit code 0
     - Assert all 39 tests pass

JSON Schema Requirements for `.agents/verifier_playbook.json`: { "projectName":
"gemini-cli", "version": "1.0.0", "created": "2026-08-05T19:27:00-07:00",
"verificationType": "non-visual", "pathways": [ { "name": "string", "type":
"non-visual", "target": "string", "command": "string", "maxLatencySeconds":
number, "assertions": [ { "kind": "exitCode" | "stdout_contains" |
"stdout_regex" | "stderr_absence" | "latency", "expected": string | number,
"description": "string" } ] } ] }

CRITICAL DIRECTIVE: Output ONLY the raw JSON of the playbook, with no markdown
code block formatting, fences, or accompanying text.

<system_state_history_marker>

## Assistant Thought

{ "projectName": "gemini-cli", "version": "1.0.0", "created":
"2026-08-05T19:27:00-07:00", "verificationType": "non-visual", "pathways": [ {
"name": "Headless Prompt Execution", "type": "non-visual", "target": "node
./bundle/gemini.js", "command": "node ./bundle/gemini.js
--allowed-mcp-server-names \"\" -p \"Hello\"", "maxLatencySeconds": 10,
"assertions": [ { "kind": "exitCode", "expected": 0, "description": "Headless
prompt invocation must terminate with exit code 0" }, { "kind": "stdout_regex",
"expected": "\\S{3,}", "description": "Stdout must contain non-empty model
response output" }, { "kind": "stderr_absence", "expected": "401 Unauthorized",
"description": "No 401 Unauthorized authentication failure emitted on stderr" },
{ "kind": "stderr_absence", "expected": "CREDENTIALS_MISSING", "description":
"No CREDENTIALS_MISSING credential resolution error emitted on stderr" }, {
"kind": "latency", "expected": 10, "description": "Total end-to-end execution
time must be under 10 seconds" } ] }, { "name": "Startup Health Check Hook
Execution", "type": "non-visual", "target": "bash
~/.agents/hooks/startup-health-check.sh", "command": "bash
~/.agents/hooks/startup-health-check.sh", "maxLatencySeconds": 5, "assertions":
[ { "kind": "exitCode", "expected": 0, "description": "Startup health check hook
must terminate with exit code 0" }, { "kind": "latency", "expected": 5,
"description": "Hook execution must complete in under 5 seconds to avoid session
startup stalls" } ] }, { "name": "Core Unit Test Suite - contentGenerator",
"type": "non-visual", "target": "npm test -w @google/gemini-cli-core",
"command": "npm test -w @google/gemini-cli-core --
src/core/contentGenerator.test.ts", "maxLatencySeconds": 300, "assertions": [ {
"kind": "exitCode", "expected": 0, "description": "contentGenerator test suite
must terminate with exit code 0" }, { "kind": "stdout_regex", "expected":
"Tests\\s+55\\s+passed\\s+\\(55\\)", "description": "All 55 contentGenerator
tests must pass with zero failures or skips" }, { "kind": "stdout_contains",
"expected": "55 passed", "description": "Vitest summary line must report 55
passing tests" }, { "kind": "stderr_absence", "expected": "FAIL", "description":
"No FAIL markers emitted during suite execution" } ] }, { "name": "Core MCP
Client Manager Test Suite", "type": "non-visual", "target": "npm test -w
@google/gemini-cli-core", "command": "npm test -w @google/gemini-cli-core --
src/tools/mcp-client-manager.test.ts", "maxLatencySeconds": 300, "assertions": [
{ "kind": "exitCode", "expected": 0, "description": "mcp-client-manager test
suite must terminate with exit code 0" }, { "kind": "stdout_regex", "expected":
"Tests\\s+39\\s+passed\\s+\\(39\\)", "description": "All 39 mcp-client-manager
tests must pass with zero failures or skips" }, { "kind": "stdout_contains",
"expected": "39 passed", "description": "Vitest summary line must report 39
passing tests" }, { "kind": "stderr_absence", "expected": "FAIL", "description":
"No FAIL markers emitted during suite execution" } ] } ] }

## System Nudge

[SYSTEM: Proceed with the next step. If you are finished, output your final
response without requesting more tool calls.]

</system_state_history_marker>
