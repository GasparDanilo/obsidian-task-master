import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { TaskMasterClient, Task } from '../services/TaskMasterClient';
import { TaskMasterModal } from '../modals/TaskMasterModal';

export const VIEW_TYPE_TASK_LIST = 'task-master-list';

export class TaskListView extends ItemView {
	private client: TaskMasterClient;
	private tasks: Task[] = [];
	private isLoading = false;

	constructor(leaf: WorkspaceLeaf, client: TaskMasterClient) {
		super(leaf);
		this.client = client;
	}

	getViewType() {
		return VIEW_TYPE_TASK_LIST;
	}

	getDisplayText() {
		return 'TaskMaster';
	}

	getIcon() {
		return 'checklist';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl('h2', { text: 'TaskMaster' });

		await this.loadTasks();
		this.renderTasks();
	}

	async onClose() {
		// Cleanup if needed
	}

	private async loadTasks() {
		if (this.isLoading) return;

		this.isLoading = true;
		try {
			if (this.client.isClientConnected()) {
				this.tasks = await this.client.listTasks();
			} else {
				this.tasks = [];
			}
		} catch (error) {
			console.error('Failed to load tasks:', error);
			new Notice(`Failed to load tasks: ${error.message}`);
			this.tasks = [];
		} finally {
			this.isLoading = false;
		}
	}

	private renderTasks() {
		const container = this.containerEl.children[1];
		
		// Clear existing content (except header)
		const existingTasks = container.querySelector('.task-list-container');
		if (existingTasks) {
			existingTasks.remove();
		}

		// Create controls section
		const controlsDiv = container.createDiv({ cls: 'task-controls' });
		controlsDiv.style.marginBottom = '10px';
		controlsDiv.style.display = 'flex';
		controlsDiv.style.gap = '5px';
		controlsDiv.style.flexWrap = 'wrap';

		// Add task button
		const addButton = controlsDiv.createEl('button', {
			text: '+ Add Task',
			cls: 'mod-cta'
		});
		addButton.style.fontSize = '12px';
		addButton.style.padding = '4px 8px';
		addButton.onclick = () => {
			new TaskMasterModal(this.app, this.client, 'add').open();
		};

		// Refresh button
		const refreshButton = controlsDiv.createEl('button', {
			text: '↻ Refresh'
		});
		refreshButton.style.fontSize = '12px';
		refreshButton.style.padding = '4px 8px';
		refreshButton.onclick = async () => {
			await this.loadTasks();
			this.renderTasks();
		};

		// Next task button
		const nextButton = controlsDiv.createEl('button', {
			text: '➤ Next'
		});
		nextButton.style.fontSize = '12px';
		nextButton.style.padding = '4px 8px';
		nextButton.onclick = async () => {
			try {
				const nextTask = await this.client.getNextTask();
				if (nextTask) {
					new TaskMasterModal(this.app, this.client, 'view', nextTask).open();
				} else {
					new Notice('No pending tasks found');
				}
			} catch (error) {
				new Notice(`Error getting next task: ${error.message}`);
			}
		};

		// Create task list container
		const taskListContainer = container.createDiv({ cls: 'task-list-container' });

		if (this.isLoading) {
			taskListContainer.createDiv({ text: 'Loading tasks...', cls: 'task-loading' });
			return;
		}

		if (!this.client.isClientConnected()) {
			const disconnectedDiv = taskListContainer.createDiv({ cls: 'task-disconnected' });
			disconnectedDiv.createEl('p', { text: 'Not connected to TaskMaster' });
			disconnectedDiv.createEl('small', { text: 'Check plugin settings' });
			return;
		}

		if (this.tasks.length === 0) {
			taskListContainer.createDiv({ text: 'No tasks found', cls: 'task-empty' });
			return;
		}

		// Group tasks by status
		const tasksByStatus = this.groupTasksByStatus();

		// Render each status group
		for (const [status, tasks] of Object.entries(tasksByStatus)) {
			if (tasks.length === 0) continue;

			const statusHeader = taskListContainer.createEl('h3', {
				text: this.formatStatusName(status),
				cls: 'task-status-header'
			});
			statusHeader.style.fontSize = '14px';
			statusHeader.style.margin = '10px 0 5px 0';
			statusHeader.style.color = this.getStatusColor(status);

			const statusContainer = taskListContainer.createDiv({ cls: `tasks-${status}` });

			tasks.forEach(task => this.renderTask(statusContainer, task));
		}

		// Add custom CSS
		this.addCustomCSS();
	}

