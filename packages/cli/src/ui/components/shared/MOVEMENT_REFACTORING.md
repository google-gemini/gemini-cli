# Movement Function Refactoring Documentation

## Overview

This document describes the refactoring of the complex `move()` function in `text-buffer.ts` from a 180+ line switch statement into focused, testable movement functions.

## Problem Statement

### Original Issues

- **Massive switch statement**: 180+ lines of complex logic in a single function
- **Hard to test**: Each direction case had unique, intertwined logic
- **Difficult to extend**: Adding new movement types required modifying the large switch
- **Poor maintainability**: Complex visual/logical coordinate mapping spread throughout

### Original Structure

```typescript
const move = useCallback(
  (dir: Direction): void => {
    let newVisualRow = visualCursor[0];
    let newVisualCol = visualCursor[1];
    let newPreferredCol = preferredCol;

    switch (dir) {
      case 'left':
        /* 8 lines of logic */ break;
      case 'right':
        /* 8 lines of logic */ break;
      case 'up':
        /* 10 lines of logic */ break;
      case 'down':
        /* 10 lines of logic */ break;
      case 'home':
        /* 3 lines of logic */ break;
      case 'end':
        /* 3 lines of logic */ break;
      case 'wordLeft':
        /* 35 lines of complex logic */ break;
      case 'wordRight':
        /* 58 lines of complex logic */ break;
      default:
        break;
    }

    // Common state updates...
  },
  [
    /* 9 dependencies */
  ],
);
```

## Solution Architecture

### 1. Movement Function Interface

All movement functions follow a consistent interface:

```typescript
interface MovementContext {
  visualLines: string[];
  visualCursor: [number, number];
  preferredCol: number | null;
  lines: string[];
  currentLineLen: (row: number) => number;
  visualToLogicalMap: Array<[number, number] | undefined>;
  logicalToVisualMap: Array<Array<[number, number]>>;
}

interface MovementResult {
  newVisualRow: number;
  newVisualCol: number;
  newPreferredCol: number | null;
}

type MovementFunction = (context: MovementContext) => MovementResult;
```

### 2. Clean Dispatch Mechanism

```typescript
const move = useCallback(
  (dir: Direction): void => {
    // Create movement context
    const context: MovementContext = {
      visualLines,
      visualCursor,
      preferredCol,
      lines,
      currentLineLen,
      visualToLogicalMap,
      logicalToVisualMap,
    };

    // Dispatch to appropriate movement function
    const movementFunction = movementFunctions[dir];
    if (!movementFunction) return;

    // Execute movement and apply result
    const { newVisualRow, newVisualCol, newPreferredCol } =
      movementFunction(context);
    setVisualCursor([newVisualRow, newVisualCol]);
    setPreferredCol(newPreferredCol);

    // Update logical cursor...
  },
  [
    /* same dependencies */
  ],
);
```

## Movement Behavior Analysis

### Horizontal Movements (Reset Preferred Column)

#### `moveLeft`

- **Within Line**: Move cursor one position left
- **Line Boundary**: Move to end of previous line
- **Edge Case**: No movement at start of first line
- **Preferred Column**: Always reset to `null`

#### `moveRight`

- **Within Line**: Move cursor one position right
- **Line Boundary**: Move to start of next line
- **Edge Case**: No movement at end of last line
- **Preferred Column**: Always reset to `null`

#### `moveHome`

- **Behavior**: Move to start of current visual line (column 0)
- **Preferred Column**: Reset to `null`

#### `moveEnd`

- **Behavior**: Move to end of current visual line
- **Preferred Column**: Reset to `null`

### Vertical Movements (Preserve Preferred Column)

#### `moveUp`

- **Behavior**: Move up one visual line
- **Column Handling**:
  - Set preferred column if `null` (first vertical movement)
  - Maintain existing preferred column
  - Clamp to line length if preferred exceeds line
