# Chat Recording

The Gemini CLI includes comprehensive **automatic chat recording** that saves every conversation to disk without any manual intervention. This powerful feature allows you to review, resume, search, and manage your chat history across different sessions with zero effort on your part.

## How It Works

**Chat recording is enabled by default and completely automatic.** Starting with your first user message, every conversation is immediately saved to JSON files in your project's temporary directory at `~/.gemini/tmp/<project_hash>/chats`.

### What Gets Recorded

Each conversation file contains a complete record of your session:

- **Session Information:** Unique session ID, project hash, start time, and last updated timestamp
- **All Messages:** User prompts and Gemini responses with timestamps, UUIDs, and model information
- **Tool Calls:** Complete tool execution history including inputs, outputs, states, and timestamps
- **Thoughts:** Gemini's internal reasoning with subjects, descriptions, and timestamps
- **Token Usage:** Detailed token consumption (input, output, cached, thoughts, tools)
- **API Events:** Error messages and system notifications

**Important:** Messages are saved immediately as they occur, so no data is lost even if the CLI crashes or is terminated unexpectedly.

## Interactive Session Browser (`/resume`)

The **interactive session browser** provides a comprehensive interface for managing saved conversations. Type `/resume` to open it.

### Features

- **Session List:** View all saved conversations with timestamps, message counts, and preview of first user message
- **Search:** Press `/` to search through conversation content across all sessions
- **Sorting:** Sort sessions by date or message count
- **Delete:** Remove unwanted sessions directly from the browser
- **Resume:** Select any session to duplicate and continue the conversation

### Usage

```bash
/resume
```

This opens the session browser where you can:

1. Browse through your conversation history
2. Use `/` to search for specific content
3. Select a session to resume
4. Delete sessions you no longer need

## Command-Line Session Management

For non-interactive workflows, several CLI flags are available:

### Resume Sessions

```bash
# Resume the most recent session
gemini --resume

# Resume a specific session by index
gemini --resume 5

# Resume latest session with a new prompt
gemini --resume latest -p "Continue working on the API"
```

### List Sessions

```bash
# List all available sessions for current project
gemini --list-sessions
```

Output shows session indices, dates, message counts, and first user message preview.

### Delete Sessions

```bash
# Delete a specific session by index
gemini --delete-session 3
```

## Session Retention & Cleanup

Configure automatic cleanup of old sessions via `settings.json`:

```json
{
  "sessionRetention": {
    "enabled": true,
    "maxAge": "7d", // Keep sessions for 7 days
    "maxCount": 50 // Keep max 50 sessions
  }
}
```

**Settings:**

- **`enabled`:** Enable/disable automatic cleanup
- **`maxAge`:** Maximum age (e.g., "1h", "7d", "30d"). Minimum: "1h"
- **`maxCount`:** Maximum number of sessions to keep. Minimum: 1

Both settings can be used together - sessions are deleted if they exceed **either** limit.

## Session File Format

Sessions are stored as JSON files with this structure:

```json
{
  "sessionId": "6577c6cc-dfe2-42f1-a861-ff475f3dc692",
  "projectHash": "7bf1664fd227f3ccca27efcaffc3225990adc35edcf3ffcb8c5b2624c3749ced",
  "startTime": "2025-07-25T14:27:05.262Z",
  "lastUpdated": "2025-07-25T14:28:10.713Z",
  "messages": [
    {
      "id": "89d02136-a4fa-489d-9efa-b17af3edaa69",
      "timestamp": "2025-07-25T14:27:08.141Z",
      "type": "user",
      "content": "Hello"
    },
    {
      "id": "c325c8dc-a69a-4134-ae15-5626361c71c0",
      "timestamp": "2025-07-25T14:27:12.766Z",
      "type": "gemini",
      "content": "Hi there! How can I help you today?",
      "model": "gemini-2.5-pro",
      "thoughts": [
        {
          "subject": "Formulating a Response",
          "description": "I'm crafting a friendly greeting...",
          "timestamp": "2025-07-25T14:27:10.687Z"
        }
      ],
      "tokens": {
        "input": 12823,
        "output": 10,
        "cached": 0,
        "thoughts": 22,
        "tool": 0,
        "total": 12855
      }
    }
  ]
}
```

## Key Behaviors

### Starting New Sessions

- **`/clear`:** Starts a new session recording
- **New CLI instance:** Each new interactive session gets a unique ID
- **Resume:** Resumes modify the existing session file in place

### Data Storage Location

- **Path:** `~/.gemini/tmp/<project_hash>/chats/`
- **Project-specific:** Each project gets its own chat directory
- **Local only:** All data stays on your machine

### What's Not Recorded

- Automatically injected messages (like "This is the Gemini CLI" setup message)
- MCP-specific metadata (currently)
- Pending tool calls cannot be resumed for user action (yet)

## Migration from Old System

The previous manual `/chat save|resume|list` system has been **completely replaced**. All conversations are now automatically saved, eliminating the need for manual management while providing far more comprehensive features and data capture.
