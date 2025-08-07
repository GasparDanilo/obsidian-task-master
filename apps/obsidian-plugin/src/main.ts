import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TaskMasterClient } from './services/TaskMasterClient';
import { TaskMasterModal } from './modals/TaskMasterModal';
import { TaskListView, VIEW_TYPE_TASK_LIST } from './views/TaskListView';

// Plugin settings interface
interface TaskMasterSettings {
	mcpCommand: string;
	mcpArgs: string[];
	mcpCwd: string;
	enableAutoSync: boolean;
	syncInterval: number;
	defaultTag: string;
}

// Default settings
const DEFAULT_SETTINGS: TaskMasterSettings = {
	mcpCommand: 'npx',
	mcpArgs: ['task-master-ai'],
	mcpCwd: '',
	enableAutoSync: false,
	syncInterval: 30000, // 30 seconds
	defaultTag: ''
};

export default class TaskMasterPlugin extends Plugin {
	settings: TaskMasterSettings;
	taskMasterClient: TaskMasterClient;
	private syncInterval: NodeJS.Timeout | null = null;

	async onload() {
		await this.loadSettings();

		// Initialize TaskMaster client
		this.taskMasterClient = new TaskMasterClient(this.settings);

		// Register the task list view
		this.registerView(
			VIEW_TYPE_TASK_LIST,
			(leaf) => new TaskListView(leaf, this.taskMasterClient)
		);

		// Add ribbon icon
		this.addRibbonIcon('checklist', 'TaskMaster', (evt: MouseEvent) => {
			this.activateView();
		});

		// Register command palette commands
		this.addCommand({
			id: 'show-task-list',
			name: 'Show Task List',
			callback: () => {
				this.activateView();
			}
		});

		this.addCommand({
			id: 'add-task',
			name: 'Add New Task',
			callback: () => {
				new TaskMasterModal(this.app, this.taskMasterClient, 'add').open();
			}
		});

		this.addCommand({
			id: 'list-tasks',
			name: 'List All Tasks',
			callback: async () => {
				try {
					const tasks = await this.taskMasterClient.listTasks();
					new Notice(`Found ${tasks.length} tasks`);
					this.activateView();
				} catch (error) {
					new Notice(`Error listing tasks: ${error.message}`);
				}
			}
		});

		this.addCommand({
			id: 'next-task',
			name: 'Get Next Task',
			callback: async () => {
				try {
					const nextTask = await this.taskMasterClient.getNextTask();
					if (nextTask) {
						new Notice(`Next task: ${nextTask.title}`);
						new TaskMasterModal(this.app, this.taskMasterClient, 'view', nextTask).open();
					} else {
						new Notice('No pending tasks found');
					}
				} catch (error) {
					new Notice(`Error getting next task: ${error.message}`);
				}
			}
		});

		this.addCommand({
			id: 'sync-tasks',
			name: 'Sync with TaskMaster',
			callback: async () => {
				try {
					await this.taskMasterClient.syncTasks();
					new Notice('Tasks synced successfully');
				} catch (error) {
					new Notice(`Sync failed: ${error.message}`);
				}
			}
		});

		// Add editor command for creating task from selection
		this.addCommand({
			id: 'create-task-from-selection',
			name: 'Create Task from Selection',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (selection) {
					new TaskMasterModal(this.app, this.taskMasterClient, 'add', null, selection).open();
				} else {
					new Notice('Please select text to create a task');
				}
			}
		});

		// Add settings tab
		this.addSettingTab(new TaskMasterSettingTab(this.app, this));

		// Start auto-sync if enabled
		if (this.settings.enableAutoSync) {
			this.startAutoSync();
		}

		console.log('TaskMaster plugin loaded');
	}

	onunload() {
		this.stopAutoSync();
		if (this.taskMasterClient) {
			this.taskMasterClient.disconnect();
		}
		console.log('TaskMaster plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Restart auto-sync if settings changed
		if (this.settings.enableAutoSync) {
			this.startAutoSync();
		} else {
			this.stopAutoSync();
		}
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_TASK_LIST)[0];

		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_TASK_LIST, active: true });
		}

		workspace.revealLeaf(leaf);
	}

	private startAutoSync() {
		this.stopAutoSync(); // Clear any existing interval
		
		if (this.settings.syncInterval > 0) {
			this.syncInterval = setInterval(async () => {
				try {
					await this.taskMasterClient.syncTasks();
				} catch (error) {
					console.error('Auto-sync failed:', error);
				}
			}, this.settings.syncInterval);
		}
	}

	private stopAutoSync() {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}
}

class TaskMasterSettingTab extends PluginSettingTab {
	plugin: TaskMasterPlugin;

	constructor(app: App, plugin: TaskMasterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'TaskMaster Settings' });

		new Setting(containerEl)
			.setName('MCP Command')
			.setDesc('Command to run TaskMaster MCP server')
			.addText(text => text
				.setPlaceholder('npx')
				.setValue(this.plugin.settings.mcpCommand)
				.onChange(async (value) => {
					this.plugin.settings.mcpCommand = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('MCP Arguments')
			.setDesc('Arguments for TaskMaster MCP server (comma-separated)')
			.addText(text => text
				.setPlaceholder('task-master-ai')
				.setValue(this.plugin.settings.mcpArgs.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.mcpArgs = value.split(',').map(arg => arg.trim());
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Working Directory')
			.setDesc('Working directory for TaskMaster commands')
			.addText(text => text
				.setPlaceholder('Leave empty to use vault root')
				.setValue(this.plugin.settings.mcpCwd)
				.onChange(async (value) => {
					this.plugin.settings.mcpCwd = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Tag')
			.setDesc('Default tag for task operations')
			.addText(text => text
				.setPlaceholder('project-tag')
				.setValue(this.plugin.settings.defaultTag)
				.onChange(async (value) => {
					this.plugin.settings.defaultTag = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Auto-sync')
			.setDesc('Automatically sync tasks with TaskMaster')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAutoSync)
				.onChange(async (value) => {
					this.plugin.settings.enableAutoSync = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Sync Interval')
			.setDesc('How often to sync tasks (in seconds)')
			.addSlider(slider => slider
				.setLimits(10, 300, 10)
				.setValue(this.plugin.settings.syncInterval / 1000)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.syncInterval = value * 1000;
					await this.plugin.saveSettings();
				}));
	}
}
