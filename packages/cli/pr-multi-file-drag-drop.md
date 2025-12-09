## Summary

Adds support for dragging and dropping multiple files into the terminal at once,
automatically adding `@` prefix to each valid path.

## Changes

- Add `splitEscapedPaths` utility to parse space-separated paths while
  preserving escaped spaces in filenames
- Add path validation utilities (`looksLikeImagePath`, `getImagePathFromText`,
  `looksLikeMultipleImagePaths`, `getMultipleImagePathsFromText`)
- Update `text-buffer.ts` to handle multiple paths in drag-and-drop operations
- Add comprehensive tests for all new functionality

## Behavior

**Before:** Dragging and dropping multiple files → inserted as
`/path/img1.png /path/img2.png`

**After:** Dragging and dropping multiple files → becomes
`@/path/img1.png @/path/img2.png`

- Only valid paths get the `@` prefix
- Escaped spaces in filenames are preserved (e.g., `/my\ image.png`)
- Normal text input is unaffected
