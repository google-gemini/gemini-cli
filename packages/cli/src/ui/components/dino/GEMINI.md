# Dino Game

This directory contains the implementation of the Dino game for the Gemini CLI.

## Assets

Game assets (sprites) are located in `packages/cli/assets`. They are converted
to TypeScript `Uint8Array` data files using the script
`packages/cli/assets/scripts/export-assets.js`.

To re-export assets after adding or modifying PNG files in
`packages/cli/assets`:

```bash
node packages/cli/assets/scripts/export-assets.js
```

## Design Decisions

- **Rendering:** Uses `QuadrantCanvas` (custom implementation based on
  `drawille-canvas` concepts but using 2x2 block characters `▗`, `▖`, `▄`, etc.)
  for higher resolution than standard terminal characters.
- **Resolution:** The game runs at a virtual resolution of
  `(terminal_width * 2) x 90` dots.
- **Colors:**
  - Dino, obstacles, and ground are rendered in the default terminal foreground
    color.
  - Clouds are rendered in Gray (`\x1b[90m`) using ANSI escape codes embedded in
    the rendered string.
- **Game Loop:** Uses `setInterval` at ~30 FPS (33ms).
- **Input:** Uses custom `useKeypress` hook. Ducking (down arrow) has a 500ms
  timeout because key-up events are not supported.
- **Sprites:** Loaded from `Uint8Array` data to avoid runtime PNG decoding
  dependencies and issues.
