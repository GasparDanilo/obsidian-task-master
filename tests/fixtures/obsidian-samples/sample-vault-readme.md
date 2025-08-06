# Sample Obsidian Vault for Testing

This directory contains sample Obsidian vault files for testing the sync functionality.

## Structure

- `tasks/` - Sample task markdown files
- `notes/` - General notes with embedded tasks
- `projects/` - Project-specific notes
- `.obsidian/` - Obsidian configuration files

## Test Scenarios

1. **Task Extraction**: Files with various task formats
2. **Metadata Handling**: Tasks with frontmatter
3. **Link Processing**: Internal links between notes
4. **Tag Processing**: Notes with Obsidian tags
5. **Complex Structure**: Nested folders and mixed content

## Usage in Tests

These fixtures are used by the test suites to validate:
- Parsing of Obsidian markdown files
- Correct extraction of task information
- Proper handling of Obsidian-specific syntax
- Edge cases and error conditions
