# Coverage Analysis Guide

Detailed instructions for performing the eval coverage analysis.

## How to read eval files

Each eval file follows one of two patterns:

### Standard evals (evalTest)

```typescript
import { evalTest } from './test-helper.js';

evalTest('USUALLY_PASSES', {
  name: 'should do X',
  files: { ... },
  prompt: '...',
  assert: async (rig, result) => {
    const toolLogs = rig.readToolLogs();
    // assertions on toolLogs
  },
});
```

Look for tool names in the assert function:
- `log.toolRequest.name === 'tool_name'` — direct tool check
- `EDIT_TOOL_NAMES.has(...)` — checks for replace or write_file
- `toolLogs.filter(...)` / `toolLogs.find(...)` / `toolLogs.findIndex(...)` —
  tool presence or ordering checks
- `rig.readFile(...)` — file content assertions (tests that edits happened
  correctly)

### Interactive evals (appEvalTest)

```typescript
import { appEvalTest } from './app-test-helper.js';

appEvalTest('USUALLY_PASSES', {
  name: 'should pause for confirmation',
  setup: async (rig) => {
    rig.setBreakpoint(['ask_user']);
  },
  assert: async (rig) => {
    const confirmation = await rig.waitForPendingConfirmation('ask_user');
    // assertions
  },
});
```

Look for:
- `rig.setBreakpoint([...])` — which tools are breakpointed
- `rig.waitForPendingConfirmation(...)` — which tools are waited on

## Tool name reference

The full list from `packages/core/src/tools/tool-names.ts`:

| Constant | String value |
|----------|-------------|
| `GLOB_TOOL_NAME` | `glob` |
| `GREP_TOOL_NAME` | `grep_search` |
| `LS_TOOL_NAME` | `list_directory` |
| `READ_FILE_TOOL_NAME` | `read_file` |
| `READ_MANY_FILES_TOOL_NAME` | `read_many_files` |
| `SHELL_TOOL_NAME` | `run_shell_command` |
| `WRITE_FILE_TOOL_NAME` | `write_file` |
| `EDIT_TOOL_NAME` | `replace` |
| `WEB_SEARCH_TOOL_NAME` | `google_web_search` |
| `WEB_FETCH_TOOL_NAME` | `web_fetch` |
| `WRITE_TODOS_TOOL_NAME` | `write_todos` |
| `MEMORY_TOOL_NAME` | `save_memory` |
| `GET_INTERNAL_DOCS_TOOL_NAME` | `get_internal_docs` |
| `ACTIVATE_SKILL_TOOL_NAME` | `activate_skill` |
| `ASK_USER_TOOL_NAME` | `ask_user` |
| `ENTER_PLAN_MODE_TOOL_NAME` | `enter_plan_mode` |
| `EXIT_PLAN_MODE_TOOL_NAME` | `exit_plan_mode` |
| `TRACKER_CREATE_TASK_TOOL_NAME` | `tracker_create_task` |
| `TRACKER_UPDATE_TASK_TOOL_NAME` | `tracker_update_task` |
| `TRACKER_GET_TASK_TOOL_NAME` | `tracker_get_task` |
| `TRACKER_LIST_TASKS_TOOL_NAME` | `tracker_list_tasks` |
| `TRACKER_ADD_DEPENDENCY_TOOL_NAME` | `tracker_add_dependency` |
| `TRACKER_VISUALIZE_TOOL_NAME` | `tracker_visualize` |

## Prompt behavior categories

When scanning `packages/core/src/prompts/snippets.ts`, look for these
behavioral categories:

1. **Security** — credential protection, source control restrictions
2. **Context efficiency** — search patterns, read patterns, turn minimization
3. **Engineering standards** — conventions, libraries, testing, proactiveness
4. **Intent alignment** — directive vs inquiry distinction
5. **Tool-specific guidance** — edit tool instructions, shell tool restrictions
6. **Plan mode** — read plan first, track tasks, iterate

## Report format

Output the report as markdown with clear sections. Use tables for the tool
coverage mapping. Keep the suggested next evals section actionable — each
suggestion should include:

- what behavior to test
- which tool(s) are involved
- a one-line description of the test scenario
- estimated difficulty (easy/medium/hard)
