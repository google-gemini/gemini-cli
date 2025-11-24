## Model Routing

Gemini CLI includes a model routing feature that automatically switches to a
fallback model in case of a model failure. This feature is enabled by default
and provides resilience when the primary model is unavailable.

## How it Works

Model routing is not based on prompt complexity, but is a fallback mechanism.
Here's how it works:

1.  **Model Failure:** If the currently selected model fails to respond (for
    example, due to a server error or other issue), the CLI will initiate the
    fallback process.

2.  **User Consent:** The CLI will prompt you to ask if you want to switch to
    the fallback model. This is handled by the `fallbackModelHandler`.

3.  **Fallback Activation:** If you consent, the CLI will activate the fallback
    mode by calling `config.setFallbackMode(true)`.

4.  **Model Switch:** On the next request, the CLI will use the
    `DEFAULT_GEMINI_FLASH_MODEL` as the fallback model. This is handled by the
    `resolveModel` function in
    `packages/cli/src/zed-integration/zedIntegration.ts` which checks if
    `isInFallbackMode()` is true.

### Model Selection Precedence

The model used by Gemini CLI is determined by the following order of precedence:

1.  **`--model` command-line flag:** A model specified with the `--model` flag
    when launching the CLI will always be used.
2.  **`GEMINI_MODEL` environment variable:** If the `--model` flag is not used,
    the CLI will use the model specified in the `GEMINI_MODEL` environment
    variable.
3.  **`model.name` in `settings.json`:** If neither of the above are set, the
    model specified in the `model.name` property of your `settings.json` file
    will be used.
4.  **Default Model:** If none of the above are set, the default model will be
    used. The default model is `auto`
