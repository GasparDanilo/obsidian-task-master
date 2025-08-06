# Obsidian Task Master Plugin Development Guide

## Project Overview

This document outlines the development of an Obsidian plugin that integrates Task Master functionality with Obsidian's command palette and provides visual status indicators through symbols.

## Plugin Features

### Core Functionality
- **Command Palette Integration**: Access Task Master commands through Obsidian's command palette (`Ctrl+P`)
- **Status Symbol Display**: Visual indicators showing current task status in the status bar
- **Task Management**: Create, update, and track task progress directly within Obsidian

### Key Components
1. Command registration and handling
2. Status bar integration
3. Task state management
4. Symbol rendering system

## Development Architecture

### File Structure
```
obsidian-task-master/
├── src/
│   ├── main.ts              # Main plugin class
│   ├── commands.ts          # Command definitions and handlers
│   ├── statusBar.ts         # Status bar component
│   ├── taskManager.ts       # Task management logic
│   └── symbols.ts           # Symbol definitions and rendering
├── scripts/
│   ├── deploy.js            # Auto-deployment script
│   └── build-and-deploy.js  # Combined build and deploy
├── styles.css               # Plugin styling
├── manifest.json            # Plugin manifest
├── package.json             # Dependencies and scripts
├── esbuild.config.js        # Build configuration
├── .env.example             # Environment variables template
└── README.md               # Plugin documentation
```

## Implementation Steps

### Step 1: Plugin Foundation

#### 1.1 Main Plugin Class (`src/main.ts`)
```typescript
import { Plugin, TFile, Notice } from 'obsidian';
import { TaskMasterCommands } from './commands';
import { StatusBarManager } from './statusBar';
import { TaskManager } from './taskManager';

export default class TaskMasterPlugin extends Plugin {
    private commands: TaskMasterCommands;
    private statusBar: StatusBarManager;
    private taskManager: TaskManager;

    async onload() {
        // Initialize components
        this.taskManager = new TaskManager(this);
        this.commands = new TaskMasterCommands(this, this.taskManager);
        this.statusBar = new StatusBarManager(this, this.taskManager);

        // Register commands
        this.commands.registerCommands();
        
        // Initialize status bar
        this.statusBar.initialize();

        console.log('Task Master Plugin loaded');
    }

    onunload() {
        this.statusBar?.cleanup();
        console.log('Task Master Plugin unloaded');
    }
}
```

#### 1.2 Plugin Manifest (`manifest.json`)
```json
{
    "id": "obsidian-task-master",
    "name": "Task Master",
    "version": "1.0.0",
    "minAppVersion": "0.15.0",
    "description": "Integrate Task Master functionality with command palette and status symbols",
    "author": "Your Name",
    "authorUrl": "https://github.com/yourusername",
    "fundingUrl": "https://buymeacoffee.com/yourusername",
    "isDesktopOnly": false
}
```

### Step 2: Command System Implementation

#### 2.1 Command Definitions (`src/commands.ts`)
```typescript
import { Plugin, Command } from 'obsidian';
import { TaskManager, TaskStatus } from './taskManager';

export class TaskMasterCommands {
    constructor(
        private plugin: Plugin,
        private taskManager: TaskManager
    ) {}

    registerCommands() {
        // Create new task
        this.plugin.addCommand({
            id: 'create-task',
            name: 'Create New Task',
            callback: () => this.createTask(),
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 't' }]
        });

        // Mark task as completed
        this.plugin.addCommand({
            id: 'complete-task',
            name: 'Mark Task as Completed',
            callback: () => this.completeCurrentTask()
        });

        // Update task status
        this.plugin.addCommand({
            id: 'update-task-status',
            name: 'Update Task Status',
            callback: () => this.showStatusSelector()
        });

        // Show task overview
        this.plugin.addCommand({
            id: 'show-task-overview',
            name: 'Show Task Overview',
            callback: () => this.showTaskOverview()
        });

        // Toggle task master mode
        this.plugin.addCommand({
            id: 'toggle-task-master',
            name: 'Toggle Task Master Mode',
            callback: () => this.toggleTaskMasterMode()
        });
    }

    private async createTask() {
        const taskName = await this.promptForTaskName();
        if (taskName) {
            await this.taskManager.createTask(taskName);
        }
    }

    private async completeCurrentTask() {
        const activeTask = this.taskManager.getActiveTask();
        if (activeTask) {
            await this.taskManager.updateTaskStatus(activeTask.id, TaskStatus.COMPLETED);
        } else {
            new Notice('No active task to complete');
        }
    }

    private async showStatusSelector() {
        // Implementation for status selection modal
    }

    private async showTaskOverview() {
        // Implementation for task overview modal
    }

    private async toggleTaskMasterMode() {
        this.taskManager.toggleTaskMasterMode();
    }

    private async promptForTaskName(): Promise<string | null> {
        // Implementation for task name input modal
        return null;
    }
}
```

