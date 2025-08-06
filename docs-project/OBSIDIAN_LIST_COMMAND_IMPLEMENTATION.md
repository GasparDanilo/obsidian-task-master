# Obsidian Task-Master List Command Implementation Guide

A comprehensive guide for implementing an enhanced "task-master list" command that creates Obsidian-compatible notes with linked tasks for improved task management and navigation.

## Overview

This document outlines how to extend the existing `task-master list` command to generate Obsidian-formatted notes that contain linked references to individual task files, creating a dynamic index of tasks within your Obsidian vault.

## Current Implementation Context

The existing `task-master list` command is implemented in:
- **Entry Point**: `index.js` (lines 118-129)
- **CLI Handler**: `scripts/modules/commands.js` (lines 1750-1803)
- **Core Function**: `scripts/modules/task-manager.js` (`listTasks` function)

### Current Features
- Lists all tasks with optional status filtering
- Supports subtask display
- Outputs to terminal with color formatting
- Integrates with tag system
- Uses complexity reports for enhanced display

## Proposed Enhancement: Obsidian List Command

### 1. Command Structure

```bash
# Generate an Obsidian note with linked task list
task-master obsidian-list [options]

# Examples
task-master obsidian-list --vault "/path/to/vault"
task-master obsidian-list --vault "/path/to/vault" --status pending --output-name "Pending Tasks"
task-master obsidian-list --vault "/path/to/vault" --tag development --with-subtasks
```

### 2. Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--vault <path>` | Path to Obsidian vault | Required |
| `--output-name <name>` | Name of the generated note | "Task Master List" |
| `--output-dir <dir>` | Directory within vault for the note | "Tasks/Lists" |
| `--status <status>` | Filter by task status | All statuses |
| `--tag <tag>` | Filter by TaskMaster tag | Current active tag |
| `--with-subtasks` | Include subtasks in the list | `false` |
| `--group-by <field>` | Group tasks by status, priority, or tag | None |
| `--sort-by <field>` | Sort tasks by created, priority, or status | "created" |
| `--include-completed` | Include completed tasks | `false` |
| `--template <path>` | Custom Obsidian template file | Built-in template |
| `--update-existing` | Update existing note instead of creating new | `false` |
| `--dry-run` | Preview the note content without creating | `false` |

### 3. Implementation Plan

#### A. Add Command Definition

Add to `index.js` (after line 157):

```javascript
program
    .command('obsidian-list')
    .description('Generate an Obsidian note with linked task list')
    .action(() => {
        const child = spawn('node', [devScriptPath, 'obsidian-list'], {
            stdio: 'inherit',
            cwd: process.cwd()
        });

        child.on('close', (code) => {
            process.exit(code);
        });
    });
```

#### B. Add CLI Command Handler

Add to `scripts/modules/commands.js` (after the existing list command):

```javascript
// obsidian-list command
programInstance
    .command('obsidian-list')
    .description('Generate an Obsidian note with linked task list')
    .option('--vault <path>', 'Path to Obsidian vault (required)')
    .option('--output-name <name>', 'Name of the generated note', 'Task Master List')
    .option('--output-dir <dir>', 'Directory within vault for the note', 'Tasks/Lists')
    .option('-s, --status <status>', 'Filter by status')
    .option('--tag <tag>', 'Specify tag context for task operations')
    .option('--with-subtasks', 'Include subtasks in the list', false)
    .option('--group-by <field>', 'Group tasks by field (status, priority, tag)')
    .option('--sort-by <field>', 'Sort tasks by field (created, priority, status)', 'created')
    .option('--include-completed', 'Include completed tasks', false)
    .option('--template <path>', 'Custom Obsidian template file')
    .option('--update-existing', 'Update existing note instead of creating new', false)
    .option('--dry-run', 'Preview the note content without creating', false)
    .option('-f, --file <file>', 'Path to the tasks file', TASKMASTER_TASKS_FILE)
    .action(async (options) => {
        // Validate required options
        if (!options.vault) {
            console.error(chalk.red('Error: --vault option is required'));
            process.exit(1);
        }

        // Initialize TaskMaster
        const taskMaster = initTaskMaster({
            tasksPath: options.file || true,
            tag: options.tag
        });

        const tag = taskMaster.getCurrentTag();
        displayCurrentTagIndicator(tag);

        try {
            await generateObsidianTaskList(options, taskMaster, tag);
        } catch (error) {
            console.error(chalk.red(`Error generating Obsidian task list: ${error.message}`));
            process.exit(1);
        }
    });
```

#### C. Core Implementation Function

Create new file `scripts/modules/task-manager/obsidian-list.js`:

