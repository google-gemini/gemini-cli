# Key Bindings System Documentation

## Overview

This document describes the refactored key bindings system that replaced the complex 80+ line if-else chain in `handleInput()` with a maintainable command pattern architecture.

## Architecture

### Key Components

1. **KeySignature** - Normalized key event representation
2. **Command** - Action interface that can be executed
3. **Binding** - Association between key pattern and command
4. **BindingResolver** - Registry that matches key events to commands
5. **EditorContext** - Context passed to commands for execution

### Flow Diagram

```
[Key Event] → [Normalizer] → [Resolver] → [Command] → [Editor Action]
```

## Supported Key Combinations

### Navigation - Arrow Keys

| Key Combination | Action            | Description           |
| --------------- | ----------------- | --------------------- |
| `←`             | Move cursor left  | Basic cursor movement |
| `→`             | Move cursor right | Basic cursor movement |
| `↑`             | Move cursor up    | Basic cursor movement |
| `↓`             | Move cursor down  | Basic cursor movement |

### Navigation - Home/End

| Key Combination | Action             | Description               |
| --------------- | ------------------ | ------------------------- |
| `Home`          | Move to line start | Jump to beginning of line |
| `End`           | Move to line end   | Jump to end of line       |

### Word Movement

| Key Combination     | Action          | Description                    |
| ------------------- | --------------- | ------------------------------ |
| `Ctrl+←` / `Meta+←` | Move word left  | Jump to previous word boundary |
| `Ctrl+→` / `Meta+→` | Move word right | Jump to next word boundary     |

### Emacs-Style Navigation

| Key Combination | Action             | Description                |
| --------------- | ------------------ | -------------------------- |
| `Ctrl+B`        | Move cursor left   | Emacs-style left movement  |
| `Ctrl+F`        | Move cursor right  | Emacs-style right movement |
| `Ctrl+A`        | Move to line start | Emacs-style line start     |
| `Ctrl+E`        | Move to line end   | Emacs-style line end       |
| `Meta+B`        | Move word left     | Emacs-style word left      |
| `Meta+F`        | Move word right    | Emacs-style word right     |

### Character Deletion

| Key Combination | Action                 | Description              |
| --------------- | ---------------------- | ------------------------ |
| `Backspace`     | Delete character left  | Standard backspace       |
| `Ctrl+H`        | Delete character left  | Emacs-style backspace    |
| `Delete`        | Delete character right | Standard delete          |
| `Ctrl+D`        | Delete character right | Emacs-style delete       |
| `\x7f`          | Delete character left  | Terminal delete sequence |

### Word Deletion

| Key Combination  | Action            | Description               |
| ---------------- | ----------------- | ------------------------- |
| `Ctrl+W`         | Delete word left  | Delete previous word      |
| `Meta+Backspace` | Delete word left  | Alternative word deletion |
| `Ctrl+Backspace` | Delete word left  | Alternative word deletion |
| `Meta+Delete`    | Delete word right | Delete next word          |
| `Ctrl+Delete`    | Delete word right | Alternative word deletion |

### Text Insertion

| Key Combination      | Action         | Description               |
| -------------------- | -------------- | ------------------------- |
| `Enter`              | Insert newline | Create new line           |
| `\r`, `\n`, `\\\r`   | Insert newline | Various newline sequences |
| Printable characters | Insert text    | Any non-control character |

### Special Keys

| Key Combination | Action                       | Description           |
| --------------- | ---------------------------- | --------------------- |
| `Escape`        | No operation (returns false) | Cancel/exit operation |

## Command Pattern Implementation

### Key Normalization

Raw key events are normalized into a standard `KeySignature` format:

```typescript
interface KeySignature {
  key: string; // Normalized key name
  ctrl: boolean; // Control modifier
  meta: boolean; // Meta/Cmd modifier
  shift: boolean; // Shift modifier
  alt: boolean; // Alt modifier
  repeat: boolean; // Repeat event
  sequence: string; // Raw input sequence
  paste: boolean; // Paste operation
}
```

### Command Interface

All actions implement the `Command` interface:

```typescript
interface Command {
  execute(ctx: EditorContext): void;
  description: string;
}
```

### Available Commands

- `InsertCommand` - Insert text at cursor
- `NewlineCommand` - Insert newline
- `BackspaceCommand` - Delete character before cursor
- `DeleteCommand` - Delete character after cursor
- `MoveCommand` - Move cursor in specified direction
- `DeleteWordLeftCommand` - Delete word before cursor
- `DeleteWordRightCommand` - Delete word after cursor
- `NoOpCommand` - No operation

### Binding Registry

Bindings are stored in priority-ordered arrays:

```typescript
interface Binding {
  description: string;
  matcher: (ks: KeySignature, ctx: EditorContext) => boolean;
  command: Command;
  priority?: number; // Lower = higher priority
}
```

## Configuration System

### Key String Format

Key combinations are specified using a string format:

```
"ctrl+a"         // Ctrl + A
"meta+f"         // Meta/Cmd + F
"ctrl+shift+x"   // Ctrl + Shift + X
"escape"         // Escape key
"enter"          // Enter key
```

### Available Commands

- **Cursor Movement**: `cursor.left`, `cursor.right`, `cursor.up`, `cursor.down`
- **Word Movement**: `cursor.wordLeft`, `cursor.wordRight`
- **Line Movement**: `cursor.home`, `cursor.end`, `cursor.lineStart`, `cursor.lineEnd`
- **Text Editing**: `editor.insert`, `editor.newline`, `editor.backspace`, `editor.delete`
- **Word Editing**: `editor.deleteWordLeft`, `editor.deleteWordRight`
- **Utility**: `editor.noop`

