#!/bin/bash
echo '{
  "hookSpecificOutput": {
    "hookEventName": "BeforeToolSelection",
    "toolConfig": {
      "mode": "ANY",
      "allowedFunctionNames": ["read_file", "run_shell_command"]
    }
  }
}'