### Step 3: Task Management System

#### 3.1 Task Manager (`src/taskManager.ts`)
```typescript
import { Plugin, Notice, TFile } from 'obsidian';

export enum TaskStatus {
    TODO = 'todo',
    IN_PROGRESS = 'in-progress',
    WAITING = 'waiting',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled'
}

export interface Task {
    id: string;
    name: string;
    status: TaskStatus;
    createdAt: Date;
    updatedAt: Date;
    file?: TFile;
    priority: 'low' | 'medium' | 'high';
}

export class TaskManager {
    private tasks: Task[] = [];
    private activeTask: Task | null = null;
    private taskMasterMode: boolean = false;

    constructor(private plugin: Plugin) {
        this.loadTasks();
    }

    async createTask(name: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<Task> {
        const task: Task = {
            id: this.generateId(),
            name,
            status: TaskStatus.TODO,
            createdAt: new Date(),
            updatedAt: new Date(),
            priority
        };

        this.tasks.push(task);
        await this.saveTasks();
        
        new Notice(`Task created: ${name}`);
        return task;
    }

    async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = status;
            task.updatedAt = new Date();
            await this.saveTasks();
            new Notice(`Task status updated to: ${status}`);
        }
    }

    getActiveTask(): Task | null {
        return this.activeTask;
    }

    setActiveTask(taskId: string): void {
        this.activeTask = this.tasks.find(t => t.id === taskId) || null;
    }

    toggleTaskMasterMode(): void {
        this.taskMasterMode = !this.taskMasterMode;
        new Notice(`Task Master Mode: ${this.taskMasterMode ? 'ON' : 'OFF'}`);
    }

    isTaskMasterMode(): boolean {
        return this.taskMasterMode;
    }

    getTasks(): Task[] {
        return this.tasks;
    }

    getTasksByStatus(status: TaskStatus): Task[] {
        return this.tasks.filter(t => t.status === status);
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    private async loadTasks(): Promise<void> {
        // Load tasks from plugin data
        const data = await this.plugin.loadData();
        this.tasks = data?.tasks || [];
        this.activeTask = data?.activeTask || null;
        this.taskMasterMode = data?.taskMasterMode || false;
    }

    private async saveTasks(): Promise<void> {
        await this.plugin.saveData({
            tasks: this.tasks,
            activeTask: this.activeTask,
            taskMasterMode: this.taskMasterMode
        });
    }
}
```

### Step 4: Status Bar Integration

