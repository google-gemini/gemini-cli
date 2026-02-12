# Built-in Native Visualization Tool for Gemini CLI (V1)

## Summary

Implement a first-class built-in tool `render_visualization` (no MCP) that
supports `bar`, `line`, and `table` outputs in the terminal using Ink-native
rendering. The model will be guided to use this tool during natural-language
reasoning loops (research -> normalize -> visualize), so users do not need to
format input data manually.

This design directly supports these scenarios:

- "Fastest 3 BMW + comparative 0-60 chart"
- Follow-up in same session: "BMW models per year for last 5 years" with dynamic
  data volumes and consistent cross-platform rendering.

## Goals and Success Criteria

- User asks a natural-language question requiring comparison/trend display.
- Model can:

1. Gather data via existing tools (web/file/etc),
2. Transform raw findings into visualization schema,
3. Call `render_visualization` correctly,
4. Render readable inline chart/table in CLI.

- Works across modern terminals on macOS, Linux, Windows.
- Follow-up turns in same session continue to use tool correctly without user
  schema knowledge.

## Product Decisions (Locked)

- V1 scope: one tool with 3 visualization types: `bar | line | table`.
- UI surface: inline tool result panel only.
- Rendering stack: pure Ink + custom renderers (no chart library dependency in
  v1).
- Invocation behavior: explicit user visualization intent
  (chart/show/compare/trend/table).
- Prompting: tool description + explicit system-prompt guidance snippet for
  visualization decisioning.
- Data entry: primary structured schema; optional text parsing fallback for
  convenience.

## Public API / Interface Changes

### New built-in tool

- Name: `render_visualization`
- Display: `Render Visualization`
- Category: built-in core tool (`Kind.Other`)

### Tool input schema

- `chartType` (required): `"bar" | "line" | "table"`
- `title` (optional): string
- `subtitle` (optional): string
- `xLabel` (optional): string
- `yLabel` (optional): string
- `series` (required): array of series
- `series[].name` (required): string
- `series[].points` (required): array of `{ label: string, value: number }`
- `sort` (optional): `"none" | "asc" | "desc"` (applies to single-series
  bar/table)
- `maxPoints` (optional): number (default 30, cap 200)
- `inputText` (optional fallback): string (JSON/table/CSV-like text to parse
  when `series` omitted)
- `unit` (optional): string (e.g., `"s"`)

### Tool output display type

Add new `ToolResultDisplay` variant:

- `VisualizationDisplay`:
- `type: "visualization"`
- `chartType: "bar" | "line" | "table"`
- `title?`, `subtitle?`, `xLabel?`, `yLabel?`, `unit?`
- `series`
- `meta`:
  `{ truncated: boolean, originalPointCount: number, fallbackMode?: "unicode"|"ascii" }`

## Architecture and Data Flow

## 1. Tool implementation (core)

- New file: `packages/core/src/tools/render-visualization.ts`
- Implements validation + normalization pipeline:

1. Resolve input source:

- use `series` if provided,
- else parse `inputText`.

2. Validate numeric values (finite only), normalize labels as strings.
3. Apply chart-specific constraints:

- `line`: preserve chronological order unless explicit sort disabled.
- `bar/table`: optional sort.

4. Apply volume controls (`maxPoints`, truncation metadata).
5. Return:

- `llmContent`: concise factual summary + normalized data preview.
- `returnDisplay`: typed `VisualizationDisplay`.

## 2. Built-in registration

- Register in `packages/core/src/config/config.ts` (`createToolRegistry()`).
- Add tool-name constants and built-in lists:
- `packages/core/src/tools/tool-names.ts`
- `packages/core/src/tools/definitions/coreTools.ts`

## 3. Prompt guidance (critical for this scenario)

- Update prompt snippets so model reliably chooses this tool:
- In tool-usage guidance section: "When user asks to compare, chart, trend, or
  show tabular metrics, gather/compute data first, then call
  `render_visualization` with structured series."
