## Summary

Adds `--type` as an alias to the `--transport` flag for the `gemini mcp add`
command.

This allows users to use any of these equivalent forms:

- `gemini mcp add --transport http ...`
- `gemini mcp add --type http ...`
- `gemini mcp add -t http ...`

### Motivation

- **Competitor compatibility**: Claude Code uses `--transport` while Factory
  Droid uses `--type`. Supporting both allows users to use the syntax they're
  familiar with.
- **Config alignment**: The `--type` flag now matches the `type` field in the
  MCP server JSON configuration.
