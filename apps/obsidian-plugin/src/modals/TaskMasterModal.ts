import { App, Modal, Setting, Notice } from 'obsidian';
import { TaskMasterClient, Task } from '../services/TaskMasterClient';

export class TaskMasterModal extends Modal {
	private client: TaskMasterClient;
	private mode: 'add' | 'edit' | 'view';
	private task: Task | null;
	private initialText?: string;

	// Form fields
	private titleInput: HTMLInputElement;
	private descriptionTextarea: HTMLTextAreaElement;
	private prioritySelect: HTMLSelectElement;
	private statusSelect: HTMLSelectElement;

	constructor(
		app: App, 
		client: TaskMasterClient, 
		mode: 'add' | 'edit' | 'view',
		task: Task | null = null,
		initialText?: string
	) {
		super(app);
		this.client = client;
		this.mode = mode;
		this.task = task;
		this.initialText = initialText;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Set modal title based on mode
		let title = '';
		switch (this.mode) {
			case 'add':
				title = 'Add New Task';
				break;
			case 'edit':
				title = 'Edit Task';
				break;
			case 'view':
				title = 'View Task';
				break;
		}

		contentEl.createEl('h2', { text: title });

		// Task Title
		new Setting(contentEl)
			.setName('Title')
			.setDesc('Task title')
			.addText(text => {
				this.titleInput = text.inputEl;
				text
					.setPlaceholder('Enter task title')
					.setValue(this.task?.title || this.initialText || '')
					.setDisabled(this.mode === 'view');
				
				// Focus title input on add mode
				if (this.mode === 'add') {
					setTimeout(() => text.inputEl.focus(), 100);
				}
			});

		// Task Description
		new Setting(contentEl)
			.setName('Description')
			.setDesc('Task description')
			.addTextArea(text => {
				this.descriptionTextarea = text.inputEl;
				text
					.setPlaceholder('Enter task description')
					.setValue(this.task?.description || '')
					.setDisabled(this.mode === 'view');
				
				// Resize textarea
				text.inputEl.rows = 4;
			});

		// Priority
		new Setting(contentEl)
			.setName('Priority')
			.setDesc('Task priority level')
			.addDropdown(dropdown => {
				this.prioritySelect = dropdown.selectEl;
				dropdown
					.addOption('low', 'Low')
					.addOption('medium', 'Medium')
					.addOption('high', 'High')
					.addOption('critical', 'Critical')
					.setValue(this.task?.priority || 'medium')
					.setDisabled(this.mode === 'view');
			});

		// Status (only show for edit and view modes)
		if (this.mode !== 'add') {
			new Setting(contentEl)
				.setName('Status')
				.setDesc('Task status')
				.addDropdown(dropdown => {
					this.statusSelect = dropdown.selectEl;
					dropdown
						.addOption('pending', 'Pending')
						.addOption('in-progress', 'In Progress')
						.addOption('completed', 'Completed')
						.addOption('cancelled', 'Cancelled')
						.addOption('deferred', 'Deferred')
						.setValue(this.task?.status || 'pending')
						.setDisabled(this.mode === 'view');
				});
		}

		// Task metadata (view mode only)
		if (this.mode === 'view' && this.task) {
			if (this.task.id) {
				new Setting(contentEl)
					.setName('Task ID')
					.setDesc('')
					.addText(text => text
						.setValue(this.task!.id)
						.setDisabled(true)
					);
			}

			if (this.task.created_at) {
				new Setting(contentEl)
					.setName('Created')
					.setDesc('')
					.addText(text => text
						.setValue(new Date(this.task!.created_at!).toLocaleString())
						.setDisabled(true)
					);
			}

			if (this.task.updated_at) {
				new Setting(contentEl)
					.setName('Last Updated')
					.setDesc('')
					.addText(text => text
						.setValue(new Date(this.task!.updated_at!).toLocaleString())
						.setDisabled(true)
					);
			}

			if (this.task.tags && this.task.tags.length > 0) {
				new Setting(contentEl)
					.setName('Tags')
					.setDesc('')
					.addText(text => text
						.setValue(this.task!.tags!.join(', '))
						.setDisabled(true)
					);
			}
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.marginTop = '20px';

		if (this.mode === 'view') {
			// View mode buttons
			const editButton = buttonContainer.createEl('button', {
				text: 'Edit',
				cls: 'mod-cta'
			});
			editButton.onclick = () => {
				this.close();
				new TaskMasterModal(this.app, this.client, 'edit', this.task).open();
			};

			const closeButton = buttonContainer.createEl('button', {
				text: 'Close'
			});
			closeButton.onclick = () => this.close();
		} else {
			// Add/Edit mode buttons
			const cancelButton = buttonContainer.createEl('button', {
				text: 'Cancel'
			});
			cancelButton.onclick = () => this.close();

			const saveButton = buttonContainer.createEl('button', {
				text: this.mode === 'add' ? 'Add Task' : 'Save Changes',
				cls: 'mod-cta'
			});
			saveButton.onclick = () => this.handleSave();
		}

		// Add CSS for better styling
		const style = document.createElement('style');
		style.textContent = `
			.modal-button-container button {
				padding: 8px 16px;
				border: none;
				border-radius: 4px;
				cursor: pointer;
				background: var(--interactive-normal);
				color: var(--text-on-accent);
			}
			
			.modal-button-container button:hover {
				background: var(--interactive-hover);
			}
			
			.modal-button-container button.mod-cta {
				background: var(--interactive-accent);
			}
			
			.modal-button-container button.mod-cta:hover {
				background: var(--interactive-accent-hover);
			}
		`;
		document.head.appendChild(style);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async handleSave() {
		const title = this.titleInput.value.trim();
		const description = this.descriptionTextarea.value.trim();
		const priority = this.prioritySelect.value as Task['priority'];
		const status = this.statusSelect?.value as Task['status'];

		if (!title) {
			new Notice('Please enter a task title');
			this.titleInput.focus();
			return;
		}

		try {
			if (this.mode === 'add') {
				await this.client.addTask(title, description, priority);
				new Notice('Task added successfully!');
			} else if (this.mode === 'edit' && this.task) {
				await this.client.updateTask(this.task.id, {
					title,
					description,
					priority,
					status
				});
				new Notice('Task updated successfully!');
			}

			this.close();

			// Refresh task list if it's open
			// This would need to be implemented with proper event handling
			console.log('Task saved, should refresh views');

		} catch (error) {
			new Notice(`Failed to save task: ${error.message}`);
			console.error('Error saving task:', error);
		}
	}

	// Handle keyboard shortcuts
	private setupKeyboardHandlers() {
		this.scope.register(['Mod'], 'Enter', (evt) => {
			if (this.mode !== 'view') {
				evt.preventDefault();
				this.handleSave();
			}
		});

		this.scope.register([], 'Escape', (evt) => {
			evt.preventDefault();
			this.close();
		});
	}
}
