# File Freshness Check Implementation Plan

## Problem Statement

The current implementation of file editing tools (`EditTool` and `WriteFileTool`) reads file content once at the beginning of operations but writes much later after content validation and AI processing. During this delay, external processes or users could modify the file, leading to data loss when the agent overwrites it.

## Current Implementation Analysis

### File Reading Points

1. **EditTool.calculateEdit()** (lines 135-148 in `edit.ts`)
   - Reads file content early in the process
   - Stores content for processing

2. **WriteFileTool.getCorrectedFileContent()** (lines 87-107 in `write-file.ts`)
   - Reads file content for validation/correction
   - Handles new files vs existing files differently

### File Writing Points

1. **EditTool.execute()** (line 365 in `edit.ts`)
   - Writes content after extensive processing

2. **WriteFileTool.execute()** (line 273 in `write-file.ts`)
   - Writes content after correction/validation

## Proposed Solution

Implement a comprehensive file freshness checking system that:

1. **Tracks file state** when initially reading
2. **Validates freshness** just before writing
3. **Handles conflicts** gracefully with user notifications
4. **Provides recovery options** when conflicts are detected

## Implementation Details

### 1. File State Tracking (`packages/core/src/utils/fileStateTracker.ts`)

```typescript
export interface FileState {
  content: string;
  mtime: Date;
  size: number;
  hash: string; // Optional content hash for better accuracy
}

export interface FileFreshnessResult {
  isFresh: boolean;
  originalState: FileState;
  currentState: FileState;
  diff?: string; // Diff showing what changed
}

export class FileStateTracker {
  private stateCache = new Map<string, FileState>();

  async getFileState(filePath: string): Promise<FileState>;
  async checkFreshness(
    filePath: string,
    expectedState: FileState,
  ): Promise<FileFreshnessResult>;
}
```

### 2. Enhanced FileSystemService Interface

```typescript
export interface EnhancedFileSystemService extends FileSystemService {
  getFileState(filePath: string): Promise<FileState>;
  writeWithFreshnessCheck(
    filePath: string,
    content: string,
    expectedState: FileState,
  ): Promise<void>;
}
```

### 3. New Error Types (`packages/core/src/tools/tool-error.ts`)

```typescript
// Add to ToolErrorType enum:
FILE_STALE = 'file_stale',
FILE_CONFLICT_DETECTED = 'file_conflict_detected',
FILE_EXTERNAL_CHANGE = 'file_external_change',
```

### 4. Modified Tool Implementations

#### EditTool Changes (`packages/core/src/tools/edit.ts`)

- Store file state after initial read in `calculateEdit()`
- Add freshness check in `execute()` just before `writeTextFile()`
- Handle stale file scenarios with proper error reporting

#### WriteFileTool Changes (`packages/core/src/tools/write-file.ts`)

- Store file state after initial read in `getCorrectedFileContent()`
- Add freshness check in `execute()` just before `writeTextFile()`
- Handle conflicts with detailed error messages

### 5. Enhanced Error Handling

Create structured error messages that:

- Clearly indicate what changed in the file
- Show a diff of the external modifications
- Provide actionable guidance for resolution
- Allow users to choose whether to proceed or abort

## Testing Strategy

### Unit Tests

1. **FileStateTracker Tests** (`packages/core/src/utils/fileStateTracker.test.ts`)
   - Test state tracking accuracy
   - Test freshness checking with various scenarios
   - Test edge cases (file deletion, permission changes)

2. **Enhanced Tool Tests**
   - **EditTool** (`packages/core/src/tools/edit.test.ts`)
     - Test normal operation when file unchanged
     - Test stale file detection
     - Test error handling for conflicts
     - Test user notification messages

   - **WriteFileTool** (`packages/core/src/tools/write-file.test.ts`)
     - Test normal operation when file unchanged
     - Test stale file detection during write
     - Test conflict resolution options

### Integration Tests

1. **File Modification Scenarios** (`packages/core/src/tools/file-freshness.integration.test.ts`)
   - Test concurrent file modifications
   - Test external process interference
   - Test recovery workflows

2. **End-to-End Scenarios**
   - Full workflow with external file changes
   - User interaction with conflict resolution

## Files to Create/Modify

### New Files

1. `packages/core/src/utils/fileStateTracker.ts`
2. `packages/core/src/utils/fileStateTracker.test.ts`
3. `packages/core/src/tools/file-freshness.integration.test.ts`

### Modified Files

1. `packages/core/src/tools/tool-error.ts` - Add new error types
2. `packages/core/src/services/fileSystemService.ts` - Enhance interface
3. `packages/core/src/tools/edit.ts` - Add freshness checks
4. `packages/core/src/tools/write-file.ts` - Add freshness checks
5. `packages/core/src/tools/edit.test.ts` - Add freshness tests
6. `packages/core/src/tools/write-file.test.ts` - Add freshness tests

## Implementation Phases

### Phase 1: Foundation (Week 1)

- Create `FileStateTracker` utility
- Add new error types to `ToolErrorType` enum
- Enhance `FileSystemService` interface
- Create comprehensive unit tests

### Phase 2: Tool Integration (Week 2)

- Modify `EditTool` to use freshness checking
- Modify `WriteFileTool` to use freshness checking
- Update error handling and user messaging
- Add integration tests

### Phase 3: Testing & Refinement (Week 3)

- Comprehensive testing across all scenarios
- Performance optimization
- Edge case handling
- Documentation updates

## Benefits

1. **Data Loss Prevention**: Users won't lose work done by other processes
2. **Conflict Awareness**: Clear notification when external changes occur
3. **Graceful Degradation**: Proper error handling instead of silent overwrites
4. **User Control**: Options for how to handle conflicts
5. **Better UX**: Clear messaging about what changed and what to do

## Risk Mitigation

1. **Performance Impact**: Minimal - freshness check only happens once before write
2. **False Positives**: Use multiple validation methods (mtime + size + optional hash)
3. **Backward Compatibility**: New feature doesn't break existing functionality
4. **Error Handling**: Comprehensive error types and recovery options

## Success Metrics

- ✅ Zero data loss incidents due to stale file overwrites
- ✅ Clear user feedback when conflicts are detected
- ✅ Comprehensive test coverage (>95%)
- ✅ No performance regression in normal operations
- ✅ Backward compatibility maintained

This plan ensures a robust implementation that prevents data loss while maintaining good user experience and system performance.