#### 4.1 Status Bar Manager (`src/statusBar.ts`)
```typescript
import { Plugin, setIcon } from 'obsidian';
import { TaskManager, TaskStatus, Task } from './taskManager';
import { TaskSymbols } from './symbols';

export class StatusBarManager {
    private statusBarItem: HTMLElement;
    private symbols: TaskSymbols;

    constructor(
        private plugin: Plugin,
        private taskManager: TaskManager
    ) {
        this.symbols = new TaskSymbols();
    }

    initialize(): void {
        this.statusBarItem = this.plugin.addStatusBarItem();
        this.statusBarItem.addClass('task-master-status');
        
        // Initial render
        this.updateStatusBar();
        
        // Update every 5 seconds
        this.plugin.registerInterval(
            window.setInterval(() => this.updateStatusBar(), 5000)
        );

        // Click handler
        this.statusBarItem.addEventListener('click', () => {
            this.showTaskQuickSwitcher();
        });
    }

    updateStatusBar(): void {
        const activeTask = this.taskManager.getActiveTask();
        const taskMasterMode = this.taskManager.isTaskMasterMode();
        
        if (!taskMasterMode) {
            this.statusBarItem.empty();
            return;
        }

        this.statusBarItem.empty();
        
        // Add mode indicator
        const modeEl = this.statusBarItem.createEl('span', {
            cls: 'task-master-mode'
        });
        modeEl.innerHTML = this.symbols.getTaskMasterSymbol();
        
        if (activeTask) {
            // Add task status symbol
            const statusEl = this.statusBarItem.createEl('span', {
                cls: 'task-status'
            });
            statusEl.innerHTML = this.symbols.getStatusSymbol(activeTask.status);
            
            // Add task name
            const nameEl = this.statusBarItem.createEl('span', {
                cls: 'task-name',
                text: activeTask.name
            });
            
            // Add task counter
            const stats = this.getTaskStats();
            const counterEl = this.statusBarItem.createEl('span', {
                cls: 'task-counter',
                text: `(${stats.active}/${stats.total})`
            });
        } else {
            const noTaskEl = this.statusBarItem.createEl('span', {
                cls: 'no-task',
                text: 'No active task'
            });
        }
    }

    private getTaskStats(): { active: number; total: number } {
        const tasks = this.taskManager.getTasks();
        const activeTasks = tasks.filter(t => 
            t.status === TaskStatus.TODO || t.status === TaskStatus.IN_PROGRESS
        );
        
        return {
            active: activeTasks.length,
            total: tasks.length
        };
    }

    private showTaskQuickSwitcher(): void {
        // Implementation for task quick switcher
    }

    cleanup(): void {
        this.statusBarItem?.remove();
    }
}
```

### Step 5: Symbol System

#### 5.1 Symbol Definitions (`src/symbols.ts`)
```typescript
import { TaskStatus } from './taskManager';

export class TaskSymbols {
    private statusSymbols: Record<TaskStatus, string> = {
        [TaskStatus.TODO]: '⏸️',
        [TaskStatus.IN_PROGRESS]: '▶️',
        [TaskStatus.WAITING]: '⏳',
        [TaskStatus.COMPLETED]: '✅',
        [TaskStatus.CANCELLED]: '❌'
    };

    private prioritySymbols = {
        low: '🔵',
        medium: '🟡',
        high: '🔴'
    };

    getStatusSymbol(status: TaskStatus): string {
        return this.statusSymbols[status] || '❓';
    }

    getPrioritySymbol(priority: 'low' | 'medium' | 'high'): string {
        return this.prioritySymbols[priority] || '⚪';
    }

    getTaskMasterSymbol(): string {
        return '📋';
    }

    getProgressBar(completed: number, total: number): string {
        const percentage = total > 0 ? completed / total : 0;
        const filledBlocks = Math.floor(percentage * 10);
        const emptyBlocks = 10 - filledBlocks;
        
        return '█'.repeat(filledBlocks) + '▒'.repeat(emptyBlocks);
    }

    getCombinedStatusDisplay(status: TaskStatus, priority: 'low' | 'medium' | 'high'): string {
        return `${this.getStatusSymbol(status)} ${this.getPrioritySymbol(priority)}`;
    }
}
```

### Step 6: Styling

