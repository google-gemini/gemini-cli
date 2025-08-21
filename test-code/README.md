# Test Codebase

This directory contains example code files in different programming languages for testing the semantic search functionality.

## Files Overview

### 1. `calculator.py` - Python Calculator
- **Language**: Python
- **Purpose**: Simple calculator with basic arithmetic operations
- **Features**: 
  - Addition, subtraction, multiplication, division
  - History tracking
  - Error handling for division by zero
  - Class-based implementation

### 2. `user_management.js` - JavaScript User Management
- **Language**: JavaScript
- **Purpose**: User registration and authentication system
- **Features**:
  - User registration with duplicate checking
  - Authentication system
  - Profile updates
  - User search functionality
  - Soft delete (deactivation)

### 3. `database_utils.rs` - Rust Database Utilities
- **Language**: Rust
- **Purpose**: Database connection and query management
- **Features**:
  - Connection pooling
  - Error handling with custom error types
  - CRUD operations (Create, Read, Update, Delete)
  - Async/await support
  - Unit tests

### 4. `file_processor.go` - Go File Processor
- **Language**: Go
- **Purpose**: File processing and analysis
- **Features**:
  - Concurrent file processing
  - MD5 hash calculation
  - File statistics (lines, words, characters)
  - File type detection
  - Directory traversal

## Testing Semantic Search

Use these files to test the semantic search functionality. Here are some example queries you can try:

### Calculator-related queries:
- "arithmetic operations"
- "mathematical functions"
- "addition and subtraction"
- "division by zero handling"

### User management queries:
- "user authentication"
- "registration system"
- "profile management"
- "user search functionality"

### Database queries:
- "database connection"
- "connection pooling"
- "CRUD operations"
- "error handling"

### File processing queries:
- "file analysis"
- "concurrent processing"
- "hash calculation"
- "file statistics"

## Expected Behavior

The semantic search should:
1. Find relevant code snippets based on the query
2. Return results with similarity scores
3. Show context around the found code
4. Work across different programming languages
5. Understand semantic meaning, not just exact text matches

## File Structure
```
test-code/
├── calculator.py      # Python calculator implementation
├── user_management.js # JavaScript user management system
├── database_utils.rs  # Rust database utilities
├── file_processor.go  # Go file processor
└── README.md         # This file
```

Each file contains well-documented code with clear function names and comments to help test the semantic understanding capabilities of the search system.
