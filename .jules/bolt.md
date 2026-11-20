# Bolt's Journal - Critical Learnings

## 2026-06-25 - Pre-compile Regular Expressions & Normalizations in Hot-Path Utilities
**Learning:** In the agent loop, utility functions like `sanitizeToolArgs` and `sanitizeErrorMessage` run on every tool execution, error, and thought payload. Dynamically instantiating `new RegExp(...)` and running string replacements inside the function body on every call creates substantial CPU and GC overhead (~8.2x slower).
**Action:** Always pre-compile regular expressions and pre-compute normalized lookup arrays at module scope for utility functions called frequently in event loops or data pipelines.