	private renderTask(container: HTMLElement, task: Task) {
		const taskDiv = container.createDiv({ cls: 'task-item' });
		taskDiv.style.border = '1px solid var(--background-modifier-border)';
		taskDiv.style.borderRadius = '4px';
		taskDiv.style.padding = '8px';
		taskDiv.style.marginBottom = '5px';
		taskDiv.style.cursor = 'pointer';
		taskDiv.style.backgroundColor = 'var(--background-secondary)';

		taskDiv.onclick = () => {
			new TaskMasterModal(this.app, this.client, 'view', task).open();
		};

		// Task title
		const titleDiv = taskDiv.createDiv({ cls: 'task-title' });
		titleDiv.style.fontWeight = 'bold';
		titleDiv.style.fontSize = '13px';
		titleDiv.style.marginBottom = '4px';
		titleDiv.textContent = task.title;

		// Task metadata row
		const metaDiv = taskDiv.createDiv({ cls: 'task-meta' });
		metaDiv.style.fontSize = '11px';
		metaDiv.style.color = 'var(--text-muted)';
		metaDiv.style.display = 'flex';
		metaDiv.style.justifyContent = 'space-between';
		metaDiv.style.alignItems = 'center';

		// Priority badge
		const prioritySpan = metaDiv.createSpan({ cls: 'task-priority' });
		prioritySpan.textContent = task.priority.toUpperCase();
		prioritySpan.style.backgroundColor = this.getPriorityColor(task.priority);
		prioritySpan.style.color = 'white';
		prioritySpan.style.padding = '2px 6px';
		prioritySpan.style.borderRadius = '3px';
		prioritySpan.style.fontSize = '10px';
		prioritySpan.style.fontWeight = 'bold';

		// Task ID
		const idSpan = metaDiv.createSpan({ cls: 'task-id' });
		idSpan.textContent = `#${task.id.slice(-6)}`;
		idSpan.style.fontFamily = 'monospace';

		// Quick actions
		const actionsDiv = taskDiv.createDiv({ cls: 'task-actions' });
		actionsDiv.style.marginTop = '5px';
		actionsDiv.style.display = 'flex';
		actionsDiv.style.gap = '5px';

		// Quick status change buttons
		if (task.status === 'pending') {
			const startButton = actionsDiv.createEl('button', {
				text: 'Start',
				cls: 'task-action-btn'
			});
			startButton.style.fontSize = '10px';
			startButton.style.padding = '2px 6px';
			startButton.onclick = async (e) => {
				e.stopPropagation();
				try {
					await this.client.setTaskStatus(task.id, 'in-progress');
					await this.loadTasks();
					this.renderTasks();
					new Notice('Task started');
				} catch (error) {
					new Notice(`Failed to start task: ${error.message}`);
				}
			};
		}

		if (task.status === 'in-progress') {
			const completeButton = actionsDiv.createEl('button', {
				text: 'Complete',
				cls: 'task-action-btn'
			});
			completeButton.style.fontSize = '10px';
			completeButton.style.padding = '2px 6px';
			completeButton.onclick = async (e) => {
				e.stopPropagation();
				try {
					await this.client.setTaskStatus(task.id, 'completed');
					await this.loadTasks();
					this.renderTasks();
					new Notice('Task completed');
				} catch (error) {
					new Notice(`Failed to complete task: ${error.message}`);
				}
			};
		}

		// Edit button
		const editButton = actionsDiv.createEl('button', {
			text: 'Edit',
			cls: 'task-action-btn'
		});
		editButton.style.fontSize = '10px';
		editButton.style.padding = '2px 6px';
		editButton.onclick = (e) => {
			e.stopPropagation();
			new TaskMasterModal(this.app, this.client, 'edit', task).open();
		};
	}

	private groupTasksByStatus(): Record<string, Task[]> {
		const groups: Record<string, Task[]> = {
			'in-progress': [],
			'pending': [],
			'completed': [],
			'deferred': [],
			'cancelled': []
		};

		this.tasks.forEach(task => {
			if (groups[task.status]) {
				groups[task.status].push(task);
			}
		});

		return groups;
	}

	private formatStatusName(status: string): string {
		const names: Record<string, string> = {
			'in-progress': 'In Progress',
			'pending': 'Pending',
			'completed': 'Completed',
			'deferred': 'Deferred',
			'cancelled': 'Cancelled'
		};
		return names[status] || status;
	}

	private getStatusColor(status: string): string {
		const colors: Record<string, string> = {
			'in-progress': '#f39c12',
			'pending': '#3498db',
			'completed': '#27ae60',
			'deferred': '#95a5a6',
			'cancelled': '#e74c3c'
		};
		return colors[status] || '#95a5a6';
	}

	private getPriorityColor(priority: string): string {
		const colors: Record<string, string> = {
			'low': '#27ae60',
			'medium': '#f39c12',
			'high': '#e67e22',
			'critical': '#e74c3c'
		};
		return colors[priority] || '#95a5a6';
	}

	private addCustomCSS() {
		const style = document.createElement('style');
		style.textContent = `
			.task-item:hover {
				background-color: var(--background-modifier-hover) !important;
			}
			
			.task-action-btn {
				background: var(--interactive-normal);
				border: none;
				border-radius: 3px;
				cursor: pointer;
				color: var(--text-normal);
			}
			
			.task-action-btn:hover {
				background: var(--interactive-hover);
			}
			
			.task-controls button {
				background: var(--interactive-normal);
				border: none;
				border-radius: 3px;
				cursor: pointer;
				color: var(--text-normal);
			}
			
			.task-controls button:hover {
				background: var(--interactive-hover);
			}
			
			.task-controls button.mod-cta {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
			}
			
			.task-controls button.mod-cta:hover {
				background: var(--interactive-accent-hover);
			}
		`;
		if (!document.head.querySelector('style[data-taskmaster="true"]')) {
			style.setAttribute('data-taskmaster', 'true');
			document.head.appendChild(style);
		}
	}

	// Public method to refresh the view
	async refresh() {
		await this.loadTasks();
		this.renderTasks();
	}
}
