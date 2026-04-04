# Session file format

Reference for the data structures in chat session files, as defined in
`packages/core/src/services/chatRecordingService.ts`.

## ConversationRecord

The top-level object in each session file.

```typescript
interface ConversationRecord {
  sessionId: string; // UUID
  projectHash: string; // SHA-256 hash of project root
  startTime: string; // ISO 8601
  lastUpdated: string; // ISO 8601
  messages: MessageRecord[];
  summary?: string;
  directories?: string[];
  kind?: 'main' | 'subagent';
}
```

## MessageRecord

Each entry in the messages array. The `type` field determines which extra
fields are present.

```typescript
interface BaseMessageRecord {
  id: string; // UUID
  timestamp: string; // ISO 8601
  content: PartListUnion; // gemini content parts
  displayContent?: PartListUnion;
}

// user messages
type UserMessage = BaseMessageRecord & {
  type: 'user' | 'info' | 'error' | 'warning';
};

// agent messages
type GeminiMessage = BaseMessageRecord & {
  type: 'gemini';
  toolCalls?: ToolCallRecord[];
  thoughts?: Array<{ summary: string; timestamp: string }>;
  tokens?: TokensSummary | null;
  model?: string;
};
```

## ToolCallRecord

Each tool invocation within an agent message.

```typescript
interface ToolCallRecord {
  id: string; // UUID
  name: string; // tool name (e.g. 'read_file', 'replace')
  args: Record<string, unknown>; // arguments passed to the tool
  result?: PartListUnion | null; // tool output
  status: Status; // execution status
  timestamp: string; // ISO 8601
  displayName?: string;
  description?: string;
}
```

## Common tool call args by tool

| Tool | Key args |
| --- | --- |
| `read_file` | `file_path`, `start_line`, `end_line` |
| `write_file` | `file_path`, `content` |
| `replace` | `file_path`, `old_string`, `new_string` |
| `grep_search` | `pattern`, `include_pattern`, `path` |
| `glob` | `pattern`, `path` |
| `run_shell_command` | `command`, `is_background` |
| `ask_user` | `questions` |

## File location

Session files are at:

```
~/.gemini/tmp/<project_short_id>/chats/session-YYYY-MM-DDTHH-MM-<8chars>.json
```

The project short ID is derived from the project root path hash.
