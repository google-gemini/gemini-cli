# Task: Update Braille Loader to Circular Spinner (Clean Re-implementation)

## Objective

Replace the legacy braille animation with a smoother, circular 8-dot spinner
effect spanning two Braille characters.

## Technical Requirements

- **Character Set**: Utilize the Braille Patterns Unicode block (U+2800 -
  U+28FF).
- **Dot Mapping**: Map 8 dots in a circular perimeter across two characters (c1
  and c2).
- **Variants**:
  - `Static`: Fixed frame `⢎⡱` for confirmation states.
  - `Small`: Fixed tail length of 2.
  - `Medium`: Fixed tail length of 3.
  - `Long`: Phased growth (lengths 1, 3, 5).
  - `Composite`: Dynamic length sequence `[2, 3, 4, 5, 4, 3]`.
- **Performance**: Use `setInterval` with a default 80ms tick, gated by
  `SettingsContext` (showSpinner).
- **Testing**: Update `CircularSpinner.test.tsx` verification frames and ensure
  `LoadingIndicator.test.tsx` matches the static `⢎⡱` frame.

## Implementation Steps

1. Define the circular `DOTS` bitmask array.
2. Implement `getFrame()` logic using `String.fromCharCode(0x2800 + bits)`.
3. Verify with `npm test`.
