# Feature: Add support for flash-lite and image models

## Summary

This feature aims to enhance the Gemini CLI by incorporating support for the flash-lite model and image processing capabilities.

## Motivation

- **Flash-lite Model:** To offer a faster and potentially more cost-effective option for simpler tasks, improving user experience and performance.
- **Image Processing:** To enable users to interact with Gemini models that support image input and generation, expanding the CLI's utility.

## Proposed Changes

1.  **Model Configuration:**
    *   Add `gemini-2.5-flash-lite` alias to `defaultModelConfigs.ts`.
    *   Add `gemini-2.5-image` and `gemini-2.5-flash-lite-image` aliases to `defaultModelConfigs.ts`.
    *   Update `resolveModel` in `models.ts` to correctly map these aliases to their respective model names, respecting the preview features flag.
2.  **Routing Strategy for Images:**
    *   Create a new `ImageStrategy` in `routing/strategies/ImageStrategy.ts`.
    *   This strategy will detect if a user request includes image parts (e.g., via `inlineData`) or explicitly asks for image generation.
    *   It will route such requests to the appropriate image-capable model (using the new aliases).
    *   Ensure that the use of preview image models is controlled by the `--preview` flag.
    *   **Refined Image Routing:** If the preferred general model is 'flash-lite', route image requests to the flash-lite image model; otherwise, use the pro image model (or default pro model based on preview flag).
3.  **Testing:**
    *   Add unit tests for the `ImageStrategy` to cover cases with and without images, with/without preview features enabled, and with different preferred general models.
    *   Update golden files if necessary.

## Acceptance Criteria

- Users can specify `flash-lite` as a model alias, and it correctly routes to the flash-lite model.
- Users can include image parts in their prompts, and the CLI correctly routes these to an image-capable model.
- Users can request image generation (e.g., using prompts like "create an image..."), and the CLI routes these to an image-capable model.
- Preview features flag correctly controls access to preview image models.
- When 'flash-lite' is the preferred general model, image requests correctly route to the flash-lite image model.