- **Edge Case**: No movement at first line

#### `moveDown`

- **Behavior**: Move down one visual line
- **Column Handling**: Same as `moveUp`
- **Edge Case**: No movement at last line

### Word Movements (Complex Logical/Visual Mapping)

#### `moveWordLeft`

- **Algorithm**:
  1. Convert visual position to logical position
  2. Find previous word boundary using regex `/[\s,.;!?]+/g`
  3. Strip trailing separators from text slice
  4. Map result back to visual coordinates
- **Complexity**: Handles visual line wrapping by mapping through logical lines
- **Preferred Column**: Reset to `null`

#### `moveWordRight`

- **Algorithm**:
  1. Convert visual position to logical position
  2. Find next word boundary using regex
  3. Handle end-of-line cases
  4. Map result back to visual coordinates
- **Special Cases**: Empty visual lines at end of logical lines
- **Preferred Column**: Reset to `null`

## Key Improvements

### 1. **Testability**

- Each movement function can be tested in isolation
- Consistent interface makes test setup straightforward
- Edge cases are easier to identify and test

### 2. **Maintainability**

- Each function has a single responsibility
- Logic is focused and easier to understand
- Changes to one movement type don't affect others

### 3. **Extensibility**

- New movement types just require implementing `MovementFunction`
- Add to `movementFunctions` registry for automatic dispatch
- No need to modify the main `move()` function

### 4. **Performance**

- Same performance characteristics as original
- No additional allocations beyond the context object
- Same dependency array and memoization behavior

## Testing Strategy

### Unit Tests

- **Individual Functions**: Each movement function tested separately
- **Edge Cases**: Empty lines, single characters, Unicode handling
- **Boundary Conditions**: Start/end of lines and documents
- **Preferred Column**: Vertical movement consistency

### Integration Tests

- **Dispatch Mechanism**: Registry correctly routes to functions
- **State Updates**: Visual and logical cursors update correctly
- **Context Creation**: All necessary data passed to movement functions

### Visual Layout Tests

- **Word Wrapping**: Complex visual/logical mapping scenarios
- **Long Lines**: Multi-line visual representation of single logical line
- **Mixed Content**: Different line lengths and content types

## Migration Notes

### Breaking Changes

- **None**: External interface remains identical
- Same `move(direction: Direction)` function signature
- Same behavior for all movement directions

### Internal Changes

- Movement logic extracted to separate module
- Context object creation on each movement (minimal overhead)
- Registry-based dispatch instead of switch statement

### File Structure

```
packages/cli/src/ui/components/shared/
├── text-buffer.ts              # Main text buffer (simplified move function)
├── movement-functions.ts       # Extracted movement implementations
├── movement-functions.test.ts  # Comprehensive movement tests
└── MOVEMENT_REFACTORING.md    # This documentation
```

## Performance Impact

### Benchmarks

- **Memory**: Minimal increase (context object creation)
- **CPU**: Same O(1) operations for most movements
- **Word Movements**: Same O(n) regex operations as before

### Memoization

- Same React hook dependencies
- Same re-render behavior
- No performance regression

## Future Enhancements

### Possible Extensions

- **Page Up/Down**: Natural fit for the movement function pattern
- **Paragraph Navigation**: Jump to blank lines
- **Smart Home/End**: Toggle between line start and first non-whitespace
- **Bracket Matching**: Jump to matching brackets
- **Custom Movement**: Plugin-based movement extensions

### Code Quality Improvements

- **Type Safety**: Stronger typing for coordinate systems
- **Error Handling**: Graceful handling of invalid states
- **Accessibility**: Screen reader support for movements
- **Performance**: Memoization of expensive mapping operations

## Conclusion

The refactoring successfully transforms a complex, monolithic function into a clean, testable, and maintainable system while preserving exact behavioral compatibility. The new architecture provides a solid foundation for future enhancements and easier debugging of cursor movement issues.
