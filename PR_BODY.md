## Summary

Fixes #24713 -- the model frequently uses `write_file` to rewrite entire files when a targeted `replace` call would be more appropriate.

## Changes

1. **write_file tool description** (gemini-3 + default-legacy tool sets): Added explicit steering text: "Prefer the 'replace' tool for modifying existing files -- it produces cleaner diffs, is less error-prone, and uses fewer tokens. Only use write_file to create new files or for complete rewrites where most of the content is changing."

2. **System prompt** (snippets.ts): Added a new `**Prefer replace for existing files**` mandate under Operational Guidelines > Tool Usage, reinforcing the same guidance at the system prompt level.

3. **Snapshot tests**: Updated to match the new descriptions.

## Why this works

The root cause was in the tool descriptions, not implementations. The `write_file` description had no guidance about when it should/shouldn't be used, while `replace` had ~300 words of strict requirements that may have pushed the model toward the "safer" `write_file` path.

This is a low-risk, prompt-only change -- no code modifications to tool implementations.

## Testing

- Snapshot tests updated to reflect new descriptions
- No behavioral code changes -- only description/prompt text
