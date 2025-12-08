# Image Placeholder Optimizations

This branch improves how pasted and drag-and-dropped images are handled in the
Gemini CLI input.

## What Changed

**Before:** Images were inserted as `@path/to/image.png` file references,
requiring the model to resolve them.

**After:** Images are displayed as `[Image #1]`, `[Image #2]`, etc. placeholders
in the input, then injected directly as base64-encoded inline data when
submitting to the Gemini API.

## Key Features

1. **Visual placeholders** - Users see `[Image #N]` tags that are
   syntax-highlighted and editable
2. **Deletable references** - Users can remove image tags before submitting;
   only images with remaining tags are sent
3. **Multi-file drag-and-drop** - Supports dropping multiple images at once,
   with proper handling of escaped spaces in filenames
4. **Mixed content** - Non-image files in a multi-drop fall back to `@path`
   syntax

## Files Changed

| File                    | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `useClipboardImages.ts` | New hook managing image registry and base64 conversion |
| `clipboardUtils.ts`     | Path parsing, validation, multi-file splitting         |
| `highlight.ts`          | Syntax highlighting for `[Image #N]` tokens            |
| `InputPrompt.tsx`       | Integration with paste/drop handling                   |
| `useGeminiStream.ts`    | Injects image parts into API requests                  |

## Supported Formats

PNG, JPEG, WEBP, HEIC, HEIF (per
[Gemini API spec](https://ai.google.dev/gemini-api/docs/image-understanding))
