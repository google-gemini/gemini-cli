# Chat Recording

The Gemini CLI includes a Chat Recording feature that automatically saves your conversations to disk. This allows you to review, resume, and search your chat history across different sessions.

## How It Works

Chat recording is enabled by default. Every conversation you have with the Gemini agent is automatically saved to a JSON file in your project's temporary directory, typically located at `~/.gemini/tmp/<project_hash>/chats`.

Each conversation file contains:

1.  **Session Information:** The session ID and a hash of the project path.
2.  **Timestamps:** The start and last updated times for the conversation.
3.  **Messages:** A complete record of all messages in the conversation, including user prompts, Gemini's responses, tool calls, and system messages.

This data is stored locally on your machine.

## Using the `/chat` Command

You can manage your recorded conversations using the `/chat` command.

### List Available Conversations

To see a list of all auto-saved conversations for the current project, simply run:

```
/chat list
```

The CLI will display a list of available conversation files, showing the session ID, the number of messages, and when the conversation started.

### Resume a Specific Conversation

To resume a previous conversation, use the session ID from the list:

```
/chat resume <session-id>
```

For example:

```
/chat resume session-2025-07-16T10-00-00-abcdef12-0
```

After running the command, your conversation history will be loaded into the current session.

### Search Conversations

You can search the content of all your saved conversations for a specific word or phrase:

```
/chat search <text>
```

For example:

```
/chat search "react component"
```

The CLI will display a list of all conversations that contain the search term, along with the number of matches in each conversation.