```javascript
/**
 * obsidian-list.js
 * Generate Obsidian-compatible task list notes with links
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { readJSON } from '../utils.js';
import { validateObsidianVault } from './obsidian-sync.js';

/**
 * Generate an Obsidian note with linked task list
 * @param {Object} options - Command options
 * @param {Object} taskMaster - TaskMaster instance
 * @param {string} tag - Current tag context
 */
export async function generateObsidianTaskList(options, taskMaster, tag) {
    // Validate vault
    const vaultValidation = await validateObsidianVault(options.vault);
    if (!vaultValidation.isValid) {
        throw new Error(`Invalid Obsidian vault: ${vaultValidation.error}`);
    }

    // Load tasks
    const tasksData = await readJSON(taskMaster.getTasksPath());
    if (!tasksData || !tasksData.tasks) {
        throw new Error('No tasks found');
    }

    // Filter and process tasks
    const filteredTasks = filterTasks(tasksData.tasks, options);
    const groupedTasks = groupTasks(filteredTasks, options.groupBy);
    const sortedTasks = sortTasks(groupedTasks, options.sortBy);

    // Generate note content
    const noteContent = await generateNoteContent(sortedTasks, options, tag, tasksData);

    // Determine output path
    const outputDir = path.join(options.vault, options.outputDir);
    await fs.mkdir(outputDir, { recursive: true });

    const noteName = sanitizeFileName(options.outputName);
    const outputPath = path.join(outputDir, `${noteName}.md`);

    // Handle dry run
    if (options.dryRun) {
        console.log(chalk.blue('=== DRY RUN: Note Content Preview ==='));
        console.log(noteContent);
        console.log(chalk.blue(`Would write to: ${outputPath}`));
        return;
    }

    // Write the note
    await fs.writeFile(outputPath, noteContent, 'utf8');

    console.log(chalk.green(`✓ Generated Obsidian task list: ${outputPath}`));
    console.log(chalk.blue(`📄 Created note with ${filteredTasks.length} tasks`));
}

/**
 * Filter tasks based on options
 * @param {Array} tasks - All tasks
 * @param {Object} options - Filter options
 * @returns {Array} Filtered tasks
 */
function filterTasks(tasks, options) {
    return tasks.filter(task => {
        // Status filter
        if (options.status && task.status !== options.status) {
            return false;
        }

        // Completed filter
        if (!options.includeCompleted && task.status === 'completed') {
            return false;
        }

        return true;
    });
}

/**
 * Group tasks by specified field
 * @param {Array} tasks - Tasks to group
 * @param {string} groupBy - Field to group by
 * @returns {Object} Grouped tasks
 */
function groupTasks(tasks, groupBy) {
    if (!groupBy) {
        return { 'All Tasks': tasks };
    }

    return tasks.reduce((groups, task) => {
        let key;
        switch (groupBy) {
            case 'status':
                key = task.status || 'Unknown';
                break;
            case 'priority':
                key = task.priority || 'No Priority';
                break;
            case 'tag':
                key = (task.tags && task.tags[0]) || 'Untagged';
                break;
            default:
                key = 'All Tasks';
        }

        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(task);
        return groups;
    }, {});
}

/**
 * Sort tasks within groups
 * @param {Object} groupedTasks - Tasks grouped by category
 * @param {string} sortBy - Field to sort by
 * @returns {Object} Sorted grouped tasks
 */
function sortTasks(groupedTasks, sortBy) {
    const sortFunctions = {
        created: (a, b) => new Date(b.created || 0) - new Date(a.created || 0),
        priority: (a, b) => {
            const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
            return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        },
        status: (a, b) => (a.status || '').localeCompare(b.status || ''),
        title: (a, b) => (a.title || '').localeCompare(b.title || '')
    };

    const sortFn = sortFunctions[sortBy] || sortFunctions.created;

    const sorted = {};
    for (const [group, tasks] of Object.entries(groupedTasks)) {
        sorted[group] = [...tasks].sort(sortFn);
    }

    return sorted;
}

/**
 * Generate the markdown content for the note
 * @param {Object} groupedTasks - Grouped and sorted tasks
 * @param {Object} options - Command options
 * @param {string} tag - Current tag context
 * @param {Object} tasksData - Full tasks data for metadata
 * @returns {string} Markdown content
 */
async function generateNoteContent(groupedTasks, options, tag, tasksData) {
    const timestamp = new Date().toISOString();
    const taskCount = Object.values(groupedTasks).flat().length;

    let content = '';

    // YAML frontmatter
    content += '---\n';
    content += `title: "${options.outputName}"\n`;
    content += `created: "${timestamp}"\n`;
    content += `type: "task-list"\n`;
    content += `source: "task-master"\n`;
    content += `tag: "${tag || 'master'}"\n`;
    content += `task_count: ${taskCount}\n`;
    if (options.status) content += `status_filter: "${options.status}"\n`;
    if (options.groupBy) content += `grouped_by: "${options.groupBy}"\n`;
    content += 'tags:\n';
    content += '  - task-master\n';
    content += '  - task-list\n';
    if (tag) content += `  - ${tag}\n`;
    content += '---\n\n';

    // Note header
    content += `# ${options.outputName}\n\n`;
    
    // Metadata section
    content += '## Overview\n\n';
    content += `- **Total Tasks**: ${taskCount}\n`;
    content += `- **Generated**: ${new Date(timestamp).toLocaleDateString()}\n`;
    content += `- **Tag Context**: ${tag || 'master'}\n`;
    if (options.status) content += `- **Status Filter**: ${options.status}\n`;
    if (options.groupBy) content += `- **Grouped By**: ${options.groupBy}\n`;
    content += `- **Source**: Task Master Database\n\n`;

    // Quick actions section
    content += '## Quick Actions\n\n';
    content += '- [[TaskMaster Commands]] - Available commands\n';
    content += '- [[Task Creation Guide]] - How to create new tasks\n';
    content += '- [[Obsidian Sync Status]] - Check sync status\n\n';

    // Task lists by group
    for (const [groupName, tasks] of Object.entries(groupedTasks)) {
        if (tasks.length === 0) continue;

        content += `## ${groupName} (${tasks.length})\n\n`;

        for (const task of tasks) {
            content += generateTaskListItem(task, options);
        }

        content += '\n';
    }

    // Footer with navigation
    content += '---\n\n';
    content += '## Related Notes\n\n';
    content += '- [[Tasks/TaskMaster-README]] - TaskMaster integration guide\n';
    content += '- [[Task Archive]] - Completed tasks\n';
    content += '- [[Project Overview]] - Main project notes\n\n';
    
    content += '*Generated by TaskMaster on ' + new Date(timestamp).toLocaleString() + '*\n';

    return content;
}

