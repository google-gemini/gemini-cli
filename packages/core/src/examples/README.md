# Example Library - Developer Documentation

This directory contains the Example Library implementation for Gemini CLI.

## Directory Structure

```
examples/
├── README.md                 # This file
├── types.ts                  # TypeScript type definitions
├── registry.ts               # Example registry and search
├── registry.test.ts          # Registry tests
├── runner.ts                 # Example execution engine
├── index.ts                  # Public API exports
└── examples/                 # Built-in examples
    ├── index.ts              # Example exports
    ├── code-understanding/   # Code analysis examples
    ├── development/          # Development workflow examples
    ├── file-operations/      # File manipulation examples
    ├── data-analysis/        # Data processing examples
    ├── automation/           # Automation examples
    └── documentation/        # Documentation generation examples
```

## Architecture

### Core Components

1. **ExampleRegistry**: Central registry for all examples
   - Stores and indexes examples
   - Provides search and filtering
   - Tracks statistics

2. **ExampleRunner**: Executes examples
   - Validates prerequisites
   - Builds complete prompts
   - Handles execution
   - Tracks results

3. **Example Types**: TypeScript definitions
   - `Example`: Complete example structure
   - `ExampleSearchQuery`: Search parameters
   - `ExampleResult`: Execution result
   - `ExampleStats`: Usage statistics

### Data Flow

```
User Command
    ↓
Registry (search/filter)
    ↓
Example Selection
    ↓
Runner (validate & execute)
    ↓
Chat Service
    ↓
Result
```

## Adding New Examples

See [Adding Examples Guide](../../../docs/contributing/adding-examples.md) for detailed instructions.

Quick steps:
1. Create file in appropriate category directory
2. Define example using `Example` type
3. Export as default
4. Add import to `examples/index.ts`
5. Test with `gemini /examples`

## Testing

```bash
# Run tests
npm test packages/core/src/examples/

# Test specific example
npm run build
gemini /examples run <example-id>
```

## API Usage

```typescript
import { getExampleRegistry, ExampleRunner } from './examples';

// Get registry
const registry = await getExampleRegistry();

// Search
const results = registry.search({
  text: 'git',
  difficulty: 'beginner'
});

// Run example
const runner = new ExampleRunner(chatService);
const result = await runner.run(results[0]);
```

## Implementation Notes

### Registry Singleton

The registry uses a singleton pattern for efficiency. Reset it in tests:

```typescript
import { resetExampleRegistry } from './registry';

afterEach(() => {
  resetExampleRegistry();
});
```

### Example Loading

Examples are loaded dynamically on first registry initialization. Failed imports are gracefully handled.

### Search Algorithm

Search uses simple string matching for:
- Title (case-insensitive)
- Description (case-insensitive)
- Tags (exact match)

Future: Consider fuzzy search with libraries like Fuse.js

### Execution Model

Examples are executed by:
1. Building complete prompt (with context files)
2. Submitting to chat service
3. Tracking file modifications
4. Returning structured result

## Performance Considerations

- Registry initialized once and cached
- Examples loaded lazily
- Search is in-memory (fast for <1000 examples)
- No external dependencies for core functionality

## Future Enhancements

Planned features:
- [ ] Example usage tracking
- [ ] User ratings and feedback
- [ ] Example versioning
- [ ] Dynamic example loading from URLs
- [ ] Example marketplace
- [ ] A/B testing for prompts
- [ ] Performance metrics
- [ ] Example recommendations based on context

## Contributing

When adding features:
1. Update types.ts if adding new fields
2. Add tests for new functionality
3. Update documentation
4. Maintain backward compatibility
5. Follow existing code patterns

## Dependencies

Core dependencies:
- None (pure TypeScript)

Dev dependencies:
- vitest (testing)

Runtime dependencies:
- ChatService (for execution)
- FileSystem (for file operations)

## License

Copyright 2025 Google LLC - Apache License 2.0
