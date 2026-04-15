# Gemma 4 Routing

Gemini CLI allows you to seamlessly route your requests to Gemma 4 models. When
enabled, requests that would normally be sent to standard Gemini Pro and Flash
models are automatically redirected to your chosen Gemma 4 variant.

## Configuration

You can enable Gemma 4 routing using the CLI settings or by modifying your
`settings.json` file.

### Via Settings UI

1. Open the settings dialog by running `/settings`.
2. Navigate to the **Model** section.
3. Locate the **Gemma 4 Variant** setting.
4. Select your preferred model:
   - `gemma-4-26b-a4b-it` (Gemma 4 26B A4B IT)
   - `gemma-4-31b-it` (Gemma 4 31B IT)
5. Save the settings and restart the CLI if prompted.

### Via `settings.json`

You can also set this directly in your `.gemini/settings.json` file:

```json
{
  "model": {
    "gemma4Variant": "gemma-4-31b-it"
  }
}
```

## How it works

When a `gemma4Variant` is selected, Gemini CLI intercepts model resolution:

- Requests for `gemini-pro`, `gemini-flash`, and their associated aliases (like
  `auto`, `pro`, `flash`) are routed to the selected Gemma 4 model.
- The **router model** (`flash-lite`) remains unaffected and continues to use
  `gemini-2.5-flash-lite`. This ensures fast, lightweight background routing
  tasks continue to operate optimally.
- If you do not have preview model access, the CLI normally falls back to stable
  models; however, the Gemma 4 variant will still take precedence for Pro and
  Flash targets.

To disable Gemma 4 routing, simply remove the `gemma4Variant` configuration from
your settings or set it to `undefined`/empty in the UI.
