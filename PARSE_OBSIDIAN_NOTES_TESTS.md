# Parse Obsidian Notes - Testing Documentation

## Overview

This document summarizes the testing infrastructure created for the `parse-obsidian-notes` functionality in the obsidian-task-master project.

## Files Created

### 1. Unit Tests
- **Location**: `tests/unit/parse-obsidian-notes.test.js`
- **Purpose**: Comprehensive unit tests for the parse-obsidian-notes functionality
- **Status**: Created but encountering Windows-specific Jest/mock-fs compatibility issues
- **Features Tested**:
  - Basic parsing functionality from Obsidian vaults
  - Append mode for existing tasks
  - Vault validation and error handling
  - Content extraction (frontmatter, tags, links)
  - Research mode integration
  - Task dependency remapping
  - MCP (Model Context Protocol) integration
  - Error handling and edge cases
  - Post-processing and sync operations
  - Metadata and tag management

- **Location**: `tests/unit/parse-obsidian-simple.test.js` 
- **Purpose**: Simplified unit tests that avoid mock-fs Windows issues
- **Status**: Created but encountering chalk dependency issues in Jest environment
- **Features Tested**:
  - Basic functionality validation
  - Task processing and ID remapping
  - Advanced options (research mode, sync)
  - Error handling scenarios

### 2. Integration Tests
- **Location**: `tests/integration/parse-obsidian-notes-integration.test.js`
- **Purpose**: End-to-end testing including CLI command execution
- **Status**: Created and ready for use
- **Features Tested**:
  - CLI command execution and help display
  - End-to-end parsing workflows
  - Advanced options handling
  - Error handling and edge cases
  - Performance and scalability testing
  - Output validation and format verification

### 3. Schema Definitions
- **Location**: `mcp-server/src/schemas/obsidian-tasks.js`
- **Purpose**: Zod schema definitions for Obsidian task validation
- **Status**: Created and ready for use
- **Features**:
  - Complete schema definitions for Obsidian tasks
  - Validation functions for tasks, responses, and configurations
  - Support for batch processing and synchronization
  - TypeScript-compatible type definitions

## Test Structure

### Unit Test Categories

1. **Basic Parsing Functionality**
   - Successful task parsing from Obsidian vault
   - Append mode handling
   - Non-existent vault error handling
   - Invalid Obsidian vault warnings

2. **Content Extraction and Processing**
   - Frontmatter, tags, and links extraction
   - Pattern exclusion
   - Empty vault handling
   - Existing task extraction

3. **Research Mode**
   - Research role usage
   - Research context in prompts

4. **Task Processing and Dependencies**
   - Dependency remapping from AI-generated IDs to sequential IDs
   - Invalid dependency filtering

5. **MCP Integration**
   - MCP logging handling
   - JSON output format for MCP

6. **Error Handling**
   - AI service error handling
   - Invalid AI response format handling
   - File system error handling
   - Overwrite protection without force flag

7. **Post-Processing and Sync**
   - Obsidian sync integration
   - Sync error handling

8. **Metadata and Tag Management**
   - Tag preservation during updates
   - Proper metadata creation

### Integration Test Categories

1. **CLI Command Execution**
   - Help information display
   - Missing argument validation
   - Path validation

2. **End-to-End Parsing Workflow**
   - Complete vault parsing
   - Append mode workflows
   - Pattern exclusion

3. **Advanced Options**
   - Research mode flag handling
   - Custom tag specification
   - Link preservation options

4. **Error Handling and Edge Cases**
   - Empty vault handling
   - Parameter validation
   - Permission error handling

5. **Performance and Scalability**
   - Large vault handling
   - Progress feedback

6. **Output Validation**
   - JSON structure validation
   - Metadata inclusion

## Known Issues

### Jest and Windows Compatibility
- **Issue**: Jest with ES modules and mock-fs has compatibility issues on Windows
- **Error**: `ENOENT, no such file or directory` and chalk import errors
- **Status**: Affects the mock-fs based unit tests
- **Workaround**: Created simplified tests that avoid mock-fs

### Dependencies
- **Chalk**: Version incompatibility in Jest environment causing `_chalk(...).default.dim is not a function`
- **Mock-fs**: Windows path handling issues in Jest context

## Usage

### Running Tests

Due to current Jest configuration issues on Windows:

1. **Integration Tests** (Recommended for now):
   ```bash
   npm test -- tests/integration/parse-obsidian-notes-integration.test.js
   ```

2. **Unit Tests** (Currently failing due to environment issues):
   ```bash
   npm test -- tests/unit/parse-obsidian-notes.test.js
   npm test -- tests/unit/parse-obsidian-simple.test.js
   ```

### Manual Testing

The CLI command can be tested manually:
```bash
node bin/task-master.js parse-obsidian-notes --help
node bin/task-master.js parse-obsidian-notes --vault "/path/to/vault" --output "tasks.json" --num-tasks 10 --force
```

## Schema Usage

The schema can be imported and used for validation:

```javascript
import { 
    validateObsidianTask,
    validateObsidianResponse,
    validateParseConfig
} from '../mcp-server/src/schemas/obsidian-tasks.js';

// Validate a single task
const result = validateObsidianTask(taskObject);
if (result.success) {
    console.log('Task is valid:', result.data);
} else {
    console.error('Validation error:', result.error);
}
```

## Test Coverage

The test suite covers:
- ✅ Basic functionality and workflow validation
- ✅ Error handling and edge cases
- ✅ Integration with external dependencies (AI service, file system)
- ✅ CLI command interface
- ✅ Configuration and options handling
- ✅ Schema validation and data structures
- ⚠️ **Limited by Jest environment issues on Windows**

## Recommendations

1. **Fix Jest Environment**: Resolve the Jest/chalk/mock-fs compatibility issues for full unit test execution
2. **Alternative Test Framework**: Consider switching to a different test framework that works better with ES modules on Windows
3. **Docker Testing**: Use Docker containers for consistent testing environment
4. **CI/CD Integration**: Set up automated testing in Linux-based CI environment where Jest works more reliably

## Future Enhancements

1. **Performance Testing**: Add benchmarks for large vault processing
2. **Memory Usage Testing**: Monitor memory usage during vault scanning
3. **Concurrency Testing**: Test parallel processing of multiple vaults
4. **Real Vault Testing**: Test with actual Obsidian vaults of various sizes
5. **Regression Testing**: Automated testing against previous versions