#### 6.1 Plugin Styles (`styles.css`)
```css
/* Task Master Status Bar Styles */
.task-master-status {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 2px 8px;
    border-radius: 4px;
    transition: background-color 0.2s ease;
}

.task-master-status:hover {
    background-color: var(--background-modifier-hover);
}

.task-master-mode {
    font-size: 16px;
}

.task-status {
    font-size: 14px;
}

.task-name {
    font-size: 12px;
    font-weight: 500;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.task-counter {
    font-size: 11px;
    opacity: 0.7;
    margin-left: 4px;
}

.no-task {
    font-size: 11px;
    opacity: 0.5;
    font-style: italic;
}

/* Command Modal Styles */
.task-master-modal {
    max-width: 500px;
}

.task-list {
    max-height: 300px;
    overflow-y: auto;
}

.task-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.task-item:hover {
    background-color: var(--background-modifier-hover);
}

.task-item.active {
    background-color: var(--background-modifier-selected);
}

.task-symbol {
    font-size: 16px;
    flex-shrink: 0;
}

.task-details {
    flex-grow: 1;
    min-width: 0;
}

.task-title {
    font-weight: 500;
    margin-bottom: 2px;
}

.task-meta {
    font-size: 11px;
    opacity: 0.7;
}
```

## Usage Instructions

### Command Palette Integration

Users can access Task Master functionality through Obsidian's command palette (`Ctrl+P` or `Cmd+P`):

1. **Create New Task** - `Task Master: Create New Task`
2. **Mark Task as Completed** - `Task Master: Mark Task as Completed`
3. **Update Task Status** - `Task Master: Update Task Status`
4. **Show Task Overview** - `Task Master: Show Task Overview`
5. **Toggle Task Master Mode** - `Task Master: Toggle Task Master Mode`

### Status Bar Symbols

The status bar displays different symbols based on task state:

- 📋 - Task Master Mode indicator
- ▶️ - Task in progress
- ⏸️ - Task paused/todo
- ⏳ - Task waiting
- ✅ - Task completed
- ❌ - Task cancelled
- 🔴/🟡/🔵 - Priority indicators (High/Medium/Low)

## Development Workflow

### 1. Setup Development Environment
```bash
# Clone the repository
git clone https://github.com/yourusername/obsidian-task-master.git
cd obsidian-task-master

# Install dependencies
npm install

# Create environment configuration
cp .env.example .env
# Edit .env file with your Obsidian vault path
```

### 2. Environment Configuration

Create a `.env` file in the project root:
```env
# Path to your Obsidian vault (adjust as needed)
OBSIDIAN_VAULT_PATH=C:\\Users\\User\\Documents\\MyVault

# Alternative: Use relative path from project directory
# OBSIDIAN_VAULT_PATH=..\\..\\MyVault

# Plugin directory will be: {OBSIDIAN_VAULT_PATH}\.obsidian\plugins\obsidian-task-master
```

### 3. Development Commands
```bash
# Watch mode for development (auto-builds and deploys on file changes)
npm run dev

# Build and deploy to Obsidian vault
npm run build:deploy

# Build for production only
npm run build

# Deploy existing build to vault
npm run deploy

# Run tests
npm test

# Lint code
npm run lint

# Clean build artifacts
npm run clean
```

### 4. Automatic Plugin Deployment

The development setup includes automatic deployment to your Obsidian vault:

1. **Watch Mode**: `npm run dev` automatically rebuilds and deploys on file changes
2. **Manual Deploy**: `npm run deploy` copies built files to vault
3. **Build & Deploy**: `npm run build:deploy` combines both operations

#### Deployment Process:
- Copies `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/obsidian-task-master/`
- Creates plugin directory if it doesn't exist
- Preserves existing plugin settings and data
- Automatically reloads plugin in Obsidian (if using hot-reload)

### 5. Testing in Obsidian
1. Ensure your vault path is correctly set in `.env`
2. Run `npm run dev` to start development mode
3. Enable the plugin in Obsidian settings (Community Plugins)
4. Test commands through the command palette
5. Verify status bar integration
6. Use Obsidian's Developer Console (`Ctrl+Shift+I`) for debugging

## Future Enhancements

