# Dynamic Work Context Adaptation Implementation

## Overview

This implementation adds dynamic work context adaptation to the `getCoreSystemPrompt()` function in `packages/core/src/core/prompts.ts`, allowing the system prompt to automatically adapt based on the current project context.

## Key Changes

### 1. Modified `getCoreSystemPrompt()` Function

- **Added optional `DynamicPromptOptions` parameter** with:
  - `workContext?: WorkContextInfo` - Pre-computed work context
  - `config?: Config` - Configuration object for accessing settings
  - `recentToolCalls?: CompletedToolCall[]` - Recent tool usage patterns

- **Added work context cache** to avoid re-detection within the same session
- **Maintains backward compatibility** - existing calls continue to work without changes

### 2. Added Configuration Support

**In `packages/core/src/config/config.ts`:**
- Added `dynamicPrompt?: boolean` to `ConfigParameters` interface
- Added private `dynamicPrompt` property to `Config` class
- Added `getDynamicPrompt()` getter method
- Defaults to `false` to maintain backward compatibility

### 3. Created Helper Functions

**New exports from `prompts.ts`:**
- `getCoreSystemPromptWithContext()` - Async helper that detects work context automatically
- `clearWorkContextCache()` - Utility for clearing cache (useful for testing)

### 4. Enhanced GeminiClient

**In `packages/core/src/core/client.ts`:**
- Added `createChatWithContext()` method that uses dynamic prompts when enabled
- Maintains existing `createChat()` method for backward compatibility

### 5. Dynamic Prompt Templates

The implementation includes comprehensive prompt templates for:

#### Project Types
- Web applications (React, Vue, Angular)
- Node.js libraries and CLI tools
- Python packages and applications
- Rust applications and libraries
- Documentation and configuration projects

#### Languages
- TypeScript: Type safety, interfaces, generics
- JavaScript: Modern syntax, error handling, performance
- Python: PEP 8, type hints, virtual environments
- Rust: Ownership, error handling, memory safety
- Go: Error handling, concurrency, interfaces

#### Frameworks
- **React**: Functional components, hooks, testing
- **Vue**: Composition API, reactivity, testing
- **Express**: Middleware, error handling, security
- **Next.js**: Routing, rendering strategies, performance
- **Django**: Models, views, templates, testing
- **Flask**: Application factory, blueprints, testing

#### Git Workflows
- **Main/Master branches**: Stability focus, code review, CI/CD
- **Feature branches**: Incremental development, testing, documentation
- **Bugfix branches**: Root cause analysis, regression tests
- **Hotfix branches**: Urgency, thorough testing
- **Develop branches**: Integration, comprehensive testing

#### Tool Usage Patterns
- **File operations**: Efficient file management, batch operations
- **Development**: Build tools, development workflow
- **Search/Analysis**: Code discovery, pattern recognition
- **Testing/Building**: TDD, build optimization, quality assurance

## Usage Examples

### Basic Usage (Backward Compatible)
```typescript
// Existing usage continues to work
const prompt = getCoreSystemPrompt(userMemory);
```

### With Pre-computed Work Context
```typescript
const workContext = await detectWorkContext('/project/path');
const prompt = getCoreSystemPrompt(userMemory, {
  config,
  workContext,
});
```

### Async Helper with Auto-detection
```typescript
const prompt = await getCoreSystemPromptWithContext(
  userMemory,
  config,
  recentToolCalls
);
```

### Using Enhanced GeminiClient
```typescript
const chat = await geminiClient.createChatWithContext(
  history,
  tools,
  extraHistory,
  recentToolCalls
);
```

## Configuration

Enable dynamic prompts in your configuration:

```typescript
const config = new Config({
  // ... other parameters
  dynamicPrompt: true,
});
```

## Testing

Comprehensive test suite added covering:
- Backward compatibility
- Dynamic prompt generation
- Confidence threshold filtering
- Project type detection
- Language and framework adaptations
- Git workflow adaptations
- Tool usage pattern adaptations

All tests pass: 17/17 ✅

## Performance Considerations

- **Caching**: Work context is cached per session to avoid repeated detection
- **Lazy Evaluation**: Context detection only occurs when dynamic prompts are enabled
- **Graceful Degradation**: Falls back to base prompt if context detection fails
- **Confidence Thresholds**: Only includes adaptations with sufficient confidence scores

## Backward Compatibility

✅ **100% Backward Compatible**
- All existing function signatures unchanged
- Default behavior unchanged when `dynamicPrompt` is `false` or not set
- Existing tests continue to pass
- No breaking changes to public APIs

## Future Enhancements

Potential areas for future development:
1. **Additional Project Types**: Mobile apps, desktop applications, games
2. **More Languages**: C#, Swift, Kotlin, Dart, PHP, Ruby
3. **Framework Expansions**: Spring Boot, Gin, FastAPI, Laravel
4. **Tool Integration**: IDE-specific adaptations, CI/CD pipeline integration
5. **User Customization**: Allow users to define custom prompt templates
6. **Machine Learning**: Learn from user patterns to improve adaptations