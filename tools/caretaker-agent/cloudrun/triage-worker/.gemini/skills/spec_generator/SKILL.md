---
name: spec_generator
description: Generates a structured Workable Spec JSON to guide a Developer Worker.
---

# Spec Generator Instructions
Extract key technical details from the issue and organize them according to the following strict JSON schema.

### Critical Rules:
1. **Codebase Verification:** Rely on file paths and locations found during your codebase exploration. Ensure all files mentioned in `files_to_modify` and `test_file` actually exist in the repository. Do not make up file paths.

> [!IMPORTANT]
> The output MUST strictly adhere to this schema. Deviations (like putting objects inside arrays instead of strings) will break the downstream automated code generation pipeline.

The final `workable_spec` object must conform strictly to this JSON Schema specification. Every field listed below is strictly required and must be populated:
```json
{
  "type": "object",
  "properties": {
    "issue_id": {
      "type": "string",
      "description": "The specific GitHub issue identifier in the canonical format: {owner}/{repo}#{number} (e.g., google/gemini-cli#245)."
    },
    "summary": {
      "type": "object",
      "description": "A deep technical summary of the issue.",
      "properties": {
        "problem": {
          "type": "string",
          "description": "Concise statement of the problem."
        },
        "root_cause": {
          "type": "string",
          "description": "Analysis of the underlying cause of the bug."
        },
        "context": {
          "type": "string",
          "description": "Any additional technical context or background."
        }
      }
    },
    "implementation_plan": {
      "type": "object",
      "description": "Details required for code implementation of the fix.",
      "properties": {
        "files_to_modify": {
          "type": "array",
          "description": "List of paths to files requiring changes relative to the repository root (e.g. ['src/cli.ts']).",
          "items": {
            "type": "string"
          }
        },
        "steps": {
          "type": "array",
          "description": "Ordered step-by-step instructions to implement the fix. Each step must be a simple, flat string description. Do not nest objects inside this array.",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "testing_strategy": {
      "type": "object",
      "description": "Instructions for validating the fix.",
      "properties": {
        "test_file": {
          "type": "string",
          "description": "Path to the relevant test file relative to the repository root (e.g., 'tests/cli.test.ts')."
        },
        "expected_behavior": {
          "type": "string",
          "description": "Description of how the system should behave after the fix."
        },
        "verification_steps": {
          "type": "array",
          "description": "Specific steps to add or modify in the test file.",
          "items": {
            "type": "string"
          }
        },
        "framework": {
          "type": "string",
          "description": "Testing framework used (e.g., 'Vitest', 'Pytest', etc.)."
        }
      }
    }
  }
}
```


Do not include any metadata like spam assessment or effort tags in this spec. Keep it focused entirely on instructions for code generation and testing.

