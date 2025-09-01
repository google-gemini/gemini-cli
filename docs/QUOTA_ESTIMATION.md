# Quota Estimation Feature

The Gemini CLI now includes a quota estimation feature that provides users with an estimate of how much quota their requests might consume before executing them.

## Overview

This feature addresses the GitHub issue [#7480](https://github.com/google-gemini/gemini-cli/issues/7480) by allowing users to:

- Get an estimate of quota usage before executing queries
- See detailed breakdowns of input vs. output token estimates
- Make informed decisions about whether to proceed with expensive requests

## Configuration

To enable quota estimation, add the following to your `settings.json` file:

```json
{
  "model": {
    "quotaEstimation": {
      "enabled": true,
      "showDetailedBreakdown": false
    }
  }
}
```

### Settings

- **`enabled`** (boolean): Enable or disable quota estimation. Default: `false`
- **`showDetailedBreakdown`** (boolean): Show detailed token breakdown including input, output, and total estimates. Default: `false`

## How It Works

### Token Estimation

The quota estimator uses the Gemini API's `countTokens` method to accurately count input tokens, then applies model-specific heuristics to estimate output tokens:

- **Gemini 2.5 Pro/Ultra**: Estimated at 1.5x input tokens (more verbose)
- **Gemini 2.5 Flash**: Estimated at 1.2x input tokens (more concise)
- **Gemini 1.5 models**: Estimated at 1.3x input tokens (moderate verbosity)
- **Other models**: Estimated at 1.25x input tokens (default fallback)

### Fallback Estimation

If the API call fails, the estimator falls back to character-based estimation (approximately 4 characters per token for English text).

## Usage Examples

### Non-Interactive CLI

When quota estimation is enabled in non-interactive mode:

```bash
$ echo "Explain quantum computing in detail" | gemini
📊 Quota Estimate for gemini-2.5-flash:
   Estimated total tokens: 1,250

⚠️  Note: This is an estimate only and actual usage may vary.

Do you want to proceed with this request? (y/N)
Proceeding with request...
```

### Interactive Mode

In interactive mode, quota estimates are displayed as special message types in the chat history, clearly marked with blue borders.

### Detailed Breakdown

With `showDetailedBreakdown: true`:

```
📊 Quota Estimate for gemini-2.5-flash:
   Input tokens: 500
   Estimated output tokens: 600
   Total estimated tokens: 1,100

⚠️  Note: This is an estimate only and actual usage may vary.
```

## Implementation Details

### Core Components

- **`QuotaEstimator`**: Main utility class for estimating quota usage
- **Settings Integration**: Configurable through the existing settings system
- **UI Integration**: Displays estimates in both interactive and non-interactive modes
- **Error Handling**: Gracefully handles API failures and continues execution

### Integration Points

- **Non-Interactive CLI**: Shows estimates before executing commands
- **Interactive UI**: Displays estimates as chat messages
- **Settings System**: Configurable through `settings.json`
- **Core Package**: Exported from `@google/gemini-cli-core`

## Limitations

1. **Estimates Only**: Output token estimates are heuristic-based and may not be accurate for all use cases
2. **Model Dependencies**: Estimates vary based on the specific Gemini model being used
3. **Content Variations**: Complex prompts or unusual content may produce less accurate estimates
4. **API Dependencies**: Requires the `countTokens` API to be available and functional

## Future Enhancements

Potential improvements for future versions:

- User confirmation prompts with timeout options
- Historical usage tracking and analytics
- More sophisticated output token estimation algorithms
- Integration with quota management systems
- Cost estimation in addition to token estimation

## Contributing

This feature was implemented as part of addressing GitHub issue #7480. For questions or contributions, please refer to the main Gemini CLI repository.
