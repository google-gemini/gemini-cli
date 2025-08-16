# Data Directory Restructure Implementation Plan

## Overview

This plan restructures the file path management system to consolidate RCAs, guardrails, and a new reviews feature under a unified data directory structure.

## Current Structure Analysis

### Current File Paths
- **Guardrails**: `./src/prompts/guardrails.json` (configurable via `ACCELOS_GUARDRAIL_FILE_PATH`)
- **RCAs**: `./src/rcas/` (configurable via `RCA_DIRECTORY_PATH`)

### Current Configuration (src/config.ts:10-11, 22-23)
- `guardrailFilePath`: Environment variable or default path
- `rcaDirectoryPath`: Environment variable or default path

## Proposed New Structure

```
.accelos/
└── data/
    ├── RCA/
    │   └── [existing RCA files]
    ├── guardrails.json
    └── reviews/
        └── [production-review agent assessments]
```

## Implementation Plan

### Phase 1: Configuration Updates

#### 1.1 Update Configuration Schema
**File**: `src/config.ts`

**Changes**:
- Replace `guardrailFilePath` and `rcaDirectoryPath` with single `dataDirectoryPath`
- Update environment variable from separate paths to `ACCELOS_DATA_DIRECTORY_PATH`
- Default to `./.accelos/data`

**New Configuration**:
```typescript
export const AccelosConfigSchema = z.object({
  // ... existing fields
  dataDirectoryPath: z.string().default(process.env.ACCELOS_DATA_DIRECTORY_PATH || './.accelos/data'),
});
```

#### 1.2 Add Directory Structure Helpers
**File**: `src/config.ts`

**New Functions**:
```typescript
export function getDataPaths(dataDir: string) {
  return {
    rcaDirectory: path.join(dataDir, 'RCA'),
    guardrailsFile: path.join(dataDir, 'guardrails.json'),
    reviewsDirectory: path.join(dataDir, 'reviews'),
  };
}
```

### Phase 2: Tool Updates

#### 2.1 Update RCA Loader
**File**: `src/tools/rca-loader.ts:description`, `src/tools/rca-loader.ts:31`

**Changes**:
- Update description to reference data directory structure
- Change default directory from `defaultConfig.rcaDirectoryPath` to `getDataPaths(defaultConfig.dataDirectoryPath).rcaDirectory`

#### 2.2 Update Guardrail Loader
**File**: `src/tools/guardrail-loader.ts:31`, `src/tools/guardrail-loader.ts:37`, `src/tools/guardrail-loader.ts:42`

**Changes**:
- Replace `filePath = defaultConfig.guardrailFilePath` with `filePath = getDataPaths(defaultConfig.dataDirectoryPath).guardrailsFile`
- Update log messages to reference data directory structure

#### 2.3 Update Guardrail CRUD Operations
**File**: `src/tools/guardrail-crud.ts`

**Changes**:
- Update all file path references to use new data directory structure
- Ensure consistency across create, read, update, delete operations

### Phase 3: New Reviews Feature

#### 3.1 Create Reviews Directory Structure
- Create `.accelos/data/reviews/` directory
- Implement directory initialization if it doesn't exist

#### 3.2 Create Review Storage Tool
**New File**: `src/tools/review-storage.ts`

**Features**:
- Store production-review agent assessments
- Support for JSON format assessments
- Metadata tracking (timestamp, version, etc.)
- Search and retrieval capabilities

#### 3.3 Create Review Loader Tool
**New File**: `src/tools/review-loader.ts`

**Features**:
- Load review assessments with pagination
- Filter by date range, review type, etc.
- Integration with existing tool patterns

### Phase 4: Migration Strategy

#### 4.1 Directory Migration Helper
**New File**: `src/tools/migrate-data-structure.ts`

**Features**:
- Detect old structure and migrate automatically
- Create new data directory structure
- Move existing files to new locations
- Preserve existing data integrity

#### 4.2 Backward Compatibility
- Maintain support for old environment variables during transition period
- Add deprecation warnings for old configuration
- Provide migration guide in documentation

### Phase 5: Testing and Validation

#### 5.1 Unit Tests
- Test all configuration changes
- Test tool functionality with new paths
- Test migration helper

#### 5.2 Integration Tests
- Test end-to-end workflows with new structure
- Validate backward compatibility
- Test new reviews feature

### Phase 6: Documentation Updates

#### 6.1 Configuration Documentation
- Update environment variable documentation
- Add migration guide
- Document new reviews feature

#### 6.2 Tool Documentation  
- Update tool descriptions and examples
- Add reviews workflow documentation

## Implementation Order

1. **Configuration Updates** (Phase 1)
2. **Tool Updates** (Phase 2) 
3. **Migration Helper** (Phase 4.1)
4. **Reviews Feature** (Phase 3)
5. **Testing** (Phase 5)
6. **Documentation** (Phase 6)

## Risk Mitigation

### Data Loss Prevention
- Migration helper validates before moving files
- Backup original structure before migration
- Rollback capability if migration fails

### Backward Compatibility
- Support old environment variables during transition
- Graceful fallback to old structure if new structure not found
- Clear deprecation timeline

### Testing Strategy
- Comprehensive unit tests for all changes
- Integration tests for complete workflows
- Manual testing of migration scenarios

## Success Criteria

- [ ] All existing functionality works with new structure
- [ ] Migration from old to new structure is seamless
- [ ] New reviews feature is fully functional
- [ ] No data loss during migration
- [ ] Documentation is complete and accurate
- [ ] All tests pass

## Timeline Estimate

- **Phase 1-2**: 1-2 days (Configuration and Tool Updates)
- **Phase 3**: 1-2 days (Reviews Feature)
- **Phase 4**: 1 day (Migration Strategy)
- **Phase 5**: 1 day (Testing)
- **Phase 6**: 0.5 days (Documentation)

**Total**: 4.5-6.5 days

## Files to Modify

### Core Files
- `src/config.ts` - Configuration schema and helpers
- `src/tools/rca-loader.ts` - Update directory path
- `src/tools/guardrail-loader.ts` - Update file path
- `src/tools/guardrail-crud.ts` - Update file operations

### New Files
- `src/tools/review-storage.ts` - Review storage functionality
- `src/tools/review-loader.ts` - Review loading functionality  
- `src/tools/migrate-data-structure.ts` - Migration helper

### Test Files
- Tests for all modified and new functionality
- Integration tests for complete workflows

This plan provides a comprehensive approach to restructuring the file path management while maintaining functionality and providing a clear migration path.