# Debugging & Troubleshooting Workflow

<!--
Module: Debugging Playbook
Tokens: ~300 target
Purpose: Systematic approach to debugging and problem resolution
-->

## Debugging Methodology

### 1. Problem Analysis

- **Understand the Issue**: Clearly define what's not working and expected behavior
- **Gather Context**: Use `${ReadFileTool.Name}` and `${GrepTool.Name}` to understand relevant code
- **Reproduce**: Attempt to reproduce the issue if possible
- **Document Symptoms**: Note exact error messages, stack traces, and conditions

### 2. Investigation Strategy

- **Start Broad**: Use `${GlobTool.Name}` to identify relevant files and modules
- **Narrow Focus**: Use `${GrepTool.Name}` to find specific patterns or error sources
- **Trace Flow**: Follow code execution paths using `${ReadFileTool.Name}`
- **Check Dependencies**: Examine imports, configurations, and external dependencies

### 3. Hypothesis Formation

- **Form Theories**: Based on evidence, develop hypotheses about root causes
- **Prioritize**: Focus on most likely causes first
- **Test Assumptions**: Use tools to verify or disprove theories
- **Iterate**: Refine understanding based on new evidence

### 4. Resolution Implementation

- **Minimal Changes**: Make the smallest change possible to fix the issue
- **Follow Conventions**: Ensure fixes align with project patterns
- **Test Thoroughly**: Verify the fix works and doesn't break other functionality
- **Document**: Add appropriate comments or documentation for complex fixes

### 5. Verification & Prevention

- **Comprehensive Testing**: Run relevant test suites to ensure no regressions
- **Edge Case Consideration**: Test boundary conditions and error scenarios
- **Root Cause Analysis**: Understand why the issue occurred
- **Prevention Measures**: Consider how to prevent similar issues in the future

## Common Debugging Patterns

### Error Message Analysis

- Extract key information from stack traces
- Identify the source file and line number
- Understand the error type and context

### Code Flow Investigation

- Trace execution paths through the codebase
- Identify where data flows and transforms
- Look for unexpected state changes or side effects

### Environment Debugging

- Check configuration files and environment variables
- Verify dependencies and version compatibility
- Ensure proper setup and initialization