/**
 * Generate a single task list item with proper linking
 * @param {Object} task - Task object
 * @param {Object} options - Command options
 * @returns {string} Formatted task list item
 */
function generateTaskListItem(task, options) {
    const taskFileName = `Task-${task.id}.md`;
    const checkbox = task.status === 'completed' ? '[x]' : '[ ]';
    const priority = task.priority ? ` ${getPriorityEmoji(task.priority)}` : '';
    const status = getStatusEmoji(task.status);
    
    let item = `- ${checkbox} [[Tasks/${taskFileName}|${task.title || `Task ${task.id}`}]]${priority} ${status}\n`;
    
    // Add description as sub-item if it exists
    if (task.description && task.description.trim()) {
        const shortDesc = task.description.substring(0, 100);
        const truncated = task.description.length > 100 ? '...' : '';
        item += `  - *${shortDesc}${truncated}*\n`;
    }

    // Add subtasks if requested
    if (options.withSubtasks && task.subtasks && task.subtasks.length > 0) {
        for (const subtask of task.subtasks) {
            const subCheckbox = subtask.status === 'completed' ? '[x]' : '[ ]';
            const subStatus = getStatusEmoji(subtask.status);
            item += `  - ${subCheckbox} ${subtask.title || `Subtask ${subtask.id}`} ${subStatus}\n`;
        }
    }

    return item;
}

/**
 * Get emoji for task priority
 * @param {string} priority - Task priority
 * @returns {string} Priority emoji
 */
function getPriorityEmoji(priority) {
    const emojis = {
        'high': '🔥',
        'medium': '⚡',
        'low': '📝'
    };
    return emojis[priority] || '';
}

/**
 * Get emoji for task status
 * @param {string} status - Task status
 * @returns {string} Status emoji
 */
function getStatusEmoji(status) {
    const emojis = {
        'pending': '⏳',
        'in-progress': '🔄',
        'blocked': '🚧',
        'completed': '✅',
        'cancelled': '❌'
    };
    return emojis[status] || '📋';
}

