# Model routing

Gemini CLI includes a model routing feature that automatically switches to a
fallback model in case of a model failure. This feature is enabled by default
and provides resilience when the primary model is unavailable.

## How it works

Model routing is managed by the `ModelAvailabilityService`, which monitors model
health and automatically routes requests to available models based on defined
policies.

1.  **Model failure:** If the currently selected model fails (e.g., due to quota
    or server errors), the CLI will initiate the fallback process.

2.  **User consent:** Depending on the failure and the model's policy, the CLI
    may prompt you to switch to a fallback model (by default always prompts
    you).

    Some internal utility calls (such as prompt completion and classification)
    use a silent fallback chain for `gemini-2.5-flash-lite` and will fall back
    to `gemini-2.5-flash` and `gemini-2.5-pro` without prompting or changing the
    configured model.

3.  **Model switch:** If approved, or if the policy allows for silent fallback,
    the CLI will use an available fallback model for the current turn or the
    remainder of the session.

### Local Model Routing (Experimental)

Gemini CLI supports using a local model for routing decisions. When configured,
Gemini CLI will use a locally-running **Gemma** model to make routing decisions
(instead of sending routing decisions to a hosted model). This feature can help
reduce costs associated with hosted model usage while offering similar routing
decision latency and quality.

In order to use this feature, the local Gemma model **must** be served behind a
Gemini API and accessible via HTTP at an endpoint configured in `settings.json`.

For more details on how to configure local model routing, see
[Local Model Routing](../core/local-model-routing.md).

### Model selection precedence

The model used by Gemini CLI is determined by the following order of precedence:

1.  **`--model` command-line flag:** A model specified with the `--model` flag
    when launching the CLI will always be used.
2.  **`GEMINI_MODEL` environment variable:** If the `--model` flag is not used,
    the CLI will use the model specified in the `GEMINI_MODEL` environment
    variable.
3.  **`model.name` in `settings.json`:** If neither of the above are set, the
    model specified in the `model.name` property of your `settings.json` file
    will be used.
4.  **Local model (experimental):** If the Gemma local model router is enabled
    in your `settings.json` file, the CLI will use the local Gemma model
    (instead of Gemini models) to route the request to an appropriate model.
5.  **Default model:** If none of the above are set, the default model will be
    used. The default model is `auto`