- Keep short and deterministic; do not over-prescribe style.
- Include 1 canonical example in tool description: "BMW 0-60 comparison."

## 4. CLI rendering (Ink)

- Extend `packages/cli/src/ui/components/messages/ToolResultDisplay.tsx` to
  handle `VisualizationDisplay`.
- Add renderer components:
- `VisualizationDisplay.tsx` dispatcher
- `BarChartDisplay.tsx`
- `LineChartDisplay.tsx`
- `TableVizDisplay.tsx`

### Rendering behavior

- Inline panel, width-aware, no alternate screen required.
- Unicode first (`█`, box chars), ASCII fallback when needed.
- Label truncation + right-aligned values.
- Height caps to preserve conversational viewport.
- Multi-series behavior:
- V1: `line` supports multi-series.
- `bar/table`: single-series required in v1 (validation error if more than one).

## 5. Natural-language to schema reliability strategy

- Primary expectation: model transforms researched data into `series`.
- Fallback parser for `inputText` supports:
- JSON object map
- JSON array records
- Markdown table
- CSV-like 2-column text
- Ambiguous prose parsing intentionally rejected with actionable error +
  accepted examples.
- This avoids silent bad charts and improves reasoning-loop consistency.

## 6. Dynamic volume strategy

- Defaults:
- `maxPoints = 30`
- Hard cap `200`
- For larger sets:
- `bar/table`: keep top N by absolute value (or chronological when user asks
  "last N years").
- `line`: downsample uniformly while preserving first/last points.
- Always annotate truncation in `meta` and human-readable footer.

## Testing Plan

## Core tests

- New: `packages/core/src/tools/render-visualization.test.ts`
- Cases:
- Valid single-series bar (BMW 0-60 style).
- Valid line trend (yearly counts).
- Valid table rendering payload.
- Multi-series line accepted.
- Multi-series bar rejected.
- `inputText` parse success for JSON/table/CSV.
- Ambiguous prose rejected with guidance.
- Sort behavior correctness.
- Volume truncation/downsampling correctness.
- Unit handling and numeric validation.

## Registration and schema tests

- Update `packages/core/src/config/config.test.ts`:
- tool registers by default
- respects `tools.core` allowlist and `tools.exclude`
- Update tool definition snapshots for model function declarations.

## Prompt tests

- Update prompt snapshot tests to assert presence of visualization guidance line
  and tool name substitution.

## UI tests

- New:
- `packages/cli/src/ui/components/messages/VisualizationDisplay.test.tsx`
- `BarChartDisplay.test.tsx`
- `LineChartDisplay.test.tsx`
- `TableVizDisplay.test.tsx`
- Validate:
- width adaptation (narrow/normal)
- unicode/ascii fallback
- long labels
- truncation indicators
- no overflow crashes

## Integration tests

- Add scenario tests for:

1. Research + bar chart call pattern.
2. Same-session follow-up question with different metric and chart type.

- Validate tool call args shape and final rendered output branch selection.

## Rollout Plan

- Feature flag: `experimental.visualizationToolV1` default `false`.
- Dogfood + internal beta.
- Telemetry:
- invocation rate
- schema validation failure rate
- parse fallback usage
- render fallback (unicode->ascii) rate
- per-chart-type success.
- Flip default to `true` after stability threshold.

## Risks and Mitigations

- Risk: model under-calls tool.
- Mitigation: explicit prompt guidance + strong tool description examples.
- Risk: terminal incompatibilities.
- Mitigation: deterministic ASCII fallback and conservative layout.
- Risk: oversized datasets.
- Mitigation: hard caps + truncation/downsampling metadata.
- Risk: noisy prose parsing.
- Mitigation: strict parser and explicit rejection path.

## Assumptions and Defaults

- Modern terminal baseline supports ANSI color and common Unicode; fallback
  always available.
- V1 interactivity (keyboard-driven selections/buttons) is out of scope.
- Browser/WebView rendering is out of scope.
- V1 excludes negative-value bars.