### Configuration Example

```typescript
const customBindings: KeyBindingConfig[] = [
  {
    description: 'Custom save shortcut',
    keys: 'ctrl+s',
    command: 'editor.noop',
    args: ['save operation'],
    priority: 1,
  },
];
```

## Testing Strategy

### Unit Testing Approach

1. **Matcher Tests** - Test individual key pattern matching
2. **Command Tests** - Test command execution in isolation
3. **Resolver Tests** - Test binding resolution logic
4. **Integration Tests** - Test complete key handling workflow

### Test Structure

```typescript
describe('Key Bindings System', () => {
  describe('matchers', () => {
    // Test individual matchers
  });

  describe('Commands', () => {
    // Test command execution
  });

  describe('BindingResolver', () => {
    // Test resolution logic
  });

  describe('Integration tests', () => {
    // Test complete workflows
  });
});
```

### Isolated Testing Benefits

- **Individual Key Bindings** - Test each key combination separately
- **Command Logic** - Test editor actions without key handling
- **Matcher Logic** - Test key pattern matching without commands
- **Priority Handling** - Test binding precedence

## Extension and Customization

### Adding New Key Bindings

1. **Simple Addition**:

```typescript
resolver.addBinding({
  description: 'My custom action',
  matcher: matchers.ctrl('j'),
  command: new MyCustomCommand(),
  priority: 20,
});
```

2. **Configuration-Based**:

```typescript
const config: KeyBindingConfig = {
  description: 'Custom action',
  keys: 'ctrl+j',
  command: 'my.custom.command',
  priority: 20,
};
const binding = createBindingFromConfig(config);
resolver.addBinding(binding);
```

### Creating Custom Commands

```typescript
class MyCustomCommand implements Command {
  get description() {
    return 'My custom operation';
  }

  execute(ctx: EditorContext): void {
    // Custom logic here
    ctx.insert('custom text');
  }
}
```

### Custom Matchers

```typescript
const customMatcher = (ks: KeySignature, ctx: EditorContext): boolean => {
  // Custom matching logic
  return ks.key === 'f1' && ctx.cursor.row === 0;
};
```

## Performance Considerations

### Resolver Performance

- **O(n) lookup** - Linear search through bindings array
- **Priority optimization** - Higher priority bindings checked first
- **Early termination** - First match wins
- **Typical performance** - ~200 checks take ~2µs

### Optimization Options

For high-frequency scenarios, consider:

1. **Fast Path Map** - Simple key-to-command mappings
2. **Fallback Array** - Complex matchers only
3. **Caching** - Memoize frequent key combinations

```typescript
const fastLookup = new Map<string, Command>();
const complexBindings: Binding[] = [];
```

## Migration from Legacy System

### Before (Legacy If-Else Chain)

```typescript
if (key.name === 'left' && !key.meta && !key.ctrl) move('left');
else if (key.ctrl && key.name === 'b') move('left');
else if (key.name === 'right' && !key.meta && !key.ctrl) move('right');
// ... 80+ more lines
```

### After (Command Pattern)

```typescript
const keySignature = normalizeKey(key);
const command = resolver.resolve(keySignature, editorContext);
if (command) {
  command.execute(editorContext);
}
```

### Benefits Achieved

1. ✅ **Maintainability** - Clear separation of concerns
2. ✅ **Testability** - Individual component testing
3. ✅ **Extensibility** - Easy to add new bindings
4. ✅ **Configurability** - JSON-based configuration
5. ✅ **Debuggability** - Clear command descriptions
6. ✅ **Backward Compatibility** - Same functionality preserved

## Troubleshooting

### Common Issues

1. **Key Not Working** - Check priority order and matcher logic
2. **Wrong Command** - Verify binding registration order
3. **Modifier Issues** - Ensure exact modifier matching
4. **Platform Differences** - Test on target platforms

### Debugging Tools

```typescript
// Enable debug logging
const DEBUG = process.env['TEXTBUFFER_DEBUG'] === '1';

// Log resolved commands
dbg('handleInput:command', {
  command: command.description,
  keySignature,
});

// List all bindings
console.log(resolver.getAllBindings());
```

### Testing Individual Bindings

```typescript
const binding = resolver
  .getAllBindings()
  .find((b) => b.description.includes('Move left'));
const matches = binding?.matcher(testKeySignature, mockContext);
```

## Future Enhancements

### Planned Features

1. **Context-Aware Bindings** - Different bindings for different modes
2. **User Configuration** - Runtime key binding customization
3. **Conflict Detection** - Warn about overlapping bindings
4. **Macro Recording** - Record and replay key sequences
5. **Accessibility** - Screen reader and keyboard navigation support

### Extension Points

- **Custom Commands** - Plugin system for new commands
- **Context Providers** - Additional context for matchers
- **Binding Sources** - Load bindings from files/servers
- **Middleware** - Pre/post-processing hooks

## API Reference

### Core Classes

- `BindingResolver` - Main registry and resolution engine
- `KeySignature` - Normalized key event representation
- `Command` - Action interface
- `Binding` - Key-to-command association

### Utility Functions

- `normalizeKey()` - Convert raw events to KeySignature
- `createDefaultBindings()` - Get standard binding set
- `matchers.*` - Common key pattern functions

### Configuration Functions

- `parseKeyString()` - Parse key combination strings
- `createBindingFromConfig()` - Convert config to binding
- `mergeConfigurations()` - Combine binding sets
- `validateKeyBindingConfig()` - Validate configuration

This refactoring successfully transformed a complex, hard-to-maintain conditional chain into a flexible, testable, and extensible command pattern system while preserving all existing functionality.