### Planned Features
- [ ] Task templates and categories
- [ ] Time tracking integration
- [ ] Pomodoro timer integration
- [ ] Task dependencies and subtasks
- [ ] Export/import functionality
- [ ] Team collaboration features
- [ ] Advanced filtering and search
- [ ] Calendar integration
- [ ] Task reminders and notifications

### Technical Improvements
- [ ] Plugin settings panel
- [ ] Data synchronization
- [ ] Performance optimizations
- [ ] Mobile compatibility
- [ ] Accessibility improvements
- [ ] API for third-party integrations

## Contributing

### Development Guidelines
1. Follow TypeScript best practices
2. Maintain consistent code formatting
3. Write comprehensive tests
4. Update documentation for new features
5. Follow Obsidian plugin development conventions

### Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Update documentation
5. Submit pull request with detailed description

## Troubleshooting

### Common Issues
- **Commands not appearing**: Ensure plugin is enabled and Obsidian is restarted
- **Status bar not updating**: Check Task Master Mode is enabled
- **Performance issues**: Reduce update frequency in settings

### Debug Mode
Enable debug logging by adding `console.log` statements and checking the Obsidian developer console (`Ctrl+Shift+I`).

## Build Configuration Files

### Package.json Scripts
```json
{
  "name": "obsidian-task-master",
  "version": "1.0.0",
  "description": "Task Master plugin for Obsidian with command palette integration",
  "main": "main.js",
  "scripts": {
    "dev": "node scripts/build-and-deploy.js --watch",
    "build": "node scripts/build-and-deploy.js",
    "build:deploy": "node scripts/build-and-deploy.js --deploy",
    "deploy": "node scripts/deploy.js",
    "test": "jest",
    "lint": "eslint src/",
    "clean": "rimraf dist"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "@typescript-eslint/eslint-plugin": "^5.0.0",
    "@typescript-eslint/parser": "^5.0.0",
    "dotenv": "^16.0.0",
    "esbuild": "^0.17.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "obsidian": "latest",
    "rimraf": "^4.0.0",
    "typescript": "^4.9.0"
  }
}
```

### Build and Deploy Script (`scripts/build-and-deploy.js`)
```javascript
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const isWatch = process.argv.includes('--watch');
const isDeploy = process.argv.includes('--deploy') || isWatch;

const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  outfile: 'main.js',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: process.env.NODE_ENV === 'development',
  treeShaking: true,
};

async function build() {
  try {
    if (isWatch) {
      console.log('Starting watch mode...');
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      
      if (isDeploy) {
        // Watch for changes and deploy
        const chokidar = require('chokidar');
        chokidar.watch(['main.js', 'manifest.json', 'styles.css'])
          .on('change', deployPlugin);
        
        // Initial deploy
        await deployPlugin();
      }
      
      console.log('Watching for changes...');
    } else {
      await esbuild.build(buildOptions);
      console.log('Build completed successfully');
      
      if (isDeploy) {
        await deployPlugin();
      }
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

async function deployPlugin() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) {
    console.warn('OBSIDIAN_VAULT_PATH not set in .env file. Skipping deployment.');
    return;
  }
  
  const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'obsidian-task-master');
  
  try {
    // Create plugin directory if it doesn't exist
    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, { recursive: true });
      console.log(`Created plugin directory: ${pluginDir}`);
    }
    
    // Copy files
    const filesToCopy = [
      { src: 'main.js', required: true },
      { src: 'manifest.json', required: true },
      { src: 'styles.css', required: false }
    ];
    
    for (const file of filesToCopy) {
      const srcPath = path.join(process.cwd(), file.src);
      const destPath = path.join(pluginDir, file.src);
      
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Deployed: ${file.src}`);
      } else if (file.required) {
        throw new Error(`Required file not found: ${file.src}`);
      }
    }
    
    console.log(`✅ Plugin deployed to: ${pluginDir}`);
    console.log('💡 Remember to reload the plugin in Obsidian settings');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
  }
}

