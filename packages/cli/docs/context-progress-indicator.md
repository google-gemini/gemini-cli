# Context Window Progress Indicator

## Problem

When using the Gemini CLI for extended conversations, users have no visual
feedback about how close they are to the token limit. This makes it difficult to
know when the conversation history will be automatically compressed or when
they're approaching the maximum context window size. Without this visibility,
users may be surprised by compression events or context window overflows.

## Solution

The context window progress indicator is a visual, real-time display integrated
directly into the input prompt's border. As you use tokens throughout your
conversation, the top border of the input box progressively fills with a thicker
line character (`▬`) from left to right. The progress bar is calibrated so that
it reaches 100% fill at the 50% token usage mark—the point where automatic
conversation compression kicks in.

## How It Works

The progress indicator appears on the **top border** of the input prompt:

```
Empty (0% usage):
╭─────────────────────────────────────────╮
│ > Your input here                       │
╰─────────────────────────────────────────╯

Partially filled (~25% usage):
╭▬▬▬▬▬▬▬▬▬▬─────────────────────────────────╮
│ > Your input here                       │
╰─────────────────────────────────────────╯

Fully filled (50% usage - compression threshold):
╭▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬╮
│ > Your input here                       │
╰─────────────────────────────────────────╯
```

### Visual Behavior

- **0-50% token usage**: Top border progressively fills from left to right with
  thicker line characters
- **50% usage (compression point)**: Border is completely filled - automatic
  compression will occur
- **50-100% usage**: Border remains fully filled as you continue toward the
  absolute limit

### Real-Time Updates

The progress indicator updates automatically as tokens are used:

- When you send messages to the AI
- When the AI responds with generated text
- When tools are called and produce output
- When the conversation history grows

No user action is required—the indicator reflects the true state of your context
window at all times.

## Technical Details

- **Hook**: `useContextTracking` - Subscribes to `uiTelemetryService` for
  real-time token count updates
- **Component**: `ProgressBorder` - Custom border component that replaces Ink's
  standard border
- **Performance**: Fully memoized to prevent unnecessary re-renders
- **Test Coverage**: 27 comprehensive tests covering all edge cases

## Example Usage

Simply start a conversation and watch the top border of the input prompt fill as
you chat:

```bash
$ gemini

> Tell me about TypeScript

[AI responds with explanation]

> Can you give me an example?

[AI provides code example - notice the border filling slightly more]

> Now explain async/await

[As conversation continues, the top border progressively fills]
```

When the border is fully filled, you'll know that automatic compression is about
to occur to keep your conversation within the model's context window.
