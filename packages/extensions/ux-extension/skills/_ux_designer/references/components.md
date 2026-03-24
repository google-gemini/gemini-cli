# Components Reference

When developing or reviewing React/Ink UI components for the Gemini CLI,
prioritize these existing primitives. Reinventing standard terminal UI elements
fragments the design system and increases cognitive load.

## Core Layout & Typography

- **`<Box>`**: The fundamental building block. Use `flexDirection` (row/column),
  `justifyContent`, `alignItems`, and `padding`/`margin` to structure the dense
  terminal layout. Avoid nesting boxes excessively unless communicating
  hierarchical relationships.
- **`<Text>`**: For all standard text rendering. Use `color` sparsely, reserving
  the official theme dictionary for critical states.
- **`<Newline>`**: Use sparingly within `<Text>`. Prefer `<Box>` margins for
  structural spacing.

## Progressive Disclosure (Signal over Noise)

These components are essential for maintaining the "collapsed by default"
standard:

- **`<ExpandableText>`**: The primary tool for managing verbose content. Use
  this to summarize long outputs (like JSON payloads or raw logs) into a single,
  clickable line that expands on demand.
- **`<ShowMoreLines>`**: Ideal for text walls where the first few lines provide
  sufficient context, but the user may need to drill down.

## Intent Signaling & State

- **`<GeminiSpinner>` / `<CliSpinner>`**: Mandatory for long-running, autonomous
  tasks. Pair with a deterministic, sub-5-word status string.
- **`<StatusDisplay>`**: Use to reflect the core loop state (e.g.,
  "Thinking...", "Waiting for input").
- **`<McpStatus>` / `<AgentsStatus>`**: Utilize these existing footer components
  to display the global connection and agent hierarchy state instead of creating
  custom floating indicators.

## Tool Outputs & Interaction

- **`<InputPrompt>`**: The standard user input boundary. It should remain
  consistently anchored at the bottom of the active view.
- **`<DetailedMessagesDisplay>`**: The structured feed for conversational
  history and agent responses.
- **`<ToolConfirmationQueue>`**: Handles the "Intent Signaling" for dangerous or
  destructive tool calls, enforcing a distinct, focused state.
