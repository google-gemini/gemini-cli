# RTL Implementation Changelog

## [2026-04-12]

### Added

- Integrated universal RTL/BiDi rendering engine with support for RTL languages.
- Renamed `arabicUtils.ts` to `rtlUtils.ts` to reflect universal support.
- Refined logical text wrapping to prevent displacement of short words (e.g.,
  "أهلاً") at line boundaries.
- Added "Grouping/Flushing" algorithm to prevent the "disappearing text" bug by
  rendering styled text groups in single `<Text>` nodes.
- Synchronized hardware cursor with reordered visual text.
- Added `GEMINI_NATIVE_RTL` environment variable kill switch. Users with
  terminals that natively support RTL can set `GEMINI_NATIVE_RTL=1` (or `true`)
  to bypass the custom reordering and use the terminal's native implementation.

## [2026-04-12] - Performance & Architecture Optimization

### Improved

- **Memory Optimization**: Implemented a Singleton Pattern for the `bidi-js`
  engine. The reordering instance is now shared across `InputPrompt` and
  `rtlUtils`, reducing memory overhead.
- **Dependency Cleanup**: Removed the `arabic-persian-reshaper` library. We now
  rely exclusively on native terminal shaping for a more robust and
  conflict-free rendering experience.
- **ESM Alignment**: Ensured all imports across RTL modules follow the standard
  `.js` extension format for strict ESM compatibility.

## [2026-04-12] - Output Rendering Completion

### Added

- Implemented RTL-aware and ANSI-safe output rendering for Markdown, Tables, and
  User Messages.
- Added ANSI escape code preservation in `processRtlText` to ensure styling
  remains intact after reordering.
- Extended the `GEMINI_NATIVE_RTL` kill switch to cover all output processing.