build();
```

### Standalone Deploy Script (`scripts/deploy.js`)
```javascript
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function deployPlugin() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  
  if (!vaultPath) {
    console.error('❌ OBSIDIAN_VAULT_PATH not set in .env file');
    console.log('Please create a .env file with your vault path:');
    console.log('OBSIDIAN_VAULT_PATH=C:\\\\path\\\\to\\\\your\\\\vault');
    process.exit(1);
  }
  
  const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'obsidian-task-master');
  
  try {
    // Verify vault exists
    if (!fs.existsSync(vaultPath)) {
      throw new Error(`Vault path does not exist: ${vaultPath}`);
    }
    
    // Create .obsidian directory if needed
    const obsidianDir = path.join(vaultPath, '.obsidian');
    if (!fs.existsSync(obsidianDir)) {
      fs.mkdirSync(obsidianDir, { recursive: true });
    }
    
    // Create plugins directory if needed
    const pluginsDir = path.join(obsidianDir, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
    }
    
    // Create plugin directory
    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, { recursive: true });
      console.log(`📁 Created plugin directory: ${pluginDir}`);
    }
    
    // Copy plugin files
    const filesToCopy = [
      { src: 'main.js', desc: 'Main plugin code' },
      { src: 'manifest.json', desc: 'Plugin manifest' },
      { src: 'styles.css', desc: 'Plugin styles' }
    ];
    
    let deployedFiles = 0;
    
    for (const file of filesToCopy) {
      const srcPath = path.join(process.cwd(), file.src);
      const destPath = path.join(pluginDir, file.src);
      
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`✅ Deployed: ${file.src} (${file.desc})`);
        deployedFiles++;
      } else {
        console.warn(`⚠️  File not found: ${file.src}`);
      }
    }
    
    if (deployedFiles > 0) {
      console.log(`\n🎉 Successfully deployed ${deployedFiles} files to:`);
      console.log(`   ${pluginDir}`);
      console.log('\n📝 Next steps:');
      console.log('   1. Open Obsidian');
      console.log('   2. Go to Settings → Community Plugins');
      console.log('   3. Enable "Task Master" plugin');
      console.log('   4. Use Ctrl+P to access Task Master commands');
    } else {
      console.error('❌ No files were deployed. Make sure to build the plugin first:');
      console.log('   npm run build');
    }
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deployPlugin();
```

### Environment Template (`.env.example`)
```env
# Obsidian Task Master Plugin - Environment Configuration

# Path to your Obsidian vault
# Windows example:
OBSIDIAN_VAULT_PATH=C:\\Users\\User\\Documents\\MyVault

# macOS example:
# OBSIDIAN_VAULT_PATH=/Users/username/Documents/MyVault

# Linux example:
# OBSIDIAN_VAULT_PATH=/home/username/Documents/MyVault

# The plugin will be automatically deployed to:
# {OBSIDIAN_VAULT_PATH}/.obsidian/plugins/obsidian-task-master/
```

### ESBuild Configuration (`esbuild.config.js`)
```javascript
const esbuild = require('esbuild');

const production = process.env.NODE_ENV === 'production';

module.exports = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  outfile: 'main.js',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: !production,
  treeShaking: true,
  minify: production,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
};
```

## Hot Reload Setup (Optional)

For even faster development, you can set up hot reloading:

### Hot Reload Plugin (`scripts/hot-reload.js`)
```javascript
// Add this to your main.ts for development hot reload
if (process.env.NODE_ENV === 'development') {
  const module = require('module');
  const originalRequire = module.prototype.require;
  
  module.prototype.require = function(...args) {
    if (args[0] === 'obsidian-task-master/main') {
      delete require.cache[require.resolve('obsidian-task-master/main')];
    }
    return originalRequire.apply(this, args);
  };
}
```

---

*This development guide provides a comprehensive foundation for building an Obsidian Task Master plugin with command palette integration, visual status indicators, and automatic deployment to your Obsidian vault.*
