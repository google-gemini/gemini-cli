# Example Library - CLI Integration

This document describes the CLI integration for the Example Library feature, connecting the backend implementation to user-facing commands.

## Overview

The Example Library CLI integration provides users with easy access to 50+ curated examples through the `/examples` command and its subcommands. Users can browse, search, and execute examples directly from the Gemini CLI.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
│  packages/cli/src/ui/commands/examplesCommand.ts            │
│  packages/cli/src/ui/components/views/ExampleList.tsx       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Core Library Layer                       │
│  packages/core/src/examples/registry.ts                     │
│  packages/core/src/examples/types.ts                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Example Content                         │
│  packages/core/src/examples/examples/*.ts                   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Command** → User types `/examples run generate-tests`
2. **Command Handler** → `runCommand.action()` processes the request
3. **Registry Lookup** → Fetches example from `ExampleRegistry`
4. **Prompt Submission** → Returns `SubmitPromptActionReturn` with prompt
5. **Execution** → CLI submits prompt to Gemini as if user typed it
6. **Result** → Gemini processes and responds

## Command Implementation

### Command Structure

```typescript
export const examplesCommand: SlashCommand = {
  name: 'examples',
  description: 'Browse and run example prompts',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    listCommand,      // Browse examples
    searchCommand,    // Search by keywords
    featuredCommand,  // Show featured examples
    runCommand,       // Execute an example
    showCommand,      // Show example details
    statsCommand,     // Library statistics
    randomCommand,    // Random example
  ],
  action: async (context) => featuredCommand.action!(context, ''),
};
```

### Key Design Decisions

**1. Prompt Submission Pattern**

Instead of creating a separate `ChatService` adapter, examples use the `SubmitPromptActionReturn` pattern:

```typescript
return {
  type: 'submit_prompt',
  content: fullPrompt,
};
```

**Why?**
- Cleaner integration with existing CLI architecture
- Examples execute exactly like user-typed prompts
- No need for separate execution path
- Leverages existing confirmation and permission flows

**2. Display Layer Separation**

UI components (`ExampleList.tsx`) are separate from command logic:

```typescript
// Command adds history item
context.ui.addItem({
  type: MessageType.EXAMPLE_LIST,
  examples,
  showDetails: true,
}, Date.now());

// UI layer renders it
<ExampleList
  examples={examples}
  showDetails={showDetails}
  terminalWidth={terminalWidth}
/>
```

**Why?**
- Follows existing CLI patterns (`ChatList`, `ToolsList`, etc.)
- Separation of concerns
- Testable components
- Reusable UI elements

**3. Tab Completion**

Commands that accept example IDs provide tab completion:

```typescript
completion: async (context, partialArg) => {
  const registry = await getExampleRegistry();
  const examples = registry.getAll();
  return examples
    .map((ex) => ex.id)
    .filter((id) => id.startsWith(partialArg));
},
```

## UI Components

### ExampleList Component

**Location:** `packages/cli/src/ui/components/views/ExampleList.tsx`

**Features:**
- Compact list view for browsing
- Detailed view for single examples
- Difficulty color coding
- Responsive layout
- Category and tag display
- Tips and prerequisites highlighting

**Display Modes:**

1. **List Mode** (default): Compact cards with key info
   ```
   📚 Available Examples

     Test Example 1 (test-example-1)
       A test example
       [beginner] development ⏱ 5 minutes
   ```

2. **Detail Mode** (`showDetails: true`): Full information
   ```
   Test Example 1 (test-example-1)

   A test example

   Category: development  Difficulty: beginner  Time: 5 minutes
   Tags: test, example

   Prerequisites:
     - Have a git repository initialized

   Prompt:
   Generate a commit message...

   Expected Outcome:
   A well-formatted commit message...

   💡 Tips:
   • Review the message before committing
   • Adjust for your team's conventions

   Run with: /examples run test-example-1
   ```

### Message Type

**Type Definition:**
```typescript
export type HistoryItemExampleList = HistoryItemBase & {
  type: 'example_list';
  examples: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
    estimatedTime: string;
    tags: string[];
    examplePrompt: string;
    expectedOutcome: string;
    tips: string[];
    prerequisites?: string[];
  }>;
  category?: string;
  difficulty?: string;
  searchQuery?: string;
  featured?: boolean;
  showDetails?: boolean;
};
```

## Testing

### Test Coverage

**Location:** `packages/cli/src/ui/commands/examplesCommand.test.ts`

**Test Scenarios:**
- ✅ Command metadata (name, description)
- ✅ Default action (shows featured examples)
- ✅ List command (all examples, with filters)
- ✅ Search command (with query, error on empty)
- ✅ Run command (executes, errors, completion)
- ✅ Show command (details, errors)
- ✅ Stats command (displays statistics)
- ✅ Random command (shows random example)

**Running Tests:**
```bash
npm test packages/cli/src/ui/commands/examplesCommand.test.ts
```

## User Experience

### Discovery Flow

1. **New User** types `/examples`
   → Sees featured examples
   → Picks one to learn more

2. **User** types `/examples show generate-tests`
   → Reads full description
   → Understands what it does

3. **User** types `/examples run generate-tests`
   → Prompt executes immediately
   → Gemini generates tests

### Search Flow

1. **User** needs to find git-related examples
   → `/examples search git`
   → Sees all matching examples

2. **User** filters by difficulty
   → `/examples list beginner`
   → Finds beginner-friendly examples

## Error Handling

### Command Validation

```typescript
// Missing arguments
if (!exampleId) {
  return {
    type: 'message',
    messageType: 'error',
    content: 'Missing example ID. Usage: /examples run <example-id>',
  };
}

// Not found
if (!example) {
  return {
    type: 'message',
    messageType: 'error',
    content: `Example '${exampleId}' not found. Use /examples list to see all examples.`,
  };
}
```

### Empty Results

```typescript
if (examples.length === 0) {
  return (
    <Box flexDirection="column">
      <Text>No examples found.</Text>
      <Text color={theme.text.secondary}>
        Try different search criteria or use /examples list to see all examples.
      </Text>
    </Box>
  );
}
```

## Performance Considerations

1. **Lazy Loading**: Registry initialized on first use
2. **Singleton Pattern**: Single registry instance
3. **In-Memory Search**: Fast for <1000 examples
4. **No Network Calls**: All examples bundled with CLI

## Future Enhancements

### Phase 2 (Planned)

1. **Save as Custom Command**
   ```bash
   /examples save generate-tests my-test-gen
   ```

2. **Example History**
   - Track which examples users have run
   - Show "recently used" examples

3. **Custom Context**
   ```bash
   /examples run generate-tests --context @file.ts
   ```

4. **Example Preview**
   - Show prompt preview before running
   - Confirm execution

### Integration Points

1. **Tutorial Mode**: Examples referenced in tutorials
2. **Learning Path**: XP awarded for running examples
3. **Smart Suggestions**: Context-aware example recommendations
4. **Analytics**: Track popular examples to improve collection

## Troubleshooting

### TypeScript Errors

**Issue**: `Cannot find module './types.js'`
**Fix**: Ensure `.js` extensions in all imports (ESM requirement)

**Issue**: `Property 'example_list' does not exist on type MessageType`
**Fix**: Add `EXAMPLE_LIST` to `MessageType` enum in `types.ts`

### UI Rendering Issues

**Issue**: ExampleList not rendering
**Fix**: Check `HistoryItemDisplay.tsx` includes case for `example_list`

**Issue**: Colors not showing
**Fix**: Import `theme` from `semantic-colors.js`

## Maintenance

### Adding New Examples

1. Create example file in `packages/core/src/examples/examples/`
2. Export from `packages/core/src/examples/examples/index.ts`
3. Example automatically appears in registry
4. Test with `/examples list` and `/examples run`

### Modifying Display

1. Edit `ExampleList.tsx` for UI changes
2. Edit `examplesCommand.ts` for command behavior
3. Update `types.ts` if changing data structure
4. Run tests to ensure compatibility

## Related Documentation

- `/docs/features/example-library.md` - User guide for Example Library
- `/docs/contributing/adding-examples.md` - How to add examples
- `/docs/cli-commands/examples.md` - Command reference
- `packages/core/src/examples/README.md` - API documentation

---

**Status**: ✅ Production Ready (Phase 1 Complete)

**Version**: 1.0.0

**Last Updated**: 2025-11-16
