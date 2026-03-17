Use `morph_edit` for large or scattered edits to existing files in the workspace.

For code discovery across the checked-out project, prefer:

- `warpgrep_codebase_search` when searching architecture, symbol locations, or behavioral
  patterns.
- `warpgrep_github_search` when you need context from a public GitHub repository without
  cloning it.

Avoid creating new files with `morph_edit`; it is constrained to existing files only.
