# TaskMaster Obsidian Plugin

An Obsidian plugin that integrates TaskMaster AI task management directly into Obsidian with full command palette support.

## Features

### 🎯 Command Palette Integration

Access all TaskMaster functionality directly from Obsidian's command palette (Ctrl/Cmd + P):

- **TaskMaster: Show Task List** - Open the task management sidebar
- **TaskMaster: Add New Task** - Create a new task with a modal dialog
- **TaskMaster: List All Tasks** - View all tasks and open the task list
- **TaskMaster: Get Next Task** - Get and view the next pending task
- **TaskMaster: Sync with TaskMaster** - Manually sync with TaskMaster backend
- **TaskMaster: Create Task from Selection** - Create a task from selected text

### 📋 Task Management

- **Visual Task List**: Clean, organized task list in the sidebar grouped by status
- **Quick Actions**: Start, complete, edit, or view tasks with one click
- **Priority Indicators**: Color-coded priority badges (Low, Medium, High, Critical)
- **Status Tracking**: Full support for all TaskMaster task statuses
- **Auto-sync**: Optional automatic synchronization with TaskMaster backend

### 🔗 Integration Features

- **MCP Protocol**: Communicates with TaskMaster via Model Context Protocol
- **Real-time Updates**: Tasks sync in real-time with TaskMaster backend
- **Text Selection**: Create tasks directly from selected text in any note
- **Ribbon Icon**: Quick access to task list via sidebar ribbon
- **Settings Panel**: Configure MCP connection and sync preferences

## Installation

### Automatic Installation (Recommended)

The easiest way to install this plugin is using the TaskMaster CLI:

```bash
# Interactive installation - discovers vaults and lets you choose
task-master obsidian-plugin-install

# Install to specific vault
task-master obsidian-plugin-install --vault /path/to/vault

# Install to multiple vaults
task-master obsidian-plugin-install --vault /path/vault1 --vault /path/vault2

# Auto-install to all discovered vaults
task-master obsidian-plugin-install --auto-discover
```

The installer will:
1. Automatically discover Obsidian vaults on your system
2. Build the plugin from source
3. Copy plugin files to the selected vault(s)
4. Optionally enable the plugin in your vault settings

After installation, simply reload Obsidian and the plugin will be available.

### Manual Installation

#### From Release

1. Download the latest release from GitHub
2. Extract the files to your Obsidian plugins folder: `VaultFolder/.obsidian/plugins/task-master-obsidian/`
3. Reload Obsidian and enable the plugin in Settings > Community Plugins

#### Development

1. Clone this repository
2. Navigate to the plugin directory: `cd apps/obsidian-plugin`
3. Install dependencies: `npm install`
4. Build the plugin: `npm run build`
5. Copy `main.js`, `manifest.json`, and `styles.css` to your plugins folder

## Setup

1. **Install TaskMaster**: Ensure you have TaskMaster AI installed and available via `npx task-master-ai`
2. **Configure Plugin**: Go to Settings > TaskMaster and configure:
   - MCP Command (default: `npx`)
   - MCP Arguments (default: `task-master-ai`)
   - Working Directory (optional)
   - Default Tag (optional)
3. **Initialize Project**: Make sure your vault/project is initialized with TaskMaster

## Usage

### Command Palette

Press `Ctrl/Cmd + P` and type "TaskMaster" to see all available commands:

```
TaskMaster: Show Task List
TaskMaster: Add New Task
TaskMaster: List All Tasks
TaskMaster: Get Next Task
TaskMaster: Sync with TaskMaster
TaskMaster: Create Task from Selection
```

### Task List Sidebar

1. Click the TaskMaster icon in the ribbon or use the command palette
2. The sidebar shows tasks grouped by status:
   - **In Progress** - Currently active tasks
   - **Pending** - Tasks waiting to be started
   - **Completed** - Finished tasks
   - **Deferred** - Postponed tasks
   - **Cancelled** - Cancelled tasks

### Creating Tasks

**From Command Palette:**
1. Use "TaskMaster: Add New Task"
2. Fill in title, description, and priority
3. Click "Add Task"

**From Text Selection:**
1. Select text in any note
2. Use "TaskMaster: Create Task from Selection"
3. The selected text becomes the task title
4. Add description and set priority

### Managing Tasks

- **View Task**: Click on any task to view details
- **Edit Task**: Click "Edit" or use the edit button in task list
- **Quick Actions**: Use "Start" or "Complete" buttons for status changes
- **Priority**: Color-coded badges show task priority at a glance

## Configuration

### Plugin Settings

Access via Settings > TaskMaster:

| Setting | Description | Default |
|---------|-------------|---------|
| MCP Command | Command to run TaskMaster MCP server | `npx` |
| MCP Arguments | Arguments for MCP server | `task-master-ai` |
| Working Directory | Working directory for TaskMaster | (vault root) |
| Default Tag | Default tag for task operations | (none) |
| Enable Auto-sync | Automatically sync tasks | `false` |
| Sync Interval | Auto-sync frequency in seconds | 30 |

### MCP Connection

The plugin communicates with TaskMaster via the Model Context Protocol (MCP). Ensure:

1. TaskMaster is installed and accessible
2. Your project is initialized with TaskMaster (`task-master init`)
3. The MCP server can be started with your configured command

## Troubleshooting

### Connection Issues

**Plugin can't connect to TaskMaster:**
1. Verify TaskMaster is installed: `npm list -g task-master-ai`
2. Check MCP command in settings
3. Ensure working directory is correct
4. Try manually: `npx task-master-ai` in terminal

**Tasks not syncing:**
1. Check console for errors (Ctrl+Shift+I)
2. Verify TaskMaster project is initialized
3. Try manual sync with "TaskMaster: Sync with TaskMaster"

### Performance

**Plugin running slowly:**
1. Disable auto-sync if not needed
2. Increase sync interval
3. Check for large number of tasks

## Development

### Project Structure

```
apps/obsidian-plugin/
├── src/
│   ├── main.ts                 # Main plugin entry point
│   ├── services/
│   │   └── TaskMasterClient.ts # MCP client for TaskMaster
│   ├── modals/
│   │   └── TaskMasterModal.ts  # Task create/edit modal
│   └── views/
│       └── TaskListView.ts     # Sidebar task list view
├── manifest.json               # Plugin manifest
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
└── esbuild.config.mjs         # Build configuration
```

### Building

```bash
# Development build with watching
npm run dev

# Production build
npm run build

# Type checking
npm run check-types
```

### Testing

The plugin integrates with TaskMaster's existing test suite. Run tests from the main project:

```bash
cd ../..  # Go to project root
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT WITH Commons-Clause - See main project LICENSE file.

## Related

- [TaskMaster AI](../../README.md) - Main TaskMaster project
- [VS Code Extension](../extension/README.md) - TaskMaster VS Code extension
- [Obsidian Integration Guide](../../docs-project/OBSIDIAN_INTEGRATION_GUIDE.md) - CLI integration docs