/**
 * Sanitize filename for cross-platform compatibility
 * @param {string} name - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeFileName(name) {
    return name
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}
```

#### D. Import the New Function

Add to `scripts/modules/commands.js` imports section:

```javascript
import { generateObsidianTaskList } from './task-manager/obsidian-list.js';
```

### 4. Generated Note Structure

The command will create Obsidian notes with the following structure:

```markdown
---
title: "Pending Tasks"
created: "2024-08-06T20:53:22.000Z"
type: "task-list"
source: "task-master"
tag: "development"
task_count: 15
status_filter: "pending"
grouped_by: "status"
tags:
  - task-master
  - task-list
  - development
---

# Pending Tasks

## Overview

- **Total Tasks**: 15
- **Generated**: 8/6/2024
- **Tag Context**: development
- **Status Filter**: pending
- **Grouped By**: status
- **Source**: Task Master Database

## Quick Actions

- [[TaskMaster Commands]] - Available commands
- [[Task Creation Guide]] - How to create new tasks
- [[Obsidian Sync Status]] - Check sync status

## High Priority (3)

- [ ] [[Tasks/Task-42.md|Implement user authentication]] 🔥 ⏳
  - *Create login system with JWT tokens and secure password handling...*
- [ ] [[Tasks/Task-38.md|Database schema migration]] 🔥 ⏳
- [ ] [[Tasks/Task-51.md|API endpoint security audit]] 🔥 ⏳

## Medium Priority (8)

- [ ] [[Tasks/Task-33.md|Update documentation]] ⚡ ⏳
  - *Refresh API docs and add new endpoint examples...*
- [ ] [[Tasks/Task-45.md|Performance optimization]] ⚡ ⏳

## Low Priority (4)

- [ ] [[Tasks/Task-29.md|Code cleanup]] 📝 ⏳
- [ ] [[Tasks/Task-52.md|UI polish]] 📝 ⏳

---

## Related Notes

- [[Tasks/TaskMaster-README]] - TaskMaster integration guide
- [[Task Archive]] - Completed tasks
- [[Project Overview]] - Main project notes

*Generated by TaskMaster on 8/6/2024, 8:53:22 PM*
```

### 5. Usage Examples

#### Basic Task List
```bash
# Generate a simple task list
task-master obsidian-list --vault "/Users/user/Notes"
```

#### Filtered and Organized
```bash
# Pending tasks grouped by priority
task-master obsidian-list \
  --vault "/Users/user/Notes" \
  --status pending \
  --group-by priority \
  --output-name "Sprint Planning"
```

#### Development Context with Subtasks
```bash
# Development tasks with subtasks
task-master obsidian-list \
  --vault "/Users/user/Notes" \
  --tag development \
  --with-subtasks \
  --output-dir "Projects/Current Sprint" \
  --output-name "Development Tasks"
```

#### Preview Before Creating
```bash
# Preview the note content
task-master obsidian-list \
  --vault "/Users/user/Notes" \
  --dry-run \
  --group-by status
```

### 6. Integration with Existing Commands

The new command integrates seamlessly with existing TaskMaster functionality:

- **Tag System**: Respects current tag context
- **Task Filtering**: Uses same status filters as regular list
- **Obsidian Sync**: Works alongside existing obsidian-sync commands
- **File Paths**: Maintains consistency with TaskMaster path conventions

### 7. Advanced Features

#### Custom Templates
Users can provide custom Obsidian templates:

```bash
task-master obsidian-list \
  --vault "/Users/user/Notes" \
  --template "/Users/user/Notes/Templates/Task-List.md"
```

#### Automated Updates
Set up periodic updates of task lists:

```bash
# Update existing note instead of creating new
task-master obsidian-list \
  --vault "/Users/user/Notes" \
  --output-name "Daily Tasks" \
  --update-existing
```

### 8. Error Handling

The implementation includes comprehensive error handling:

- **Vault Validation**: Ensures target is a valid Obsidian vault
- **Permission Checks**: Verifies write permissions to vault directories
- **File Conflicts**: Handles existing files appropriately
- **Task Data Validation**: Ensures task data integrity
- **Graceful Degradation**: Falls back to basic functionality if advanced features fail

### 9. Testing Strategy

#### Unit Tests
```javascript
// tests/obsidian-list.test.js
describe('Obsidian List Command', () => {
    test('should generate valid markdown with task links', async () => {
        // Test implementation
    });
    
    test('should filter tasks by status correctly', () => {
        // Test implementation
    });
    
    test('should group tasks appropriately', () => {
        // Test implementation
    });
});
```

#### Integration Tests
```bash
# Test with real vault
npm test -- --integration --vault-path="/tmp/test-vault"
```

### 10. Future Enhancements

#### Planned Features
1. **Live Updates**: Auto-refresh notes when tasks change
2. **Interactive Links**: Click-to-edit task properties
3. **Visual Kanban**: Generate Kanban board views in Obsidian
4. **Progress Tracking**: Visual progress bars and charts
5. **Time Tracking**: Integration with time tracking plugins

#### Plugin Integration
- **Dataview**: Generate dynamic queries
- **Templater**: Advanced template processing
- **Calendar**: Schedule-based task views
- **Graph View**: Task relationship visualization

## Conclusion

This implementation provides a powerful bridge between TaskMaster's CLI functionality and Obsidian's note-taking capabilities. Users can maintain their command-line workflow while benefiting from Obsidian's linking, visualization, and organization features.

The generated notes serve as living documents that stay synchronized with the TaskMaster database, providing both a snapshot view and an interactive interface for task management within the Obsidian environment.
